// Thin client for OpenRouter's video generation API.
// https://openrouter.ai/docs/guides/overview/multimodal/video-generation
//
// The API itself is async (submit a job, poll until done) - this module
// hides that behind a single function so the rest of the backend can treat
// video generation as one synchronous call, per the spec.

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

type FrameImage = {
  type: "image_url";
  image_url: { url: string };
  frame_type: "first_frame" | "last_frame";
};

type InputReference = {
  type: "image_url";
  image_url: { url: string };
};

export type CreateVideoParams = {
  model: string;
  prompt: string;
  duration: number;
  resolution: string;
  aspectRatio: string;
  startFrameUrl?: string;
  endFrameUrl?: string;
  referenceFrameUrls?: string[];
};

type CreateVideoJobResponse = {
  id: string;
  polling_url: string;
  status: string;
};

type PollVideoJobResponse = {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  unsigned_urls?: string[];
  error?: { message?: string };
};

/** Lists video generation models available through OpenRouter, with their supported params. */
export async function listVideoModels(): Promise<unknown> {
  const res = await fetch(`${OPENROUTER_BASE_URL}/videos/models`, {
    headers: headers(),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `OpenRouter model list failed: ${res.status} ${res.statusText} - ${body}`,
    );
  }
  return res.json();
}

function apiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }
  return key;
}

function headers() {
  return {
    Authorization: `Bearer ${apiKey()}`,
    "Content-Type": "application/json",
  };
}

async function createVideoJob(
  params: CreateVideoParams,
): Promise<CreateVideoJobResponse> {
  const frameImages: FrameImage[] = [];
  if (params.startFrameUrl) {
    frameImages.push({
      type: "image_url",
      image_url: { url: params.startFrameUrl },
      frame_type: "first_frame",
    });
  }
  if (params.endFrameUrl) {
    frameImages.push({
      type: "image_url",
      image_url: { url: params.endFrameUrl },
      frame_type: "last_frame",
    });
  }

  const inputReferences: InputReference[] = (
    params.referenceFrameUrls ?? []
  ).map((url) => ({ type: "image_url", image_url: { url } }));

  const res = await fetch(`${OPENROUTER_BASE_URL}/videos`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      model: params.model,
      prompt: params.prompt,
      duration: params.duration,
      resolution: params.resolution,
      aspect_ratio: params.aspectRatio,
      ...(frameImages.length > 0 ? { frame_images: frameImages } : {}),
      ...(inputReferences.length > 0
        ? { input_references: inputReferences }
        : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `OpenRouter video creation failed: ${res.status} ${res.statusText} - ${body}`,
    );
  }

  return (await res.json()) as CreateVideoJobResponse;
}

async function pollVideoJob(
  pollingUrl: string,
): Promise<PollVideoJobResponse> {
  const res = await fetch(pollingUrl, { headers: headers() });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `OpenRouter video poll failed: ${res.status} ${res.statusText} - ${body}`,
    );
  }
  return (await res.json()) as PollVideoJobResponse;
}

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 10 * 60 * 1_000; // 10 minutes

/**
 * Submits a video generation job to OpenRouter and blocks (polling
 * internally) until it completes or fails. Returns the URL to download the
 * finished video from.
 */
export async function generateVideo(
  params: CreateVideoParams,
): Promise<string> {
  const job = await createVideoJob(params);

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const result = await pollVideoJob(job.polling_url);

    if (result.status === "completed") {
      const url = result.unsigned_urls?.[0];
      if (!url) {
        throw new Error("OpenRouter reported completion but returned no video URL");
      }
      return url;
    }

    if (result.status === "failed") {
      throw new Error(
        `OpenRouter video generation failed: ${result.error?.message ?? "unknown error"}`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error("Timed out waiting for OpenRouter video generation");
}

/** Downloads the finished video's bytes from an `unsigned_urls[0]` URL. */
export async function downloadVideo(
  url: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) {
    throw new Error(
      `Failed to download generated video: ${res.status} ${res.statusText}`,
    );
  }
  const arrayBuffer = await res.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: res.headers.get("content-type") ?? "video/mp4",
  };
}
