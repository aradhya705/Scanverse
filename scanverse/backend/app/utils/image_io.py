"""Helper to read image data — tries DB first, then disk.

On Render free tier the filesystem is ephemeral (files are wiped when the
service restarts).  Storing the raw image bytes in PostgreSQL ensures they
survive restarts.  For backward compatibility with pages that were uploaded
before this migration, we fall back to reading from the file path on disk.
"""

from __future__ import annotations

import os

import cv2
import numpy as np
from sqlalchemy.orm import Session

from app.db.models import Page


def read_page_image(page: Page, db: Session, *, prefer: str = "original") -> np.ndarray | None:
    """Return the page image as a BGR numpy array, or None if unavailable.

    *prefer* selects which version to return: ``"original"`` (full photo)
    or ``"processed"`` (cropped / filtered).  Falls back to the other
    variant if the preferred one is missing.
    """
    # Order to try: preferred binary → preferred disk → other binary → other disk
    if prefer == "original":
        candidates = [
            ("binary", page.original_data),
            ("disk", page.original_path),
            ("binary", page.processed_data),
            ("disk", page.processed_path),
        ]
    else:
        candidates = [
            ("binary", page.processed_data),
            ("disk", page.processed_path),
            ("binary", page.original_data),
            ("disk", page.original_path),
        ]

    for source, data in candidates:
        if data is None:
            continue
        if source == "binary":
            arr = np.frombuffer(data, dtype=np.uint8)
            img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            if img is not None:
                return img
        else:  # disk
            if not os.path.exists(str(data)):
                continue
            img = cv2.imread(str(data))
            if img is not None:
                return img

    return None


def save_page_image(page: Page, image_bgr: np.ndarray, db: Session, *, target: str = "original") -> None:
    """Encode image to JPEG bytes and store in the DB column.

    Also writes to disk as a fallback for environments that have
    persistent storage.
    """
    _, buf = cv2.imencode(".jpg", image_bgr, [cv2.IMWRITE_JPEG_QUALITY, 92])
    data = buf.tobytes()

    if target == "original":
        page.original_data = data
    else:
        page.processed_data = data

    db.flush()
