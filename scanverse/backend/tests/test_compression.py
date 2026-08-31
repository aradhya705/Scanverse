"""Tests for target-size compression: image (lossy + lossless) and PDF.

The core contract: when a target size is given, output must never exceed it
(when achievable) and must get as close as possible while keeping quality.
"""

import os
import tempfile
import unittest

from PIL import Image

from app.services import image_compression_service as ics
from app.services import pdf_compression_service as pcs
from tests.helpers import make_image, make_pdf


class ImageCompressionTest(unittest.TestCase):
    def test_compress_no_target_succeeds(self):
        with tempfile.TemporaryDirectory() as d:
            src = make_image(os.path.join(d, "in.jpg"))
            out = os.path.join(d, "out.jpg")
            stats = ics.compress_image(src, out)
            self.assertGreater(os.path.getsize(out), 0)
            self.assertIsNone(stats["target_size_bytes"])
            self.assertIn("format_used", stats)

    def test_compress_to_target_hits_or_under(self):
        with tempfile.TemporaryDirectory() as d:
            src = make_image(os.path.join(d, "in.jpg"))
            out = os.path.join(d, "out.jpg")
            target = 60 * 1024  # 60 KB
            stats = ics.compress_image(src, out, target_size_bytes=target)
            self.assertLessEqual(os.path.getsize(out), target)
            self.assertTrue(stats["target_achieved"])
            self.assertEqual(stats["target_size_bytes"], target)

    def test_compress_impossible_target_reports_failure(self):
        with tempfile.TemporaryDirectory() as d:
            src = make_image(os.path.join(d, "in.jpg"))
            out = os.path.join(d, "out.jpg")
            stats = ics.compress_image(src, out, target_size_bytes=500)  # absurdly small
            self.assertFalse(stats["target_achieved"])

    def test_convert_to_png_is_lossless_format(self):
        with tempfile.TemporaryDirectory() as d:
            src = make_image(os.path.join(d, "in.jpg"))
            out = os.path.join(d, "out.png")
            stats = ics.compress_image(src, out, output_format="png")
            self.assertEqual(stats["format_used"], "png")
            with Image.open(out) as img:
                self.assertEqual(img.format, "PNG")

    def test_normalize_format(self):
        self.assertEqual(ics._normalize_format("jpg"), "JPEG")
        self.assertEqual(ics._normalize_format("JPEG"), "JPEG")


class PdfCompressionTest(unittest.TestCase):
    def test_compress_preset_returns_stats(self):
        with tempfile.TemporaryDirectory() as d:
            src = make_pdf(os.path.join(d, "in.pdf"), pages=3, with_images=True)
            out = os.path.join(d, "out.pdf")
            stats = pcs.compress_pdf(src, out, preset="balanced")
            self.assertGreater(stats["compressed_size_bytes"], 0)
            self.assertGreaterEqual(stats["reduction_pct"], 0)

    def test_compress_to_target_under_or_reports(self):
        with tempfile.TemporaryDirectory() as d:
            src = make_pdf(os.path.join(d, "in.pdf"), pages=3, with_images=True)
            out = os.path.join(d, "out.pdf")
            stats = pcs.compress_pdf(src, out, preset="maximum_compression", target_size_bytes=150 * 1024)
            size = os.path.getsize(out)
            if stats["target_achieved"]:
                self.assertLessEqual(size, 150 * 1024)
            else:
                self.assertGreater(size, 150 * 1024)


if __name__ == "__main__":
    unittest.main()
