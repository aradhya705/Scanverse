import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
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
import { FILTER_LABELS } from "@/types";
import { useToast } from "@/context/ToastContext";
import CornerAdjuster from "@/components/CornerAdjuster";
import CleanupBrush from "@/components/CleanupBrush";
import FilterPicker from "@/components/FilterPicker";
import PageThumbnail from "@/components/PageThumbnail";
import CaptureOverlay from "@/components/CaptureOverlay";
import SignatureModal from "@/components/SignatureModal";
import WordOcrViewer from "@/components/WordOcrViewer";
import type { OcrResult } from "@/api/client";
import {
  Camera,
  ChevronDown,
  Crop as CropIcon,
  Eraser,
  FileText,
  Images,
  Pen,
  RotateCw,
  Scaling,
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
  scale: number; // 0.25-1.0 output size multiplier (Resize tool)
}

const DEFAULT_ADJUSTMENTS: Adjustments = {
  intensity: 1,
  brightness: 1,
  contrast: 1,
  saturation: 1,
  sharpness: 1,
  scale: 1,
};

type Mode = "view" | "crop" | "filters" | "cleanup" | "text" | "resize";

/** The filter the user chose in Settings (falls back to the smart filter,
 * and ignores any stale/invalid value that may be in localStorage). */
function getDefaultScanFilter(): FilterName {
  const raw = localStorage.getItem("scanverse_default_filter") as FilterName | null;
  return raw && FILTER_LABELS[raw] ? raw : "smart_document";
}

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
        active ? "bg-brand/30 text-white" : "text-white/60 hover:bg-white/10 hover:text-white"
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
  // When routed as /dashboard/documents/:id/edit, open that document in the
  // full editor instead of starting a brand-new scan.
  const { id: editDocumentId } = useParams<{ id?: string }>();
  const [documentId, setDocumentId] = useState<string | null>(editDocumentId ?? null);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [corners, setCorners] = useState<number[][] | null>(null);
  const [filter, setFilter] = useState<FilterName>("auto");
  const [adjustments, setAdjustments] = useState<Adjustments>(DEFAULT_ADJUSTMENTS);
  const [title, setTitle] = useState("Untitled Scan");
  const [titleDirty, setTitleDirty] = useState(false);
  const blurSavedRef = useRef(false);
  const [ocrText, setOcrText] = useState("");
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [mode, setMode] = useState<Mode>("view");
  const [cleanupRegions, setCleanupRegions] = useState<number[][]>([]);
  const [showCapture, setShowCapture] = useState(false);
  const [showSignature, setShowSignature] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const retakeInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const { data: document } = useQuery({
    queryKey: ["document", documentId],
    queryFn: () => getDocument(documentId!),
    enabled: !!documentId,
  });

  useEffect(() => {
    if (document) setTitle(document.title);
  }, [document?.title]);

  // In edit mode, open the first page automatically once the document loads
  useEffect(() => {
    if (document && !activePageId && document.pages.length > 0) {
      setActivePageId(document.pages[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document?.id]);

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
        scale: activePage.scale ?? 1,
      });
      setOcrText(activePage.ocr_text ?? "");
      // Don't clear ocrResult if it's for the same page — only reset on page change
      setMode("view");
      setCleanupRegions([]);
    }
    // Re-sync when the auto-enhance (or a manual filter apply) changes the
    // page's saved filter so the Filters panel shows the truth.
  }, [activePage?.id, activePage?.filter_applied]);

  const upload = useMutation({
    mutationFn: (file: File) => uploadPage(file, documentId ?? undefined),
    onSuccess: (page, file) => {
      if (!documentId) setDocumentId(page.document_id);
      setActivePageId(page.id);
      // Adobe Scan behavior: straighten to the detected edges and enhance to
      // a clean black & white document automatically (image captures only —
      // uploaded PDFs keep their original colors).
      if (file.type.startsWith("image/") && page.corners) {
        autoEnhance.mutate({ pageId: page.id, corners: page.corners, documentId: page.document_id });
      }
      queryClient.invalidateQueries({ queryKey: ["document", page.document_id] });
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.detail || "Upload failed — check the file and try again", "error");
    },
  });

  const autoEnhance = useMutation({
    mutationFn: ({
      pageId,
      corners,
      documentId,
    }: {
      pageId: string;
      corners: number[][];
      documentId: string;
    }) => {
      // Honor the default filter chosen in Settings (falls back to the
      // smart filter that picks black & white vs color by itself).
      const defaultFilter = getDefaultScanFilter();
      return processPage(pageId, {
        corners,
        ...(defaultFilter === "original"
          ? {} // crop/straighten only, keep the original colors
          : { filter_applied: defaultFilter, intensity: 1 }),
      });
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["document", vars.documentId] });
      const defaultFilter = getDefaultScanFilter();
      showToast(
        defaultFilter === "original"
          ? "Edges detected — page straightened"
          : `Edges detected — enhanced with ${FILTER_LABELS[defaultFilter]}`,
        "success"
      );
    },
    onError: () => showToast("Auto-enhance skipped — you can apply a filter manually", "info"),
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
    onSuccess: (page) => {
      if (page.corners) {
        autoEnhance.mutate({ pageId: page.id, corners: page.corners, documentId: page.document_id });
      }
      // Retake resets the page server-side — clear any local resize too
      setAdjustments((prev) => ({ ...prev, scale: 1 }));
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
    onSuccess: (result: OcrResult) => {
      setOcrText(result.full_text);
      setOcrResult(result);
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
    onSuccess: () => {
      setTitleDirty(false);
      blurSavedRef.current = false;
      queryClient.invalidateQueries({ queryKey: ["document", documentId] });
      showToast("Changes saved", "success");
    },
    onError: () => {
      blurSavedRef.current = false;
      showToast("Couldn't save changes — try again", "error");
    },
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
        {editDocumentId && (
          <Link
            to={`/dashboard/documents/${editDocumentId}`}
            className="btn-secondary flex items-center gap-1.5 text-sm"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </Link>
        )}
        {documentId ? (
          <input
            ref={titleInputRef}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setTitleDirty(true);
            }}
            onBlur={() => {
              if (titleDirty) {
                blurSavedRef.current = true;
                saveTitle.mutate();
              }
            }}
            className="w-72 border-none bg-transparent text-2xl font-semibold tracking-tight outline-none focus:ring-0"
          />
        ) : (
          <h1 className="text-2xl font-semibold tracking-tight">New scan</h1>
        )}

        {documentId && document && activePage && document.pages.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {/* All-tools dropdown (Adobe Scan-style More menu) */}
            <div className="relative">
              <button
                onClick={() => setToolsOpen((v) => !v)}
                className="btn-secondary flex items-center gap-1.5 text-sm"
              >
                Tools <ChevronDown className="h-4 w-4" />
              </button>
              {toolsOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setToolsOpen(false)} />
                  <div className="absolute right-0 z-50 mt-2 w-52 overflow-hidden rounded-xl2 border border-line-light bg-white py-1 text-ink shadow-soft dark:border-line-dark dark:bg-surface-dark dark:text-white">
                    {[
                      {
                        label: "Retake",
                        icon: <Camera className="h-4 w-4" />,
                        onClick: () => {
                          setToolsOpen(false);
                          retakeInputRef.current?.click();
                        },
                      },
                      {
                        label: "Crop",
                        icon: <CropIcon className="h-4 w-4" />,
                        onClick: () => {
                          setMode("crop");
                          setToolsOpen(false);
                        },
                      },
                      {
                        label: "Rotate",
                        icon: <RotateCw className="h-4 w-4" />,
                        onClick: () => {
                          rotate.mutate(activePage.id);
                          setToolsOpen(false);
                        },
                      },
                      {
                        label: "Filters",
                        icon: <Sparkles className="h-4 w-4" />,
                        onClick: () => {
                          setMode("filters");
                          setToolsOpen(false);
                        },
                      },
                      {
                        label: "Cleanup",
                        icon: <Eraser className="h-4 w-4" />,
                        onClick: () => {
                          setMode("cleanup");
                          setToolsOpen(false);
                        },
                      },
                      {
                        label: "Resize",
                        icon: <Scaling className="h-4 w-4" />,
                        onClick: () => {
                          setMode("resize");
                          setToolsOpen(false);
                        },
                      },
                      {
                        label: "Edit text",
                        icon: <FileText className="h-4 w-4" />,
                        onClick: () => {
                          setMode("text");
                          setToolsOpen(false);
                        },
                      },
                      {
                        label: "Sign",
                        icon: <Pen className="h-4 w-4" />,
                        onClick: () => {
                          setShowSignature(true);
                          setToolsOpen(false);
                        },
                      },
                      {
                        label: "Delete page",
                        icon: <Trash2 className="h-4 w-4" />,
                        onClick: () => {
                          setToolsOpen(false);
                          if (confirm("Delete this page?")) remove.mutate(activePage.id);
                        },
                      },
                    ].map((tool) => (
                      <button
                        key={tool.label}
                        onClick={tool.onClick}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-ink/80 transition hover:bg-brand/15 hover:text-brand dark:text-white/80 dark:hover:text-white"
                      >
                        {tool.icon}
                        {tool.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <button onClick={() => setShowCapture(true)} className="btn-secondary text-sm">
              Keep scanning
            </button>
            <button
              onClick={() => {
                // Blurring the title input triggers its autosave, and clicking
                // the Save button blurs it first — so don't fire a second save.
                if (blurSavedRef.current) {
                  blurSavedRef.current = false;
                  return;
                }
                if (titleDirty) {
                  saveTitle.mutate();
                } else {
                  showToast("All changes already saved", "info");
                }
              }}
              disabled={saveTitle.isPending}
              className="btn-secondary flex items-center gap-1.5 text-sm"
            >
              <Check className="h-4 w-4" /> {saveTitle.isPending ? "Saving…" : "Save"}
            </button>
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as any)}
              className="input w-24"
              aria-label="Export format"
            >
              <option value="pdf">PDF</option>
              <option value="docx">DOCX</option>
              <option value="txt">TXT</option>
            </select>
            <button
              onClick={() => exporting.mutate()}
              disabled={exporting.isPending}
              className="btn-primary flex items-center gap-1.5 text-sm"
            >
              {exporting.isPending ? "Saving…" : `Save ${exportFormat.toUpperCase()}`}
            </button>
          </div>
        )}
      </div>

      {/* Capture zone — shown until at least one page exists */}
      {!documentId && (
        <div
          {...getRootProps()}
          className={`mt-6 cursor-pointer rounded-xl2 border-2 border-dashed p-10 text-center transition ${
            isDragActive ? "border-brand bg-brand/5" : "border-line-light hover:border-brand/40"
          }`}
        >
          <input {...getInputProps()} />
          <p className="font-medium">Scan a document</p>
          <p className="mt-1 text-xs text-ink/50">
            Take a photo with your camera, or pick one from your gallery
          </p>
          <div className="mx-auto mt-5 flex max-w-md flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowCapture(true);
              }}
              className="btn-primary flex flex-1 items-center justify-center gap-2"
            >
              <Camera className="h-4 w-4" /> Open camera
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                galleryInputRef.current?.click();
              }}
              className="btn-secondary flex flex-1 items-center justify-center gap-2"
            >
              <Images className="h-4 w-4" /> Choose from gallery
            </button>
          </div>
          <p className="mt-4 text-xs text-ink/40">
            Tip: you can also drag &amp; drop images or a PDF anywhere here
          </p>
        </div>
      )}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*,application/pdf"
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
      {(upload.isPending || autoEnhance.isPending) && (
        <p className="mt-2 text-sm text-ink/50">
          {upload.isPending ? "Uploading and detecting edges…" : "Enhancing…"}
        </p>
      )}

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
            {mode === "resize" && (
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
            <div className={mode === "text" ? "w-full" : "w-full max-w-xl"}>
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
                      onAdjustmentsChange={(adj) => setAdjustments({ ...adjustments, ...adj })}
                      disabled={process.isPending}
                    />
                  </div>
                </div>
              )}

              {mode === "resize" && previewUrl && (
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-[1fr_260px]">
                  {/* Live preview: the page shown at its target output size */}
                  <div className="flex max-h-[70vh] items-center justify-center overflow-hidden rounded-lg bg-[#050506]">
                    <img
                      src={previewUrl}
                      alt="Resize preview"
                      className="rounded-sm transition-all duration-150"
                      style={{
                        width: `${Math.round(adjustments.scale * 100)}%`,
                        height: "auto",
                      }}
                    />
                  </div>
                  <div className="rounded-xl2 bg-surface-dark p-5 text-white">
                    <p className="mb-4 text-sm font-medium">Output size</p>
                    <label className="block">
                      <div className="mb-1 flex items-center justify-between text-xs text-white/60">
                        <span>Scale</span>
                        <span className="font-mono">{Math.round(adjustments.scale * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0.25}
                        max={1}
                        step={0.05}
                        value={adjustments.scale}
                        onChange={(e) =>
                          setAdjustments({ ...adjustments, scale: parseFloat(e.target.value) })
                        }
                        className="w-full accent-brand"
                      />
                    </label>
                    <p className="mt-4 text-xs leading-relaxed text-white/50">
                      Smaller sizes produce lower file sizes and faster exports. Your original photo stays
                      untouched.
                    </p>
                  </div>
                </div>
              )}

              {mode === "text" && (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-white/80">Extracted text</p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => ocr.mutate()}
                        disabled={ocr.isPending}
                        className="text-xs text-brand hover:underline"
                      >
                        {ocr.isPending ? "Scanning…" : ocrResult ? "Re-run OCR" : "Run OCR"}
                      </button>
                      <button
                        onClick={() => navigator.clipboard.writeText(ocrText)}
                        className="text-xs text-brand hover:underline"
                      >
                        Copy
                      </button>
                    </div>
                  </div>

                  {ocrResult ? (
                    <WordOcrViewer
                      imageUrl={mediaUrl(activePage.original_url) || previewUrl || ""}
                      ocrResult={ocrResult}
                      onWordClick={(word) => {
                        console.log("Word clicked:", word);
                      }}
                      onWordUpdate={async (wordId: number, newText: string) => {
                        const updatedWords = ocrResult.words.map((w) =>
                          w.id === wordId ? { ...w, text: newText } : w
                        );
                        const lines = ocrResult.lines.map((line) => ({
                          ...line,
                          text: line.word_ids
                            .map((wid) => updatedWords.find((w) => w.id === wid)?.text || "")
                            .filter(Boolean)
                            .join(" "),
                        }));
                        const fullText = lines.map((l) => l.text).join("\n");
                        setOcrResult({ ...ocrResult, words: updatedWords, lines, full_text: fullText });
                        setOcrText(fullText);
                      }}
                    />
                  ) : (
                    <>
                      {previewUrl && (
                        <img src={mediaUrl(activePage.original_url) || previewUrl} alt="Preview" className="w-full rounded-lg" />
                      )}
                      <textarea
                        value={ocrText}
                        onChange={(e) => setOcrText(e.target.value)}
                        rows={14}
                        placeholder="No text extracted yet — tap Run OCR."
                        className="w-full rounded-lg border border-white/10 bg-black/40 px-3.5 py-2.5 text-xs text-white outline-none focus:border-brand font-mono"
                      />
                    </>
                  )}
                </div>
              )}

              {mode === "view" && previewUrl && (
                <img src={previewUrl} alt="Preview" className="mx-auto max-h-[70vh] w-auto rounded-lg" />
              )}
            </div>
          </div>

          {/* Bottom action bar (Adobe Scan-style). Sticky on mobile so the
              tools stay visible above the bottom nav while editing — the
              page preview can be tall and the tools were easy to miss. */}
          {mode === "view" && (
            <div className="sticky bottom-20 z-30 flex items-center justify-center gap-1 overflow-x-auto border-t border-white/10 bg-surface-dark px-2 py-2 text-white sm:gap-2 lg:bottom-0">
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
              <ToolButton icon={<Scaling className="h-5 w-5" />} label="Resize" onClick={() => setMode("resize")} />
              <ToolButton icon={<FileText className="h-5 w-5" />} label="Edit text" onClick={() => setMode("text")} />
              <ToolButton icon={<Pen className="h-5 w-5" />} label="Sign" onClick={() => setShowSignature(true)} />
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

      {showCapture && (
        <CaptureOverlay
          onFile={(file) => {
            setShowCapture(false);
            upload.mutate(file);
          }}
          onClose={() => setShowCapture(false)}
        />
      )}

      {showSignature && activePage && (
        <SignatureModal
          pageId={activePage.id}
          pageUrl={previewUrl || ""}
          onClose={() => setShowSignature(false)}
          onApplied={() => {
            queryClient.invalidateQueries({ queryKey: ["document", documentId] });
            setShowSignature(false);
          }}
        />
      )}
    </div>
  );
}
