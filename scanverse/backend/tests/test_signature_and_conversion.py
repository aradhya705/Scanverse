"""Tests for signature compositing and image format conversion."""

import io
import os
import tempfile
import unittest

from PIL import Image

from app.services import image_conversion_service as icv
from app.services import signature_service
from tests.helpers import make_image, make_pdf


def _signature_png(color=(0, 0, 0, 255), size=(200, 80)) -> bytes:
    # A solid, fully-opaque ellipse — guarantees pixel coverage after the
    # service resizes the signature, so pixel-level assertions are stable.
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    mask = Image.new("L", size, 0)
    from PIL import ImageDraw

    ImageDraw.Draw(mask).ellipse((5, 5, size[0] - 5, size[1] - 5), fill=255)
    ink = Image.new("RGBA", size, color)
    img.paste(ink, (0, 0), mask)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


class SignatureServiceTest(unittest.TestCase):
    def test_composite_signature_changes_pixels(self):
        with tempfile.TemporaryDirectory() as d:
            page = make_image(os.path.join(d, "page.jpg"))
            sig = _signature_png()
            composited = signature_service.composite_signature(
                page, sig, x=0.3, y=0.3, width_fraction=0.3, opacity=1.0
            )
            self.assertEqual(composited.mode, "RGB")
            orig = Image.open(page).convert("RGB")
            self.assertEqual(composited.size, orig.size)
            # The signature covers ~(0.3w, 0.3h); that region must change
            px = (int(0.3 * orig.width) + 40, int(0.3 * orig.height) + 40)
            self.assertNotEqual(orig.getpixel(px), composited.getpixel(px))

    def test_composite_signature_with_opacity_zero_is_faint(self):
        with tempfile.TemporaryDirectory() as d:
            page = make_image(os.path.join(d, "page.jpg"))
            sig = _signature_png()
            fully = signature_service.composite_signature(page, sig, x=0.3, y=0.3, width_fraction=0.3, opacity=1.0)
            faint = signature_service.composite_signature(page, sig, x=0.3, y=0.3, width_fraction=0.3, opacity=0.3)
            orig = Image.open(page).convert("RGB")
            px = (int(0.3 * orig.width) + 40, int(0.3 * orig.height) + 40)

            def region_diff(img):
                total = 0
                for dx in range(-15, 15, 3):
                    for dy in range(-15, 15, 3):
                        q = (px[0] + dx, px[1] + dy)
                        total += sum(abs(a - b) for a, b in zip(orig.getpixel(q), img.getpixel(q)))
                return total

            # The faint version must stay closer to the original page
            self.assertLess(region_diff(faint), region_diff(fully))

    def test_invalid_signature_bytes_raise(self):
        with tempfile.TemporaryDirectory() as d:
            page = make_image(os.path.join(d, "page.jpg"))
            with self.assertRaises(Exception):
                signature_service.composite_signature(page, b"not-an-image", 0.5, 0.5)


class ImageConversionTest(unittest.TestCase):
    def test_convert_jpg_to_png(self):
        with tempfile.TemporaryDirectory() as d:
            src = make_image(os.path.join(d, "in.jpg"))
            out = os.path.join(d, "out.png")
            stats = icv.convert_image(src, out, "png")
            self.assertEqual(stats["format_used"], "png")
            with Image.open(out) as img:
                self.assertEqual(img.format, "PNG")

    def test_convert_png_to_jpg_flattens_transparency(self):
        with tempfile.TemporaryDirectory() as d:
            src = os.path.join(d, "in.png")
            Image.new("RGBA", (100, 100), (0, 0, 0, 0)).save(src)
            out = os.path.join(d, "out.jpg")
            icv.convert_image(src, out, "jpg")
            with Image.open(out) as img:
                self.assertEqual(img.format, "JPEG")
                self.assertEqual(img.mode, "RGB")

    def test_unsupported_format_raises(self):
        with tempfile.TemporaryDirectory() as d:
            src = make_image(os.path.join(d, "in.jpg"))
            out = os.path.join(d, "out.xyz")
            with self.assertRaises(ValueError):
                icv.convert_image(src, out, "xyz")

    def test_pdf_to_images_renders_all_pages(self):
        with tempfile.TemporaryDirectory() as d:
            src = make_pdf(os.path.join(d, "in.pdf"), pages=3)
            out_dir = os.path.join(d, "imgs")
            os.makedirs(out_dir)
            paths = icv.pdf_to_images(src, out_dir, image_format="png")
            self.assertEqual(len(paths), 3)


if __name__ == "__main__":
    unittest.main()
