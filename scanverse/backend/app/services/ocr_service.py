"""
OCR service built on Tesseract (via pytesseract).

Accuracy-focused multi-pass strategy:
1. Preprocess: grayscale + upscale + sharpen + CLAHE contrast
2. Try 3 Tesseract PSM modes (auto, uniform block, sparse text)
3. Pick the result with highest average confidence
4. No binarization — grayscale preserves more text information

Tesseract is used instead of EasyOCR because it runs in a few hundred MB of
RAM, which fits the free tiers of Railway/Render where torch-based EasyOCR
OOMs.  For printed documents (newspapers, receipts, magazines) Tesseract
with proper preprocessing achieves very good accuracy.
"""

from __future__ import annotations

import logging
import threading

import cv2
import numpy as np
import pytesseract

from app.core.config import settings

logger = logging.getLogger("scanverse.ocr")

# Below this per-line confidence, a line is flagged as likely-wrong so the
# UI can highlight it for manual review instead of silently trusting it.
LOW_CONFIDENCE_THRESHOLD = 0.5

# EasyOCR-style / ISO-639-1 aliases -> Tesseract ISO-639-3 codes.
_LANG_ALIASES = {
    "en": "eng",
    "es": "spa",
    "fra": "fra",
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


def _preprocess_for_ocr(image_bgr: np.ndarray) -> np.ndarray:
    """Lightweight preprocessing optimized for maximum Tesseract accuracy.

    Key decisions:
    - NO binarization (Otsu destroys newspaper/magazine text with varying contrast)
    - Upscale 1.5x (newspaper text is often 8-12px, Tesseract needs 15-25px)
    - Mild sharpening (reverses slight camera blur)
    - CLAHE contrast boost (separates text from background)
    - Grayscale (Tesseract works on single channel)
    """
    h, w = image_bgr.shape[:2]

    # Step 1: Convert to grayscale early (saves memory and time)
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)

    # Step 2: Upscale if text is too small
    # Newspaper text in phone photos is 8-12px tall; Tesseract needs 15-25px
    min_side = min(h, w)
    if min_side < 1200:
        scale = min(2.0, 1200.0 / min_side)
        new_w, new_h = int(w * scale), int(h * scale)
        # Hard cap at 3000px longest side to stay fast
        if max(new_w, new_h) > 3000:
            cap = 3000.0 / max(new_w, new_h)
            new_w, new_h = int(new_w * cap), int(new_h * cap)
        gray = cv2.resize(gray, (new_w, new_h), interpolation=cv2.INTER_CUBIC)

    # Step 3: Mild sharpening via unsharp mask
    # Helps with slight camera blur without amplifying noise
    blurred = cv2.GaussianBlur(gray, (0, 0), 2.0)
    gray = cv2.addWeighted(gray, 1.5, blurred, -0.5, 0)
    gray = np.clip(gray, 0, 255).astype(np.uint8)

    # Step 4: CLAHE contrast boost — helps separate text from background
    # Lower clipLimit (1.5) than before to avoid over-enhancing noise
    clahe = cv2.createCLAHE(clipLimit=1.5, tileGridSize=(8, 8))
    gray = clahe.apply(gray)

    # NO binarization — grayscale preserves more text information
    # especially for newspaper text near images, colored backgrounds, etc.
    return gray


