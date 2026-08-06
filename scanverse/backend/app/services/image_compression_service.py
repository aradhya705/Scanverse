"""
Standalone image compression service (Feature 5).

Unlike PDF compression, images can be lossy (JPEG/WEBP/HEIC) or lossless
(PNG/TIFF), so two different strategies are used:

  * Lossy formats: binary-search encoder quality (and fall back to
    downscaling if quality alone can't hit the target), same approach as
    the PDF compressor.
  * Lossless formats: quality doesn't apply the same way, so we first try
    PNG/TIFF's own optimize flag, then progressively downscale the image
    (the only way to meaningfully shrink a lossless format). If an
    aggressive target still can't be hit at the smallest scale, we report
    the smallest lossless result achieved (target_achieved=False) rather
    than silently swapping to a lossy format under the original filename
    — if you want a guaranteed small file, pick JPEG/WEBP as the output
    format instead.

HEIC input is supported by registering pillow-heif's opener; HEIC is only
read, not written back out, since HEIC encoders aren't universally
available client-side — output stays JPEG/PNG/WEBP/TIFF.
"""

from __future__ import annotations

import io
import os

from PIL import Image

try:
    import pillow_heif

    pillow_heif.register_heif_opener()
    HEIF_AVAILABLE = True
except ImportError:  # pragma: no cover - only hit if the optional dep is missing
    HEIF_AVAILABLE = False

LOSSY_FORMATS = {"JPEG", "WEBP"}
LOSSLESS_FORMATS = {"PNG", "TIFF"}
SUPPORTED_OUTPUT_FORMATS = {"jpg", "jpeg", "png", "webp", "tiff"}

MIN_QUALITY = 10
MAX_SEARCH_ITERATIONS = 7
DOWNSCALE_STEPS = [1.0, 0.85, 0.7, 0.55, 0.4, 0.3]


def _normalize_format(fmt: str) -> str:
    fmt = fmt.upper()
    return "JPEG" if fmt == "JPG" else fmt


def _encode(img: Image.Image, fmt: str, quality: int | None) -> bytes:
    buf = io.BytesIO()
    save_kwargs: dict = {}
    if fmt in LOSSY_FORMATS:
        save_kwargs["quality"] = quality or 85
        save_kwargs["optimize"] = True
    elif fmt == "PNG":
        save_kwargs["optimize"] = True
    elif fmt == "TIFF":
        save_kwargs["compression"] = "tiff_lzw"

    to_save = img
    if fmt in ("JPEG",) and img.mode in ("RGBA", "P", "LA"):
        to_save = img.convert("RGB")

    to_save.save(buf, format=fmt, **save_kwargs)
    return buf.getvalue()


def compress_image(
    input_path: str,
    output_path: str,
    target_size_bytes: int | None = None,
    output_format: str | None = None,
) -> dict:
    """Compress an image to (as close as possible to, without exceeding)
    `target_size_bytes`, preserving maximum quality otherwise.

    Returns stats: original_size_bytes, compressed_size_bytes, reduction_pct,
    target_size_bytes, target_achieved, format_used, quality_used, scale_used.
    """
    original_size = os.path.getsize(input_path)
    img = Image.open(input_path)
    img.load()
    source_format = _normalize_format(img.format or "JPEG")
    fmt = _normalize_format(output_format) if output_format else source_format
    if fmt not in LOSSY_FORMATS | LOSSLESS_FORMATS:
        fmt = "JPEG"  # HEIC and anything unrecognized re-encodes to JPEG

    if not target_size_bytes:
        # No target: just re-encode at a high-quality default (this alone
        # often shrinks HEIC/PNG-from-camera files considerably).
        data = _encode(img, fmt, quality=92)
        _write(output_path, data)
        return _stats(original_size, data, None, fmt, 92, 1.0)

    if fmt in LOSSY_FORMATS:
        best = _search_lossy(img, fmt, target_size_bytes)
    else:
        best = _search_lossless(img, fmt, target_size_bytes)

    _write(output_path, best["data"])
    return _stats(
        original_size, best["data"], target_size_bytes, fmt, best["quality"], best["scale"]
    )


def _search_lossy(img: Image.Image, fmt: str, target_size_bytes: int) -> dict:
    smallest_seen: dict | None = None

    for scale in DOWNSCALE_STEPS:
        working = img if scale == 1.0 else _resize(img, scale)
        lo, hi = MIN_QUALITY, 95
        fit: dict | None = None

        for _ in range(MAX_SEARCH_ITERATIONS):
            if lo > hi:
                break
            mid = (lo + hi) // 2
            data = _encode(working, fmt, quality=mid)
            size = len(data)

            if smallest_seen is None or size < len(smallest_seen["data"]):
                smallest_seen = {"data": data, "quality": mid, "scale": scale}

            if size <= target_size_bytes:
                if fit is None or size > len(fit["data"]):
                    fit = {"data": data, "quality": mid, "scale": scale}
                lo = mid + 1
            else:
                hi = mid - 1

        if fit is not None:
            return fit

    assert smallest_seen is not None
    return smallest_seen


def _search_lossless(img: Image.Image, fmt: str, target_size_bytes: int) -> dict:
    # 1. Try optimize-only at full size first.
    data = _encode(img, fmt, quality=None)
    if len(data) <= target_size_bytes:
        return {"data": data, "quality": 100, "scale": 1.0}

    smallest_seen = {"data": data, "quality": 100, "scale": 1.0}

    # 2. Progressively downscale — the only lever a lossless format has.
    for scale in DOWNSCALE_STEPS[1:]:
        working = _resize(img, scale)
        data = _encode(working, fmt, quality=None)
        if len(data) < len(smallest_seen["data"]):
            smallest_seen = {"data": data, "quality": 100, "scale": scale}
        if len(data) <= target_size_bytes:
            return {"data": data, "quality": 100, "scale": scale}

    # Still too big even at the smallest scale — report the smallest
    # lossless result we found rather than silently switching formats
    # (which would put JPEG bytes behind a ".png" filename/label).
    return smallest_seen


def _resize(img: Image.Image, scale: float) -> Image.Image:
    w, h = img.size
    return img.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)


def _write(output_path: str, data: bytes) -> None:
    with open(output_path, "wb") as f:
        f.write(data)


def _stats(
    original_size: int,
    data: bytes,
    target_size_bytes: int | None,
    fmt: str,
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
        "format_used": fmt.lower(),
        "quality_used": quality,
        "scale_used": scale,
    }
