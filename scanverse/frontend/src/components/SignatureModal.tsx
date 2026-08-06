import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { applySignature } from "@/api/client";
import { useToast } from "@/context/ToastContext";
import SignaturePad from "./SignaturePad";

const PLACEMENTS = [
  { id: "bottom-right", label: "Bottom right", x: 0.62, y: 0.72 },
  { id: "bottom-center", label: "Bottom center", x: 0.38, y: 0.72 },
  { id: "bottom-left", label: "Bottom left", x: 0.08, y: 0.72 },
  { id: "center", label: "Center", x: 0.38, y: 0.45 },
] as const;

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
  const [placement, setPlacement] = useState<(typeof PLACEMENTS)[number]>(PLACEMENTS[0]);
  const [widthFrac, setWidthFrac] = useState(0.3);
  const [opacity, setOpacity] = useState(1);

  const apply = useMutation({
    mutationFn: () =>
      applySignature(pageId, {
        signature_png_b64: (signature ?? "").split(",")[1] ?? "",
        x: placement.x,
        y: placement.y,
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
      <div className="flex w-full max-w-2xl flex-col gap-5 overflow-hidden rounded-xl2 border border-line-dark bg-surface-dark text-paper shadow-soft md:flex-row">
        {/* Page preview */}
        <div className="hidden flex-1 items-center justify-center bg-[#050506] p-4 md:flex">
          <img src={pageUrl} alt="Page preview" className="max-h-[380px] rounded-lg" />
        </div>

        <div className="flex-1 p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Add signature</h2>
            <button onClick={onClose} aria-label="Close" className="text-paper/50 transition hover:text-paper">
              ✕
            </button>
          </div>

          <SignaturePad onExport={setSignature} onClearChange={setIsEmpty} />

          <div className="mt-5">
            <p className="mb-2 text-sm font-medium text-paper/80">Placement</p>
            <div className="grid grid-cols-2 gap-2">
              {PLACEMENTS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPlacement(p)}
                  className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                    placement.id === p.id
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
                max={0.5}
                step={0.01}
                value={widthFrac}
                onChange={(e) => setWidthFrac(parseFloat(e.target.value))}
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