def _run_tesseract(
    image: np.ndarray,
    lang_config: str,
    psm: int,
) -> dict:
    """Run Tesseract with a specific PSM mode and return raw data + stats.

    PSM modes:
      3  — Fully automatic page segmentation (best for complex layouts)
      6  — Assume a single uniform block (good for newspaper columns)
      11 — Sparse text without order (finds text wherever it is)
    """
    # --psm N: page segmentation mode
    # --oem 1: LSTM neural net (most accurate)
    # -c preserve_interword_spaces=1: keeps spacing correct
    config = f"--psm {psm} --oem 1 -c preserve_interword_spaces=1"
    try:
        data = pytesseract.image_to_data(
            image,
            lang=lang_config,
            config=config,
            output_type=pytesseract.Output.DICT,
        )
    except pytesseract.TesseractError as e:
        logger.warning(f"Tesseract PSM {psm} failed: {e}")
        return {"data": None, "word_count": 0, "avg_conf": 0.0, "score": 0.0}

    # Count meaningful words and compute confidence stats
    word_count = 0
    total_conf = 0.0
    for i in range(len(data["text"])):
        text = (data["text"][i] or "").strip()
        conf = float(data["conf"][i])
        if text and conf > 0:
            word_count += 1
            total_conf += conf
    avg_conf = total_conf / word_count if word_count > 0 else 0.0

    # Score: prefer higher word count, then higher confidence
    # This ensures we pick the pass that found the most real text
    score = word_count * (avg_conf / 100.0) if word_count > 0 else 0.0

    return {"data": data, "word_count": word_count, "avg_conf": avg_conf, "score": score}


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
    Run OCR on an image with accuracy-focused multi-pass strategy.

    1. Preprocess: grayscale + upscale + sharpen + CLAHE (no binarization)
    2. Try 3 Tesseract PSM modes on the preprocessed image
    3. Also try one pass on the raw grayscale (for images that are already clean)
    4. Pick the result with the highest quality score

    Returns full text, per-line + per-word results with bounding boxes,
    and aggregate quality stats.
    """
    langs = languages or settings.OCR_LANGUAGES
    normalized = [_normalize_language(l) for l in langs]
    lang_config = "+".join(normalized) if normalized else "eng"

    logger.info(f"OCR start: image {image_bgr.shape}, langs={lang_config}")

    # Preprocess: grayscale + upscale + sharpen + CLAHE
    if preprocess:
        preprocessed = _preprocess_for_ocr(image_bgr)
    else:
        preprocessed = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)

    # Also prepare a raw grayscale (no preprocessing) for comparison
    raw_gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)

    # Try multiple PSM modes and pick the best
    # Each mode handles document layout differently:
    #   PSM 3: auto segmentation — best for complex newspaper layouts
    #   PSM 6: uniform block — best for single-column text
    #   PSM 11: sparse text — finds text anywhere without assuming layout
    candidates = []
    for gray_img, psm, label in [
        (preprocessed, 3, "preprocessed+psm3"),
        (preprocessed, 6, "preprocessed+psm6"),
        (preprocessed, 11, "preprocessed+psm11"),
        (raw_gray, 3, "raw+psm3"),
    ]:
        try:
            result = _run_tesseract(gray_img, lang_config, psm)
            if result["data"] is not None and result["word_count"] > 0:
                candidates.append((result, label))
                logger.info(
                    f"  {label}: {result['word_count']} words, "
                    f"avg_conf={result['avg_conf']:.1f}%, score={result['score']:.0f}"
                )
        except Exception as e:
            logger.warning(f"  {label} failed: {e}")
            continue

    if not candidates:
        # Absolute fallback: run with defaults
        logger.warning("All Tesseract passes failed, using absolute fallback")
        try:
            data = pytesseract.image_to_data(
                preprocessed, lang=lang_config,
                config="--psm 3 --oem 1",
                output_type=pytesseract.Output.DICT,
            )
        except Exception:
            # Even the fallback failed — return empty result
            return {
                "full_text": "",
                "lines": [],
                "words": [],
                "language": langs,
                "average_confidence": 0.0,
                "low_confidence_line_count": 0,
                "line_count": 0,
                "word_count": 0,
                "preprocessed": preprocess,
            }
        lines, words_all, full_text_parts, low_confidence_count = _group_ocr_data(data)
    else:
        # Pick the candidate with the best score (word_count × confidence)
        best = max(candidates, key=lambda c: c[0]["score"])
        logger.info(f"Best OCR pass: {best[1]} (score={best[0]['score']:.0f})")
        data = best[0]["data"]
        lines, words_all, full_text_parts, low_confidence_count = _group_ocr_data(data)

    confidences = [l["confidence"] for l in lines]
    avg_confidence = round(sum(confidences) / len(confidences), 3) if confidences else 0.0

    logger.info(
        f"OCR result: {len(words_all)} words, {len(lines)} lines, "
        f"avg_conf={avg_confidence*100:.1f}%, "
        f"low_conf_lines={low_confidence_count}"
    )

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
