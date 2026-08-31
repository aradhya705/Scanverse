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


def _run_tesseract(
    image: np.ndarray,
    lang_config: str,
    psm: int,
) -> dict:
    """Run Tesseract with a specific PSM mode and return raw data + stats.

    PSM modes tried:
      3  — Fully automatic page segmentation (default, good for single-column docs)
      6  — Assume a single uniform block of text (good for newspaper columns)
      11 — Sparse text without order (finds text wherever it is, no layout)
    """
    config = f"--psm {psm} --oem 1"
    data = pytesseract.image_to_data(
        image,
        lang=lang_config,
        config=config,
        output_type=pytesseract.Output.DICT,
    )
    # Count meaningful words and average confidence
    word_count = 0
    total_conf = 0.0
    for i in range(len(data["text"])):
        text = (data["text"][i] or "").strip()
        conf = float(data["conf"][i])
        if text and conf > 0:
            word_count += 1
            total_conf += conf
    avg_conf = total_conf / word_count if word_count > 0 else 0.0
    return {"data": data, "word_count": word_count, "avg_conf": avg_conf}


def _group_ocr_data(data: dict) -> tuple[list[dict], list[dict], list[str], int]:
    """Group raw Tesseract word data into lines and build word-level entries.

    Returns (lines, words, full_text_parts, low_confidence_count).
    """
    grouped: dict[tuple[int, int, int], list[dict]] = {}
    n = len(data["text"])
    for i in range(n):
        text = (data["text"][i] or "").strip()
        if not text:
            continue
        conf = float(data["conf"][i])
        if conf < 0:
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
    words_all = []
    full_text_parts = []
    low_confidence_count = 0
    word_id = 0

    for key in sorted(grouped.keys()):
        words_line = sorted(grouped[key], key=lambda w: w["x"])
        line_text = " ".join(w["text"] for w in words_line)
        line_conf = sum(w["conf"] for w in words_line) / len(words_line)
        conf = round(line_conf / 100.0, 3)
        is_low = conf < LOW_CONFIDENCE_THRESHOLD
        if is_low:
            low_confidence_count += 1

        x0 = min(w["x"] for w in words_line)
        y0 = min(w["y"] for w in words_line)
        x1 = max(w["x"] + w["w"] for w in words_line)
        y1 = max(w["y"] + w["h"] for w in words_line)

        line_words = []
        for w in words_line:
            w_conf = round(w["conf"] / 100.0, 3)
            words_all.append(
                {
                    "id": word_id,
                    "text": w["text"],
                    "confidence": w_conf,
                    "low_confidence": w_conf < LOW_CONFIDENCE_THRESHOLD,
                    "bbox": [
                        [w["x"], w["y"]],
                        [w["x"] + w["w"], w["y"]],
                        [w["x"] + w["w"], w["y"] + w["h"]],
                        [w["x"], w["y"] + w["h"]],
                    ],
                    "line_index": len(lines),
                }
            )
            line_words.append(word_id)
            word_id += 1

        lines.append(
            {
                "text": line_text,
                "confidence": conf,
                "low_confidence": is_low,
                "bbox": [[x0, y0], [x1, y0], [x1, y1], [x0, y1]],
                "word_ids": line_words,
            }
        )
        full_text_parts.append(line_text)

    return lines, words_all, full_text_parts, low_confidence_count


def extract_text(
    image_bgr: np.ndarray,
    languages: list[str] | None = None,
    *,
    preprocess: bool = True,
    auto_deskew: bool = True,
) -> dict:
    """
    Run OCR on an image with multi-pass strategy for maximum accuracy.

    1. Preprocess the image (upscale → sharpen → binarize → thicken).
    2. Try multiple Tesseract PSM modes (automatic, uniform block, sparse).
    3. Also try without binarization (grayscale) for images that already
       have good contrast.
    4. Pick the result with the most words and highest confidence.

    Returns full text, per-line + per-word results with bounding boxes,
    and aggregate quality stats.
    """
    langs = languages or settings.OCR_LANGUAGES
    normalized = [_normalize_language(l) for l in langs]
    lang_config = "+".join(normalized) if normalized else "eng"

    # Prepare the aggressively preprocessed image (upscaled + binarized)
    if preprocess:
        working_binary = prepare_for_ocr(image_bgr, auto_deskew=auto_deskew)
        gray_binary = cv2.cvtColor(working_binary, cv2.COLOR_BGR2GRAY)
    else:
        gray_binary = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)

    # Also prepare a grayscale version WITHOUT binarization — just
    # upscale + sharpen + contrast. Faster than a full second pipeline.
    if preprocess:
        h, w = image_bgr.shape[:2]
        soft = image_bgr.copy()
        min_side = min(h, w)
        if min_side < 1500:
            sf = min(2.0, 1500.0 / min_side)
            new_w, new_h = int(w * sf), int(h * sf)
            if max(new_w, new_h) > 2400:
                cap = 2400.0 / max(new_w, new_h)
                new_w, new_h = int(new_w * cap), int(new_h * cap)
            soft = cv2.resize(soft, (new_w, new_h), interpolation=cv2.INTER_CUBIC)
        soft = cv2.bilateralFilter(soft, 9, 75, 75)
        lab = cv2.cvtColor(soft, cv2.COLOR_BGR2LAB)
        l_ch, a_ch, b_ch = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
        l_ch = clahe.apply(l_ch)
        soft = cv2.cvtColor(cv2.merge((l_ch, a_ch, b_ch)), cv2.COLOR_LAB2BGR)
        gray_soft = cv2.cvtColor(soft, cv2.COLOR_BGR2GRAY)
    else:
        gray_soft = gray_binary

    # Multi-pass OCR: try 3 key combinations and keep the best.
    # binary+PSM6: best for newspapers/columns
    # soft+PSM3: best for clean single-column docs  
    # binary+PSM3: fallback for mixed content
    candidates = []
    for gray_img, psm in [
        (gray_binary, 6),
        (gray_soft, 3),
        (gray_binary, 3),
    ]:
        try:
            result = _run_tesseract(gray_img, lang_config, psm)
            candidates.append((result, "", psm))
        except Exception:
            continue

    # Pick the candidate with the best combined score: prefer more words,
    # and use confidence as a tiebreaker.
    if not candidates:
        # Absolute fallback: run with defaults on whatever we have
        data = pytesseract.image_to_data(
            gray_binary, lang=lang_config,
            config="--psm 3 --oem 1",
            output_type=pytesseract.Output.DICT,
        )
        lines, words_all, full_text_parts, low_confidence_count = _group_ocr_data(data)
    else:
        best = max(candidates, key=lambda c: (c[1]["word_count"], c[1]["avg_conf"]))
        data = best[0]["data"]
        lines, words_all, full_text_parts, low_confidence_count = _group_ocr_data(data)

    confidences = [l["confidence"] for l in lines]
    avg_confidence = round(sum(confidences) / len(confidences), 3) if confidences else 0.0

    return {
        "full_text": "\n".join(full_text_parts),
        "lines": lines,
        "words": words_all,
        "language": langs,
        "average_confidence": avg_confidence,
        "low_confidence_line_count": low_confidence_count,
        "line_count": len(lines),
        "word_count": len(words_all),
        "preprocessed": preprocess,
    }
