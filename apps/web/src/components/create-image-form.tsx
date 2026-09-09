import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createImage,
  listImageModels,
  type GeneratedImage,
} from "@/lib/api";

// Fallback list shown until (or if) OPENROUTER_API_KEY is configured and
// GET /api/images/models can return the live list.
const FALLBACK_MODELS = [
  "microsoft/mai-image-2.6",
  "openai/gpt-image-1-mini",
  "qwen/qwen-image-3",
];

const RESOLUTIONS = ["512", "1K", "2K", "4K"];
const ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4"];

export function CreateImageForm({
  onCreated,
}: {
  onCreated: (image: GeneratedImage) => void;
}) {
  const [models, setModels] = useState<string[]>(FALLBACK_MODELS);
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState(FALLBACK_MODELS[0]);
  const [resolution, setResolution] = useState(RESOLUTIONS[1]);
  const [aspectRatio, setAspectRatio] = useState(ASPECT_RATIOS[0]);
  const [referenceImages, setReferenceImages] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listImageModels()
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
          .map((m) =>
            typeof m === "object" && m && "id" in m ? String(m.id) : null,
          )
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
      const image = await createImage({
        prompt,
        model,
        resolution,
        aspectRatio,
        referenceImages,
      });
      onCreated(image);
      setPrompt("");
      setReferenceImages([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create image");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-2">
        <Label htmlFor="image-prompt">Prompt</Label>
        <Textarea
          id="image-prompt"
          placeholder="Describe the image you want to generate..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          required
          rows={4}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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

      <div className="flex flex-col gap-2">
        <Label htmlFor="reference-images">Reference images (optional)</Label>
        <Input
          id="reference-images"
          type="file"
          accept="image/*"
          multiple
          onChange={(e) =>
            setReferenceImages(Array.from(e.target.files ?? []).slice(0, 4))
          }
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        type="submit"
        disabled={submitting || !prompt}
        className="self-start"
      >
        {submitting ? "Generating..." : "Generate image"}
      </Button>
    </form>
  );
}
