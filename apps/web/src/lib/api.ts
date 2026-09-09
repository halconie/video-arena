const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:4000";

/** Shared by videos, images and face swaps (Video.status /
 * GenerationStatus in the Prisma schema - same four values). */
export type GenerationStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED";

export type Video = {
  id: string;
  userId: string;
  prompt: string;
  model: string;
  duration: number;
  resolution: string;
  aspectRatio: string;
  startFrameUrl: string | null;
  endFrameUrl: string | null;
  referenceFrameUrls: string[];
  generateAudio: boolean;
  status: GenerationStatus;
  outputUrl: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateVideoInput = {
  prompt: string;
  model: string;
  duration: number;
  resolution: string;
  aspectRatio: string;
  generateAudio: boolean;
  startFrame?: File;
  endFrame?: File;
  referenceFrames?: File[];
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    credentials: "include",
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // A failed generation (502) responds with the row itself, whose failure
    // reason lives in `errorMessage`, not `error`.
    throw new Error(
      body.error ?? body.errorMessage ?? `Request failed: ${res.status}`,
    );
  }
  // DELETE endpoints reply 204 with no body - json() would throw.
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function listVideos(): Promise<Video[]> {
  return request<Video[]>("/api/videos");
}

export function getVideo(id: string): Promise<Video> {
  return request<Video>(`/api/videos/${id}`);
}

export function listVideoModels(): Promise<unknown> {
  return request("/api/videos/models");
}

// --- Images -------------------------------------------------------------

export type GeneratedImage = {
  id: string;
  userId: string;
  prompt: string;
  model: string;
  resolution: string;
  aspectRatio: string;
  referenceImageUrls: string[];
  status: GenerationStatus;
  outputUrl: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateImageInput = {
  prompt: string;
  model: string;
  resolution: string;
  aspectRatio: string;
  referenceImages?: File[];
};

export function listImages(): Promise<GeneratedImage[]> {
  return request<GeneratedImage[]>("/api/images");
}

export function listImageModels(): Promise<unknown> {
  return request("/api/images/models");
}

export function createImage(input: CreateImageInput): Promise<GeneratedImage> {
  const form = new FormData();
  form.set("prompt", input.prompt);
  form.set("model", input.model);
  form.set("resolution", input.resolution);
  form.set("aspectRatio", input.aspectRatio);
  for (const file of input.referenceImages ?? []) {
    form.append("referenceImages", file);
  }

  return request<GeneratedImage>("/api/images", {
    method: "POST",
    body: form,
  });
}

// --- Face swap ----------------------------------------------------------

export type FaceSwap = {
  id: string;
  userId: string;
  baseImageUrl: string;
  faceImageUrl: string;
  status: GenerationStatus;
  outputUrl: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export function listFaceSwaps(): Promise<FaceSwap[]> {
  return request<FaceSwap[]>("/api/faceswap");
}

export function createFaceSwap(input: {
  baseImage: File;
  faceImage: File;
}): Promise<FaceSwap> {
  const form = new FormData();
  form.set("baseImage", input.baseImage);
  form.set("faceImage", input.faceImage);

  return request<FaceSwap>("/api/faceswap", {
    method: "POST",
    body: form,
  });
}

export function createVideo(input: CreateVideoInput): Promise<Video> {
  const form = new FormData();
  form.set("prompt", input.prompt);
  form.set("model", input.model);
  form.set("duration", String(input.duration));
  form.set("resolution", input.resolution);
  form.set("aspectRatio", input.aspectRatio);
  form.set("generateAudio", String(input.generateAudio));
  if (input.startFrame) form.set("startFrame", input.startFrame);
  if (input.endFrame) form.set("endFrame", input.endFrame);
  for (const file of input.referenceFrames ?? []) {
    form.append("referenceFrames", file);
  }

  return request<Video>("/api/videos", {
    method: "POST",
    body: form,
  });
}

// --- Avatars ------------------------------------------------------------

export type Avatar = {
  id: string;
  userId: string;
  name: string;
  imageUrls: string[];
  createdAt: string;
  updatedAt: string;
};

export function listAvatars(): Promise<Avatar[]> {
  return request<Avatar[]>("/api/avatars");
}

export function createAvatar(input: {
  name: string;
  images: File[];
}): Promise<Avatar> {
  const form = new FormData();
  form.set("name", input.name);
  for (const image of input.images) form.append("images", image);

  return request<Avatar>("/api/avatars", { method: "POST", body: form });
}

export function deleteAvatar(id: string): Promise<void> {
  return request<void>(`/api/avatars/${id}`, { method: "DELETE" });
}

// --- Templates ----------------------------------------------------------

export type TemplateStatus = "DRAFT" | "EXPORTED";

export type VideoBlock = {
  id: string;
  templateId: string;
  startSeconds: number;
  endSeconds: number;
  prompt: string;
  model: string;
  resolution: string;
  aspectRatio: string;
  startFrameUrl: string | null;
  endFrameUrl: string | null;
  referenceImageUrls: string[];
  swapStartFrame: boolean;
  swapEndFrame: boolean;
  avatarSlot: number;
};

export type Template = {
  id: string;
  createdById: string;
  name: string;
  description: string | null;
  avatarCount: number;
  audioUrl: string | null;
  durationSeconds: number;
  status: TemplateStatus;
  previewVideoUrl: string | null;
  thumbnailUrl: string | null;
  blocks?: VideoBlock[];
  createdAt: string;
  updatedAt: string;
};

export type TemplateRender = {
  id: string;
  templateId: string;
  userId: string;
  avatarIds: string[];
  isPreview: boolean;
  status: GenerationStatus;
  outputUrl: string | null;
  thumbnailUrl: string | null;
  errorMessage: string | null;
  template?: { name: string };
  createdAt: string;
  updatedAt: string;
};

/** Exported templates, visible to all signed-in users. */
export function listTemplates(): Promise<Template[]> {
  return request<Template[]>("/api/templates");
}

export function getTemplate(id: string): Promise<Template> {
  return request<Template>(`/api/templates/${id}`);
}

export function listMyRenders(): Promise<TemplateRender[]> {
  return request<TemplateRender[]>("/api/templates/renders");
}

/** Long-running. Pass `renderId` to resume a render that was interrupted. */
export function renderTemplate(
  templateId: string,
  input: { avatarIds: string[]; renderId?: string },
): Promise<TemplateRender> {
  return request<TemplateRender>(`/api/templates/${templateId}/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

// --- Templates: admin ---------------------------------------------------

export function listAllTemplates(): Promise<Template[]> {
  return request<Template[]>("/api/templates/admin/all");
}

export function createTemplate(input: {
  name: string;
  description?: string;
  avatarCount: number;
  durationSeconds: number;
}): Promise<Template> {
  return request<Template>("/api/templates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function updateTemplate(
  id: string,
  input: Partial<{
    name: string;
    description: string;
    avatarCount: number;
    durationSeconds: number;
  }>,
): Promise<Template> {
  return request<Template>(`/api/templates/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function deleteTemplate(id: string): Promise<void> {
  return request<void>(`/api/templates/${id}`, { method: "DELETE" });
}

export function uploadTemplateAudio(
  id: string,
  audio: File,
): Promise<Template> {
  const form = new FormData();
  form.set("audio", audio);
  return request<Template>(`/api/templates/${id}/audio`, {
    method: "POST",
    body: form,
  });
}

export type BlockInput = {
  startSeconds: number;
  endSeconds: number;
  prompt: string;
  model: string;
  resolution?: string;
  aspectRatio?: string;
  swapStartFrame?: boolean;
  swapEndFrame?: boolean;
  avatarSlot?: number;
  startFrame?: File;
  endFrame?: File;
  referenceImages?: File[];
};

function blockFormData(input: Partial<BlockInput>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (value instanceof File) {
      form.set(key, value);
    } else if (Array.isArray(value)) {
      for (const file of value) form.append(key, file as File);
    } else {
      form.set(key, String(value));
    }
  }
  return form;
}

export function createBlock(
  templateId: string,
  input: BlockInput,
): Promise<VideoBlock> {
  return request<VideoBlock>(`/api/templates/${templateId}/blocks`, {
    method: "POST",
    body: blockFormData(input),
  });
}

export function updateBlock(
  templateId: string,
  blockId: string,
  input: Partial<BlockInput>,
): Promise<VideoBlock> {
  return request<VideoBlock>(
    `/api/templates/${templateId}/blocks/${blockId}`,
    { method: "PATCH", body: blockFormData(input) },
  );
}

export function deleteBlock(
  templateId: string,
  blockId: string,
): Promise<void> {
  return request<void>(`/api/templates/${templateId}/blocks/${blockId}`, {
    method: "DELETE",
  });
}

/** Long-running. Renders the template with the admin's own avatar(s). */
export function previewTemplate(
  templateId: string,
  input: { avatarIds: string[]; renderId?: string },
): Promise<TemplateRender> {
  return request<TemplateRender>(`/api/templates/${templateId}/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function exportTemplate(templateId: string): Promise<Template> {
  return request<Template>(`/api/templates/${templateId}/export`, {
    method: "POST",
  });
}
