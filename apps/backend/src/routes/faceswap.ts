import { Router } from "express";
import { prisma } from "@repo/db";
import { requireAuth } from "../middleware/auth.js";
import { upload } from "../lib/uploads.js";
import { uploadFile, uploadObject } from "../lib/minio.js";
import { runFaceSwap } from "../lib/faceswap.js";

const router = Router();

router.use(requireAuth);

// GET /api/faceswap - the current user's face swaps, newest first
router.get("/", async (req, res) => {
  const faceSwaps = await prisma.faceSwap.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: "desc" },
  });
  res.json(faceSwaps);
});

// GET /api/faceswap/:id
router.get("/:id", async (req, res) => {
  const faceSwap = await prisma.faceSwap.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!faceSwap) {
    res.status(404).json({ error: "Face swap not found" });
    return;
  }
  res.json(faceSwap);
});

const imageFields = upload.fields([
  { name: "baseImage", maxCount: 1 },
  { name: "faceImage", maxCount: 1 },
]);

// POST /api/faceswap - swap `faceImage`'s face onto `baseImage`
router.post("/", imageFields, async (req, res) => {
  const files = req.files as
    | Record<string, Express.Multer.File[]>
    | undefined;

  const baseFile = files?.baseImage?.[0];
  const faceFile = files?.faceImage?.[0];

  if (!baseFile || !faceFile) {
    res
      .status(400)
      .json({ error: "Both baseImage and faceImage are required" });
    return;
  }

  const [baseImageUrl, faceImageUrl] = await Promise.all([
    uploadFile(baseFile),
    uploadFile(faceFile),
  ]);

  const faceSwap = await prisma.faceSwap.create({
    data: {
      userId: req.userId!,
      baseImageUrl: baseImageUrl!,
      faceImageUrl: faceImageUrl!,
      status: "PROCESSING",
    },
  });

  try {
    const { buffer, contentType } = await runFaceSwap({
      // FaceFusion's `-s` is the face being applied, `-t` the image it
      // gets applied to.
      source: { buffer: faceFile.buffer, contentType: faceFile.mimetype },
      target: { buffer: baseFile.buffer, contentType: baseFile.mimetype },
    });

    const outputUrl = await uploadObject({
      folder: "outputs",
      body: buffer,
      contentType,
    });

    const completed = await prisma.faceSwap.update({
      where: { id: faceSwap.id },
      data: { status: "COMPLETED", outputUrl },
    });

    res.status(201).json(completed);
  } catch (err) {
    console.error(`Face swap failed for ${faceSwap.id}:`, err);
    const failed = await prisma.faceSwap.update({
      where: { id: faceSwap.id },
      data: {
        status: "FAILED",
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    });
    res.status(502).json(failed);
  }
});

export default router;
