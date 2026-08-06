"""Test fixtures that avoid importing app code (so the suite runs with only
Pillow + PyMuPDF installed, without a configured database or settings)."""

import os

import fitz
from PIL import Image


def make_image(path: str, mode: str = "RGB", size: tuple[int, int] = (800, 600), fmt: str = "JPEG") -> str:
    img = Image.new(mode, size, (120, 90, 200))
    for i in range(0, size[0], 12):
        for j in range(0, size[1], 12):
            img.putpixel((i, j), ((i * 7) % 255, (j * 11) % 255, (i + j) % 255))
    img.save(path, format=fmt, quality=95)
    return path


def make_pdf(path: str, pages: int = 3, with_images: bool = False) -> str:
    """Create a simple multi-page PDF (text pages, or image pages)."""
    doc = fitz.open()
    for i in range(pages):
        page = doc.new_page(width=400, height=600)
        page.draw_rect(fitz.Rect(0, 0, 400, 600), color=(0.45, 0.35, 0.7), fill=(0.45, 0.35, 0.7))
        if with_images:
            img_path = os.path.join(os.path.dirname(path), f".helper_{i}.jpg")
            make_image(img_path)
            page.insert_image(fitz.Rect(40, 40, 360, 560), filename=img_path)
        else:
            page.insert_text((40, 80), f"Page {i + 1}", fontsize=22, color=(0, 0, 0))
    doc.save(path)
    doc.close()
    return path
