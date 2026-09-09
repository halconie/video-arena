import multer from "multer";

// Shared across every route that accepts image uploads (video frames,
// image-generation references, face-swap inputs). Memory storage since
// everything gets forwarded to MinIO/OpenRouter as buffers, never written
// to local disk.
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB per image
});
