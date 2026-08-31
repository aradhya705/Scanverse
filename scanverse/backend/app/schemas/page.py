import os
from pydantic import BaseModel, ConfigDict, model_validator
from datetime import datetime

from app.core.config import settings


def _to_media_url(path: str | None) -> str | None:
    """Convert an absolute filesystem path under UPLOAD_DIR into a URL the
    frontend can fetch through the /media/uploads static mount."""
    if not path:
        return None
    try:
        rel = os.path.relpath(path, settings.UPLOAD_DIR)
    except ValueError:
        return None
    return f"/media/uploads/{rel}".replace(os.sep, "/")


class CornerPoints(BaseModel):
    """Four [x, y] corner points, in order: top-left, top-right, bottom-right, bottom-left."""

    points: list[list[float]]


class PageAdjustRequest(BaseModel):
    corners: list[list[float]] | None = None
    rotation: int | None = None
    filter_applied: str | None = None
    brightness: float | None = None
    contrast: float | None = None
    saturation: float | None = None
    sharpness: float | None = None
    intensity: float | None = None
    scale: float | None = None  # 0.1-1.0 output size multiplier


class PageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    document_id: str
    order_index: int
    original_path: str | None
    processed_path: str | None
    thumbnail_path: str | None
    corners: list[list[float]] | None
    filter_applied: str
    rotation: int
    brightness: float
    contrast: float
    saturation: float
    sharpness: float
    intensity: float
    scale: float
    ocr_text: str | None
    created_at: datetime

    original_url: str | None = None
    processed_url: str | None = None
    thumbnail_url: str | None = None
    has_original_data: bool = False
    has_processed_data: bool = False

    @model_validator(mode="after")
    def _compute_urls(self):
        # Try disk path first; if missing, use DB image endpoint
        orig = _to_media_url(self.original_path)
        proc = _to_media_url(self.processed_path)
        thumb = _to_media_url(self.thumbnail_path)

        if not orig and self.has_original_data:
            orig = f"/api/v1/media/pages/{self.id}/image?variant=original"
        if not proc and self.has_processed_data:
            proc = f"/api/v1/media/pages/{self.id}/image?variant=processed"

        self.original_url = orig
        self.processed_url = proc
        self.thumbnail_url = thumb
        return self


class ReorderRequest(BaseModel):
    page_ids_in_order: list[str]


class SignatureRequest(BaseModel):
    """Composite a signature (PNG, base64) onto a page.

    `x`/`y` position the signature's top-left corner as fractions of the
    page (0..1); `width_fraction` scales it to that fraction of page width;
    `opacity` 0..1 fades it.
    """

    signature_png_b64: str
    x: float = 0.5
    y: float = 0.6
    width_fraction: float = 0.3
    opacity: float = 1.0


class CleanupRequest(BaseModel):
    """Rectangles (in the current preview image's pixel coordinates) to
    inpaint over — e.g. coffee stains, stray marks, fingertip in frame."""

    regions: list[list[float]]
