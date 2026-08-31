import { useRef, useState } from "react";

interface CleanupBrushProps {
  imageUrl: string;
  regions: number[][]; // [x, y, w, h] in natural image pixel coords, committed so far
  onAddRegion: (region: number[]) => void;
  onUndo: () => void;
  onClear: () => void;
}

/**
 * Adobe Scan's "Cleanup" tool: drag a box over a stain/stray mark and it gets
 * queued up to be inpainted out. Multiple boxes can be drawn before applying.
 */
export default function CleanupBrush({ imageUrl, regions, onAddRegion, onUndo, onClear }: CleanupBrushProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [display, setDisplay] = useState<{ w: number; h: number } | null>(null);
  const [draft, setDraft] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const dragging = useRef(false);

  const scaleX = natural && display ? display.w / natural.w : 1;
  const scaleY = natural && display ? display.h / natural.h : 1;

  function toDisplayPoint(clientX: number, clientY: number) {
    const rect = containerRef.current!.getBoundingClientRect();
    return {
      x: Math.min(Math.max(clientX - rect.left, 0), rect.width),
      y: Math.min(Math.max(clientY - rect.top, 0), rect.height),
    };
  }

  function handleDown(e: React.PointerEvent) {
    dragging.current = true;
    const { x, y } = toDisplayPoint(e.clientX, e.clientY);
    setDraft({ x0: x, y0: y, x1: x, y1: y });
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function handleMove(e: React.PointerEvent) {
    if (!dragging.current || !draft) return;
    const { x, y } = toDisplayPoint(e.clientX, e.clientY);
    setDraft({ ...draft, x1: x, y1: y });
  }

  function handleUp() {
    if (draft) {
      const x = Math.min(draft.x0, draft.x1) / scaleX;
      const y = Math.min(draft.y0, draft.y1) / scaleY;
      const w = (Math.abs(draft.x1 - draft.x0)) / scaleX;
      const h = (Math.abs(draft.y1 - draft.y0)) / scaleY;
      if (w > 4 && h > 4) onAddRegion([x, y, w, h]);
    }
    dragging.current = false;
    setDraft(null);
  }

  return (
    <div>
      <div ref={containerRef} className="relative w-full select-none overflow-hidden rounded-lg">
        <img
          src={imageUrl}
          alt="Page to clean up"
          className="pointer-events-none w-full rounded-lg"
          draggable={false}
          onLoad={(e) => {
            const img = e.currentTarget;
            setNatural({ w: img.naturalWidth, h: img.naturalHeight });
            const rect = containerRef.current?.getBoundingClientRect();
            if (rect) setDisplay({ w: rect.width, h: rect.height });
          }}
        />
        <svg
          className="absolute inset-0 h-full w-full touch-none cursor-crosshair"
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
        >
          {regions.map(([x, y, w, h], i) => (
            <rect
              key={i}
              x={x * scaleX}
              y={y * scaleY}
              width={w * scaleX}
              height={h * scaleY}
              fill="rgba(157,78,221,0.28)"
              stroke="#9D4EDD"
              strokeWidth={2}
              strokeDasharray="4 3"
              rx={4}
            />
          ))}
          {draft && (
            <rect
              x={Math.min(draft.x0, draft.x1)}
              y={Math.min(draft.y0, draft.y1)}
              width={Math.abs(draft.x1 - draft.x0)}
              height={Math.abs(draft.y1 - draft.y0)}
              fill="rgba(157,78,221,0.2)"
              stroke="#C77DFF"
              strokeWidth={2}
              rx={4}
            />
          )}
        </svg>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <p className="text-xs text-ink/50">Drag a box over a stain or mark, then tap Apply cleanup.</p>
        <div className="flex gap-2">
          <button type="button" onClick={onUndo} disabled={!regions.length} className="text-xs text-brand hover:underline disabled:opacity-40">
            Undo
          </button>
          <button type="button" onClick={onClear} disabled={!regions.length} className="text-xs text-ink/50 hover:underline disabled:opacity-40">
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}
