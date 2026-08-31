"""
Signature compositing service.

Takes a transparent PNG signature (drawn on the client's signature pad or
uploaded) and pastes it onto a page image at the requested position/size.
Position and width are given as *fractions* of the page so the client can
send one layout that scales to any page resolution.
"""

from __future__ import annotations

import io

from PIL import Image

# Sanity bounds (fractions of page dimension) — the client UI already
# constrains these, but the API re-validates defensively.
MAX_WIDTH_FRACTION = 0.6
MAX_HEIGHT_FRACTION = 0.4


def composite_signature(
    page_path: str,
    signature_png: bytes,
    x: float,
    y: float,
    width_fraction: float = 0.3,
    opacity: float = 1.0,
) -> Image.Image:
    """Paste `signature_png` onto the image at `page_path`.

    x/y are fractions of the page (0..1, origin top-left) positioning the
    signature's top-left corner; width_fraction scales the signature to that
    fraction of the page width. Returns the composited RGB image.
    """
    page = Image.open(page_path).convert("RGB")

    sig = Image.open(io.BytesIO(signature_png)).convert("RGBA")

    # Scale signature so its width is width_fraction of the page, capped so a
    # signature can never dominate the page even with bad client input.
    w = int(page.width * max(0.05, min(MAX_WIDTH_FRACTION, width_fraction)))
    h = max(1, int(sig.height * w / max(1, sig.width)))
    h = min(h, int(page.height * MAX_HEIGHT_FRACTION))
    sig = sig.resize((w, h), Image.LANCZOS)

    if 0.0 <= opacity < 1.0:
        alpha = sig.getchannel("A").point(lambda a: int(a * opacity))
        sig.putalpha(alpha)

    px = int(page.width * max(0.0, min(1.0, x)))
    py = int(page.height * max(0.0, min(1.0, y)))
    # Clamp so the signature stays fully inside the page
    px = min(px, page.width - w)
    py = min(py, page.height - h)

    overlay = Image.new("RGBA", page.size, (0, 0, 0, 0))
    overlay.paste(sig, (px, py), sig)
    return Image.alpha_composite(page.convert("RGBA"), overlay).convert("RGB")
