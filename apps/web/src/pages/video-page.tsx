import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreateVideoForm } from "@/components/create-video-form";
import { VideoList } from "@/components/video-list";
import { RequireSession } from "@/components/require-session";
import { useSession } from "@/lib/auth-client";
import { listVideos, type Video } from "@/lib/api";

export function VideoPage() {
  return (
    <RequireSession title="Sign in to generate videos">
      <VideoWorkspace />
    </RequireSession>
  );
}

function VideoWorkspace() {
  const { data: session } = useSession();
  const [videos, setVideos] = useState<Video[]>([]);
  const [tab, setTab] = useState("create");

  useEffect(() => {
    if (!session) return;
    listVideos()
      .then(setVideos)
      .catch(() => {});
  }, [session]);

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="create">Text to video</TabsTrigger>
          <TabsTrigger value="videos">Your videos</TabsTrigger>
        </TabsList>

        <TabsContent value="create" className="pt-6">
          <CreateVideoForm
            onCreated={(video) => {
              setVideos((prev) => [video, ...prev]);
              setTab("videos");
            }}
          />
        </TabsContent>

        <TabsContent value="videos" className="pt-6">
          <VideoList videos={videos} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
