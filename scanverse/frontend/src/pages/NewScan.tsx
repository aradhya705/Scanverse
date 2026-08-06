import { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  cleanupPage,
  deletePage,
  downloadDocumentExport,
  duplicatePage,
  getDocument,
  mediaUrl,
  processPage,
  reorderPages,
  retakePage,
  runOcr,
  updateDocument,
  updatePageOcrText,
  uploadPage,
} from "@/api/client";
import type { FilterName, Page } from "@/types";
import { useToast } from "@/context/ToastContext";
import CornerAdjuster from "@/components/CornerAdjuster";
import CleanupBrush from "@/components/CleanupBrush";
import FilterPicker from "@/components/FilterPicker";
import PageThumbnail from "@/components/PageThumbnail";
import {
  Camera,
  Crop as CropIcon,
  Eraser,
  FileText,
  RotateCw,
  Sparkles,
  Trash2,
  Check,
  ChevronLeft,
} from "lucide-react";

interface Adjustments {
  intensity: number;
  brightness: number;
  contrast: number;
  saturation: number;
  sharpness: number;
}

const DEFAULT_ADJUSTMENTS: Adjustments = {
  intensity: 1,
  brightness: 1,
  contrast: 1,
  saturation: 1,
  sharpness: 1,
};

type Mode = "view" | "crop" | "filters" | "cleanup" | "text";

