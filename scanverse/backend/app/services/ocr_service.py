"""
OCR service built on EasyOCR.

The reader is expensive to initialize (loads neural net weights), so it is
created lazily and cached per language-set for the lifetime of the process.
"""

from __future__ import annotations

import threading

import cv2
import numpy as np

from app.core.config import settings
from app.services.image_processing import prepare_for_ocr

_readers: dict[tuple[str, ...], "easyocr.Reader"] = {}
_lock = threading.Lock()

# Below this per-line confidence, a line is flagged as likely-wrong so the
# UI can highlight it for manual review instead of silently trusting it.
LOW_CONFIDENCE_THRESHOLD = 0.4

# EasyOCR language codes that can't share one reader instance (its detector
# groups are disjoint for these); readtext() would silently degrade instead
# of throwing, so it's better to warn early than to accept bad results.
_INCOMPATIBLE_LANGUAGE_GROUPS = [
    {"ch_sim", "ch_tra", "ja", "ko"},  # CJK models are mutually exclusive
]


def _get_reader(languages: list[str]):
    import easyocr  # imported lazily: heavy dependency, slow first import

    key = tuple(sorted(languages))
    with _lock:
        if key not in _readers:
            _readers[key] = easyocr.Reader(list(key), gpu=False)
        return _readers[key]


def validate_languages(languages: list[str]) -> str | None:
    """Return a human-readable error if the requested language combination
    isn't supported together, else None."""
    lang_set = set(languages)
    for group in _INCOMPATIBLE_LANGUAGE_GROUPS:
        if len(lang_set & group) > 1:
            return (
                f"These languages can't be combined in one OCR pass: "
                f"{', '.join(sorted(lang_set & group))}. Run them separately."
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
    pipeline tuned for OCR accuracy before handing the image to EasyOCR,
    rather than OCR'ing the raw display image as-is.
    """
    langs = languages or settings.OCR_LANGUAGES
    reader = _get_reader(langs)

    working = prepare_for_ocr(image_bgr, auto_deskew=auto_deskew) if preprocess else image_bgr
    rgb = cv2.cvtColor(working, cv2.COLOR_BGR2RGB)
    raw_results = reader.readtext(rgb)

    lines = []
    full_text_parts = []
    confidences = []
    low_confidence_count = 0
    for bbox, text, confidence in raw_results:
        conf = round(float(confidence), 3)
        is_low = conf < LOW_CONFIDENCE_THRESHOLD
        if is_low:
            low_confidence_count += 1
        lines.append(
            {
                "text": text,
                "confidence": conf,
                "low_confidence": is_low,
                "bbox": [[float(x), float(y)] for x, y in bbox],
            }
        )
        full_text_parts.append(text)
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
