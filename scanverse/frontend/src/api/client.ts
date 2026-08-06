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

export const api = axios.create({
  baseURL: "/api/v1",
});

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
export interface OcrResult {
  full_text: string;
  lines: { text: string; confidence: number; low_confidence: boolean; bbox: number[][] }[];
  language: string[];
  average_confidence: number;
  low_confidence_line_count: number;
  line_count: number;
  preprocessed: boolean;
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
