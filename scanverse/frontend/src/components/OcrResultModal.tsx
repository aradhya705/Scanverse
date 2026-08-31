import { useState } from "react";
import { Copy, Download, X, Check } from "lucide-react";

interface OcrResultModalProps {
  text: string;
  wordCount?: number;
  lineCount?: number;
  avgConfidence?: number;
  onClose: () => void;
  onSave?: (text: string) => void;
}

export default function OcrResultModal({
  text,
  wordCount,
  lineCount,
  avgConfidence,
  onClose,
  onSave,
}: OcrResultModalProps) {
  const [editedText, setEditedText] = useState(text);
  const [copied, setCopied] = useState(false);

  const handleCopyAll = async () => {
    try {
      await navigator.clipboard.writeText(editedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = editedText;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSave = () => {
    // Save as .txt file download
    const blob = new Blob([editedText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `scanverse-ocr-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onSave?.(editedText);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="flex w-full max-w-3xl flex-col rounded-2xl border border-line-light bg-white shadow-2xl dark:border-line-dark dark:bg-surface-dark"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line-light px-5 py-4 dark:border-line-dark">
          <div>
            <h2 className="text-lg font-semibold">ScanVerse OCR</h2>
            {wordCount !== undefined && (
              <p className="mt-0.5 text-xs text-ink/50">
                {wordCount} words • {lineCount} lines
                {avgConfidence !== undefined && ` • ${Math.round(avgConfidence * 100)}% confidence`}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink/40 transition hover:bg-ink/5 hover:text-ink/70"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Text area */}
        <div className="flex-1 overflow-auto p-5">
          <textarea
            value={editedText}
            onChange={(e) => setEditedText(e.target.value)}
            className="h-96 w-full resize-y rounded-xl border border-line-light bg-ink/[0.02] px-4 py-3 font-mono text-sm text-ink outline-none transition focus:border-brand focus:ring-1 focus:ring-brand/20 dark:border-line-dark dark:bg-white/5 dark:text-white"
            placeholder="No text extracted..."
            spellCheck={false}
          />
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between border-t border-line-light px-5 py-4 dark:border-line-dark">
          <p className="text-xs text-ink/40">Edit text above before saving</p>
          <div className="flex gap-3">
            <button
              onClick={handleCopyAll}
              className="flex items-center gap-2 rounded-xl border border-line-light px-4 py-2 text-sm font-medium transition hover:bg-ink/5 dark:border-line-dark dark:hover:bg-white/5"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-green-500" />
                  <span className="text-green-600">Text copied successfully!</span>
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy All
                </>
              )}
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-2 rounded-xl bg-brand px-5 py-2 text-sm font-medium text-white transition hover:bg-brand/90"
            >
              <Download className="h-4 w-4" />
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
