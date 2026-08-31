"""
Image conversion service (Feature 6): straight format-to-format conversion
(no target-size search — that's image_compression_service's job), plus
PDF <-> image batch conversion.

Conversion is done at high quality (JPEG/WEBP quality 95, PNG/TIFF
lossless) since the point here is format compatibility, not shrinking
anything.
"""

from __future__ import annotations

import os
import zipfile

import fitz  # PyMuPDF
from PIL import Image

try:
    import pillow_heif

    pillow_heif.register_heif_opener()
    HEIF_AVAILABLE = True
except ImportError:  # pragma: no cover
    HEIF_AVAILABLE = False

# Target formats we can *write*. (We can *read* additional formats — BMP,
# GIF, HEIC/HEIF — via Pillow/pillow-heif, just not necessarily write them
# back out losslessly/universally, e.g. animated GIF round-tripping.)
WRITABLE_FORMATS = {
    "jpg": "JPEG",
    "jpeg": "JPEG",
    "png": "PNG",
    "webp": "WEBP",
    "tiff": "TIFF",
    "bmp": "BMP",
    "gif": "GIF",
}


def convert_image(input_path: str, output_path: str, target_format: str) -> dict:
    """Convert a single image to `target_format`, preserving quality."""
    target_format = target_format.lower()
    if target_format not in WRITABLE_FORMATS:
        raise ValueError(f"Unsupported target format: {target_format}")
    pil_format = WRITABLE_FORMATS[target_format]

    original_size = os.path.getsize(input_path)
    img = Image.open(input_path)
    img.load()

    to_save = img
    save_kwargs: dict = {}

    if pil_format == "JPEG":
        if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
            # Flatten transparency onto white instead of letting Pillow drop
            # it into black, which is what a naive .convert("RGB") does.
            rgba = img.convert("RGBA")
            bg = Image.new("RGB", img.size, (255, 255, 255))
            bg.paste(rgba, mask=rgba.split()[-1])
            to_save = bg
        else:
            to_save = img.convert("RGB")
        save_kwargs = {"quality": 95, "optimize": True}
    elif pil_format == "BMP":
        to_save = img.convert("RGB")
    elif pil_format == "GIF":
        to_save = img.convert("P", palette=Image.ADAPTIVE)
    elif pil_format == "PNG":
        save_kwargs = {"optimize": True}
    elif pil_format == "WEBP":
        save_kwargs = {"quality": 95}
    elif pil_format == "TIFF":
        save_kwargs = {"compression": "tiff_lzw"}

    to_save.save(output_path, format=pil_format, **save_kwargs)
    output_size = os.path.getsize(output_path)

    return {
        "original_size_bytes": original_size,
        "output_size_bytes": output_size,
        "format_used": target_format,
    }


def pdf_to_images(input_path: str, output_dir: str, image_format: str = "png", dpi: int = 200) -> list[str]:
    """Render every page of a PDF to an individual image file. Returns the
    list of written file paths, in page order."""
    image_format = image_format.lower()
    pil_format = WRITABLE_FORMATS.get(image_format, "PNG")
    ext = "jpg" if pil_format == "JPEG" else image_format

    doc = fitz.open(input_path)
    scale = dpi / 72.0
    matrix = fitz.Matrix(scale, scale)
    out_paths: list[str] = []
    try:
        for i, page in enumerate(doc):
            pix = page.get_pixmap(matrix=matrix, alpha=False)
            img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            path = os.path.join(output_dir, f"page_{i + 1:03d}.{ext}")
            save_kwargs = {"quality": 95} if pil_format == "JPEG" else {}
            img.save(path, format=pil_format, **save_kwargs)
            out_paths.append(path)
    finally:
        doc.close()
    return out_paths


def zip_files(paths: list[str], zip_path: str) -> str:
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for p in paths:
            zf.write(p, arcname=os.path.basename(p))
    return zip_path
