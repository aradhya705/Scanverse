import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { applySignature } from "@/api/client";
import { useToast } from "@/context/ToastContext";
import SignaturePad from "./SignaturePad";
import { Move } from "lucide-react";

const PLACEMENTS = [
  { id: "bottom-right", label: "Bottom right", x: 0.62, y: 0.72 },
  { id: "bottom-center", label: "Bottom center", x: 0.38, y: 0.72 },
  { id: "bottom-left", label: "Bottom left", x: 0.08, y: 0.72 },
  { id: "center", label: "Center", x: 0.38, y: 0.45 },
] as const;

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), Math.max(min, max));
}

interface Props {
  pageId: string;
  pageUrl: string;
  onClose: () => void;
  onApplied: () => void;
}

export default function SignatureModal({ pageId, pageUrl, onClose, onApplied }: Props) {
  const { showToast } = useToast();
  const [signature, setSignature] = useState<string | null>(null);
  const [isEmpty, setIsEmpty] = useState(true);
  // x/y are the signature's top-left corner as fractions of the page
  const [x, setX] = useState(0.62);
  const [y, setY] = useState(0.72);
  const [widthFrac, setWidthFrac] = useState(0.3);
  const [opacity, setOpacity] = useState(1);
  const [sigAspect, setSigAspect] = useState(0.35); // height / width
  const previewRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  // Learn the signature's aspect ratio so the preview + clamping match the
  // final composited result on the page.
  useEffect(() => {
    if (!signature) return;
    const img = new Image();
    img.onload = () => setSigAspect(img.height / Math.max(1, img.width));
    img.src = signature;
  }, [signature]);

  function handleDragStart(e: React.PointerEvent) {
    if (isEmpty || !signature) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {
      /* pointer capture unsupported for this pointer */
    }
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: x, origY: y };
  }

  function handleDragMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    const container = previewRef.current;
    if (!drag || !container) return;
    const rect = container.getBoundingClientRect();
    const heightFrac = widthFrac * sigAspect;
    const dx = (e.clientX - drag.startX) / rect.width;
    const dy = (e.clientY - drag.startY) / rect.height;
    setX(clamp(drag.origX + dx, 0.01, 0.99 - widthFrac));
    setY(clamp(drag.origY + dy, 0.01, 0.99 - heightFrac));
  }

  function handleDragEnd() {
    dragRef.current = null;
  }

  function changeWidth(value: number) {
    setWidthFrac(value);
    const heightFrac = value * sigAspect;
    // Keep the signature inside the page as it grows/shrinks
    setX((px) => clamp(px, 0.01, 0.99 - value));
    setY((py) => clamp(py, 0.01, 0.99 - heightFrac));
  }

  const apply = useMutation({
    mutationFn: () =>
      applySignature(pageId, {
        signature_png_b64: (signature ?? "").split(",")[1] ?? "",
        x,
        y,
        width_fraction: widthFrac,
        opacity,
      }),
    onSuccess: () => {
      showToast("Signature placed on page", "success");
      onApplied();
    },
    onError: (err: any) => showToast(err?.response?.data?.detail || "Couldn't place signature", "error"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col gap-5 overflow-y-auto rounded-xl2 border border-line-dark bg-surface-dark p-5 text-paper shadow-soft md:flex-row md:overflow-hidden">
        {/* Page preview with live, draggable signature — visible on all screens */}
        <div className="flex-1">
          <div ref={previewRef} className="relative overflow-hidden rounded-lg bg-[#050506]">
            <img src={pageUrl} alt="Page preview" draggable={false} className="w-full select-none" />
            {signature && !isEmpty && (
              <img
                src={signature}
                alt="Signature"
                draggable={false}
                onPointerDown={handleDragStart}
                onPointerMove={handleDragMove}
                onPointerUp={handleDragEnd}
                onPointerCancel={handleDragEnd}
                className="absolute cursor-move touch-none"
                style={{
                  left: `${x * 100}%`,
                  top: `${y * 100}%`,
                  width: `${widthFrac * 100}%`,
                  opacity,
                }}
              />
            )}
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-paper/50">
            <Move className="h-3.5 w-3.5" /> Drag the signature to position it on the page
          </p>
        </div>

        <div className="flex-1">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Add signature</h2>
            <button onClick={onClose} aria-label="Close" className="text-paper/50 transition hover:text-paper">
              ✕
            </button>
          </div>

          <SignaturePad onExport={setSignature} onClearChange={setIsEmpty} />

          <div className="mt-5">
            <p className="mb-2 text-sm font-medium text-paper/80">Quick placement</p>
            <div className="grid grid-cols-2 gap-2">
              {PLACEMENTS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setX(p.x);
                    setY(p.y);
                  }}
                  className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                    Math.abs(x - p.x) < 0.02 && Math.abs(y - p.y) < 0.02
                      ? "border-brand bg-brand/15 text-paper"
                      : "border-line-dark bg-white/5 text-paper/70 hover:border-brand/40"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <label className="block">
              <div className="mb-1 flex justify-between text-xs text-paper/60">
                <span>Size</span>
                <span className="font-mono">{Math.round(widthFrac * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.15}
                max={0.6}
                step={0.01}
                value={widthFrac}
                onChange={(e) => changeWidth(parseFloat(e.target.value))}
                className="w-full accent-brand"
              />
            </label>
            <label className="block">
              <div className="mb-1 flex justify-between text-xs text-paper/60">
                <span>Opacity</span>
                <span className="font-mono">{Math.round(opacity * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.3}
                max={1}
                step={0.05}
                value={opacity}
                onChange={(e) => setOpacity(parseFloat(e.target.value))}
                className="w-full accent-brand"
              />
            </label>
          </div>

          {apply.isError && (
            <p className="mt-3 text-sm text-red-400">
              {(apply.error as Error)?.message || "Something went wrong. Try again."}
            </p>
          )}

          <div className="mt-5 flex gap-2">
            <button onClick={onClose} className="btn-secondary flex-1 !border-line-dark !bg-white/5 !text-paper">
              Cancel
            </button>
            <button
              onClick={() => apply.mutate()}
              disabled={apply.isPending || isEmpty || !signature}
              className="btn-primary flex-1 disabled:opacity-40"
            >
              {apply.isPending ? "Placing…" : "Apply signature"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
