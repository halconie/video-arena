import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import type { GeneratedImage } from "@/lib/api";

export function ImageList({ images }: { images: GeneratedImage[] }) {
  if (images.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        You haven&apos;t generated any images yet.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {images.map((image) => (
        <Card key={image.id} className="overflow-hidden">
          <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
            <p className="line-clamp-2 text-sm font-medium">{image.prompt}</p>
            <StatusBadge status={image.status} />
          </CardHeader>
          <CardContent>
            {image.status === "COMPLETED" && image.outputUrl ? (
              <img
                src={image.outputUrl}
                alt={image.prompt}
                className="aspect-square w-full rounded-md bg-muted object-cover"
              />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center rounded-md bg-muted p-4 text-center text-xs text-muted-foreground">
                {image.status === "FAILED"
                  ? (image.errorMessage ?? "Generation failed")
                  : "Generating..."}
              </div>
            )}
          </CardContent>
          <CardFooter className="text-xs text-muted-foreground">
            {image.model} &middot; {image.resolution} &middot; {image.aspectRatio}
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
