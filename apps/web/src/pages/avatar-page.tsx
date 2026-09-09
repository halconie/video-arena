import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { RequireSession } from "@/components/require-session";
import { useSession } from "@/lib/auth-client";
import {
  createAvatar,
  deleteAvatar,
  listAvatars,
  type Avatar,
} from "@/lib/api";

export function AvatarPage() {
  return (
    <RequireSession title="Sign in to manage your avatars">
      <AvatarWorkspace />
    </RequireSession>
  );
}

function AvatarWorkspace() {
  const { data: session } = useSession();
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [name, setName] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    listAvatars()
      .then(setAvatars)
      .catch(() => {});
  }, [session]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (images.length === 0) return;
    const form = e.currentTarget;

    setError(null);
    setSubmitting(true);
    try {
      const avatar = await createAvatar({ name, images });
      setAvatars((prev) => [avatar, ...prev]);
      setName("");
      setImages([]);
      form.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create avatar");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    await deleteAvatar(id).catch(() => {});
    setAvatars((prev) => prev.filter((a) => a.id !== id));
  }

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <h1 className="text-xl font-semibold">Your avatars</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Upload 1-2 clear, front-facing photos of yourself. Templates use your
        avatar to put your face into the generated video.
      </p>

      <form
        className="mt-6 flex flex-col gap-4 rounded-lg border p-4"
        onSubmit={handleSubmit}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="avatar-name">Name</Label>
            <Input
              id="avatar-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Me, front-facing"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="avatar-images">Photos (1-2)</Label>
            <Input
              id="avatar-images"
              type="file"
              accept="image/*"
              multiple
              required
              onChange={(e) =>
                setImages(Array.from(e.target.files ?? []).slice(0, 2))
              }
            />
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button
          type="submit"
          disabled={submitting || !name || images.length === 0}
          className="self-start"
        >
          {submitting ? "Creating..." : "Create avatar"}
        </Button>
      </form>

      <div className="mt-8">
        {avatars.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            You haven&apos;t created any avatars yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {avatars.map((avatar) => (
              <Card key={avatar.id}>
                <CardHeader>
                  <p className="text-sm font-medium">{avatar.name}</p>
                </CardHeader>
                <CardContent className="flex gap-2">
                  {avatar.imageUrls.map((url) => (
                    <img
                      key={url}
                      src={url}
                      alt={avatar.name}
                      className="h-24 w-24 rounded-md border object-cover"
                    />
                  ))}
                </CardContent>
                <CardFooter>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(avatar.id)}
                  >
                    Delete
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
