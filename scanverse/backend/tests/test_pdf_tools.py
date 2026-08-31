"""Tests for the PDF manipulation service (merge / split / extract /
delete / rearrange), built on PyMuPDF page copying."""

import os
import tempfile
import unittest

import fitz

from app.services import pdf_tools_service as pts
from tests.helpers import make_pdf


class PdfToolsTest(unittest.TestCase):
    def test_merge_two_pdfs(self):
        with tempfile.TemporaryDirectory() as d:
            a = make_pdf(os.path.join(d, "a.pdf"), pages=2)
            b = make_pdf(os.path.join(d, "b.pdf"), pages=3)
            out = os.path.join(d, "merged.pdf")
            count = pts.merge_pdfs([a, b], out)
            self.assertEqual(count, 5)
            with fitz.open(out) as doc:
                self.assertEqual(len(doc), 5)

    def test_split_into_pages(self):
        with tempfile.TemporaryDirectory() as d:
            src = make_pdf(os.path.join(d, "in.pdf"), pages=3)
            out_dir = os.path.join(d, "pages")
            os.makedirs(out_dir)
            paths = pts.split_pdf(src, out_dir)
            self.assertEqual(len(paths), 3)
            for path in paths:
                with fitz.open(path) as doc:
                    self.assertEqual(len(doc), 1)

    def test_extract_pages(self):
        with tempfile.TemporaryDirectory() as d:
            src = make_pdf(os.path.join(d, "in.pdf"), pages=4)
            out = os.path.join(d, "extracted.pdf")
            count = pts.extract_pages(src, out, [1, 3])
            self.assertEqual(count, 2)
            with fitz.open(out) as doc:
                self.assertEqual(len(doc), 2)

    def test_extract_out_of_range_is_skipped(self):
        with tempfile.TemporaryDirectory() as d:
            src = make_pdf(os.path.join(d, "in.pdf"), pages=2)
            out = os.path.join(d, "extracted.pdf")
            count = pts.extract_pages(src, out, [1, 99])
            self.assertEqual(count, 1)

    def test_delete_pages(self):
        with tempfile.TemporaryDirectory() as d:
            src = make_pdf(os.path.join(d, "in.pdf"), pages=4)
            out = os.path.join(d, "remaining.pdf")
            count = pts.delete_pages(src, out, [2, 3])
            self.assertEqual(count, 2)
            with fitz.open(out) as doc:
                self.assertEqual(len(doc), 2)

    def test_rearrange_pages(self):
        with tempfile.TemporaryDirectory() as d:
            src = make_pdf(os.path.join(d, "in.pdf"), pages=3)
            out = os.path.join(d, "rearranged.pdf")
            count = pts.rearrange_pages(src, out, [3, 1, 2])
            self.assertEqual(count, 3)

    def test_delete_all_pages_raises(self):
        with tempfile.TemporaryDirectory() as d:
            src = make_pdf(os.path.join(d, "in.pdf"), pages=2)
            out = os.path.join(d, "out.pdf")
            with self.assertRaises(ValueError):
                pts.delete_pages(src, out, [1, 2])


if __name__ == "__main__":
    unittest.main()
