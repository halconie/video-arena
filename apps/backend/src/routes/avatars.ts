import { Router } from "express";
import { z } from "zod";
import { prisma } from "@repo/db";
import { requireAuth } from "../middleware/auth.js";
import { upload } from "../lib/uploads.js";
import { uploadFile } from "../lib/minio.js";

const router = Router();

router.use(requireAuth);

// GET /api/avatars - the current user's avatars, newest first
router.get("/", async (req, res) => {
  const avatars = await prisma.avatar.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: "desc" },
  });
  res.json(avatars);
});

const createAvatarSchema = z.object({
  name: z.string().min(1),
});

const avatarImages = upload.fields([{ name: "images", maxCount: 2 }]);

// POST /api/avatars - create an avatar from 1-2 face images
router.post("/", avatarImages, async (req, res) => {
  const parsed = createAvatarSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const files = req.files as
    | Record<string, Express.Multer.File[]>
    | undefined;
  const images = files?.images ?? [];

  if (images.length < 1 || images.length > 2) {
    res.status(400).json({ error: "Provide 1 or 2 images" });
    return;
  }

  const imageUrls = (await Promise.all(images.map(uploadFile))).filter(
    (url): url is string => Boolean(url),
  );

  const avatar = await prisma.avatar.create({
    data: {
      userId: req.userId!,
      name: parsed.data.name,
      imageUrls,
    },
  });

  res.status(201).json(avatar);
});

// DELETE /api/avatars/:id
router.delete("/:id", async (req, res) => {
  const { count } = await prisma.avatar.deleteMany({
    where: { id: req.params.id, userId: req.userId },
  });
  if (count === 0) {
    res.status(404).json({ error: "Avatar not found" });
    return;
  }
  res.status(204).end();
});

export default router;
