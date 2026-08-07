export interface User {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
}

export type FilterName =
  | "original"
  | "auto"
  | "smart_document"
  | "color_boost"
  | "clean_document"
  | "black_and_white"
  | "high_contrast"
  | "soft_gray"
  | "warm_paper"
  | "cool_tone"
  | "magic_color"
  | "grayscale"
  | "soft"
  | "bright"
  | "dark"
  | "blueprint"
  | "newspaper"
  | "pencil"
  | "ink"
  | "vintage";

export interface Page {
  id: string;
  document_id: string;
  order_index: number;
  original_path: string;
  processed_path: string | null;
  thumbnail_path: string | null;
  original_url: string | null;
  processed_url: string | null;
  thumbnail_url: string | null;
  corners: number[][] | null;
  filter_applied: FilterName;
  rotation: number;
  brightness: number;
  contrast: number;
  saturation: number;
  sharpness: number;
  intensity: number;
  ocr_text: string | null;
  created_at: string;
}

export interface Document {
  id: string;
  title: string;
  category: string;
  tags: string[];
  is_favorite: boolean;
  ocr_text: string | null;
  ocr_language: string;
  created_at: string;
  updated_at: string;
  pages: Page[];
}

export interface DocumentListItem {
  id: string;
  title: string;
  category: string;
  tags: string[];
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
  page_count: number;
}

export type CompressionPreset = "maximum_quality" | "balanced" | "maximum_compression" | "custom";

export interface CompressResult {
  original_size_bytes: number;
  compressed_size_bytes: number;
  reduction_pct: number;
  target_size_bytes: number | null;
  target_achieved: boolean;
  preset: CompressionPreset;
  quality_used: number;
  scale_used: number;
  download_filename: string;
}

export interface CompressImageResult {
  original_size_bytes: number;
  compressed_size_bytes: number;
  reduction_pct: number;
  target_size_bytes: number | null;
  target_achieved: boolean;
  format_used: string;
  quality_used: number;
  scale_used: number;
  download_filename: string;
}

export const FILTER_LABELS: Record<FilterName, string> = {
  original: "Original",
  auto: "Auto",
  smart_document: "Smart (auto)",
  color_boost: "Enhanced Color",
  clean_document: "Document",
  black_and_white: "Black & White",
  high_contrast: "High Contrast",
  soft_gray: "Soft Gray",
  warm_paper: "Warm",
  cool_tone: "Cool",
  magic_color: "Magic Color",
  grayscale: "Grayscale",
  soft: "Soft",
  bright: "Bright",
  dark: "Dark",
  blueprint: "Blueprint",
  newspaper: "Newspaper",
  pencil: "Pencil",
  ink: "Ink",
  vintage: "Vintage",
};
