import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteDocument,
  deletePage,
  downloadDocumentExport,
  getDocument,
  mediaUrl,
  runOcr,
  updateDocument,
  updatePageOcrText,
} from "@/api/client";
import type { OcrResult, OcrWord } from "@/api/client";
import CompressPdfModal from "@/components/CompressPdfModal";
import SignatureModal from "@/components/SignatureModal";
import WordOcrViewer from "@/components/WordOcrViewer";

export default function DocumentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<"pdf" | "docx" | "txt">("pdf");
  const [category, setCategory] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [showCompress, setShowCompress] = useState(false);
  const [showSignature, setShowSignature] = useState(false);
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [ocrViewMode, setOcrViewMode] = useState<"interactive" | "text">("interactive");

  const { data: document, isLoading } = useQuery({
    queryKey: ["document", id],
    queryFn: () => getDocument(id!),
    enabled: !!id,
  });

  useEffect(() => {
    if (document) {
      setCategory(document.category);
      setTagsInput(document.tags.join(", "));
      if (!activePageId && document.pages[0]) setActivePageId(document.pages[0].id);
    }
  }, [document?.id]);

  const activePage = document?.pages.find((p) => p.id === activePageId) ?? document?.pages[0];

  const ocr = useMutation({
    mutationFn: (pageId: string) => runOcr(pageId),
    onSuccess: (result: OcrResult) => {
      setOcrResult(result);
      queryClient.invalidateQueries({ queryKey: ["document", id] });
    },
  });

  const removePage = useMutation({
    mutationFn: (pageId: string) => deletePage(pageId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["document", id] }),
  });

  const saveMeta = useMutation({
    mutationFn: () =>
      updateDocument(id!, {
        category,
        tags: tagsInput
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["document", id] }),
  });

  const removeDocument = useMutation({
    mutationFn: () => deleteDocument(id!),
    onSuccess: () => navigate("/dashboard/documents"),
  });

  const exporting = useMutation({
    mutationFn: () => downloadDocumentExport(id!, document?.title ?? "scan", exportFormat),
  });

  if (isLoading) return <p className="text-sm text-ink/50">Loading…</p>;
  if (!document) return <p className="text-sm text-ink/50">Document not found.</p>;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{document.title}</h1>
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <Link
            to={`/dashboard/documents/${id}/edit`}
            className="btn-primary shrink-0 text-sm"
          >
            Edit document
          </Link>
          <select
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value as any)}
            className="input w-28 shrink-0"
          >
            <option value="pdf">PDF</option>
            <option value="docx">DOCX</option>
            <option value="txt">TXT</option>
          </select>
          <button onClick={() => exporting.mutate()} disabled={exporting.isPending} className="btn-primary">
            {exporting.isPending ? "Exporting…" : "Export"}
          </button>
          <button onClick={() => setShowCompress(true)} className="btn-secondary shrink-0">
            Compress PDF
          </button>
          <button onClick={() => setShowSignature(true)} className="btn-secondary shrink-0">
            Sign
          </button>
          <button
            onClick={() => {
              if (confirm(`Delete "${document.title}"? This can't be undone.`)) removeDocument.mutate();
            }}
            className="btn-secondary shrink-0 text-red-500"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
        <div>
          {activePage ? (
            <div className="card p-4">
              <img
                src={mediaUrl(activePage.processed_url || activePage.original_url) || ""}
                alt={document.title}
                className="w-full rounded-lg"
              />
            </div>
          ) : (
            <div className="card p-10 text-center text-ink/50">This document has no pages.</div>
          )}

          {document.pages.length > 1 && (
            <div className="mt-4 flex gap-3 overflow-x-auto">
              {document.pages.map((page, idx) => (
                <button
                  key={page.id}
                  onClick={() => setActivePageId(page.id)}
                  className={`w-20 shrink-0 overflow-hidden rounded-lg border-2 ${
                    activePage?.id === page.id ? "border-brand" : "border-transparent"
                  }`}
                >
                  <img
                    src={mediaUrl(page.thumbnail_url || page.original_url) || ""}
                    alt={`Page ${idx + 1}`}
                    className="aspect-[3/4] w-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}

          {activePage && (
            <div className="mt-6 flex items-center gap-3">
              <button
                onClick={() => ocr.mutate(activePage.id)}
                disabled={ocr.isPending}
                className="btn-secondary"
              >
                {ocr.isPending ? "Extracting…" : activePage.ocr_text ? "Re-run OCR" : "Extract text (OCR)"}
              </button>
              <button
                onClick={() => {
                  if (confirm("Delete this page?")) removePage.mutate(activePage.id);
                }}
                className="btn-secondary text-red-500"
              >
                Delete page
              </button>
            </div>
          )}

          {(activePage?.ocr_text || ocrResult) && (
            <div className="mt-6 card p-5">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-medium">Extracted text</p>
                <div className="flex items-center gap-2">
                  <div className="flex rounded-lg border border-line-light">
                    <button
                      onClick={() => setOcrViewMode("interactive")}
                      className={`px-3 py-1 text-xs transition-colors ${
                        ocrViewMode === "interactive" ? "bg-brand text-white" : "text-ink/60 hover:text-ink"
                      }`}
                    >
                      Interactive
                    </button>
                    <button
                      onClick={() => setOcrViewMode("text")}
                      className={`px-3 py-1 text-xs transition-colors ${
                        ocrViewMode === "text" ? "bg-brand text-white" : "text-ink/60 hover:text-ink"
                      }`}
                    >
                      Plain text
                    </button>
                  </div>
                  <button
                    onClick={() => navigator.clipboard.writeText(activePage?.ocr_text || "")}
                    className="text-xs text-brand hover:underline"
                  >
                    Copy
                  </button>
                </div>
              </div>

              {ocrViewMode === "interactive" && ocrResult ? (
                <WordOcrViewer
                  imageUrl={activePage?.processed_url || activePage?.original_url || ""}
                  ocrResult={ocrResult}
                  onWordClick={(word: OcrWord) => {
                    console.log("Word clicked:", word);
                  }}
                  onWordUpdate={async (wordId: number, newText: string) => {
                    if (!ocrResult) return;
                    // Update the word in local state
                    const updatedWords = ocrResult.words.map((w) =>
                      w.id === wordId ? { ...w, text: newText } : w
                    );
                    // Rebuild full text from updated words
                    const lines = ocrResult.lines.map((line) => ({
                      ...line,
                      text: line.word_ids
                        .map((wid) => updatedWords.find((w) => w.id === wid)?.text || "")
                        .filter(Boolean)
                        .join(" "),
                    }));
                    const fullText = lines.map((l) => l.text).join("\n");

                    setOcrResult({
                      ...ocrResult,
                      words: updatedWords,
                      lines,
                      full_text: fullText,
                    });

                    // Persist to backend
                    if (activePage?.id) {
                      try {
                        await updatePageOcrText(activePage.id, fullText);
                        queryClient.invalidateQueries({ queryKey: ["document", id] });
                      } catch (err) {
                        console.error("Failed to save OCR text:", err);
                      }
                    }
                  }}
                />
              ) : (
                <p className="whitespace-pre-wrap font-mono text-xs text-ink/70">
                  {activePage?.ocr_text || ocrResult?.full_text || ""}
                </p>
              )}

              {ocrViewMode === "text" && ocrResult && (
                <div className="mt-3 rounded-lg bg-ink/5 p-3">
                  <p className="text-[10px] font-medium text-ink/50">
                    {ocrResult.word_count} words • {ocrResult.line_count} lines • Avg confidence: {(ocrResult.average_confidence * 100).toFixed(1)}%
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="card h-fit space-y-4 p-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Category</label>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              onBlur={() => saveMeta.mutate()}
              className="input"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Tags</label>
            <input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              onBlur={() => saveMeta.mutate()}
              placeholder="finance, invoice, office"
              className="input"
            />
            <p className="mt-1 text-xs text-ink/40">Comma-separated</p>
          </div>
          <div className="border-t border-line-light pt-4 text-xs text-ink/50">
            <p>Created {new Date(document.created_at).toLocaleString()}</p>
            <p>Updated {new Date(document.updated_at).toLocaleString()}</p>
            <p>{document.pages.length} page{document.pages.length === 1 ? "" : "s"}</p>
          </div>
        </div>
      </div>

      {showCompress && (
        <CompressPdfModal
          documentId={id!}
          title={document.title}
          onClose={() => setShowCompress(false)}
        />
      )}

      {showSignature && activePage && (
        <SignatureModal
          pageId={activePage.id}
          pageUrl={mediaUrl(activePage.processed_url || activePage.original_url) || ""}
          onClose={() => setShowSignature(false)}
          onApplied={() => {
            queryClient.invalidateQueries({ queryKey: ["document", id] });
            setShowSignature(false);
          }}
        />
      )}
    </div>
  );
}
