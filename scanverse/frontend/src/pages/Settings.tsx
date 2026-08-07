import { useEffect, useState } from "react";
import { FILTER_LABELS } from "@/types";
import type { FilterName } from "@/types";

const FILTERS: FilterName[] = [
  "smart_document",
  "original",
  "auto",
  "black_and_white",
  "clean_document",
  "magic_color",
  "color_boost",
  "grayscale",
  "high_contrast",
  "soft",
  "bright",
  "dark",
  "warm_paper",
  "cool_tone",
  "blueprint",
  "newspaper",
  "pencil",
  "ink",
  "vintage",
];

export default function Settings() {
  const [theme, setTheme] = useState<"light" | "dark">(
    () => (localStorage.getItem("scanverse_theme") as "light" | "dark") || "dark"
  );
  const [ocrLanguage, setOcrLanguage] = useState(() => localStorage.getItem("scanverse_ocr_lang") || "en");
  const [defaultFilter, setDefaultFilter] = useState<FilterName>(
    () => (localStorage.getItem("scanverse_default_filter") as FilterName) || "smart_document"
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("scanverse_theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("scanverse_ocr_lang", ocrLanguage);
  }, [ocrLanguage]);

  useEffect(() => {
    localStorage.setItem("scanverse_default_filter", defaultFilter);
  }, [defaultFilter]);

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-ink/50">Preferences apply on this device.</p>

      <div className="card mt-8 divide-y divide-line-light">
        <div className="flex items-center justify-between gap-4 p-5">
          <div>
            <p className="font-medium">Appearance</p>
            <p className="text-sm text-ink/50">Choose light or dark mode.</p>
          </div>
          <div className="flex shrink-0 overflow-hidden rounded-full border border-line-light">
            {(["light", "dark"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setTheme(mode)}
                className={`px-4 py-1.5 text-sm capitalize ${
                  theme === mode ? "bg-brand text-white" : "text-ink/60"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 p-5">
          <div>
            <p className="font-medium">OCR language</p>
            <p className="text-sm text-ink/50">Used when extracting text from new scans.</p>
          </div>
          <select
            value={ocrLanguage}
            onChange={(e) => setOcrLanguage(e.target.value)}
            className="input w-40 shrink-0"
          >
            <option value="en">English</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
            <option value="de">German</option>
            <option value="hi">Hindi</option>
          </select>
        </div>

        <div className="flex items-center justify-between gap-4 p-5">
          <div>
            <p className="font-medium">Default scan filter</p>
            <p className="text-sm text-ink/50">
              Applied automatically to new scans. Smart picks black &amp; white or color based on the page.
            </p>
          </div>
          <select
            value={defaultFilter}
            onChange={(e) => setDefaultFilter(e.target.value as FilterName)}
            className="input w-44 shrink-0"
          >
            {FILTERS.map((f) => (
              <option key={f} value={f}>
                {FILTER_LABELS[f]}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
