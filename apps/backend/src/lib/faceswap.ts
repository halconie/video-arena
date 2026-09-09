// Talks to the self-hosted FaceFusion container. FaceFusion has no REST
// API - it's a CLI/Gradio tool - so this uses a shared Docker volume as a
// tiny job queue instead of mounting the Docker socket or reverse
// engineering Gradio's internal HTTP calls:
//
//   1. We write source/target images + a `pending` marker into a fresh
//      job directory under the shared volume.
//   2. The `facefusion` container (see its `command:` override in
//      docker-compose.yml) polls for `pending` markers and runs
//      `facefusion.py headless-run ... --processors face_swapper` on a
//      match, writing `status` (done/failed) + `output.png`.
//   3. We poll for that `status` file and read the result back off the
//      same shared volume.
//
// Verified against the real image (facefusion/facefusion:3.8.2-cpu) rather
// than guessed: `-s <source>` is the face to apply, `-t <target>` is the
// base image, `-o <output>` the result, `--processors face_swapper`.

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const JOBS_DIR = process.env.FACESWAP_JOBS_DIR ?? "/tmp/faceswap-jobs";

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
};

function extensionFor(contentType: string): string {
  return EXTENSION_BY_CONTENT_TYPE[contentType] ?? "png";
}

export type FaceSwapInput = { buffer: Buffer; contentType: string };

const POLL_INTERVAL_MS = 2_000;

// Two separate deadlines, because "nothing is watching /jobs" and "the swap
// is taking a while" need very different patience:
//
//  - The watcher deletes the `pending` marker the moment it claims a job.
//    If the marker is still there after CLAIM_TIMEOUT_MS, nothing is
//    running - fail fast with an actionable message instead of making the
//    user wait out the full timeout.
//  - Once claimed, allow much longer: FaceFusion downloads ~400MB of model
//    weights on the very first swap, and runs under emulation on arm64.
const CLAIM_TIMEOUT_MS = 20 * 1_000; // 20 seconds
const RUN_TIMEOUT_MS = 15 * 60 * 1_000; // 15 minutes

/**
 * Submits a face-swap job to FaceFusion and blocks (polling internally)
 * until it's done, failed, or times out.
 */
export async function runFaceSwap(params: {
  /** The face to apply. */
  source: FaceSwapInput;
  /** The base image the face gets swapped onto. */
  target: FaceSwapInput;
}): Promise<{ buffer: Buffer; contentType: string }> {
  const jobDir = path.join(JOBS_DIR, randomUUID());
  await mkdir(jobDir, { recursive: true });

  try {
    await writeFile(
      path.join(jobDir, `source.${extensionFor(params.source.contentType)}`),
      params.source.buffer,
    );
    await writeFile(
      path.join(jobDir, `target.${extensionFor(params.target.contentType)}`),
      params.target.buffer,
    );
    // Written last, once both images are fully on disk - the watcher only
    // picks up a job once it sees this marker.
    await writeFile(path.join(jobDir, "pending"), "");

    const startedAt = Date.now();
    let claimed = false;

    for (;;) {
      const status = await readStatus(jobDir);

      if (status === "done") {
        const buffer = await readFile(path.join(jobDir, "output.png"));
        return { buffer, contentType: "image/png" };
      }

      if (status === "failed") {
        const log = await readFile(path.join(jobDir, "log.txt"), "utf8").catch(
          () => "",
        );
        throw new Error(
          `FaceFusion job failed${log ? `: ${log.slice(-500)}` : ""}`,
        );
      }

      if (!claimed) {
        claimed = !(await exists(path.join(jobDir, "pending")));
      }

      const elapsed = Date.now() - startedAt;
      if (!claimed && elapsed > CLAIM_TIMEOUT_MS) {
        throw new Error(
          "FaceFusion isn't running - no worker picked up the job. Start it " +
            "with: docker compose --profile facefusion up -d facefusion",
        );
      }
      if (elapsed > RUN_TIMEOUT_MS) {
        throw new Error("Timed out waiting for FaceFusion to finish the swap");
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  } finally {
    await rm(jobDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function readStatus(jobDir: string): Promise<string | null> {
  try {
    return (await readFile(path.join(jobDir, "status"), "utf8")).trim();
  } catch {
    return null;
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}
