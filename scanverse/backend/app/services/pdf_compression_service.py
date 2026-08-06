"""
PDF compression service.

ScanVerse's exported PDFs are image-only (one full-resolution photo per
page — there's no vector content, and no embedded text layer yet), so the
only real lever for shrinking them is how each page image is re-encoded:
JPEG quality and render DPI (scale). This mirrors what mobile scanner apps
actually do under the hood for "compress to X MB".

Strategy for a given target size:
  1. Try the preset's default render scale, binary-searching JPEG quality
     to land as close under the target as possible without going over.
  2. If even the lowest allowed quality at that scale is still too big,
     step down to a smaller render scale and repeat.
  3. If no combination fits, return the smallest result we found (report
     target_achieved=False so the caller can tell the user it couldn't
     hit the exact number, e.g. asking for 50 KB on a 40-page document).

If no target size is given, the preset is applied once at its default
"good result" quality/scale with no search.
"""

from __future__ import annotations

import io
import os

import fitz  # PyMuPDF
from PIL import Image

# (quality floor, quality ceiling, default render scale) per preset.
# "custom" gets the widest quality range since the target size alone should
# drive the outcome.
PRESET_RANGES: dict[str, tuple[int, int, float]] = {
    "maximum_quality": (85, 95, 1.0),
    "balanced": (45, 85, 0.85),
    "maximum_compression": (15, 40, 0.5),
    "custom": (10, 95, 1.0),
}

# Render-scale fallbacks tried (largest first) when quality alone can't hit
# the requested target size.
FALLBACK_SCALES = [1.0, 0.75, 0.6, 0.45, 0.35]

MIN_QUALITY = 10
MAX_SEARCH_ITERATIONS = 7  # enough for a binary search over a 10-95 range


def compress_pdf(
    input_path: str,
    output_path: str,
    preset: str = "balanced",
    target_size_bytes: int | None = None,
) -> dict:
    """Compress `input_path` (an image-only PDF) into `output_path`.

    Returns a stats dict: original_size_bytes, compressed_size_bytes,
    reduction_pct, target_size_bytes, target_achieved, quality_used, scale_used.
    """
    original_size = os.path.getsize(input_path)
    q_floor, q_ceiling, default_scale = PRESET_RANGES.get(preset, PRESET_RANGES["balanced"])

    src = fitz.open(input_path)
    try:
        if not target_size_bytes:
            quality, scale = q_ceiling, default_scale
            data = _build_pdf_from_rerendered_pages(src, scale, quality)
            _write(output_path, data)
            return _stats(original_size, data, None, quality, scale)

        best = _search_for_target(src, target_size_bytes, q_floor, q_ceiling, default_scale)
        _write(output_path, best["data"])
        return _stats(
            original_size,
            best["data"],
            target_size_bytes,
            best["quality"],
            best["scale"],
        )
    finally:
        src.close()


def _search_for_target(
    src: "fitz.Document",
    target_size_bytes: int,
    q_floor: int,
    q_ceiling: int,
    default_scale: float,
) -> dict:
    scales_to_try = sorted({default_scale, *FALLBACK_SCALES}, reverse=True)
    smallest_seen: dict | None = None

    for scale in scales_to_try:
        lo, hi = max(q_floor, MIN_QUALITY), q_ceiling
        fit_at_this_scale: dict | None = None

        for _ in range(MAX_SEARCH_ITERATIONS):
            if lo > hi:
                break
            mid = (lo + hi) // 2
            data = _build_pdf_from_rerendered_pages(src, scale, mid)
            size = len(data)

            if smallest_seen is None or size < len(smallest_seen["data"]):
                smallest_seen = {"data": data, "quality": mid, "scale": scale}

            if size <= target_size_bytes:
                # Fits — remember the highest-quality fit seen at this scale,
                # then try pushing quality up further.
                if fit_at_this_scale is None or size > len(fit_at_this_scale["data"]):
                    fit_at_this_scale = {"data": data, "quality": mid, "scale": scale}
                lo = mid + 1
            else:
                hi = mid - 1

        if fit_at_this_scale is not None:
            return fit_at_this_scale

    # Nothing fit under the target at any scale — return the smallest we found.
    assert smallest_seen is not None
    return smallest_seen


def _build_pdf_from_rerendered_pages(src: "fitz.Document", scale: float, quality: int) -> bytes:
    out = fitz.open()
    matrix = fitz.Matrix(scale, scale)
    for page in src:
        pix = page.get_pixmap(matrix=matrix, alpha=False)
        img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=quality, optimize=True)
        jpeg_bytes = buf.getvalue()

        width_pt, height_pt = page.rect.width, page.rect.height
        new_page = out.new_page(width=width_pt, height=height_pt)
        new_page.insert_image(fitz.Rect(0, 0, width_pt, height_pt), stream=jpeg_bytes)

    data = out.tobytes(garbage=4, deflate=True, clean=True)
    out.close()
    return data


def _write(output_path: str, data: bytes) -> None:
    with open(output_path, "wb") as f:
        f.write(data)


def _stats(
    original_size: int,
    data: bytes,
    target_size_bytes: int | None,
    quality: int,
    scale: float,
) -> dict:
    compressed_size = len(data)
    reduction_pct = round((1 - compressed_size / original_size) * 100, 1) if original_size else 0.0
    return {
        "original_size_bytes": original_size,
        "compressed_size_bytes": compressed_size,
        "reduction_pct": reduction_pct,
        "target_size_bytes": target_size_bytes,
        "target_achieved": target_size_bytes is None or compressed_size <= target_size_bytes,
        "quality_used": quality,
        "scale_used": scale,
    }
