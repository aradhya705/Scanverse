import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { compressDocument, downloadCompressedPdf } from "@/api/client";
import type { CompressionPreset, CompressResult } from "@/types";

const QUICK_SIZES_KB = [50, 100, 250, 500, 1024, 2048, 5120, 10240];

const PRESETS: { value: CompressionPreset; label: string; hint: string }[] = [
  { value: "maximum_quality", label: "Maximum Quality", hint: "Smallest file that still looks crisp" },
  { value: "balanced", label: "Balanced", hint: "Good size-to-quality tradeoff" },
  { value: "maximum_compression", label: "Maximum Compression", hint: "Smallest possible file" },
  { value: "custom", label: "Custom", hint: "Drive it entirely by target size" },
];

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

interface Props {
  documentId: string;
  title: string;
  onClose: () => void;
}

export default function CompressPdfModal({ documentId, title, onClose }: Props) {
  const [preset, setPreset] = useState<CompressionPreset>("balanced");
  const [selectedKb, setSelectedKb] = useState<number | null>(null);
  const [customValue, setCustomValue] = useState<string>("");
  const [customUnit, setCustomUnit] = useState<"KB" | "MB" | "GB">("MB");
  const [result, setResult] = useState<CompressResult | null>(null);

  const targetSizeBytes = (): number | null => {
    if (customValue.trim()) {
      const n = parseFloat(customValue);
      if (!Number.isFinite(n) || n <= 0) return null;
      const multiplier = customUnit === "KB" ? 1024 : customUnit === "MB" ? 1024 ** 2 : 1024 ** 3;
      return Math.round(n * multiplier);
    }
    if (selectedKb) return selectedKb * 1024;
    return null;
  };

  const compress = useMutation({
    mutationFn: () => {
      const target = targetSizeBytes();
      if (preset === "custom" && !target) {
        throw new Error("Pick a target size (or enter a custom one) for the Custom preset.");
      }
      return compressDocument(documentId, { preset, target_size_bytes: target ?? undefined });
    },
    onSuccess: (data) => setResult(data),
  });

  const download = useMutation({
    mutationFn: (r: CompressResult) => downloadCompressedPdf(r.download_filename, title),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl2 border border-line-dark bg-surface-dark p-6 text-paper shadow-soft">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Compress PDF</h2>
          <button onClick={onClose} className="text-paper/50 hover:text-paper" aria-label="Close">
            ✕
          </button>
        </div>

        {!result ? (
          <>
            <p className="mb-2 text-sm font-medium text-paper/80">Preset</p>
            <div className="mb-5 grid grid-cols-2 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setPreset(p.value)}
                  className={`rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                    preset === p.value
                      ? "border-brand bg-brand/15 text-paper"
                      : "border-line-dark bg-white/5 text-paper/70 hover:border-brand/40"
                  }`}
                >
                  <div className="font-medium">{p.label}</div>
                  <div className="text-xs text-paper/50">{p.hint}</div>
                </button>
              ))}
            </div>

            <p className="mb-2 text-sm font-medium text-paper/80">
              Target size {preset !== "custom" && <span className="text-paper/40">(optional)</span>}
            </p>
            <div className="mb-3 flex flex-wrap gap-2">
              {QUICK_SIZES_KB.map((kb) => (
                <button
                  key={kb}
                  onClick={() => {
                    setSelectedKb(kb);
                    setCustomValue("");
                  }}
                  className={`rounded-full border px-3 py-1.5 text-xs transition ${
                    selectedKb === kb && !customValue
                      ? "border-brand bg-brand text-white"
                      : "border-line-dark bg-white/5 text-paper/70 hover:border-brand/40"
                  }`}
                >
                  {kb >= 1024 ? `${kb / 1024} MB` : `${kb} KB`}
                </button>
              ))}
            </div>

            <div className="mb-5 flex items-center gap-2">
              <input
                type="number"
                min={0}
                step="any"
                placeholder="Custom size"
                value={customValue}
                onChange={(e) => {
                  setCustomValue(e.target.value);
                  setSelectedKb(null);
                }}
                className="input flex-1 !bg-white/5 !text-paper !border-line-dark"
              />
              <select
                value={customUnit}
                onChange={(e) => setCustomUnit(e.target.value as any)}
                className="input w-24 !bg-white/5 !text-paper !border-line-dark"
              >
                <option value="KB">KB</option>
                <option value="MB">MB</option>
                <option value="GB">GB</option>
              </select>
            </div>

            {compress.isError && (
              <p className="mb-3 text-sm text-red-400">
                {(compress.error as Error)?.message || "Something went wrong. Try again."}
              </p>
            )}

            <button
              onClick={() => compress.mutate()}
              disabled={compress.isPending}
              className="btn-primary w-full"
            >
              {compress.isPending ? "Compressing…" : "Compress"}
            </button>
          </>
        ) : (
          <div>
            <div className="mb-5 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg border border-line-dark bg-white/5 p-3">
                <p className="text-xs text-paper/50">Original</p>
                <p className="mt-1 font-mono text-sm">{formatBytes(result.original_size_bytes)}</p>
              </div>
              <div className="rounded-lg border border-brand/40 bg-brand/10 p-3">
                <p className="text-xs text-paper/50">Compressed</p>
                <p className="mt-1 font-mono text-sm text-brand-soft">
                  {formatBytes(result.compressed_size_bytes)}
                </p>
              </div>
              <div className="rounded-lg border border-line-dark bg-white/5 p-3">
                <p className="text-xs text-paper/50">Reduction</p>
                <p className="mt-1 font-mono text-sm">{result.reduction_pct}%</p>
              </div>
            </div>

            {!result.target_achieved && (
              <p className="mb-4 rounded-lg border border-flag/40 bg-flag/10 px-3 py-2 text-xs text-flag">
                Couldn't quite hit your target size while keeping the document readable — this is
                the smallest it could go. Try "Maximum Compression" for a smaller result.
              </p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setResult(null)}
                className="btn-secondary flex-1 !border-line-dark !bg-white/5 !text-paper"
              >
                Try another size
              </button>
              <button
                onClick={() => download.mutate(result)}
                disabled={download.isPending}
                className="btn-primary flex-1"
              >
                {download.isPending ? "Downloading…" : "Download"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
