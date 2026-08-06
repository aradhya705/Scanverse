import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  compressImage,
  convertImage,
  downloadCompressedImage,
  downloadImageToolFile,
  imagesToPdf,
  pdfToImages,
} from "@/api/client";
import type { CompressImageResult } from "@/types";

const QUICK_SIZES_KB = [100, 250, 500, 1024, 2048, 5120];
const OUTPUT_FORMATS = [
  { value: "", label: "Keep original format" },
  { value: "jpg", label: "JPG" },
  { value: "png", label: "PNG" },
  { value: "webp", label: "WEBP" },
  { value: "tiff", label: "TIFF" },
];
const CONVERT_FORMATS = ["jpg", "png", "webp", "tiff", "bmp", "gif"];
const PDF_IMAGE_FORMATS = ["png", "jpg"];

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

const TABS = [
  { id: "compress", label: "Compress" },
  { id: "convert", label: "Convert" },
  { id: "images-to-pdf", label: "Images → PDF" },
  { id: "pdf-to-images", label: "PDF → Images" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function Dropzone({
  file,
  previewUrl,
  accept,
  placeholder,
  onPick,
}: {
  file: File | null;
  previewUrl: string | null;
  accept: string;
  placeholder: string;
  onPick: (f: File) => void;
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
        const f = e.dataTransfer.files?.[0];
        if (f) onPick(f);
      }}
      onClick={() => inputRef.current?.click()}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-xl2 border-2 border-dashed p-10 text-center transition ${
        dragOver ? "border-brand bg-brand/5" : "border-line-light dark:border-line-dark"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
        }}
      />
      {previewUrl ? (
        <img src={previewUrl} alt="Selected" className="mb-3 max-h-48 rounded-lg object-contain" />
      ) : null}
      <p className="text-sm font-medium">{file ? file.name : placeholder}</p>
      {file && <p className="mt-1 text-xs text-ink/40">{formatBytes(file.size)}</p>}
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className={`rounded-lg border p-3 text-center ${
        highlight ? "border-brand/40 bg-brand/10" : "border-line-light dark:border-line-dark"
      }`}
    >
      <p className="text-xs text-ink/50 dark:text-paper/50">{label}</p>
      <p className={`mt-1 font-mono text-sm ${highlight ? "text-brand" : ""}`}>{value}</p>
    </div>
  );
}

