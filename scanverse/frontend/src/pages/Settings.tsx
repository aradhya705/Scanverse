import { useEffect, useState } from "react";

const FILTERS = [
  "original",
  "auto",
  "color_boost",
  "clean_document",
  "black_and_white",
  "high_contrast",
  "soft_gray",
  "warm_paper",
  "cool_tone",
];

export default function Settings() {
  const [theme, setTheme] = useState<"light" | "dark">(
    () => (localStorage.getItem("scanverse_theme") as "light" | "dark") || "dark"
  );
  const [ocrLanguage, setOcrLanguage] = useState(() => localStorage.getItem("scanverse_ocr_lang") || "en");
  const [defaultFilter, setDefaultFilter] = useState(
    () => localStorage.getItem("scanverse_default_filter") || "auto"
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
        <div className="flex items-center justify-between p-5">
          <div>
            <p className="font-medium">Appearance</p>
            <p className="text-sm text-ink/50">Choose light or dark mode.</p>
          </div>
          <div className="flex overflow-hidden rounded-full border border-line-light">
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

        <div className="flex items-center justify-between p-5">
          <div>
            <p className="font-medium">OCR language</p>
            <p className="text-sm text-ink/50">Used when extracting text from new scans.</p>
          </div>
          <select
            value={ocrLanguage}
            onChange={(e) => setOcrLanguage(e.target.value)}
            className="input w-40"
          >
            <option value="en">English</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
            <option value="de">German</option>
            <option value="hi">Hindi</option>
          </select>
        </div>

        <div className="flex items-center justify-between p-5">
          <div>
            <p className="font-medium">Default filter</p>
            <p className="text-sm text-ink/50">Applied automatically to new pages.</p>
          </div>
          <select
            value={defaultFilter}
            onChange={(e) => setDefaultFilter(e.target.value)}
            className="input w-44"
          >
            {FILTERS.map((f) => (
              <option key={f} value={f}>
                {f.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
