// ffmpeg helpers for assembling long-form template videos: stitch the
// per-block clips together, lay the template's audio track over the result,
// and pull a thumbnail frame out of it.
//
// ffmpeg is installed in the backend image (see apps/backend/Dockerfile);
// running the backend outside Docker needs it on PATH (`brew install ffmpeg`).

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Generous - stitching a 10 minute video is slow, but this should never be
// the thing that hangs a render forever.
const FFMPEG_TIMEOUT_MS = 10 * 60 * 1_000;

async function runFfmpeg(args: string[]): Promise<void> {
  try {
    await execFileAsync("ffmpeg", ["-y", "-hide_banner", ...args], {
      timeout: FFMPEG_TIMEOUT_MS,
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (err) {
    // ffmpeg writes its actual diagnostics to stderr; surface the tail of it
    // rather than a bare non-zero exit code.
    const stderr =
      err && typeof err === "object" && "stderr" in err
        ? String(err.stderr).slice(-800)
        : "";
    throw new Error(
      `ffmpeg failed${stderr ? `: ${stderr}` : `: ${String(err)}`}`,
    );
  }
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "video-arena-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Concatenates clips in order into a single video.
 *
 * Re-encodes rather than using the faster stream-copy concat: clips come
 * from different models/resolutions, and stream copy silently produces
 * broken output unless every input shares codec, resolution and timebase.
 */
export async function concatVideos(clips: Buffer[]): Promise<Buffer> {
  if (clips.length === 0) {
    throw new Error("Cannot concatenate zero clips");
  }

  return withTempDir(async (dir) => {
    const inputs: string[] = [];
    for (const [index, clip] of clips.entries()) {
      const file = path.join(dir, `clip-${index}.mp4`);
      await writeFile(file, clip);
      inputs.push(file);
    }

    const output = path.join(dir, "out.mp4");

    if (inputs.length === 1) {
      await runFfmpeg([
        "-i",
        inputs[0]!,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-pix_fmt",
        "yuv420p",
        output,
      ]);
      return readFile(output);
    }

    // Normalise every stream to a common resolution/fps before concatenating,
    // otherwise the concat filter refuses mismatched inputs.
    const args: string[] = [];
    for (const input of inputs) args.push("-i", input);

    const scale = inputs
      .map(
        (_, i) =>
          `[${i}:v]scale=1280:720:force_original_aspect_ratio=decrease,` +
          `pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v${i}]`,
      )
      .join(";");
    const concatInputs = inputs.map((_, i) => `[v${i}]`).join("");

    args.push(
      "-filter_complex",
      `${scale};${concatInputs}concat=n=${inputs.length}:v=1:a=0[outv]`,
      "-map",
      "[outv]",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-pix_fmt",
      "yuv420p",
      output,
    );

    await runFfmpeg(args);
    return readFile(output);
  });
}

/**
 * Replaces the video's audio with `audio`, trimmed to the video's length
 * (`-shortest`). Used to lay a template's base audio track over the
 * stitched blocks.
 */
export async function muxAudio(
  video: Buffer,
  audio: Buffer,
  audioExtension = "mp3",
): Promise<Buffer> {
  return withTempDir(async (dir) => {
    const videoFile = path.join(dir, "in.mp4");
    const audioFile = path.join(dir, `audio.${audioExtension}`);
    const output = path.join(dir, "out.mp4");

    await writeFile(videoFile, video);
    await writeFile(audioFile, audio);

    await runFfmpeg([
      "-i",
      videoFile,
      "-i",
      audioFile,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-shortest",
      output,
    ]);

    return readFile(output);
  });
}

/** Grabs a single frame as a JPEG thumbnail. */
export async function extractThumbnail(
  video: Buffer,
  atSeconds = 1,
): Promise<Buffer> {
  return withTempDir(async (dir) => {
    const videoFile = path.join(dir, "in.mp4");
    await writeFile(videoFile, video);

    const grab = async (seek: number, output: string) => {
      await runFfmpeg([
        "-ss",
        String(seek),
        "-i",
        videoFile,
        "-frames:v",
        "1",
        "-q:v",
        "3",
        output,
      ]);
      return readFile(output);
    };

    try {
      return await grab(atSeconds, path.join(dir, "thumb.jpg"));
    } catch {
      // Seeking past the end of a very short clip yields no frame - fall
      // back to the very first one.
      return grab(0, path.join(dir, "thumb-0.jpg"));
    }
  });
}
