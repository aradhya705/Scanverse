import type { FilterName } from "@/types";
import { FILTER_LABELS } from "@/types";

const FILTERS: FilterName[] = [
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

interface Adjustments {
  intensity: number;
  brightness: number;
  contrast: number;
  saturation: number;
  sharpness: number;
}

interface FilterPickerProps {
  active: FilterName;
  onSelectFilter: (filter: FilterName) => void;
  adjustments: Adjustments;
  onAdjustmentsChange: (adjustments: Adjustments) => void;
  disabled?: boolean;
}

function Slider({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-center justify-between text-xs text-ink/50">
        <span>{label}</span>
        <span className="font-mono">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={2}
        step={0.05}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-brand"
      />
    </label>
  );
}

export default function FilterPicker({
  active,
  onSelectFilter,
  adjustments,
  onAdjustmentsChange,
  disabled,
}: FilterPickerProps) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium">Filter</p>
      <div className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto pr-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            disabled={disabled}
            onClick={() => onSelectFilter(f)}
            className={`rounded-lg border px-2 py-2 text-xs font-medium transition ${
              active === f
                ? "border-brand bg-brand/10 text-brand"
                : "border-line-light text-ink/60 hover:border-brand/40 dark:border-line-dark"
            }`}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-3">
        <Slider
          label="Intensity"
          value={adjustments.intensity}
          disabled={disabled}
          onChange={(v) => onAdjustmentsChange({ ...adjustments, intensity: v })}
        />
        <Slider
          label="Brightness"
          value={adjustments.brightness}
          disabled={disabled}
          onChange={(v) => onAdjustmentsChange({ ...adjustments, brightness: v })}
        />
        <Slider
          label="Contrast"
          value={adjustments.contrast}
          disabled={disabled}
          onChange={(v) => onAdjustmentsChange({ ...adjustments, contrast: v })}
        />
        <Slider
          label="Saturation"
          value={adjustments.saturation}
          disabled={disabled}
          onChange={(v) => onAdjustmentsChange({ ...adjustments, saturation: v })}
        />
        <Slider
          label="Sharpness"
          value={adjustments.sharpness}
          disabled={disabled}
          onChange={(v) => onAdjustmentsChange({ ...adjustments, sharpness: v })}
        />
      </div>
    </div>
  );
}
