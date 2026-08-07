"""
OCR service built on Tesseract (via pytesseract).

Tesseract is used instead of EasyOCR because it runs in a few hundred MB of
RAM, which fits the free tiers of Railway/Render (512 MB - 1 GB) where
torch-based EasyOCR OOMs. Accuracy is lower on handwriting and messy
photos, but solid on clean printed documents.

Tesseract language codes differ from EasyOCR's (`eng` vs `en`, `spa` vs
`es`, ...). Accepted codes are normalized through a small alias map so
existing EasyOCR-style codes keep working.

The heavy lifting happens in-process per request; pytesseract shells out to
the `tesseract` binary (installed in the Docker image), so there is no
model download at runtime.
"""

from __future__ import annotations

import threading

import cv2
import numpy as np
import pytesseract

from app.core.config import settings
from app.services.image_processing import prepare_for_ocr

# Below this per-line confidence, a line is flagged as likely-wrong so the
# UI can highlight it for manual review instead of silently trusting it.
LOW_CONFIDENCE_THRESHOLD = 0.4

# EasyOCR-style / ISO-639-1 aliases -> Tesseract ISO-639-3 codes.
_LANG_ALIASES = {
    "en": "eng",
    "es": "spa",
    "fr": "fra",
    "de": "deu",
    "it": "ita",
    "pt": "por",
    "nl": "nld",
    "ru": "rus",
    "ar": "ara",
    "hi": "hin",
    "bn": "ben",
    "zh": "chi_sim",
    "zh_cn": "chi_sim",
    "zh_tw": "chi_tra",
    "ja": "jpn",
    "ko": "kor",
}

_installed_langs: set[str] | None = None
_lang_lock = threading.Lock()


def _normalize_language(code: str) -> str:
    code = code.strip().lower().replace("-", "_")
    return _LANG_ALIASES.get(code, code)


def _get_installed_langs() -> set[str]:
    """Tesseract language data available on this machine (cached)."""
    global _installed_langs
    if _installed_langs is None:
        with _lang_lock:
            if _installed_langs is None:
                try:
                    _installed_langs = set(pytesseract.get_languages(config=""))
                except Exception:
                    _installed_langs = set()
    return _installed_langs


def validate_languages(languages: list[str]) -> str | None:
    """Return a human-readable error if a requested language isn't
    installed on this server, else None."""
    installed = _get_installed_langs()
    missing = [lang for lang in languages if _normalize_language(lang) not in installed]
    if missing:
        return (
            "OCR language(s) not available on this server: "
            f"{', '.join(sorted(missing))} "
            f"(installed: {', '.join(sorted(installed)) or 'none'})"
        )
    return None


def extract_text(
    image_bgr: np.ndarray,
    languages: list[str] | None = None,
    *,
    preprocess: bool = True,
    auto_deskew: bool = True,
) -> dict:
    """
    Run OCR on an image and return the full concatenated text, per-line
    results with bounding boxes + confidence (useful for "click a word to
    edit" UI), and aggregate quality stats.

    `preprocess=True` (default) runs a deskew + shadow-removal + contrast
    pipeline tuned for OCR accuracy before handing the image to Tesseract,
    rather than OCR'ing the raw display image as-is.
    """
    langs = languages or settings.OCR_LANGUAGES
    normalized = [_normalize_language(l) for l in langs]
    lang_config = "+".join(normalized) if normalized else "eng"

    working = prepare_for_ocr(image_bgr, auto_deskew=auto_deskew) if preprocess else image_bgr
    # Tesseract works on grayscale; this also keeps memory use minimal.
    gray = cv2.cvtColor(working, cv2.COLOR_BGR2GRAY)

    data = pytesseract.image_to_data(
        gray,
        lang=lang_config,
        config="--psm 3 --oem 1",
        output_type=pytesseract.Output.DICT,
    )

    # Group word-level results into lines (same block/paragraph/line), then
    # order words left-to-right to rebuild each line of text.
    grouped: dict[tuple[int, int, int], list[dict]] = {}
    n = len(data["text"])
    for i in range(n):
        text = (data["text"][i] or "").strip()
        if not text:
            continue
        conf = float(data["conf"][i])
        if conf < 0:  # -1 = not OCR'd by Tesseract
            conf = 0.0
        key = (data["block_num"][i], data["par_num"][i], data["line_num"][i])
        grouped.setdefault(key, []).append(
            {
                "text": text,
                "conf": conf,
                "x": int(data["left"][i]),
                "y": int(data["top"][i]),
                "w": int(data["width"][i]),
                "h": int(data["height"][i]),
            }
        )

    lines = []
    full_text_parts = []
    confidences = []
    low_confidence_count = 0

    for key in sorted(grouped.keys()):
        words = sorted(grouped[key], key=lambda w: w["x"])
        line_text = " ".join(w["text"] for w in words)
        line_conf = sum(w["conf"] for w in words) / len(words)
        # Tesseract reports 0-100; the API contract is 0-1 like EasyOCR's.
        conf = round(line_conf / 100.0, 3)
        is_low = conf < LOW_CONFIDENCE_THRESHOLD
        if is_low:
            low_confidence_count += 1

        x0 = min(w["x"] for w in words)
        y0 = min(w["y"] for w in words)
        x1 = max(w["x"] + w["w"] for w in words)
        y1 = max(w["y"] + w["h"] for w in words)

        lines.append(
            {
                "text": line_text,
                "confidence": conf,
                "low_confidence": is_low,
                "bbox": [[x0, y0], [x1, y0], [x1, y1], [x0, y1]],
            }
        )
        full_text_parts.append(line_text)
        confidences.append(conf)

    avg_confidence = round(sum(confidences) / len(confidences), 3) if confidences else 0.0

    return {
        "full_text": "\n".join(full_text_parts),
        "lines": lines,
        "language": langs,
        "average_confidence": avg_confidence,
        "low_confidence_line_count": low_confidence_count,
        "line_count": len(lines),
        "preprocessed": preprocess,
    }
