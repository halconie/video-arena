import { Router } from "express";
import { z } from "zod";
import { prisma } from "@repo/db";
import { requireAuth } from "../middleware/auth.js";
import { upload } from "../lib/uploads.js";
import { uploadFile, uploadObject } from "../lib/minio.js";
import { generateImage, listImageModels } from "../lib/openrouter.js";

const router = Router();

router.use(requireAuth);

// GET /api/images/models - list generation models available via OpenRouter
router.get("/models", async (_req, res) => {
  try {
    const models = await listImageModels();
    res.json(models);
  } catch (err) {
    res.status(502).json({
      error: "Could not fetch image models from OpenRouter",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

// GET /api/images - the current user's images, newest first
router.get("/", async (req, res) => {
  const images = await prisma.image.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: "desc" },
  });
  res.json(images);
});

// GET /api/images/:id
router.get("/:id", async (req, res) => {
  const image = await prisma.image.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!image) {
    res.status(404).json({ error: "Image not found" });
    return;
  }
  res.json(image);
});

const createImageSchema = z.object({
  prompt: z.string().min(1),
  model: z.string().min(1),
  resolution: z.string().min(1),
  aspectRatio: z.string().min(1),
});

const referenceFields = upload.fields([
  { name: "referenceImages", maxCount: 4 },
]);

// POST /api/images - create + synchronously generate an image
router.post("/", referenceFields, async (req, res) => {
  const parsed = createImageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { prompt, model, resolution, aspectRatio } = parsed.data;

  const files = req.files as
    | Record<string, Express.Multer.File[]>
    | undefined;
  const referenceFiles = files?.referenceImages ?? [];

  const image = await prisma.image.create({
    data: {
      userId: req.userId!,
      prompt,
      model,
      resolution,
      aspectRatio,
      status: "PENDING",
    },
  });

  try {
    // Uploaded for our own storage/display - OpenRouter gets these inline
    // as base64 below (same reasoning as video frames, see openrouter.ts).
    const referenceImageUrls = (
      await Promise.all(referenceFiles.map(uploadFile))
    ).filter((u): u is string => Boolean(u));

    await prisma.image.update({
      where: { id: image.id },
      data: { status: "PROCESSING", referenceImageUrls },
    });

    const { buffer, contentType } = await generateImage({
      model,
      prompt,
      resolution,
      aspectRatio,
      referenceImages: referenceFiles.map((f) => ({
        buffer: f.buffer,
        contentType: f.mimetype,
      })),
    });

    const outputUrl = await uploadObject({
      folder: "outputs",
      body: buffer,
      contentType,
    });

    const completed = await prisma.image.update({
      where: { id: image.id },
      data: { status: "COMPLETED", outputUrl },
    });

    res.status(201).json(completed);
  } catch (err) {
    console.error(`Image generation failed for ${image.id}:`, err);
    const failed = await prisma.image.update({
      where: { id: image.id },
      data: {
        status: "FAILED",
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    });
    res.status(502).json(failed);
  }
});

export default router;
