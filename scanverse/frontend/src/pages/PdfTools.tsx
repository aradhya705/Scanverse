import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  deletePdfPages,
  downloadPdfToolOutput,
  extractPdfPages,
  mergePdfs,
  rearrangePdfPages,
  splitPdf,
  type PdfToolBatchResult,
} from "@/api/client";
import { useToast } from "@/context/ToastContext";

const TABS = [
  { id: "merge", label: "Merge PDFs" },
  { id: "split", label: "Split" },
  { id: "extract", label: "Extract pages" },
  { id: "delete", label: "Delete pages" },
  { id: "rearrange", label: "Rearrange" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function PdfDropzone({
  multiple,
  files,
  onPick,
  placeholder,
}: {
  multiple: boolean;
  files: File[];
  onPick: (f: File[]) => void;
  placeholder: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const picked = Array.from(e.dataTransfer.files || []);
        if (picked.length) onPick(picked);
      }}
      onClick={() => inputRef.current?.click()}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-xl2 border-2 border-dashed p-10 text-center transition ${
        dragOver ? "border-brand bg-brand/5" : "border-line-light hover:border-brand/40 dark:border-line-dark"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        multiple={multiple}
        accept=".pdf"
        className="hidden"
        onChange={(e) => {
          const picked = Array.from(e.target.files || []);
          if (picked.length) onPick(picked);
        }}
      />
      <p className="text-sm font-medium">
        {files.length ? `${files.length} PDF${files.length === 1 ? "" : "s"} selected` : placeholder}
      </p>
      {files.length > 0 && (
        <div className="mt-3 flex max-w-full flex-wrap justify-center gap-2">
          {files.map((f, i) => (
            <span
              key={i}
              className="truncate rounded-full border border-line-light px-3 py-1 text-xs dark:border-line-dark"
            >
              {i + 1}. {f.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ResultCard({
  result,
  baseName,
  verb,
  onReset,
}: {
  result: PdfToolBatchResult;
  baseName: string;
  verb: string;
  onReset: () => void;
}) {
  const download = useMutation({
    mutationFn: () => downloadPdfToolOutput(result, baseName),
  });
  return (
    <div className="card mt-6 p-5">
      <p className="text-sm">
        <span className="font-medium">{result.page_count}</span> page{result.page_count === 1 ? "" : "s"} {verb}.
      </p>
      <div className="mt-4 flex gap-2">
        <button onClick={onReset} className="btn-secondary flex-1">
          Start over
        </button>
        <button onClick={() => download.mutate()} disabled={download.isPending} className="btn-primary flex-1">
          {download.isPending ? "Downloading…" : "Download"}
        </button>
      </div>
    </div>
  );
}

function MergeTab() {
  const [files, setFiles] = useState<File[]>([]);
  const [result, setResult] = useState<PdfToolBatchResult | null>(null);
  const merge = useMutation({
    mutationFn: () => mergePdfs(files),
    onSuccess: (data) => setResult(data),
  });
  return (
    <div>
      <p className="mb-4 text-sm text-ink/50 dark:text-paper/50">
        Combine multiple PDFs into one document, in the order you pick them.
      </p>
      <PdfDropzone
        multiple
        files={files}
        onPick={(f) => {
          setFiles(f);
          setResult(null);
        }}
        placeholder="Drag & drop PDFs here, or click to choose"
      />
      {files.length > 1 && !result && (
        <div className="mt-6">
          {merge.isError && (
            <p className="mb-3 text-sm text-red-500">
              {(merge.error as Error)?.message || "Something went wrong. Try again."}
            </p>
          )}
          <button onClick={() => merge.mutate()} disabled={merge.isPending} className="btn-primary w-full">
            {merge.isPending ? "Merging…" : `Merge ${files.length} PDFs`}
          </button>
        </div>
      )}
      {result && (
        <ResultCard
          result={result}
          baseName="merged"
          verb="merged"
          onReset={() => {
            setResult(null);
            setFiles([]);
          }}
        />
      )}
    </div>
  );
}

interface SinglePdfTabProps {
  hint: string;
  actionLabel: string;
  busyLabel: string;
  onRun: (file: File) => void;
  isPending: boolean;
  apiError: string | null;
  extra?: (file: File) => React.ReactNode;
  result: PdfToolBatchResult | null;
  baseName: string;
  verb: string;
  onReset: () => void;
}

function SinglePdfTab({
  hint,
  actionLabel,
  busyLabel,
  onRun,
  isPending,
  apiError,
  extra,
  result,
  baseName,
  verb,
  onReset,
}: SinglePdfTabProps) {
  const [file, setFile] = useState<File | null>(null);
  return (
    <div>
      <p className="mb-4 text-sm text-ink/50 dark:text-paper/50">{hint}</p>
      <PdfDropzone
        multiple={false}
        files={file ? [file] : []}
        onPick={(f) => {
          setFile(f[0]);
          onReset();
        }}
        placeholder="Drag & drop a PDF here, or click to choose"
      />
      {file && !result && (
        <div className="card mt-6 space-y-5 p-5">
          {extra?.(file)}
          {apiError && <p className="text-sm text-red-500">{apiError}</p>}
          <button onClick={() => onRun(file)} disabled={isPending} className="btn-primary w-full">
            {isPending ? busyLabel : actionLabel}
          </button>
        </div>
      )}
      {result && <ResultCard result={result} baseName={baseName} verb={verb} onReset={onReset} />}
    </div>
  );
}

function PagesInput({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="input" />
    </div>
  );
}

/** Parse "1,3,5" into 1-indexed page numbers, or null if invalid/empty. */
function parsePages(raw: string): number[] | null {
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  const nums = parts.map(Number);
  if (nums.some((n) => !Number.isInteger(n) || n < 1)) return null;
  return nums;
}

export default function PdfTools() {
  const [tab, setTab] = useState<TabId>("merge");
  const { showToast } = useToast();

  // ---- Split ----
  const [splitResult, setSplitResult] = useState<PdfToolBatchResult | null>(null);
  const split = useMutation({
    mutationFn: (f: File) => splitPdf(f),
    onSuccess: (data) => {
      setSplitResult(data);
      showToast("PDF split into individual pages", "success");
    },
  });

  // ---- Extract ----
  const [extractPagesRaw, setExtractPagesRaw] = useState("");
  const [extractResult, setExtractResult] = useState<PdfToolBatchResult | null>(null);
  const extract = useMutation({
    mutationFn: ({ f, pages }: { f: File; pages: number[] }) => extractPdfPages(f, pages),
    onSuccess: (data) => setExtractResult(data),
    onError: (err: any) => showToast(err?.response?.data?.detail || "Extract failed", "error"),
  });

  // ---- Delete ----
  const [deletePagesRaw, setDeletePagesRaw] = useState("");
  const [deleteResult, setDeleteResult] = useState<PdfToolBatchResult | null>(null);
  const del = useMutation({
    mutationFn: ({ f, pages }: { f: File; pages: number[] }) => deletePdfPages(f, pages),
    onSuccess: (data) => setDeleteResult(data),
    onError: (err: any) => showToast(err?.response?.data?.detail || "Delete failed", "error"),
  });

  // ---- Rearrange ----
  const [rearrangeOrderRaw, setRearrangeOrderRaw] = useState("");
  const [rearrangeResult, setRearrangeResult] = useState<PdfToolBatchResult | null>(null);
  const rearrange = useMutation({
    mutationFn: ({ f, order }: { f: File; order: number[] }) => rearrangePdfPages(f, order),
    onSuccess: (data) => setRearrangeResult(data),
    onError: (err: any) => showToast(err?.response?.data?.detail || "Rearrange failed", "error"),
  });

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">PDF Tools</h1>
      <p className="mt-1 text-sm text-ink/50 dark:text-paper/50">
        Merge, split, extract, delete, and rearrange pages — no uploads are stored on the server.
      </p>

      <div className="mt-4 flex flex-wrap gap-2 border-b border-line-light pb-3 dark:border-line-dark">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              tab === t.id
                ? "bg-brand text-white"
                : "text-ink/60 hover:bg-black/5 dark:text-paper/60 dark:hover:bg-white/5"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "merge" && <MergeTab />}

        {tab === "split" && (
          <SinglePdfTab
            hint="Break a PDF into one file per page, delivered as a .zip."
            actionLabel="Split PDF"
            busyLabel="Splitting…"
            onRun={(f) => split.mutate(f)}
            isPending={split.isPending}
            apiError={split.isError ? (split.error as Error)?.message || "Something went wrong." : null}
            result={splitResult}
            baseName="split"
            verb="split into separate files"
            onReset={() => setSplitResult(null)}
          />
        )}

        {tab === "extract" && (
          <SinglePdfTab
            hint="Pull out just the pages you need into a new PDF."
            actionLabel="Extract pages"
            busyLabel="Extracting…"
            onRun={(f) => {
              const pages = parsePages(extractPagesRaw);
              if (!pages) {
                showToast("Enter at least one page number, e.g. 1,3,5", "error");
                return;
              }
              extract.mutate({ f, pages });
            }}
            isPending={extract.isPending}
            apiError={extract.isError ? (extract.error as Error)?.message || "Something went wrong." : null}
            extra={() => (
              <PagesInput
                label="Pages to extract (1-indexed)"
                placeholder="e.g. 1,3,5"
                value={extractPagesRaw}
                onChange={setExtractPagesRaw}
              />
            )}
            result={extractResult}
            baseName="extracted"
            verb="extracted"
            onReset={() => {
              setExtractResult(null);
              setExtractPagesRaw("");
            }}
          />
        )}

        {tab === "delete" && (
          <SinglePdfTab
            hint="Remove unwanted pages and download the remaining PDF."
            actionLabel="Delete pages"
            busyLabel="Deleting…"
            onRun={(f) => {
              const pages = parsePages(deletePagesRaw);
              if (!pages) {
                showToast("Enter at least one page number, e.g. 2,4", "error");
                return;
              }
              del.mutate({ f, pages });
            }}
            isPending={del.isPending}
            apiError={del.isError ? (del.error as Error)?.message || "Something went wrong." : null}
            extra={() => (
              <PagesInput
                label="Pages to delete (1-indexed)"
                placeholder="e.g. 2,4"
                value={deletePagesRaw}
                onChange={setDeletePagesRaw}
              />
            )}
            result={deleteResult}
            baseName="remaining"
            verb="remaining"
            onReset={() => {
              setDeleteResult(null);
              setDeletePagesRaw("");
            }}
          />
        )}

        {tab === "rearrange" && (
          <SinglePdfTab
            hint="Type the page order you want (1-indexed), e.g. 3,1,2 puts page 3 first."
            actionLabel="Rearrange"
            busyLabel="Rearranging…"
            onRun={(f) => {
              const order = parsePages(rearrangeOrderRaw);
              if (!order) {
                showToast("Enter a page order, e.g. 3,1,2", "error");
                return;
              }
              rearrange.mutate({ f, order });
            }}
            isPending={rearrange.isPending}
            apiError={rearrange.isError ? (rearrange.error as Error)?.message || "Something went wrong." : null}
            extra={() => (
              <PagesInput
                label="New page order"
                placeholder="e.g. 3,1,2"
                value={rearrangeOrderRaw}
                onChange={setRearrangeOrderRaw}
              />
            )}
            result={rearrangeResult}
            baseName="rearranged"
            verb="rearranged"
            onReset={() => {
              setRearrangeResult(null);
              setRearrangeOrderRaw("");
            }}
          />
        )}
      </div>
    </div>
  );
}
