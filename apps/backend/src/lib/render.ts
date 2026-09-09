// The template render pipeline, shared by admin previews and user renders.
//
// For each block on the timeline, in order:
//   1. optionally face-swap the block's start/end frames with the avatar
//      assigned to that block's slot (existing FaceFusion pipeline)
//   2. generate the clip via OpenRouter
//   3. upload it and record a RenderedBlock row
//
// Then concat the clips, mux the template's audio over the result, extract a
// thumbnail, and store both.
//
// **Renders are resumable.** Rendering is synchronous (one long-lived HTTP
// request, consistent with the rest of the app), but a real template is
// 10-20+ minutes of generation, so a dropped connection is likely. Each
// block is persisted the moment it completes, and this function skips any
// block that already has a COMPLETED RenderedBlock for this render - so
// re-POSTing resumes instead of re-paying OpenRouter for finished work.

import { prisma, type Avatar, type VideoBlock } from "@repo/db";
import { downloadVideo, generateVideo } from "./openrouter.js";
import { runFaceSwap } from "./faceswap.js";
import { concatVideos, extractThumbnail, muxAudio } from "./ffmpeg.js";
import { downloadStoredUrl, uploadObject } from "./minio.js";

/** Applies the avatar's face to a stored frame, returning the new frame's bytes. */
async function swapFace(
  frameUrl: string,
  avatar: Avatar,
): Promise<{ buffer: Buffer; contentType: string }> {
  const faceUrl = avatar.imageUrls[0];
  if (!faceUrl) {
    throw new Error(`Avatar "${avatar.name}" has no images`);
  }

  const [frame, face] = await Promise.all([
    downloadStoredUrl(frameUrl),
    downloadStoredUrl(faceUrl),
  ]);

  return runFaceSwap({ source: face, target: frame });
}

/**
 * Resolves a block's start/end frames, applying face swaps where the block
 * asks for them, and returns them as raw bytes ready for OpenRouter.
 */
async function resolveFrames(
  block: VideoBlock,
  avatar: Avatar | undefined,
): Promise<{
  startFrame?: { buffer: Buffer; contentType: string };
  endFrame?: { buffer: Buffer; contentType: string };
  referenceImages: { buffer: Buffer; contentType: string }[];
}> {
  const wantsSwap = block.swapStartFrame || block.swapEndFrame;
  if (wantsSwap && !avatar) {
    throw new Error(
      `Block needs avatar slot ${block.avatarSlot} but no avatar was supplied for it`,
    );
  }

  const startFrame = block.startFrameUrl
    ? block.swapStartFrame && avatar
      ? await swapFace(block.startFrameUrl, avatar)
      : await downloadStoredUrl(block.startFrameUrl)
    : undefined;

  const endFrame = block.endFrameUrl
    ? block.swapEndFrame && avatar
      ? await swapFace(block.endFrameUrl, avatar)
      : await downloadStoredUrl(block.endFrameUrl)
    : undefined;

  const referenceImages = await Promise.all(
    block.referenceImageUrls.map((url) => downloadStoredUrl(url)),
  );

  return { startFrame, endFrame, referenceImages };
}

/** Generates one block's clip and records it against the render. */
async function renderBlock(
  renderId: string,
  block: VideoBlock,
  avatar: Avatar | undefined,
): Promise<string> {
  const record = await prisma.renderedBlock.upsert({
    where: { renderId_blockId: { renderId, blockId: block.id } },
    create: { renderId, blockId: block.id, status: "PROCESSING" },
    update: { status: "PROCESSING", errorMessage: null },
  });

  try {
    const { startFrame, endFrame, referenceImages } = await resolveFrames(
      block,
      avatar,
    );

    const generatedUrl = await generateVideo({
      model: block.model,
      prompt: block.prompt,
      duration: block.endSeconds - block.startSeconds,
      resolution: block.resolution,
      aspectRatio: block.aspectRatio,
      // The template supplies its own audio track over the whole video, so
      // per-block audio would just be mixed away - and it costs extra.
      generateAudio: false,
      startFrame,
      endFrame,
      referenceFrames: referenceImages,
    });

    const { buffer, contentType } = await downloadVideo(generatedUrl);
    const outputUrl = await uploadObject({
      folder: "outputs",
      body: buffer,
      contentType,
    });

    await prisma.renderedBlock.update({
      where: { id: record.id },
      data: { status: "COMPLETED", outputUrl },
    });

    return outputUrl;
  } catch (err) {
    await prisma.renderedBlock.update({
      where: { id: record.id },
      data: {
        status: "FAILED",
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    });
    throw err;
  }
}

/**
 * Renders a template into one stitched video. Safe to call again on the same
 * render id to resume after a failure/disconnect.
 */
export async function renderTemplate(renderId: string): Promise<void> {
  const render = await prisma.templateRender.findUnique({
    where: { id: renderId },
    include: {
      template: { include: { blocks: { orderBy: { startSeconds: "asc" } } } },
      blocks: true,
    },
  });

  if (!render) throw new Error(`Render ${renderId} not found`);

  const { template } = render;
  if (template.blocks.length === 0) {
    throw new Error("Template has no video blocks");
  }

  await prisma.templateRender.update({
    where: { id: renderId },
    data: { status: "PROCESSING", errorMessage: null },
  });

  try {
    const avatars = await prisma.avatar.findMany({
      where: { id: { in: render.avatarIds } },
    });
    // avatarIds is ordered by slot: index 0 fills slot 1.
    const avatarBySlot = new Map<number, Avatar>();
    render.avatarIds.forEach((id, index) => {
      const avatar = avatars.find((a) => a.id === id);
      if (avatar) avatarBySlot.set(index + 1, avatar);
    });

    const alreadyDone = new Map(
      render.blocks
        .filter((b) => b.status === "COMPLETED" && b.outputUrl)
        .map((b) => [b.blockId, b.outputUrl!]),
    );

    const clipUrls: string[] = [];
    for (const block of template.blocks) {
      const done = alreadyDone.get(block.id);
      if (done) {
        console.log(`render ${renderId}: block ${block.id} already done, skipping`);
        clipUrls.push(done);
        continue;
      }

      console.log(`render ${renderId}: generating block ${block.id}`);
      clipUrls.push(
        await renderBlock(renderId, block, avatarBySlot.get(block.avatarSlot)),
      );
    }

    // Stitch, then lay the template's audio over the whole thing.
    const clips = await Promise.all(
      clipUrls.map((url) => downloadStoredUrl(url).then((r) => r.buffer)),
    );

    let final = await concatVideos(clips);

    if (template.audioUrl) {
      const audio = await downloadStoredUrl(template.audioUrl);
      final = await muxAudio(final, audio.buffer);
    }

    const [outputUrl, thumbnailUrl] = await Promise.all([
      uploadObject({
        folder: "outputs",
        body: final,
        contentType: "video/mp4",
      }),
      extractThumbnail(final).then((thumb) =>
        uploadObject({
          folder: "outputs",
          body: thumb,
          contentType: "image/jpeg",
        }),
      ),
    ]);

    await prisma.templateRender.update({
      where: { id: renderId },
      data: { status: "COMPLETED", outputUrl, thumbnailUrl },
    });
  } catch (err) {
    console.error(`Template render ${renderId} failed:`, err);
    await prisma.templateRender.update({
      where: { id: renderId },
      data: {
        status: "FAILED",
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    });
    throw err;
  }
}
