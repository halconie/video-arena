import { Router } from "express";
import { z } from "zod";
import { prisma } from "@repo/db";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { upload } from "../lib/uploads.js";
import { uploadFile } from "../lib/minio.js";
import { renderTemplate } from "../lib/render.js";

const router = Router();

router.use(requireAuth);

// --- User-facing --------------------------------------------------------

// GET /api/templates - exported templates, available to everyone
router.get("/", async (_req, res) => {
  const templates = await prisma.template.findMany({
    where: { status: "EXPORTED" },
    orderBy: { createdAt: "desc" },
  });
  res.json(templates);
});

// GET /api/templates/renders - the current user's renders
router.get("/renders", async (req, res) => {
  const renders = await prisma.templateRender.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: "desc" },
    include: { template: { select: { name: true } } },
  });
  res.json(renders);
});

// GET /api/templates/:id - a single template with its blocks. Admins can see
// their drafts; everyone else only sees exported ones.
router.get("/:id", async (req, res) => {
  const template = await prisma.template.findUnique({
    where: { id: req.params.id },
    include: { blocks: { orderBy: { startSeconds: "asc" } } },
  });

  if (
    !template ||
    (template.status !== "EXPORTED" && req.userRole !== "admin")
  ) {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  res.json(template);
});

const renderSchema = z.object({
  avatarIds: z.array(z.string()).min(1).max(2),
  /** Resume an existing render instead of starting a fresh one. */
  renderId: z.string().optional(),
});

// POST /api/templates/:id/render - generate this template with the caller's
// avatar(s). Long-running and synchronous; pass `renderId` to resume.
router.post("/:id/render", async (req, res) => {
  const parsed = renderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { avatarIds, renderId } = parsed.data;

  const template = await prisma.template.findUnique({
    where: { id: req.params.id },
  });
  if (!template || template.status !== "EXPORTED") {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  if (avatarIds.length !== template.avatarCount) {
    res.status(400).json({
      error: `This template needs exactly ${template.avatarCount} avatar(s)`,
    });
    return;
  }

  // Avatars must belong to the caller.
  const owned = await prisma.avatar.count({
    where: { id: { in: avatarIds }, userId: req.userId },
  });
  if (owned !== avatarIds.length) {
    res.status(400).json({ error: "Unknown avatar" });
    return;
  }

  const render = renderId
    ? await prisma.templateRender.findFirst({
        where: { id: renderId, userId: req.userId, templateId: template.id },
      })
    : await prisma.templateRender.create({
        data: { templateId: template.id, userId: req.userId!, avatarIds },
      });

  if (!render) {
    res.status(404).json({ error: "Render not found" });
    return;
  }

  try {
    await renderTemplate(render.id);
    res.status(201).json(
      await prisma.templateRender.findUnique({ where: { id: render.id } }),
    );
  } catch {
    // renderTemplate already recorded the failure on the row.
    res.status(502).json(
      await prisma.templateRender.findUnique({ where: { id: render.id } }),
    );
  }
});

// --- Admin --------------------------------------------------------------

router.use(requireAdmin);

// GET /api/templates/admin/all - every template, including drafts
router.get("/admin/all", async (_req, res) => {
  const templates = await prisma.template.findMany({
    orderBy: { createdAt: "desc" },
    include: { blocks: { orderBy: { startSeconds: "asc" } } },
  });
  res.json(templates);
});

const templateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  avatarCount: z.coerce.number().int().min(1).max(2).default(1),
  durationSeconds: z.coerce.number().int().min(1).max(3600).default(60),
});

// POST /api/templates - create a draft template
router.post("/", async (req, res) => {
  const parsed = templateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const template = await prisma.template.create({
    data: { ...parsed.data, createdById: req.userId! },
    include: { blocks: true },
  });
  res.status(201).json(template);
});

// PATCH /api/templates/:id
router.patch("/:id", async (req, res) => {
  const parsed = templateSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const template = await prisma.template.update({
    where: { id: req.params.id },
    data: parsed.data,
    include: { blocks: { orderBy: { startSeconds: "asc" } } },
  });
  res.json(template);
});

// DELETE /api/templates/:id
router.delete("/:id", async (req, res) => {
  await prisma.template.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

// POST /api/templates/:id/audio - set the base audio track
router.post("/:id/audio", upload.single("audio"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "audio file is required" });
    return;
  }

  const audioUrl = await uploadFile(req.file);
  const template = await prisma.template.update({
    where: { id: String(req.params.id) },
    data: { audioUrl },
  });
  res.json(template);
});

// Blocks are sent as multipart (they carry frame images), so booleans arrive
// as the strings "true"/"false" - and z.coerce.boolean("false") is `true`.
// Same trap as the video route's generateAudio flag.
const multipartBoolean = z.preprocess(
  (v) => (v === "false" ? false : v === "true" ? true : v),
  z.boolean(),
);

