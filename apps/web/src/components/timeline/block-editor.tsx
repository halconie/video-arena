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
import { formatTimecode } from "@/components/timeline/timeline";
import type { BlockInput, VideoBlock } from "@/lib/api";

const RESOLUTIONS = ["480p", "720p", "1080p"];
const ASPECT_RATIOS = ["16:9", "9:16", "1:1"];

export function BlockEditor({
  block,
  avatarCount,
  models,
  onSave,
  onDelete,
}: {
  block: VideoBlock;
  avatarCount: number;
  models: string[];
  onSave: (input: Partial<BlockInput>) => Promise<void>;
  onDelete: () => void;
}) {
  const [prompt, setPrompt] = useState(block.prompt);
  const [model, setModel] = useState(block.model);
  const [resolution, setResolution] = useState(block.resolution);
  const [aspectRatio, setAspectRatio] = useState(block.aspectRatio);
  const [swapStartFrame, setSwapStartFrame] = useState(block.swapStartFrame);
  const [swapEndFrame, setSwapEndFrame] = useState(block.swapEndFrame);
  const [avatarSlot, setAvatarSlot] = useState(block.avatarSlot);
  const [startFrame, setStartFrame] = useState<File | undefined>();
  const [endFrame, setEndFrame] = useState<File | undefined>();
  const [saving, setSaving] = useState(false);

  // Re-seed the form when a different clip is selected on the timeline.
  useEffect(() => {
    setPrompt(block.prompt);
    setModel(block.model);
    setResolution(block.resolution);
    setAspectRatio(block.aspectRatio);
    setSwapStartFrame(block.swapStartFrame);
    setSwapEndFrame(block.swapEndFrame);
    setAvatarSlot(block.avatarSlot);
    setStartFrame(undefined);
    setEndFrame(undefined);
  }, [block]);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        prompt,
        model,
        resolution,
        aspectRatio,
        swapStartFrame,
        swapEndFrame,
        avatarSlot,
        startFrame,
        endFrame,
      });
    } finally {
      setSaving(false);
    }
  }

  const duration = block.endSeconds - block.startSeconds;

  return (
    <div className="flex w-full flex-col gap-4 rounded-lg border p-4">
      <div>
        <h2 className="text-sm font-semibold">Video block</h2>
        <p className="font-mono text-xs text-muted-foreground">
          {formatTimecode(block.startSeconds)} &rarr;{" "}
          {formatTimecode(block.endSeconds)} ({duration}s)
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="block-prompt">Prompt</Label>
        <Textarea
          id="block-prompt"
          rows={4}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
      </div>

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

      <div className="grid grid-cols-2 gap-3">
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
        <Label htmlFor="block-start-frame">
          Start frame {block.startFrameUrl ? "(replace)" : "(optional)"}
        </Label>
        <Input
          id="block-start-frame"
          type="file"
          accept="image/*"
          onChange={(e) => setStartFrame(e.target.files?.[0])}
        />
        {block.startFrameUrl && (
          <img
            src={block.startFrameUrl}
            alt="Start frame"
            className="h-16 w-16 rounded border object-cover"
          />
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="block-end-frame">
          End frame {block.endFrameUrl ? "(replace)" : "(optional)"}
        </Label>
        <Input
          id="block-end-frame"
          type="file"
          accept="image/*"
          onChange={(e) => setEndFrame(e.target.files?.[0])}
        />
        {block.endFrameUrl && (
          <img
            src={block.endFrameUrl}
            alt="End frame"
            className="h-16 w-16 rounded border object-cover"
          />
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-md border p-3">
        <p className="text-xs font-medium">Face swap</p>
        <p className="text-xs text-muted-foreground">
          When enabled, the avatar&apos;s face is swapped onto the frame
          <em> before</em> the clip is generated.
        </p>
        <div className="flex items-center gap-3">
          <Switch
            id="swap-start"
            checked={swapStartFrame}
            onCheckedChange={setSwapStartFrame}
          />
          <Label htmlFor="swap-start">Swap on start frame</Label>
        </div>
        <div className="flex items-center gap-3">
          <Switch
            id="swap-end"
            checked={swapEndFrame}
            onCheckedChange={setSwapEndFrame}
          />
          <Label htmlFor="swap-end">Swap on end frame</Label>
        </div>

        {avatarCount > 1 && (
          <div className="flex flex-col gap-2">
            <Label>Avatar slot</Label>
            <Select
              value={String(avatarSlot)}
              onValueChange={(v) => setAvatarSlot(Number(v))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: avatarCount }, (_, i) => i + 1).map(
                  (slot) => (
                    <SelectItem key={slot} value={String(slot)}>
                      Avatar {slot}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={saving} size="sm">
          {saving ? "Saving..." : "Save block"}
        </Button>
        <Button variant="outline" size="sm" onClick={onDelete}>
          Delete
        </Button>
      </div>
    </div>
  );
}
