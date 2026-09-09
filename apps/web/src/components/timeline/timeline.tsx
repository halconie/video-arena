import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { VideoBlock } from "@/lib/api";

export const TRACK_HEADER_WIDTH = 128;
const RULER_HEIGHT = 28;
const LANE_HEIGHT = 64;

/** Formats seconds as the HH:MM:SS the spec's timecodes use. */
export function formatTimecode(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/** Tick spacing that keeps labels readable as you zoom. */
function tickInterval(pxPerSecond: number): number {
  for (const candidate of [1, 2, 5, 10, 15, 30, 60, 120, 300]) {
    if (candidate * pxPerSecond >= 60) return candidate;
  }
  return 600;
}

type DragState =
  | { kind: "move"; blockId: string; grabOffsetSeconds: number }
  | { kind: "resize-start"; blockId: string }
  | { kind: "resize-end"; blockId: string }
  | { kind: "playhead" };

export type TimelineProps = {
  durationSeconds: number;
  blocks: VideoBlock[];
  audioUrl: string | null;
  selectedBlockId: string | null;
  onSelectBlock: (id: string | null) => void;
  /** Fired on drop/resize-end, not on every mouse move. */
  onMoveBlock: (id: string, startSeconds: number, endSeconds: number) => void;
  onAddBlockAt: (startSeconds: number) => void;
  blockStatus?: Record<string, "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED">;
};

export function Timeline({
  durationSeconds,
  blocks,
  audioUrl,
  selectedBlockId,
  onSelectBlock,
  onMoveBlock,
  onAddBlockAt,
  blockStatus,
}: TimelineProps) {
  const [pxPerSecond, setPxPerSecond] = useState(24);
  const [playhead, setPlayhead] = useState(0);
  const [drag, setDrag] = useState<DragState | null>(null);
  // Live positions while dragging, so the clip follows the cursor without
  // round-tripping to the server on every mousemove.
  const [preview, setPreview] = useState<Record<string, [number, number]>>({});
  const laneRef = useRef<HTMLDivElement>(null);

  const width = durationSeconds * pxPerSecond;
  const interval = tickInterval(pxPerSecond);

  const secondsAt = useCallback(
    (clientX: number) => {
      const lane = laneRef.current;
      if (!lane) return 0;
      const rect = lane.getBoundingClientRect();
      const x = clientX - rect.left + lane.scrollLeft;
      return Math.max(0, Math.min(durationSeconds, x / pxPerSecond));
    },
    [durationSeconds, pxPerSecond],
  );

  useEffect(() => {
    if (!drag) return;

    const onMove = (e: MouseEvent) => {
      const at = secondsAt(e.clientX);

      if (drag.kind === "playhead") {
        setPlayhead(Math.round(at));
        return;
      }

      const block = blocks.find((b) => b.id === drag.blockId);
      if (!block) return;
      const length = block.endSeconds - block.startSeconds;

      if (drag.kind === "move") {
        // Snap to whole seconds - blocks map to generated clip durations.
        let start = Math.round(at - drag.grabOffsetSeconds);
        start = Math.max(0, Math.min(durationSeconds - length, start));
        setPreview({ [block.id]: [start, start + length] });
      } else if (drag.kind === "resize-start") {
        const start = Math.max(
          0,
          Math.min(block.endSeconds - 1, Math.round(at)),
        );
        setPreview({ [block.id]: [start, block.endSeconds] });
      } else {
        const end = Math.min(
          durationSeconds,
          Math.max(block.startSeconds + 1, Math.round(at)),
        );
        setPreview({ [block.id]: [block.startSeconds, end] });
      }
    };

    const onUp = () => {
      if (drag.kind !== "playhead") {
        const next = preview[drag.blockId];
        if (next) {
          const [start, end] = next;
          const block = blocks.find((b) => b.id === drag.blockId);
          if (block && (block.startSeconds !== start || block.endSeconds !== end)) {
            onMoveBlock(drag.blockId, start, end);
          }
        }
      }
      setDrag(null);
      setPreview({});
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [drag, blocks, durationSeconds, secondsAt, preview, onMoveBlock]);

  const ticks: number[] = [];
  for (let t = 0; t <= durationSeconds; t += interval) ticks.push(t);

  return (
    <div className="flex flex-col rounded-lg border bg-card">
      {/* Toolbar */}
      <div className="flex items-center gap-4 border-b px-3 py-2">
        <span className="font-mono text-sm tabular-nums">
          {formatTimecode(playhead)}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Zoom</span>
          <input
            type="range"
            min={4}
            max={80}
            value={pxPerSecond}
            onChange={(e) => setPxPerSecond(Number(e.target.value))}
            className="w-32"
          />
        </div>
        <button
          type="button"
          className="ml-auto text-xs text-muted-foreground hover:text-foreground"
          onClick={() => onAddBlockAt(playhead)}
        >
          + Add block at playhead
        </button>
      </div>

      <div className="flex">
        {/* Fixed track headers */}
        <div
          className="shrink-0 border-r bg-muted/30"
          style={{ width: TRACK_HEADER_WIDTH }}
        >
          <div style={{ height: RULER_HEIGHT }} className="border-b" />
          <div
            style={{ height: LANE_HEIGHT }}
            className="flex items-center border-b px-3 text-xs font-medium"
          >
            Video
          </div>
          <div
            style={{ height: LANE_HEIGHT }}
            className="flex items-center px-3 text-xs font-medium"
          >
            Audio
          </div>
        </div>

        {/* Scrollable lanes */}
        <div ref={laneRef} className="relative flex-1 overflow-x-auto">
          <div style={{ width }} className="relative">
            {/* Ruler */}
            <div
              style={{ height: RULER_HEIGHT }}
              className="relative select-none border-b"
              onMouseDown={(e) => {
                setPlayhead(Math.round(secondsAt(e.clientX)));
                setDrag({ kind: "playhead" });
              }}
            >
              {ticks.map((t) => (
                <div
                  key={t}
                  className="absolute top-0 h-full border-l border-border"
                  style={{ left: t * pxPerSecond }}
                >
                  <span className="pl-1 font-mono text-[10px] text-muted-foreground">
                    {formatTimecode(t)}
                  </span>
                </div>
              ))}
            </div>

            {/* Video lane */}
            <div
              style={{ height: LANE_HEIGHT }}
              className="relative border-b bg-muted/10"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) onSelectBlock(null);
              }}
              onDoubleClick={(e) => {
                if (e.target === e.currentTarget) {
                  onAddBlockAt(Math.round(secondsAt(e.clientX)));
                }
              }}
            >
              {blocks.map((block) => {
                const [start, end] = preview[block.id] ?? [
                  block.startSeconds,
                  block.endSeconds,
                ];
                const status = blockStatus?.[block.id];
                return (
                  <div
                    key={block.id}
                    role="button"
                    tabIndex={0}
                    className={cn(
                      "absolute top-2 flex h-12 cursor-grab items-center overflow-hidden rounded border px-2 text-xs",
                      selectedBlockId === block.id
                        ? "border-primary bg-primary/20 ring-1 ring-primary"
                        : "border-border bg-primary/10 hover:bg-primary/15",
                      status === "COMPLETED" && "border-green-500/60",
                      status === "FAILED" && "border-destructive",
                      status === "PROCESSING" && "animate-pulse",
                    )}
                    style={{
                      left: start * pxPerSecond,
                      width: Math.max(8, (end - start) * pxPerSecond),
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      onSelectBlock(block.id);
                      setDrag({
                        kind: "move",
                        blockId: block.id,
                        grabOffsetSeconds:
                          secondsAt(e.clientX) - block.startSeconds,
                      });
                    }}
                  >
                    {/* Resize handles */}
                    <span
                      className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize bg-primary/40"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        onSelectBlock(block.id);
                        setDrag({ kind: "resize-start", blockId: block.id });
                      }}
                    />
                    <span
                      className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize bg-primary/40"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        onSelectBlock(block.id);
                        setDrag({ kind: "resize-end", blockId: block.id });
                      }}
                    />
                    <span className="truncate px-1">
                      {block.prompt || "Untitled block"}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Audio lane */}
            <div style={{ height: LANE_HEIGHT }} className="relative bg-muted/10">
              {audioUrl ? (
                <div
                  className="absolute top-2 flex h-12 items-center rounded border border-sky-500/50 bg-sky-500/15 px-2 text-xs"
                  style={{ left: 0, width }}
                >
                  Base audio track
                </div>
              ) : (
                <div className="flex h-full items-center px-2 text-xs text-muted-foreground">
                  No audio track uploaded
                </div>
              )}
            </div>

            {/* Playhead */}
            <div
              className="pointer-events-none absolute top-0 z-10 w-px bg-red-500"
              style={{ left: playhead * pxPerSecond, height: "100%" }}
            >
              <div className="-ml-1.5 h-2 w-3 bg-red-500" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
