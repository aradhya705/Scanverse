import axios from "axios";
import type {
  CompressImageResult,
  CompressionPreset,
  CompressResult,
  Document,
  DocumentListItem,
  Page,
  User,
} from "@/types";

// API base URL. Defaults to the same-origin "/api/v1" (proxied by Vite in
// dev and by nginx in Docker). When the frontend is hosted somewhere that
// can't proxy (e.g. Vercel), set VITE_API_BASE_URL to the full backend URL,
// e.g. https://scanverse-api.example.com/api/v1 — then API calls and uploads
// go directly to the backend (which must allow this origin via CORS).
const API_BASE: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) || "/api/v1";

export const api = axios.create({
  baseURL: API_BASE,
});

/**
 * Resolve a backend-relative media URL (e.g. "/media/uploads/...") to an
 * absolute URL when the frontend talks to a cross-origin backend. Returns the
 * URL unchanged when no VITE_API_BASE_URL is configured (same-origin setup).
 */
export function mediaUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("http") || url.startsWith("data:") || url.startsWith("blob:")) return url;
  const base = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (!base || base === "/api/v1") return url;
  try {
    return `${new URL(base).origin}${url.startsWith("/") ? url : `/${url}`}`;
  } catch {
    return url;
  }
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("scanverse_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("scanverse_token");
      localStorage.removeItem("scanverse_user");
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

// ---- Auth ----
export async function registerUser(payload: { email: string; password: string; full_name?: string }) {
  const { data } = await api.post<{ access_token: string; user: User }>("/auth/register", payload);
  return data;
}

export async function forgotPassword(email: string) {
  const { data } = await api.post<{ detail: string; reset_token?: string; expires_minutes?: number }>(
    "/auth/forgot-password",
    { email }
  );
  return data;
}

export async function resetPassword(token: string, newPassword: string) {
  const { data } = await api.post<{ detail: string }>("/auth/reset-password", {
    token,
    new_password: newPassword,
  });
  return data;
}

export async function loginUser(email: string, password: string) {
  const form = new URLSearchParams();
  form.set("username", email);
  form.set("password", password);
  const { data } = await api.post<{ access_token: string; user: User }>("/auth/login", form, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  return data;
}

export async function fetchCurrentUser() {
  const { data } = await api.get<User>("/auth/me");
  return data;
}

// ---- Documents ----
export async function listDocuments(params?: { q?: string; category?: string; favorites_only?: boolean }) {
  const { data } = await api.get<DocumentListItem[]>("/documents", { params });
  return data;
}

export async function getDocument(id: string) {
  const { data } = await api.get<Document>(`/documents/${id}`);
  return data;
}

export async function updateDocument(id: string, payload: Partial<Pick<Document, "title" | "category" | "tags" | "is_favorite">>) {
  const { data } = await api.patch<Document>(`/documents/${id}`, payload);
  return data;
}

export async function deleteDocument(id: string) {
  await api.delete(`/documents/${id}`);
}

// ---- Scan ----
export async function uploadPage(file: File, documentId?: string) {
  const form = new FormData();
  form.append("file", file);
  if (documentId) form.append("document_id", documentId);
  const { data } = await api.post<Page>("/scan/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function processPage(pageId: string, payload: Partial<Page> & { corners?: number[][] }) {
  const { data } = await api.post<Page>(`/scan/pages/${pageId}/process`, payload);
  return data;
}

export async function retakePage(pageId: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<Page>(`/scan/pages/${pageId}/retake`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function cleanupPage(pageId: string, regions: number[][]) {
  const { data } = await api.post<Page>(`/scan/pages/${pageId}/cleanup`, { regions });
  return data;
}

export async function duplicatePage(pageId: string) {
  const { data } = await api.post<Page>(`/scan/pages/${pageId}/duplicate`);
  return data;
}

export async function deletePage(pageId: string) {
  await api.delete(`/scan/pages/${pageId}`);
}

export async function reorderPages(documentId: string, pageIdsInOrder: string[]) {
  await api.post(`/scan/documents/${documentId}/reorder`, { page_ids_in_order: pageIdsInOrder });
}

// ---- OCR ----
export interface OcrWord {
  id: number;
  text: string;
  confidence: number;
  low_confidence: boolean;
  bbox: number[][];
  line_index: number;
}

export interface OcrLine {
  text: string;
  confidence: number;
  low_confidence: boolean;
  bbox: number[][];
  word_ids: number[];
}

export interface OcrResult {
  full_text: string;
  lines: OcrLine[];
  words: OcrWord[];
  language: string[];
  average_confidence: number;
  low_confidence_line_count: number;
  line_count: number;
  word_count: number;
  preprocessed: boolean;
  page_id?: string;
}

export async function runOcr(pageId: string, language?: string) {
  const { data } = await api.post<OcrResult>(`/ocr/pages/${pageId}`, null, {
    params: language ? { language } : undefined,
  });
  return data;
}

export async function updatePageOcrText(pageId: string, ocrText: string) {
  const { data } = await api.patch<{ page_id: string; ocr_text: string }>(`/ocr/pages/${pageId}`, {
    ocr_text: ocrText,
  });
  return data;
}

// ---- Export ----
// Exports require the auth header, so we fetch as a blob rather than
// linking directly to the API URL (which would be requested unauthenticated).
export async function downloadDocumentExport(documentId: string, title: string, format: "pdf" | "docx" | "txt") {
  const response = await api.get(`/export/documents/${documentId}`, {
    params: { format },
    responseType: "blob",
  });
  const blobUrl = window.URL.createObjectURL(response.data);
  const link = window.document.createElement("a");
  link.href = blobUrl;
  link.download = `${title}.${format}`;
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
}

// ---- PDF Tools ----
export async function compressDocument(
  documentId: string,
  payload: { preset: CompressionPreset; target_size_bytes?: number | null }
) {
  const { data } = await api.post<CompressResult>(
    `/pdf-tools/documents/${documentId}/compress`,
    payload
  );
  return data;
}

export async function downloadCompressedPdf(downloadFilename: string, title: string) {
  const response = await api.get(`/pdf-tools/download/${downloadFilename}`, {
    responseType: "blob",
  });
  const blobUrl = window.URL.createObjectURL(response.data);
  const link = window.document.createElement("a");
  link.href = blobUrl;
  link.download = `${title}_compressed.pdf`;
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
}

// ---- Stats ----
export interface UserStats {
  document_count: number;
  page_count: number;
  favorite_count: number;
  total_storage_bytes: number;
  ocr_char_count: number;
  recently_edited: {
    id: string;
    title: string;
    category: string;
    is_favorite: boolean;
    page_count: number;
    updated_at: string;
  }[];
}

export async function fetchStats() {
  const { data } = await api.get<UserStats>("/stats");
  return data;
}

// ---- PDF Tools ----
export interface PdfToolBatchResult {
  page_count: number;
  download_filename: string;
}

export async function mergePdfs(files: File[]) {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  const { data } = await api.post<PdfToolBatchResult>("/pdf-tools/merge", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function splitPdf(file: File) {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<PdfToolBatchResult>("/pdf-tools/split", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function extractPdfPages(file: File, pages: number[]) {
  const form = new FormData();
  form.append("file", file);
  form.append("pages", pages.join(","));
  const { data } = await api.post<PdfToolBatchResult>("/pdf-tools/extract", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function deletePdfPages(file: File, pages: number[]) {
  const form = new FormData();
  form.append("file", file);
  form.append("pages", pages.join(","));
  const { data } = await api.post<PdfToolBatchResult>("/pdf-tools/delete-pages", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function rearrangePdfPages(file: File, order: number[]) {
  const form = new FormData();
  form.append("file", file);
  form.append("order", order.join(","));
  const { data } = await api.post<PdfToolBatchResult>("/pdf-tools/rearrange", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

async function downloadPdfToolFile(filename: string, baseName: string) {
  const response = await api.get(`/pdf-tools/download/${encodeURIComponent(filename)}`, {
    responseType: "blob",
  });
  const ext = filename.split(".").pop() || "pdf";
  const blobUrl = window.URL.createObjectURL(response.data);
  const link = window.document.createElement("a");
  link.href = blobUrl;
  link.download = `${baseName}.${ext}`;
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
}

export async function downloadPdfToolOutput(result: PdfToolBatchResult, baseName: string) {
  await downloadPdfToolFile(result.download_filename, baseName);
}

// ---- Signature ----
export async function applySignature(
  pageId: string,
  payload: {
    signature_png_b64: string;
    x: number;
    y: number;
    width_fraction: number;
    opacity: number;
  }
) {
  const { data } = await api.post<Page>(`/scan/pages/${pageId}/signature`, payload);
  return data;
}

// ---- Image Tools ----
export async function compressImage(
  file: File,
  options: { target_size_bytes?: number | null; output_format?: string | null }
) {
  const form = new FormData();
  form.append("file", file);
  if (options.target_size_bytes) form.append("target_size_bytes", String(options.target_size_bytes));
  if (options.output_format) form.append("output_format", options.output_format);
  const { data } = await api.post<CompressImageResult>("/image-tools/compress", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function downloadCompressedImage(downloadFilename: string, baseName: string) {
  const response = await api.get(`/image-tools/download/${downloadFilename}`, {
    responseType: "blob",
  });
  const ext = downloadFilename.split(".").pop();
  const blobUrl = window.URL.createObjectURL(response.data);
  const link = window.document.createElement("a");
  link.href = blobUrl;
  link.download = `${baseName}_compressed.${ext}`;
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
}

export async function convertImage(file: File, targetFormat: string) {
  const form = new FormData();
  form.append("file", file);
  form.append("target_format", targetFormat);
  const { data } = await api.post<{
    original_size_bytes: number;
    output_size_bytes: number;
    format_used: string;
    download_filename: string;
  }>("/image-tools/convert", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function imagesToPdf(files: File[]) {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  const { data } = await api.post<{ page_count: number; download_filename: string }>(
    "/image-tools/images-to-pdf",
    form,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return data;
}

export async function pdfToImages(file: File, imageFormat: string) {
  const form = new FormData();
  form.append("file", file);
  form.append("image_format", imageFormat);
  const { data } = await api.post<{ page_count: number; download_filename: string }>(
    "/image-tools/pdf-to-images",
    form,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return data;
}

export async function downloadImageToolFile(downloadFilename: string, baseName: string) {
  const response = await api.get(`/image-tools/download/${downloadFilename}`, {
    responseType: "blob",
  });
  const ext = downloadFilename.split(".").pop();
  const blobUrl = window.URL.createObjectURL(response.data);
  const link = window.document.createElement("a");
  link.href = blobUrl;
  link.download = `${baseName}.${ext}`;
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
}
