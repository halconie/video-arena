import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import type { Video, VideoStatus } from "@/lib/api";

const STATUS_VARIANT: Record<VideoStatus, "default" | "secondary" | "destructive"> = {
  PENDING: "secondary",
  PROCESSING: "secondary",
  COMPLETED: "default",
  FAILED: "destructive",
};

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
            <Badge variant={STATUS_VARIANT[video.status]}>{video.status}</Badge>
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
            {video.aspectRatio}
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
