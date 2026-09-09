import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreateImageForm } from "@/components/create-image-form";
import { ImageList } from "@/components/image-list";
import { RequireSession } from "@/components/require-session";
import { useSession } from "@/lib/auth-client";
import { listImages, type GeneratedImage } from "@/lib/api";

export function ImagePage() {
  return (
    <RequireSession title="Sign in to generate images">
      <ImageWorkspace />
    </RequireSession>
  );
}

function ImageWorkspace() {
  const { data: session } = useSession();
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [tab, setTab] = useState("create");

  useEffect(() => {
    if (!session) return;
    listImages()
      .then(setImages)
      .catch(() => {});
  }, [session]);

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="create">Text to image</TabsTrigger>
          <TabsTrigger value="images">Your images</TabsTrigger>
        </TabsList>

        <TabsContent value="create" className="pt-6">
          <CreateImageForm
            onCreated={(image) => {
              setImages((prev) => [image, ...prev]);
              setTab("images");
            }}
          />
        </TabsContent>

        <TabsContent value="images" className="pt-6">
          <ImageList images={images} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
