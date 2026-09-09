import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/status-badge";
import { RequireSession } from "@/components/require-session";
import { useSession } from "@/lib/auth-client";
import {
  listAvatars,
  listMyRenders,
  listTemplates,
  renderTemplate,
  type Avatar,
  type Template,
  type TemplateRender,
} from "@/lib/api";

export function TemplatesPage() {
  return (
    <RequireSession title="Sign in to use templates">
      <TemplatesWorkspace />
    </RequireSession>
  );
}

function TemplatesWorkspace() {
  const { data: session } = useSession();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [renders, setRenders] = useState<TemplateRender[]>([]);
  const [tab, setTab] = useState("browse");

  useEffect(() => {
    if (!session) return;
    listTemplates().then(setTemplates).catch(() => {});
    listAvatars().then(setAvatars).catch(() => {});
    listMyRenders().then(setRenders).catch(() => {});
  }, [session]);

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="browse">Browse templates</TabsTrigger>
          <TabsTrigger value="mine">Your videos</TabsTrigger>
        </TabsList>

        <TabsContent value="browse" className="pt-6">
          {avatars.length === 0 && (
            <p className="mb-4 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
              You need an avatar before you can generate a template video.{" "}
              <Link to="/user/avatar" className="underline">
                Create one
              </Link>
              .
            </p>
          )}

          {templates.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No templates have been published yet.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {templates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  avatars={avatars}
                  onRendered={(render) => {
                    setRenders((prev) => [render, ...prev]);
                    setTab("mine");
                  }}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="mine" className="pt-6">
          {renders.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              You haven&apos;t generated any template videos yet.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {renders.map((render) => (
                <Card key={render.id} className="overflow-hidden">
                  <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
                    <p className="text-sm font-medium">
                      {render.template?.name ?? "Template"}
                    </p>
                    <StatusBadge status={render.status} />
                  </CardHeader>
                  <CardContent>
                    {render.status === "COMPLETED" && render.outputUrl ? (
                      <video
                        src={render.outputUrl}
                        poster={render.thumbnailUrl ?? undefined}
                        controls
                        className="aspect-video w-full rounded-md bg-black"
                      />
                    ) : (
                      <div className="flex aspect-video w-full items-center justify-center rounded-md bg-muted p-4 text-center text-xs text-muted-foreground">
                        {render.status === "FAILED"
                          ? (render.errorMessage ?? "Render failed")
                          : "Rendering..."}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TemplateCard({
  template,
  avatars,
  onRendered,
}: {
  template: Template;
  avatars: Avatar[];
  onRendered: (render: TemplateRender) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slots = Array.from({ length: template.avatarCount }, (_, i) => i);
  const ready = slots.every((i) => selected[i]);

  async function handleRender() {
    setError(null);
    setRendering(true);
    try {
      onRendered(
        await renderTemplate(template.id, {
          avatarIds: slots.map((i) => selected[i]!),
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Render failed");
    } finally {
      setRendering(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <p className="text-sm font-medium">{template.name}</p>
        {template.description && (
          <p className="text-xs text-muted-foreground">
            {template.description}
          </p>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {template.previewVideoUrl ? (
          <video
            src={template.previewVideoUrl}
            poster={template.thumbnailUrl ?? undefined}
            controls
            className="aspect-video w-full rounded-md bg-black"
          />
        ) : template.thumbnailUrl ? (
          <img
            src={template.thumbnailUrl}
            alt={template.name}
            className="aspect-video w-full rounded-md object-cover"
          />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
            No preview
          </div>
        )}

        {slots.map((i) => (
          <div key={i} className="flex flex-col gap-1">
            <Label className="text-xs">
              {template.avatarCount > 1 ? `Avatar ${i + 1}` : "Your avatar"}
            </Label>
            <Select
              value={selected[i] ?? ""}
              onValueChange={(v) =>
                setSelected((prev) => {
                  const next = [...prev];
                  next[i] = v;
                  return next;
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose an avatar" />
              </SelectTrigger>
              <SelectContent>
                {avatars.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}

        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>
      <CardFooter className="flex-col items-start gap-2">
        <Button
          size="sm"
          disabled={!ready || rendering || avatars.length === 0}
          onClick={handleRender}
        >
          {rendering ? "Generating..." : "Generate with my avatar"}
        </Button>
        {rendering && (
          <p className="text-xs text-muted-foreground">
            This generates every clip in the template - it can take many
            minutes. Keep this tab open.
          </p>
        )}
      </CardFooter>
    </Card>
  );
}
