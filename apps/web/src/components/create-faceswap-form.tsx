import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createFaceSwap, type FaceSwap } from "@/lib/api";

export function CreateFaceSwapForm({
  onCreated,
}: {
  onCreated: (faceSwap: FaceSwap) => void;
}) {
  const [baseImage, setBaseImage] = useState<File | undefined>();
  const [faceImage, setFaceImage] = useState<File | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!baseImage || !faceImage) return;

    // Captured before the await - `e.currentTarget` is null by the time an
    // async handler resumes.
    const form = e.currentTarget;

    setError(null);
    setSubmitting(true);
    try {
      const faceSwap = await createFaceSwap({ baseImage, faceImage });
      onCreated(faceSwap);
      setBaseImage(undefined);
      setFaceImage(undefined);
      form.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Face swap failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="base-image">Base image</Label>
          <Input
            id="base-image"
            type="file"
            accept="image/*"
            required
            onChange={(e) => setBaseImage(e.target.files?.[0])}
          />
          <p className="text-xs text-muted-foreground">
            The photo whose face gets replaced.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="face-image">Face image</Label>
          <Input
            id="face-image"
            type="file"
            accept="image/*"
            required
            onChange={(e) => setFaceImage(e.target.files?.[0])}
          />
          <p className="text-xs text-muted-foreground">
            The face to put onto the base image.
          </p>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        type="submit"
        disabled={submitting || !baseImage || !faceImage}
        className="self-start"
      >
        {submitting ? "Swapping..." : "Swap face"}
      </Button>

      <p className="text-xs text-muted-foreground">
        Face swapping runs on the self-hosted FaceFusion service. If it
        isn&apos;t running, start it with{" "}
        <code className="rounded bg-muted px-1 py-0.5">
          docker compose --profile facefusion up -d facefusion
        </code>
        .
      </p>
    </form>
  );
}
