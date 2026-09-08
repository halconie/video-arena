const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:4000";

export type VideoStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

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
  status: VideoStatus;
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
    // A failed video generation (502) responds with the Video row itself,
    // whose failure reason lives in `errorMessage`, not `error`.
    throw new Error(
      body.error ?? body.errorMessage ?? `Request failed: ${res.status}`,
    );
  }
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