function ToolButton({
  icon,
  label,
  active,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center gap-1 rounded-xl px-3 py-2 text-[11px] font-medium transition disabled:opacity-30 ${
        active ? "bg-brand/15 text-brand" : "text-ink/60 hover:bg-white/5 hover:text-ink"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

export default function NewScan() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [corners, setCorners] = useState<number[][] | null>(null);
  const [filter, setFilter] = useState<FilterName>("auto");
  const [adjustments, setAdjustments] = useState<Adjustments>(DEFAULT_ADJUSTMENTS);
  const [title, setTitle] = useState("Untitled Scan");
  const [ocrText, setOcrText] = useState("");
  const [mode, setMode] = useState<Mode>("view");
  const [cleanupRegions, setCleanupRegions] = useState<number[][]>([]);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const retakeInputRef = useRef<HTMLInputElement>(null);

  const { data: document } = useQuery({
    queryKey: ["document", documentId],
    queryFn: () => getDocument(documentId!),
    enabled: !!documentId,
  });

  useEffect(() => {
    if (document) setTitle(document.title);
  }, [document?.title]);

  const activePage: Page | undefined = document?.pages.find((p) => p.id === activePageId);

  useEffect(() => {
    if (activePage) {
      setCorners(activePage.corners ?? null);
      setFilter(activePage.filter_applied);
      setAdjustments({
        intensity: activePage.intensity,
        brightness: activePage.brightness,
        contrast: activePage.contrast,
        saturation: activePage.saturation,
        sharpness: activePage.sharpness,
      });
      setOcrText(activePage.ocr_text ?? "");
      setMode("view");
      setCleanupRegions([]);
    }
  }, [activePage?.id]);

  const upload = useMutation({
    mutationFn: (file: File) => uploadPage(file, documentId ?? undefined),
    onSuccess: (page) => {
      if (!documentId) setDocumentId(page.document_id);
      setActivePageId(page.id);
      queryClient.invalidateQueries({ queryKey: ["document", page.document_id] });
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.detail || "Upload failed — check the file and try again", "error");
    },
  });

  const onDrop = useCallback(
    (accepted: File[]) => {
      accepted.forEach((file) => upload.mutate(file));
    },
    [upload]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/jpeg": [], "image/png": [], "image/webp": [], "application/pdf": [] },
    multiple: true,
    noClick: !!documentId,
  });

  const process = useMutation({
    mutationFn: () =>
      processPage(activePageId!, {
        corners: corners ?? undefined,
        filter_applied: filter,
        ...adjustments,
      } as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document", documentId] });
      setMode("view");
    },
    onError: () => showToast("Couldn't apply changes — try again", "error"),
  });

  const rotate = useMutation({
    mutationFn: (pageId: string) => {
      const page = document?.pages.find((p) => p.id === pageId);
      const newRotation = ((page?.rotation ?? 0) + 90) % 360;
      return processPage(pageId, { rotation: newRotation } as any);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["document", documentId] }),
  });

  const retake = useMutation({
    mutationFn: (file: File) => retakePage(activePageId!, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document", documentId] });
      setMode("view");
    },
    onError: (err: any) => showToast(err?.response?.data?.detail || "Retake failed — try again", "error"),
  });

  const cleanup = useMutation({
    mutationFn: () => cleanupPage(activePageId!, cleanupRegions),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document", documentId] });
      setCleanupRegions([]);
      setMode("view");
    },
    onError: () => showToast("Cleanup failed — try again", "error"),
  });

  const duplicate = useMutation({
    mutationFn: (pageId: string) => duplicatePage(pageId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["document", documentId] }),
  });

  const remove = useMutation({
    mutationFn: (pageId: string) => deletePage(pageId),
    onSuccess: (_data, pageId) => {
      const remaining = document?.pages.filter((p) => p.id !== pageId) ?? [];
      setActivePageId(remaining.length ? remaining[0].id : null);
      queryClient.invalidateQueries({ queryKey: ["document", documentId] });
    },
  });

  const reorder = useMutation({
    mutationFn: (order: string[]) => reorderPages(documentId!, order),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["document", documentId] }),
  });

  const ocr = useMutation({
    mutationFn: () => runOcr(activePageId!),
    onSuccess: (result) => {
      setOcrText(result.full_text);
      queryClient.invalidateQueries({ queryKey: ["document", documentId] });
      if (!result.line_count) {
        showToast("No text found on this page", "info");
      } else if (result.low_confidence_line_count > 0) {
        showToast(
          `Text extracted — ${result.low_confidence_line_count} line${
            result.low_confidence_line_count === 1 ? "" : "s"
          } may need review (${Math.round(result.average_confidence * 100)}% avg. confidence)`,
          "info"
        );
      } else {
        showToast(`Text extracted (${Math.round(result.average_confidence * 100)}% avg. confidence)`, "success");
      }
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.detail || "OCR failed — try again", "error");
    },
  });

  const saveOcrEdit = useMutation({
    mutationFn: () => updatePageOcrText(activePageId!, ocrText),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["document", documentId] }),
  });

  const saveTitle = useMutation({
    mutationFn: () => updateDocument(documentId!, { title }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["document", documentId] }),
  });

  const [exportFormat, setExportFormat] = useState<"pdf" | "docx" | "txt">("pdf");
  const exporting = useMutation({
    mutationFn: () => downloadDocumentExport(documentId!, title, exportFormat),
    onSuccess: () => showToast(`Exported as ${exportFormat.toUpperCase()}`, "success"),
    onError: () => showToast("Export failed — try again", "error"),
  });

  const previewUrl = mediaUrl(activePage?.processed_url || activePage?.original_url);

  return (
    <div>
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {documentId ? (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => saveTitle.mutate()}
            className="w-72 border-none bg-transparent text-2xl font-semibold tracking-tight outline-none focus:ring-0"
          />
        ) : (
          <h1 className="text-2xl font-semibold tracking-tight">New scan</h1>
        )}

        {documentId && document && document.pages.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => cameraInputRef.current?.click()}
              className="btn-secondary text-sm"
            >
              Keep scanning
            </button>
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as any)}
              className="input w-24"
            >
              <option value="pdf">PDF</option>
              <option value="docx">DOCX</option>
              <option value="txt">TXT</option>
            </select>
            <button onClick={() => exporting.mutate()} disabled={exporting.isPending} className="btn-primary">
              {exporting.isPending ? "Saving…" : "Save PDF"}
            </button>
          </div>
        )}
      </div>

      {/* Upload zone — shown until at least one page exists */}
      {!documentId && (
        <div
          {...getRootProps()}
          className={`mt-6 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl2 border-2 border-dashed p-10 text-center transition ${
            isDragActive ? "border-brand bg-brand/5" : "border-line-light hover:border-brand/40"
          }`}
        >
          <input {...getInputProps()} />
          <p className="font-medium">Drop a document here, or click to upload</p>
          <p className="text-xs text-ink/50">JPG, PNG, WEBP, or PDF</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                cameraInputRef.current?.click();
              }}
              className="btn-secondary text-xs"
            >
              <Camera className="mr-1 inline h-3.5 w-3.5" /> Use camera
            </button>
          </div>
        </div>
      )}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload.mutate(file);
          e.target.value = "";
        }}
      />
      <input
        ref={retakeInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) retake.mutate(file);
          e.target.value = "";
        }}
      />
      {upload.isPending && <p className="mt-2 text-sm text-ink/50">Uploading and detecting edges…</p>}

      {document && document.pages.length > 0 && (
        <div className="mt-8">
          <PageThumbnail
            pages={document.pages}
            activePageId={activePageId}
            onSelect={setActivePageId}
            onReorder={(order) => reorder.mutate(order)}
            onRotate={(id) => rotate.mutate(id)}
            onDuplicate={(id) => duplicate.mutate(id)}
            onDelete={(id) => {
              if (confirm("Delete this page?")) remove.mutate(id);
            }}
          />
        </div>
      )}

      {activePage && (
        <div className="mt-6 overflow-hidden rounded-xl2 border border-line-light bg-black shadow-soft dark:border-line-dark">
          {/* Editor header (mode-aware) */}
          <div className="flex items-center justify-between border-b border-white/10 bg-surface-dark px-4 py-2.5 text-white">
            {mode === "view" ? (
              <span className="text-sm font-medium text-white/70">
                Page {(document?.pages.findIndex((p) => p.id === activePage.id) ?? 0) + 1} of {document?.pages.length}
              </span>
            ) : (
              <button
                onClick={() => {
                  setMode("view");
                  setCleanupRegions([]);
                  setCorners(activePage.corners ?? null);
                }}
                className="flex items-center gap-1 text-sm text-white/70 hover:text-white"
              >
                <ChevronLeft className="h-4 w-4" /> Cancel
              </button>
            )}

            {mode === "crop" && (
              <button
                onClick={() => process.mutate()}
                disabled={process.isPending}
                className="flex items-center gap-1 rounded-full bg-brand px-4 py-1.5 text-sm font-medium text-white"
              >
                <Check className="h-4 w-4" /> {process.isPending ? "Applying…" : "Apply"}
              </button>
            )}
            {mode === "filters" && (
              <button
                onClick={() => process.mutate()}
                disabled={process.isPending}
                className="flex items-center gap-1 rounded-full bg-brand px-4 py-1.5 text-sm font-medium text-white"
              >
                <Check className="h-4 w-4" /> {process.isPending ? "Applying…" : "Apply"}
              </button>
            )}
            {mode === "cleanup" && (
              <button
                onClick={() => cleanup.mutate()}
                disabled={cleanup.isPending || !cleanupRegions.length}
                className="flex items-center gap-1 rounded-full bg-brand px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
              >
                <Check className="h-4 w-4" /> {cleanup.isPending ? "Cleaning…" : "Apply cleanup"}
              </button>
            )}
            {mode === "text" && (
              <button
                onClick={() => saveOcrEdit.mutate()}
                disabled={saveOcrEdit.isPending}
                className="flex items-center gap-1 rounded-full bg-brand px-4 py-1.5 text-sm font-medium text-white"
              >
                <Check className="h-4 w-4" /> {saveOcrEdit.isPending ? "Saving…" : "Save text"}
              </button>
            )}
            {mode === "view" && <span />}
          </div>

          {/* Preview / active tool surface */}
          <div className="flex justify-center bg-[#050506] p-4 sm:p-6">
            <div className="w-full max-w-xl">
              {mode === "crop" && previewUrl && corners && (
                <CornerAdjuster imageUrl={mediaUrl(activePage.original_url) || ""} corners={corners} onChange={setCorners} />
              )}

              {mode === "cleanup" && previewUrl && (
                <CleanupBrush
                  imageUrl={previewUrl}
                  regions={cleanupRegions}
                  onAddRegion={(r) => setCleanupRegions((prev) => [...prev, r])}
                  onUndo={() => setCleanupRegions((prev) => prev.slice(0, -1))}
                  onClear={() => setCleanupRegions([])}
                />
              )}

              {mode === "filters" && previewUrl && (
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-[1fr_260px]">
                  <img src={previewUrl} alt="Preview" className="w-full rounded-lg" />
                  <div className="rounded-xl2 bg-surface-dark p-4 text-white">
                    <FilterPicker
                      active={filter}
                      onSelectFilter={setFilter}
                      adjustments={adjustments}
                      onAdjustmentsChange={setAdjustments}
                      disabled={process.isPending}
                    />
                  </div>
                </div>
              )}

              {mode === "text" && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {previewUrl && <img src={previewUrl} alt="Preview" className="w-full rounded-lg" />}
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-medium text-white/80">Extracted text</p>
                      <div className="flex gap-3">
                        <button
                          onClick={() => ocr.mutate()}
                          disabled={ocr.isPending}
                          className="text-xs text-brand hover:underline"
                        >
                          {ocr.isPending ? "Scanning…" : "Re-run OCR"}
                        </button>
                        <button
                          onClick={() => navigator.clipboard.writeText(ocrText)}
                          className="text-xs text-brand hover:underline"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                    <textarea
                      value={ocrText}
                      onChange={(e) => setOcrText(e.target.value)}
                      rows={14}
                      placeholder="No text extracted yet — tap Re-run OCR."
                      className="w-full rounded-lg border border-white/10 bg-black/40 px-3.5 py-2.5 text-xs text-white outline-none focus:border-brand font-mono"
                    />
                  </div>
                </div>
              )}

              {mode === "view" && previewUrl && (
                <img src={previewUrl} alt="Preview" className="mx-auto max-h-[70vh] w-auto rounded-lg" />
              )}
            </div>
          </div>

          {/* Bottom action bar (Adobe Scan-style) */}
          {mode === "view" && (
            <div className="flex items-center justify-center gap-1 overflow-x-auto border-t border-white/10 bg-surface-dark px-2 py-2 text-white sm:gap-2">
              <ToolButton
                icon={<Camera className="h-5 w-5" />}
                label="Retake"
                onClick={() => retakeInputRef.current?.click()}
                disabled={retake.isPending}
              />
              <ToolButton icon={<CropIcon className="h-5 w-5" />} label="Crop" onClick={() => setMode("crop")} />
              <ToolButton
                icon={<RotateCw className="h-5 w-5" />}
                label="Rotate"
                onClick={() => rotate.mutate(activePage.id)}
                disabled={rotate.isPending}
              />
              <ToolButton icon={<Sparkles className="h-5 w-5" />} label="Filters" onClick={() => setMode("filters")} />
              <ToolButton icon={<Eraser className="h-5 w-5" />} label="Cleanup" onClick={() => setMode("cleanup")} />
              <ToolButton icon={<FileText className="h-5 w-5" />} label="Edit text" onClick={() => setMode("text")} />
              <ToolButton
                icon={<Trash2 className="h-5 w-5" />}
                label="Delete"
                onClick={() => {
                  if (confirm("Delete this page?")) remove.mutate(activePage.id);
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