const blockSchema = z.object({
  startSeconds: z.coerce.number().int().min(0),
  endSeconds: z.coerce.number().int().min(1),
  prompt: z.string().min(1),
  model: z.string().min(1),
  resolution: z.string().default("720p"),
  aspectRatio: z.string().default("16:9"),
  swapStartFrame: multipartBoolean.default(false),
  swapEndFrame: multipartBoolean.default(false),
  avatarSlot: z.coerce.number().int().min(1).max(2).default(1),
});

const blockFrames = upload.fields([
  { name: "startFrame", maxCount: 1 },
  { name: "endFrame", maxCount: 1 },
  { name: "referenceImages", maxCount: 4 },
]);

// POST /api/templates/:id/blocks - add a block to the timeline
router.post("/:id/blocks", blockFrames, async (req, res) => {
  const parsed = blockSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  if (parsed.data.endSeconds <= parsed.data.startSeconds) {
    res.status(400).json({ error: "endSeconds must be after startSeconds" });
    return;
  }

  const files = req.files as
    | Record<string, Express.Multer.File[]>
    | undefined;

  const [startFrameUrl, endFrameUrl, referenceImageUrls] = await Promise.all([
    uploadFile(files?.startFrame?.[0]),
    uploadFile(files?.endFrame?.[0]),
    Promise.all((files?.referenceImages ?? []).map(uploadFile)).then((urls) =>
      urls.filter((u): u is string => Boolean(u)),
    ),
  ]);

  const block = await prisma.videoBlock.create({
    data: {
      ...parsed.data,
      templateId: String(req.params.id),
      startFrameUrl,
      endFrameUrl,
      referenceImageUrls,
    },
  });
  res.status(201).json(block);
});

// PATCH /api/templates/:id/blocks/:blockId
router.patch("/:id/blocks/:blockId", blockFrames, async (req, res) => {
  const parsed = blockSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const files = req.files as
    | Record<string, Express.Multer.File[]>
    | undefined;

  const [startFrameUrl, endFrameUrl] = await Promise.all([
    uploadFile(files?.startFrame?.[0]),
    uploadFile(files?.endFrame?.[0]),
  ]);

  const block = await prisma.videoBlock.update({
    where: { id: String(req.params.blockId) },
    data: {
      ...parsed.data,
      ...(startFrameUrl ? { startFrameUrl } : {}),
      ...(endFrameUrl ? { endFrameUrl } : {}),
    },
  });
  res.json(block);
});

// DELETE /api/templates/:id/blocks/:blockId
router.delete("/:id/blocks/:blockId", async (req, res) => {
  await prisma.videoBlock.delete({ where: { id: req.params.blockId } });
  res.status(204).end();
});

const previewSchema = z.object({
  avatarIds: z.array(z.string()).min(1).max(2),
  renderId: z.string().optional(),
});

// POST /api/templates/:id/preview - render the template with the admin's own
// avatar(s) so they can check it before exporting. Resumable, same as a user
// render.
router.post("/:id/preview", async (req, res) => {
  const parsed = previewSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { avatarIds, renderId } = parsed.data;

  const template = await prisma.template.findUnique({
    where: { id: req.params.id },
  });
  if (!template) {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  const render = renderId
    ? await prisma.templateRender.findFirst({
        where: { id: renderId, templateId: template.id, isPreview: true },
      })
    : await prisma.templateRender.create({
        data: {
          templateId: template.id,
          userId: req.userId!,
          avatarIds,
          isPreview: true,
        },
      });

  if (!render) {
    res.status(404).json({ error: "Render not found" });
    return;
  }

  try {
    await renderTemplate(render.id);
    const done = await prisma.templateRender.findUnique({
      where: { id: render.id },
    });
    // The most recent successful preview becomes what users see on the
    // template card.
    await prisma.template.update({
      where: { id: template.id },
      data: {
        previewVideoUrl: done?.outputUrl,
        thumbnailUrl: done?.thumbnailUrl,
      },
    });
    res.status(201).json(done);
  } catch {
    res.status(502).json(
      await prisma.templateRender.findUnique({ where: { id: render.id } }),
    );
  }
});

// POST /api/templates/:id/export - publish the template to users. Requires a
// successful preview first, which is also what supplies the thumbnail.
router.post("/:id/export", async (req, res) => {
  const template = await prisma.template.findUnique({
    where: { id: req.params.id },
    include: { blocks: true },
  });
  if (!template) {
    res.status(404).json({ error: "Template not found" });
    return;
  }
  if (template.blocks.length === 0) {
    res.status(400).json({ error: "Add at least one video block first" });
    return;
  }
  if (!template.previewVideoUrl || !template.thumbnailUrl) {
    res.status(400).json({
      error: "Run a preview first - its output is used as the template thumbnail",
    });
    return;
  }

  const exported = await prisma.template.update({
    where: { id: template.id },
    data: { status: "EXPORTED" },
  });
  res.json(exported);
});

export default router;
