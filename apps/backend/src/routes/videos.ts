import { Router } from "express";
import { z } from "zod";
import { prisma } from "@repo/db";
import { requireAuth } from "../middleware/auth.js";
import { upload } from "../lib/uploads.js";
import { uploadFile, uploadObject } from "../lib/minio.js";
import { downloadVideo, generateVideo, listVideoModels } from "../lib/openrouter.js";

const router = Router();

router.use(requireAuth);

// GET /api/videos/models - list generation models available via OpenRouter
router.get("/models", async (_req, res) => {
  try {
    const models = await listVideoModels();
    res.json(models);
  } catch (err) {
    res.status(502).json({
      error: "Could not fetch video models from OpenRouter",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

// GET /api/videos - the current user's videos, newest first
router.get("/", async (req, res) => {
  const videos = await prisma.video.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: "desc" },
  });
  res.json(videos);
});

// GET /api/videos/:id
router.get("/:id", async (req, res) => {
  const video = await prisma.video.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!video) {
    res.status(404).json({ error: "Video not found" });
    return;
  }
  res.json(video);
});

const createVideoSchema = z.object({
  prompt: z.string().min(1),
  model: z.string().min(1),
  duration: z.coerce.number().int().positive(),
  resolution: z.string().min(1),
  aspectRatio: z.string().min(1),
  // multipart fields arrive as strings - z.coerce.boolean() would treat
  // the string "false" as truthy, so handle "true"/"false" explicitly.
  generateAudio: z
    .preprocess(
      (v) => (v === "false" ? false : v === "true" ? true : v),
      z.boolean(),
    )
    .default(true),
});

const frameFields = upload.fields([
  { name: "startFrame", maxCount: 1 },
  { name: "endFrame", maxCount: 1 },
  { name: "referenceFrames", maxCount: 4 },
]);

// POST /api/videos - create + synchronously generate a video
router.post("/", frameFields, async (req, res) => {
  const parsed = createVideoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { prompt, model, duration, resolution, aspectRatio, generateAudio } =
    parsed.data;

  const files = req.files as
    | Record<string, Express.Multer.File[]>
    | undefined;

  const video = await prisma.video.create({
    data: {
      userId: req.userId!,
      prompt,
      model,
      duration,
      resolution,
      aspectRatio,
      generateAudio,
      status: "PENDING",
    },
  });

  const startFile = files?.startFrame?.[0];
  const endFile = files?.endFrame?.[0];
  const referenceFiles = files?.referenceFrames ?? [];

  try {
    // Uploaded here purely for our own storage/display (the "your videos"
    // grid shows these). OpenRouter gets the raw bytes directly below,
    // inline, since it can't fetch back a localhost MinIO URL.
    const [startFrameUrl, endFrameUrl, referenceFrameUrls] =
      await Promise.all([
        uploadFile(startFile),
        uploadFile(endFile),
        Promise.all(referenceFiles.map(uploadFile)).then((urls) =>
          urls.filter((u): u is string => Boolean(u)),
        ),
      ]);

    await prisma.video.update({
      where: { id: video.id },
      data: {
        status: "PROCESSING",
        startFrameUrl,
        endFrameUrl,
        referenceFrameUrls,
      },
    });

    const generatedUrl = await generateVideo({
      model,
      prompt,
      duration,
      resolution,
      aspectRatio,
      generateAudio,
      startFrame: startFile
        ? { buffer: startFile.buffer, contentType: startFile.mimetype }
        : undefined,
      endFrame: endFile
        ? { buffer: endFile.buffer, contentType: endFile.mimetype }
        : undefined,
      referenceFrames: referenceFiles.map((f) => ({
        buffer: f.buffer,
        contentType: f.mimetype,
      })),
    });

    const { buffer, contentType } = await downloadVideo(generatedUrl);
    const outputUrl = await uploadObject({
      folder: "outputs",
      body: buffer,
      contentType,
    });

    const completed = await prisma.video.update({
      where: { id: video.id },
      data: { status: "COMPLETED", outputUrl },
    });

    res.status(201).json(completed);
  } catch (err) {
    console.error(`Video generation failed for ${video.id}:`, err);
    const failed = await prisma.video.update({
      where: { id: video.id },
      data: {
        status: "FAILED",
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    });
    res.status(502).json(failed);
  }
});

export default router;
