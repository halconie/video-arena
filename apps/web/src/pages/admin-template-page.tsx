import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { RequireSession } from "@/components/require-session";
import { Timeline } from "@/components/timeline/timeline";
import { BlockEditor } from "@/components/timeline/block-editor";
import { useSession } from "@/lib/auth-client";
import {
  createBlock,
  createTemplate,
  deleteBlock,
  exportTemplate,
  getTemplate,
  listAllTemplates,
  listAvatars,
  listVideoModels,
  previewTemplate,
  updateBlock,
  uploadTemplateAudio,
  type Avatar,
  type BlockInput,
  type Template,
  type TemplateRender,
  type VideoBlock,
} from "@/lib/api";

const FALLBACK_MODELS = [
  "kwaivgi/kling-v3.0-std",
  "alibaba/wan-3.0",
  "google/veo-3.1-fast",
];

export function AdminTemplatePage() {
  return (
    <RequireSession title="Sign in to build templates">
      <AdminGate />
    </RequireSession>
  );
}

function AdminGate() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;

  if (role !== "admin") {
    return (
      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-12">
        <p className="text-sm text-muted-foreground">
          You need an admin account to build templates.
        </p>
      </div>
    );
  }

  return <TemplateBuilder />;
}

function TemplateBuilder() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [template, setTemplate] = useState<Template | null>(null);
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [models, setModels] = useState<string[]>(FALLBACK_MODELS);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [render, setRender] = useState<TemplateRender | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // New-template form
  const [name, setName] = useState("");
  const [avatarCount, setAvatarCount] = useState(1);
  const [durationSeconds, setDurationSeconds] = useState(60);

  useEffect(() => {
    listAllTemplates().then(setTemplates).catch(() => {});
    listAvatars().then(setAvatars).catch(() => {});
    listVideoModels()
      .then((response) => {
        const data =
          response &&
          typeof response === "object" &&
          "data" in response &&
          Array.isArray(response.data)
            ? response.data
            : null;
        if (!data?.length) return;
        const ids = data
          .map((m) =>
            typeof m === "object" && m && "id" in m ? String(m.id) : null,
          )
          .filter((id): id is string => Boolean(id));
        if (ids.length) setModels(ids);
      })
      .catch(() => {});
  }, []);

  const reload = useCallback(async (id: string) => {
    const fresh = await getTemplate(id);
    setTemplate(fresh);
    return fresh;
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const created = await createTemplate({
        name,
        avatarCount,
        durationSeconds,
      });
      setTemplates((prev) => [created, ...prev]);
      setTemplate({ ...created, blocks: [] });
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
    }
  }

  async function handleAddBlock(startSeconds: number) {
    if (!template) return;
    const end = Math.min(template.durationSeconds, startSeconds + 5);
    if (end <= startSeconds) return;

    await createBlock(template.id, {
      startSeconds,
      endSeconds: end,
      prompt: "New block",
      model: models[0] ?? FALLBACK_MODELS[0]!,
    });
    await reload(template.id);
  }

  async function handleMoveBlock(id: string, start: number, end: number) {
    if (!template) return;
    // Optimistic - the timeline already drew it in the new position.
    setTemplate({
      ...template,
      blocks: template.blocks?.map((b) =>
        b.id === id ? { ...b, startSeconds: start, endSeconds: end } : b,
      ),
    });
    await updateBlock(template.id, id, {
      startSeconds: start,
      endSeconds: end,
    }).catch(() => {});
  }

  async function handleSaveBlock(blockId: string, input: Partial<BlockInput>) {
    if (!template) return;
    await updateBlock(template.id, blockId, input);
    await reload(template.id);
  }

  async function handleDeleteBlock(blockId: string) {
    if (!template) return;
    await deleteBlock(template.id, blockId);
    setSelectedBlockId(null);
    await reload(template.id);
  }

  async function handleAudio(file: File) {
    if (!template) return;
    const updated = await uploadTemplateAudio(template.id, file);
    setTemplate({ ...updated, blocks: template.blocks });
  }

  async function handlePreview() {
    if (!template) return;
    const ids = avatars.slice(0, template.avatarCount).map((a) => a.id);
    if (ids.length < template.avatarCount) {
      setError(
        `This template needs ${template.avatarCount} avatar(s) - create them on the Avatar page first.`,
      );
      return;
    }

    setError(null);
    setBusy("Rendering preview - this generates every block and can take many minutes...");
    try {
      const result = await previewTemplate(template.id, {
        avatarIds: ids,
        // Resume the previous attempt rather than paying to regenerate.
        renderId: render?.status === "FAILED" ? render.id : undefined,
      });
      setRender(result);
      await reload(template.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleExport() {
    if (!template) return;
    setError(null);
    try {
      const exported = await exportTemplate(template.id);
      setTemplate({ ...exported, blocks: template.blocks });
      setTemplates((prev) =>
        prev.map((t) => (t.id === exported.id ? exported : t)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    }
  }

  const blocks: VideoBlock[] = template?.blocks ?? [];
  const selectedBlock = blocks.find((b) => b.id === selectedBlockId) ?? null;

  return (
    <div className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-8">
      <h1 className="text-xl font-semibold">Template creator</h1>

      <div className="mt-4 flex flex-wrap items-end gap-4">
        <form className="flex flex-wrap items-end gap-3" onSubmit={handleCreate}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="t-name">New template</Label>
            <Input
              id="t-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Template name"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Avatars</Label>
            <Select
              value={String(avatarCount)}
              onValueChange={(v) => setAvatarCount(Number(v))}
            >
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1</SelectItem>
                <SelectItem value="2">2</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="t-duration">Length (s)</Label>
            <Input
              id="t-duration"
              type="number"
              min={1}
              max={3600}
              className="w-28"
              value={durationSeconds}
              onChange={(e) => setDurationSeconds(Number(e.target.value))}
            />
          </div>
          <Button type="submit" disabled={!name}>
            Create
          </Button>
        </form>

        {templates.length > 0 && (
          <div className="flex flex-col gap-2">
            <Label>Open existing</Label>
            <Select
              value={template?.id ?? ""}
              onValueChange={(id) => {
                setSelectedBlockId(null);
                setRender(null);
                reload(id);
              }}
            >
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Select a template" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} ({t.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
      {busy && <p className="mt-4 text-sm text-muted-foreground">{busy}</p>}

      {template && (
        <>
          <div className="mt-6 flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="t-audio">Base audio track</Label>
              <Input
                id="t-audio"
                type="file"
                accept="audio/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleAudio(file);
                }}
              />
            </div>
            <Button variant="outline" onClick={handlePreview} disabled={!!busy}>
              Preview render
            </Button>
            <Button
              onClick={handleExport}
              disabled={!!busy || template.status === "EXPORTED"}
            >
              {template.status === "EXPORTED" ? "Exported" : "Export"}
            </Button>
            <span className="text-xs text-muted-foreground">
              {blocks.length} block(s) &middot; {template.avatarCount} avatar
              slot(s) &middot; {template.durationSeconds}s
            </span>
          </div>

          <div className="mt-4">
            <Timeline
              durationSeconds={template.durationSeconds}
              blocks={blocks}
              audioUrl={template.audioUrl}
              selectedBlockId={selectedBlockId}
              onSelectBlock={setSelectedBlockId}
              onMoveBlock={handleMoveBlock}
              onAddBlockAt={handleAddBlock}
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <p className="text-sm font-medium">Preview</p>
                {render && <StatusBadge status={render.status} />}
              </CardHeader>
              <CardContent>
                {render?.outputUrl ? (
                  <video
                    src={render.outputUrl}
                    controls
                    className="aspect-video w-full rounded-md bg-black"
                  />
                ) : template.previewVideoUrl ? (
                  <video
                    src={template.previewVideoUrl}
                    controls
                    className="aspect-video w-full rounded-md bg-black"
                  />
                ) : (
                  <div className="flex aspect-video w-full items-center justify-center rounded-md bg-muted p-4 text-center text-xs text-muted-foreground">
                    {render?.errorMessage ??
                      "Run a preview render to see the stitched video. Its first frame becomes the template thumbnail."}
                  </div>
                )}
              </CardContent>
            </Card>

            {selectedBlock ? (
              <BlockEditor
                key={selectedBlock.id}
                block={selectedBlock}
                avatarCount={template.avatarCount}
                models={models}
                onSave={(input) => handleSaveBlock(selectedBlock.id, input)}
                onDelete={() => handleDeleteBlock(selectedBlock.id)}
              />
            ) : (
              <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                Select a block on the timeline to edit it, or double-click an
                empty spot on the Video track to add one.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
