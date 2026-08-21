import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import { z } from "zod";
import { fromNodeHeaders } from "better-auth/node";
import { prisma } from "@repo/db";
import { auth } from "../lib/auth.js";
import { uploadObject } from "../lib/minio.js";
import { downloadVideo, generateVideo, listVideoModels } from "../lib/openrouter.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB per image
});

/* eslint-disable @typescript-eslint/no-namespace -- this is the standard
   way to augment Express's Request type. */
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}
/* eslint-enable @typescript-eslint/no-namespace */

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });

  if (!session) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  req.userId = session.user.id;
  next();
}

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
  const { prompt, model, duration, resolution, aspectRatio } = parsed.data;

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
      status: "PENDING",
    },
  });

  try {
    const [startFrameUrl, endFrameUrl, referenceFrameUrls] =
      await Promise.all([
        uploadFrame(files?.startFrame?.[0]),
        uploadFrame(files?.endFrame?.[0]),
        Promise.all((files?.referenceFrames ?? []).map(uploadFrame)).then(
          (urls) => urls.filter((u): u is string => Boolean(u)),
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
      startFrameUrl: startFrameUrl ?? undefined,
      endFrameUrl: endFrameUrl ?? undefined,
      referenceFrameUrls,
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

async function uploadFrame(
  file: Express.Multer.File | undefined,
): Promise<string | undefined> {
  if (!file) return undefined;
  return uploadObject({
    folder: "uploads",
    body: file.buffer,
    contentType: file.mimetype,
  });
}

export default router;
