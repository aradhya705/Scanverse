import { useCallback, useEffect, useRef, useState } from "react";

const INK_COLORS = ["#1C1C1E", "#9D4EDD", "#2563EB", "#DC2626", "#16A34A"];

interface Stroke {
  points: { x: number; y: number }[];
  color: string;
  width: number;
}

interface SignaturePadProps {
  onExport: (dataUrl: string) => void;
  onClearChange: (isEmpty: boolean) => void;
}

/** Touch + mouse signature pad. Strokes are tracked as vectors so the export
 * is a clean transparent PNG regardless of the on-screen background. */
export default function SignaturePad({ onExport, onClearChange }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const [color, setColor] = useState(INK_COLORS[0]);
  const [width, setWidth] = useState(3);
  const [uploadedImage, setUploadedImage] = useState<HTMLImageElement | null>(null);
  const [isEmpty, setIsEmptyLocal] = useState(true);
  const drawingRef = useRef(false);
  const currentStrokeRef = useRef<Stroke | null>(null);

  // Resize the canvas backing store to match its displayed size ×2 for
  // crisp strokes on high-DPI screens.
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, rect.width) * dpr;
    canvas.height = Math.max(1, rect.height) * dpr;
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toCanvasCoords(e: React.PointerEvent): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    return {
      x: (e.clientX - rect.left) * dpr,
      y: (e.clientY - rect.top) * dpr,
    };
  }

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (uploadedImage) {
      const scale = Math.min(canvas.width / uploadedImage.width, canvas.height / uploadedImage.height);
      const w = uploadedImage.width * scale;
      const h = uploadedImage.height * scale;
      ctx.globalAlpha = 0.9;
      ctx.drawImage(uploadedImage, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      ctx.globalAlpha = 1;
    }

    for (const stroke of strokesRef.current) {
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (stroke.points.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (const p of stroke.points.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
  }, [uploadedImage]);

  useEffect(() => {
    redraw();
  }, [redraw, uploadedImage]);

  function handlePointerDown(e: React.PointerEvent) {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drawingRef.current = true;
    currentStrokeRef.current = { points: [toCanvasCoords(e)], color, width };
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!drawingRef.current || !currentStrokeRef.current) return;
    currentStrokeRef.current.points.push(toCanvasCoords(e));
    const ctx = canvasRef.current?.getContext("2d");
    const pts = currentStrokeRef.current.points;
    if (ctx && pts.length >= 2) {
      const s = currentStrokeRef.current;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y);
      ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      ctx.stroke();
    }
  }

  /** Emptiness is derived from the current strokes plus the *new* upload
   * state, so callers pass the value explicitly (setState is async — a
   * closure over `uploadedImage` would read the stale pre-update value). */
  function syncEmpty(hasUploadedImage: boolean) {
    const empty = strokesRef.current.length === 0 && !hasUploadedImage;
    setIsEmptyLocal(empty);
    onClearChange(empty);
  }

  function handlePointerUp() {
    if (drawingRef.current && currentStrokeRef.current) {
      strokesRef.current.push(currentStrokeRef.current);
      currentStrokeRef.current = null;
      syncEmpty(!!uploadedImage);
    }
    drawingRef.current = false;
  }

  function clear() {
    strokesRef.current = [];
    setUploadedImage(null);
    redraw();
    syncEmpty(false);
  }

  function exportPng() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const out = document.createElement("canvas");
    out.width = canvas.width;
    out.height = canvas.height;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    if (uploadedImage) {
      const scale = Math.min(out.width / uploadedImage.width, out.height / uploadedImage.height);
      const w = uploadedImage.width * scale;
      const h = uploadedImage.height * scale;
      ctx.drawImage(uploadedImage, (out.width - w) / 2, (out.height - h) / 2, w, h);
    }
    ctx.strokeStyle = "#000";
    for (const stroke of strokesRef.current) {
      if (stroke.points.length < 2) continue;
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (const p of stroke.points.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    onExport(out.toDataURL("image/png"));
  }

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      setUploadedImage(img);
      syncEmpty(true);
    };
    img.src = URL.createObjectURL(file);
  }

  return (
    <div>
      <div
        ref={containerRef}
        className="relative h-48 w-full overflow-hidden rounded-lg border border-line-light bg-paper dark:border-line-dark"
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className="absolute inset-0 h-full w-full touch-none"
        />
        {isEmpty && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-ink/40 dark:text-paper/40">
            Sign here with your finger or mouse
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          {INK_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              aria-label={`Ink color ${c}`}
              className={`h-6 w-6 rounded-full border-2 transition ${
                color === c ? "scale-110 border-ink dark:border-paper" : "border-transparent"
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-ink/60 dark:text-paper/60">
          Size
          <input
            type="range"
            min={1}
            max={12}
            value={width}
            onChange={(e) => setWidth(parseInt(e.target.value, 10))}
            className="w-20 accent-brand"
          />
        </label>
        <div className="ml-auto flex items-center gap-2">
          <label className="cursor-pointer rounded-lg border border-line-light px-3 py-1.5 text-xs font-medium transition hover:border-brand/40 dark:border-line-dark">
            Upload image
            <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleUpload} />
          </label>
          <button onClick={clear} className="rounded-lg border border-line-light px-3 py-1.5 text-xs font-medium transition hover:border-brand/40 dark:border-line-dark">
            Clear
          </button>
          <button onClick={exportPng} className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white transition hover:bg-brand-deep">
            Use signature
          </button>
        </div>
      </div>
    </div>
  );
}
