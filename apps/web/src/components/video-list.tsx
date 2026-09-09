import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import type { Video } from "@/lib/api";

export function VideoList({ videos }: { videos: Video[] }) {
  if (videos.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        You haven&apos;t generated any videos yet.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {videos.map((video) => (
        <Card key={video.id} className="overflow-hidden">
          <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
            <p className="line-clamp-2 text-sm font-medium">{video.prompt}</p>
            <StatusBadge status={video.status} />
          </CardHeader>
          <CardContent>
            {video.status === "COMPLETED" && video.outputUrl ? (
              <video
                src={video.outputUrl}
                controls
                className="aspect-video w-full rounded-md bg-black"
              />
            ) : (
              <div className="flex aspect-video w-full items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
                {video.status === "FAILED"
                  ? (video.errorMessage ?? "Generation failed")
                  : "Generating..."}
              </div>
            )}
          </CardContent>
          <CardFooter className="text-xs text-muted-foreground">
            {video.model} &middot; {video.duration}s &middot; {video.resolution} &middot;{" "}
            {video.aspectRatio} &middot; {video.generateAudio ? "audio" : "no audio"}
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
