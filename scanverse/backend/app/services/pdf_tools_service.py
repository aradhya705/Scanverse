"""
PDF manipulation service: merge, split, extract, delete and rearrange pages.

All operations use PyMuPDF's page-level insertion (insert_pdf), which copies
the source page's content stream, images, and annotations into the output
document without re-rendering — fast and lossless for both image-only scans
and text-based PDFs alike.
"""

from __future__ import annotations

import os

import fitz  # PyMuPDF


def merge_pdfs(input_paths: list[str], output_path: str) -> int:
    """Append every page of each input PDF into one output document.

    Returns the resulting page count.
    """
    merged = fitz.open()
    for path in input_paths:
        src = fitz.open(path)
        try:
            merged.insert_pdf(src)
        finally:
            src.close()
    merged.save(output_path, garbage=4, deflate=True)
    page_count = len(merged)
    merged.close()
    return page_count


def split_pdf(input_path: str, output_dir: str, prefix: str = "page") -> list[str]:
    """Write each page of `input_path` as its own PDF file.

    Returns the list of created file paths (one per source page).
    """
    src = fitz.open(input_path)
    paths: list[str] = []
    try:
        for i in range(len(src)):
            page_out = fitz.open()
            page_out.insert_pdf(src, from_page=i, to_page=i)
            path = os.path.join(output_dir, f"{prefix}_{i + 1:03d}.pdf")
            page_out.save(path, garbage=4, deflate=True)
            page_out.close()
            paths.append(path)
    finally:
        src.close()
    return paths


def extract_pages(input_path: str, output_path: str, page_numbers: list[int]) -> int:
    """Copy only the given 1-indexed pages into a new PDF."""
    src = fitz.open(input_path)
    try:
        return _copy_selection(src, output_path, page_numbers)
    finally:
        src.close()


def delete_pages(input_path: str, output_path: str, page_numbers: list[int]) -> int:
    """Write a new PDF containing every page EXCEPT the given 1-indexed ones."""
    src = fitz.open(input_path)
    try:
        keep = [i + 1 for i in range(len(src)) if (i + 1) not in set(page_numbers)]
        return _copy_selection(src, output_path, keep)
    finally:
        src.close()


def rearrange_pages(input_path: str, output_path: str, order: list[int]) -> int:
    """Write a new PDF with pages in the given 1-indexed order.

    Order entries that fall outside the document (or duplicates) are
    silently skipped, and any page never mentioned is omitted — so a
    frontend can send exactly the order the user dragged pages into.
    """
    src = fitz.open(input_path)
    try:
        seen: list[int] = []
        for n in order:
            if 1 <= n <= len(src) and n not in seen:
                seen.append(n)
        return _copy_selection(src, output_path, seen)
    finally:
        src.close()


def _copy_selection(src: "fitz.Document", output_path: str, page_numbers: list[int]) -> int:
    """Copy 1-indexed pages from `src` into a fresh document at `output_path`."""
    out = fitz.open()
    for n in sorted(set(page_numbers)):
        if 1 <= n <= len(src):
            out.insert_pdf(src, from_page=n - 1, to_page=n - 1)
    if len(out) == 0:
        out.close()
        raise ValueError("The selected page range is empty")
    out.save(output_path, garbage=4, deflate=True)
    page_count = len(out)
    out.close()
    return page_count
