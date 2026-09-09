import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import type { FaceSwap } from "@/lib/api";

export function FaceSwapList({ faceSwaps }: { faceSwaps: FaceSwap[] }) {
  if (faceSwaps.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        You haven&apos;t made any face swaps yet.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {faceSwaps.map((swap) => (
        <Card key={swap.id} className="overflow-hidden">
          <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
            <p className="text-sm font-medium">Face swap</p>
            <StatusBadge status={swap.status} />
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {swap.status === "COMPLETED" && swap.outputUrl ? (
              <img
                src={swap.outputUrl}
                alt="Face swap result"
                className="aspect-square w-full rounded-md bg-muted object-cover"
              />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center rounded-md bg-muted p-4 text-center text-xs text-muted-foreground">
                {swap.status === "FAILED"
                  ? (swap.errorMessage ?? "Face swap failed")
                  : "Swapping..."}
              </div>
            )}

            <div className="flex gap-2">
              <img
                src={swap.baseImageUrl}
                alt="Base"
                className="h-12 w-12 rounded border object-cover"
              />
              <img
                src={swap.faceImageUrl}
                alt="Face"
                className="h-12 w-12 rounded border object-cover"
              />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
