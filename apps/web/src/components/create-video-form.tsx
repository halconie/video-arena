import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createVideo, listVideoModels, type Video } from "@/lib/api";

// Fallback list shown until (or if) OPENROUTER_API_KEY is configured and
// GET /api/videos/models can return the live list.
const FALLBACK_MODELS = [
  "google/veo-3.1",
  "minimax/hailuo-3",
  "alibaba/wan-2.7",
];

const RESOLUTIONS = ["720p", "1080p"];
const ASPECT_RATIOS = ["16:9", "9:16", "1:1"];

export function CreateVideoForm({
  onCreated,
}: {
  onCreated: (video: Video) => void;
}) {
  const [models, setModels] = useState<string[]>(FALLBACK_MODELS);
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState(FALLBACK_MODELS[0]);
  const [duration, setDuration] = useState(5);
  const [resolution, setResolution] = useState(RESOLUTIONS[0]);
  const [aspectRatio, setAspectRatio] = useState(ASPECT_RATIOS[0]);
  const [generateAudio, setGenerateAudio] = useState(true);
  const [startFrame, setStartFrame] = useState<File | undefined>();
  const [endFrame, setEndFrame] = useState<File | undefined>();
  const [referenceFrames, setReferenceFrames] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listVideoModels()
      .then((response) => {
        // OpenRouter returns { data: [{ id, ... }, ...] }.
        const data =
          response &&
          typeof response === "object" &&
          "data" in response &&
          Array.isArray(response.data)
            ? response.data
            : null;
        if (!data || data.length === 0) return;

        const ids = data
          .map((m) => (typeof m === "object" && m && "id" in m ? String(m.id) : null))
          .filter((id): id is string => Boolean(id));
        if (ids.length > 0) setModels(ids);
      })
      .catch(() => {
        // OPENROUTER_API_KEY probably isn't configured yet - keep fallback list.
      });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const video = await createVideo({
        prompt,
        model,
        duration,
        resolution,
        aspectRatio,
        generateAudio,
        startFrame,
        endFrame,
        referenceFrames,
      });
      onCreated(video);
      setPrompt("");
      setStartFrame(undefined);
      setEndFrame(undefined);
      setReferenceFrames([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create video");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-2">
        <Label htmlFor="prompt">Prompt</Label>
        <Textarea
          id="prompt"
          placeholder="Describe the video you want to generate..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          required
          rows={4}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="flex flex-col gap-2">
          <Label>Model</Label>
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {models.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="duration">Duration (s)</Label>
          <Input
            id="duration"
            type="number"
            min={1}
            max={60}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Resolution</Label>
          <Select value={resolution} onValueChange={setResolution}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RESOLUTIONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label>Aspect ratio</Label>
          <Select value={aspectRatio} onValueChange={setAspectRatio}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASPECT_RATIOS.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="generate-audio"
          checked={generateAudio}
          onCheckedChange={setGenerateAudio}
        />
        <Label htmlFor="generate-audio">Generate audio</Label>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="start-frame">Start frame (optional)</Label>
          <Input
            id="start-frame"
            type="file"
            accept="image/*"
            onChange={(e) => setStartFrame(e.target.files?.[0])}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="end-frame">End frame (optional)</Label>
          <Input
            id="end-frame"
            type="file"
            accept="image/*"
            onChange={(e) => setEndFrame(e.target.files?.[0])}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="reference-frames">Reference frames (optional)</Label>
          <Input
            id="reference-frames"
            type="file"
            accept="image/*"
            multiple
            onChange={(e) =>
              setReferenceFrames(Array.from(e.target.files ?? []).slice(0, 4))
            }
          />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={submitting || !prompt} className="self-start">
        {submitting ? "Generating..." : "Generate video"}
      </Button>
    </form>
  );
}
