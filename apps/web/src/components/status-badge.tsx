import { Badge } from "@/components/ui/badge";
import type { GenerationStatus } from "@/lib/api";

const STATUS_VARIANT: Record<
  GenerationStatus,
  "default" | "secondary" | "destructive"
> = {
  PENDING: "secondary",
  PROCESSING: "secondary",
  COMPLETED: "default",
  FAILED: "destructive",
};

/** Status pill shared by the video, image and face-swap lists. */
export function StatusBadge({ status }: { status: GenerationStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>;
}