function CompressTab() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedKb, setSelectedKb] = useState<number | null>(null);
  const [customValue, setCustomValue] = useState("");
  const [customUnit, setCustomUnit] = useState<"KB" | "MB">("KB");
  const [outputFormat, setOutputFormat] = useState("");
  const [result, setResult] = useState<CompressImageResult | null>(null);

  const targetSizeBytes = (): number | null => {
    if (customValue.trim()) {
      const n = parseFloat(customValue);
      if (!Number.isFinite(n) || n <= 0) return null;
      return Math.round(n * (customUnit === "KB" ? 1024 : 1024 ** 2));
    }
    if (selectedKb) return selectedKb * 1024;
    return null;
  };

  const compress = useMutation({
    mutationFn: () => {
      if (!file) throw new Error("Choose an image first.");
      return compressImage(file, { target_size_bytes: targetSizeBytes(), output_format: outputFormat || null });
    },
    onSuccess: (data) => setResult(data),
  });

  const download = useMutation({
    mutationFn: (r: CompressImageResult) =>
      downloadCompressedImage(r.download_filename, file?.name.split(".")[0] || "image"),
  });

  function pickFile(f: File) {
    setFile(f);
    setResult(null);
    setPreviewUrl(URL.createObjectURL(f));
  }

  return (
    <div>
      <p className="mb-4 text-sm text-ink/50 dark:text-paper/50">
        Compress JPG, PNG, WEBP, TIFF, or HEIC photos down to a target size.
      </p>
      <Dropzone
        file={file}
        previewUrl={previewUrl}
        accept=".jpg,.jpeg,.png,.webp,.tiff,.tif,.heic,.heif"
        placeholder="Drag & drop an image, or click to choose one"
        onPick={pickFile}
      />

      {file && !result && (
        <div className="card mt-6 space-y-5 p-5">
          <div>
            <p className="mb-2 text-sm font-medium">Target size (optional)</p>
            <div className="flex flex-wrap gap-2">
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
                      : "border-line-light text-ink/70 hover:border-brand/40 dark:border-line-dark dark:text-paper/70"
                  }`}
                >
                  {kb >= 1024 ? `${kb / 1024} MB` : `${kb} KB`}
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
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
                className="input flex-1"
              />
              <select value={customUnit} onChange={(e) => setCustomUnit(e.target.value as any)} className="input w-24">
                <option value="KB">KB</option>
                <option value="MB">MB</option>
              </select>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Output format</p>
            <select value={outputFormat} onChange={(e) => setOutputFormat(e.target.value)} className="input">
              {OUTPUT_FORMATS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          {compress.isError && (
            <p className="text-sm text-red-500">{(compress.error as Error)?.message || "Something went wrong. Try again."}</p>
          )}

          <button onClick={() => compress.mutate()} disabled={compress.isPending} className="btn-primary w-full">
            {compress.isPending ? "Compressing…" : "Compress"}
          </button>
        </div>
      )}

      {result && (
        <div className="card mt-6 p-5">
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Original" value={formatBytes(result.original_size_bytes)} />
            <StatCard label="Compressed" value={formatBytes(result.compressed_size_bytes)} highlight />
            <StatCard label="Reduction" value={`${result.reduction_pct}%`} />
          </div>

          {!result.target_achieved && (
            <p className="mt-4 rounded-lg border border-flag/40 bg-flag/10 px-3 py-2 text-xs text-flag">
              Couldn't quite hit your target size while keeping the image usable — this is the smallest it could go
              for this format. Try converting to JPG or WEBP for smaller output.
            </p>
          )}

          <div className="mt-5 flex gap-2">
            <button onClick={() => setResult(null)} className="btn-secondary flex-1">
              Try another size
            </button>
            <button onClick={() => download.mutate(result)} disabled={download.isPending} className="btn-primary flex-1">
              {download.isPending ? "Downloading…" : "Download"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ConvertTab() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [targetFormat, setTargetFormat] = useState("png");
  const [result, setResult] = useState<{
    original_size_bytes: number;
    output_size_bytes: number;
    format_used: string;
    download_filename: string;
  } | null>(null);

  const convert = useMutation({
    mutationFn: () => {
      if (!file) throw new Error("Choose an image first.");
      return convertImage(file, targetFormat);
    },
    onSuccess: (data) => setResult(data),
  });

  const download = useMutation({
    mutationFn: (filename: string) => downloadImageToolFile(filename, file?.name.split(".")[0] || "converted"),
  });

  function pickFile(f: File) {
    setFile(f);
    setResult(null);
    setPreviewUrl(URL.createObjectURL(f));
  }

  return (
    <div>
      <p className="mb-4 text-sm text-ink/50 dark:text-paper/50">
        Convert between PNG, JPG, WEBP, TIFF, BMP, and GIF (HEIC can be read as a source).
      </p>
      <Dropzone
        file={file}
        previewUrl={previewUrl}
        accept=".jpg,.jpeg,.png,.webp,.tiff,.tif,.bmp,.gif,.heic,.heif"
        placeholder="Drag & drop an image, or click to choose one"
        onPick={pickFile}
      />

      {file && !result && (
        <div className="card mt-6 space-y-5 p-5">
          <div>
            <p className="mb-2 text-sm font-medium">Convert to</p>
            <div className="grid grid-cols-3 gap-2">
              {CONVERT_FORMATS.map((f) => (
                <button
                  key={f}
                  onClick={() => setTargetFormat(f)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium uppercase transition ${
                    targetFormat === f
                      ? "border-brand bg-brand/10 text-brand"
                      : "border-line-light text-ink/60 hover:border-brand/40 dark:border-line-dark"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {convert.isError && (
            <p className="text-sm text-red-500">{(convert.error as Error)?.message || "Something went wrong. Try again."}</p>
          )}

          <button onClick={() => convert.mutate()} disabled={convert.isPending} className="btn-primary w-full">
            {convert.isPending ? "Converting…" : `Convert to ${targetFormat.toUpperCase()}`}
          </button>
        </div>
      )}

      {result && (
        <div className="card mt-6 p-5">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Original" value={formatBytes(result.original_size_bytes)} />
            <StatCard label={`As ${result.format_used.toUpperCase()}`} value={formatBytes(result.output_size_bytes)} highlight />
          </div>
          <div className="mt-5 flex gap-2">
            <button onClick={() => setResult(null)} className="btn-secondary flex-1">
              Convert another
            </button>
            <button
              onClick={() => download.mutate(result.download_filename)}
              disabled={download.isPending}
              className="btn-primary flex-1"
            >
              {download.isPending ? "Downloading…" : "Download"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ImagesToPdfTab() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [result, setResult] = useState<{ page_count: number; download_filename: string } | null>(null);

  const build = useMutation({
    mutationFn: () => {
      if (files.length === 0) throw new Error("Choose at least one image.");
      return imagesToPdf(files);
    },
    onSuccess: (data) => setResult(data),
  });

  const download = useMutation({
    mutationFn: (filename: string) => downloadImageToolFile(filename, "images"),
  });

  return (
    <div>
      <p className="mb-4 text-sm text-ink/50 dark:text-paper/50">
        Combine multiple images into a single multi-page PDF, in the order you pick them.
      </p>
      <div
        onClick={() => inputRef.current?.click()}
        className="cursor-pointer rounded-xl2 border-2 border-dashed border-line-light p-10 text-center transition hover:border-brand/40 dark:border-line-dark"
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.webp,.tiff,.tif,.bmp,.gif,.heic,.heif"
          className="hidden"
          onChange={(e) => {
            const picked = Array.from(e.target.files || []);
            if (picked.length) {
              setFiles(picked);
              setResult(null);
            }
          }}
        />
        <p className="text-sm font-medium">
          {files.length ? `${files.length} image${files.length === 1 ? "" : "s"} selected` : "Click to choose images"}
        </p>
      </div>

      {files.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <span key={i} className="rounded-full border border-line-light px-3 py-1 text-xs dark:border-line-dark">
              {i + 1}. {f.name}
            </span>
          ))}
        </div>
      )}

      {files.length > 0 && !result && (
        <div className="mt-6">
          {build.isError && (
            <p className="mb-3 text-sm text-red-500">{(build.error as Error)?.message || "Something went wrong. Try again."}</p>
          )}
          <button onClick={() => build.mutate()} disabled={build.isPending} className="btn-primary w-full">
            {build.isPending ? "Building PDF…" : `Build PDF from ${files.length} image${files.length === 1 ? "" : "s"}`}
          </button>
        </div>
      )}

      {result && (
        <div className="card mt-6 p-5">
          <p className="text-sm">
            Built a <span className="font-medium">{result.page_count}-page</span> PDF.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => {
                setResult(null);
                setFiles([]);
              }}
              className="btn-secondary flex-1"
            >
              Start over
            </button>
            <button
              onClick={() => download.mutate(result.download_filename)}
              disabled={download.isPending}
              className="btn-primary flex-1"
            >
              {download.isPending ? "Downloading…" : "Download PDF"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PdfToImagesTab() {
  const [file, setFile] = useState<File | null>(null);
  const [imageFormat, setImageFormat] = useState("png");
  const [result, setResult] = useState<{ page_count: number; download_filename: string } | null>(null);

  const extract = useMutation({
    mutationFn: () => {
      if (!file) throw new Error("Choose a PDF first.");
      return pdfToImages(file, imageFormat);
    },
    onSuccess: (data) => setResult(data),
  });

  const download = useMutation({
    mutationFn: (filename: string) => downloadImageToolFile(filename, file?.name.split(".")[0] || "pages"),
  });

  return (
    <div>
      <p className="mb-4 text-sm text-ink/50 dark:text-paper/50">
        Extract every page of a PDF as an image, delivered as a .zip.
      </p>
      <Dropzone
        file={file}
        previewUrl={null}
        accept=".pdf"
        placeholder="Drag & drop a PDF, or click to choose one"
        onPick={(f) => {
          setFile(f);
          setResult(null);
        }}
      />

      {file && !result && (
        <div className="card mt-6 space-y-5 p-5">
          <div>
            <p className="mb-2 text-sm font-medium">Image format</p>
            <div className="grid grid-cols-2 gap-2">
              {PDF_IMAGE_FORMATS.map((f) => (
                <button
                  key={f}
                  onClick={() => setImageFormat(f)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium uppercase transition ${
                    imageFormat === f
                      ? "border-brand bg-brand/10 text-brand"
                      : "border-line-light text-ink/60 hover:border-brand/40 dark:border-line-dark"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {extract.isError && (
            <p className="text-sm text-red-500">{(extract.error as Error)?.message || "Something went wrong. Try again."}</p>
          )}

          <button onClick={() => extract.mutate()} disabled={extract.isPending} className="btn-primary w-full">
            {extract.isPending ? "Extracting…" : "Extract pages"}
          </button>
        </div>
      )}

      {result && (
        <div className="card mt-6 p-5">
          <p className="text-sm">
            Extracted <span className="font-medium">{result.page_count}</span> page
            {result.page_count === 1 ? "" : "s"} as {imageFormat.toUpperCase()}.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => {
                setResult(null);
                setFile(null);
              }}
              className="btn-secondary flex-1"
            >
              Start over
            </button>
            <button
              onClick={() => download.mutate(result.download_filename)}
              disabled={download.isPending}
              className="btn-primary flex-1"
            >
              {download.isPending ? "Downloading…" : "Download .zip"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ImageTools() {
  const [tab, setTab] = useState<TabId>("compress");

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Image Tools</h1>

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
        {tab === "compress" && <CompressTab />}
        {tab === "convert" && <ConvertTab />}
        {tab === "images-to-pdf" && <ImagesToPdfTab />}
        {tab === "pdf-to-images" && <PdfToImagesTab />}
      </div>
    </div>
  );
}
