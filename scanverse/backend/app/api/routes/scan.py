import os
import shutil

import cv2
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, Form
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.db.database import get_db
from app.db.models import Document, Page, User
from app.schemas.page import CleanupRequest, PageAdjustRequest, PageOut, ReorderRequest
from app.services import image_processing as ip
from app.utils.files import new_filename, user_dir, validate_image_content

router = APIRouter(prefix="/scan", tags=["scan"])

ALLOWED_EXT = {"jpg", "jpeg", "png", "webp"}


async def _save_upload_validated(file, directory: str, ext: str) -> str:
    """Write an uploaded file to disk while enforcing the configured size
    limit and verifying the bytes are actually a well-formed image of the
    claimed type — not just trusting the filename extension."""
    max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024
    path = os.path.join(directory, new_filename(ext))

    size = 0
    with open(path, "wb") as buffer:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > max_bytes:
                buffer.close()
                if os.path.exists(path):
                    os.remove(path)
                raise HTTPException(
                    status_code=413,
                    detail=f"File exceeds the {settings.MAX_UPLOAD_MB} MB upload limit",
                )
            buffer.write(chunk)

    try:
        validate_image_content(path, ext)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return path


def _read_image(path: str):
    img = cv2.imread(path)
    if img is None:
        raise HTTPException(status_code=422, detail="Could not read uploaded image")
    return img


@router.post("/upload", response_model=PageOut)
async def upload_page(
    file: UploadFile = File(...),
    document_id: str | None = Form(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ext = (file.filename or "scan.jpg").rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: .{ext}")

    if document_id:
        document = (
            db.query(Document)
            .filter(Document.id == document_id, Document.owner_id == current_user.id)
            .first()
        )
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")
    else:
        document = Document(owner_id=current_user.id, title="Untitled Scan")
        db.add(document)
        db.commit()
        db.refresh(document)

    directory = user_dir(current_user.id)
    original_path = await _save_upload_validated(file, directory, ext)

    image = _read_image(original_path)
    corners, confidence = ip.detect_document_corners(image)
    if corners is None:
        h, w = image.shape[:2]
        corners = ip.default_corners(w, h)

    next_index = len(document.pages)
    page = Page(
        document_id=document.id,
        order_index=next_index,
        original_path=original_path,
        corners=corners,
    )
    db.add(page)
    db.commit()
    db.refresh(page)

    result = PageOut.model_validate(page)
    return result


@router.get("/pages/{page_id}/detection")
def get_detection_confidence(
    page_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    page = _get_owned_page(page_id, db, current_user)
    image = _read_image(page.original_path)
    corners, confidence = ip.detect_document_corners(image)
    return {"corners": corners or page.corners, "confidence": confidence}


def _get_owned_page(page_id: str, db: Session, current_user: User) -> Page:
    page = (
        db.query(Page)
        .join(Document)
        .filter(Page.id == page_id, Document.owner_id == current_user.id)
        .first()
    )
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    return page


@router.post("/pages/{page_id}/process", response_model=PageOut)
def process_page(
    page_id: str,
    payload: PageAdjustRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    page = _get_owned_page(page_id, db, current_user)
    image = _read_image(page.original_path)

    if payload.corners is not None:
        page.corners = payload.corners
    if payload.rotation is not None:
        page.rotation = payload.rotation % 360
    if payload.filter_applied is not None:
        if payload.filter_applied not in ip.FILTER_PRESETS:
            raise HTTPException(status_code=400, detail="Unknown filter")
        page.filter_applied = payload.filter_applied
    for field in ("brightness", "contrast", "saturation", "sharpness", "intensity"):
        value = getattr(payload, field)
        if value is not None:
            setattr(page, field, value)

    working = image
    if page.corners:
        try:
            working = ip.warp_perspective(working, page.corners)
        except Exception:
            pass  # fall back to unwarped image if corners are degenerate

    if page.rotation:
        working = ip.rotate_image(working, page.rotation)

    working = ip.apply_filter(
        working,
        page.filter_applied.value if hasattr(page.filter_applied, "value") else page.filter_applied,
        intensity=page.intensity,
        brightness=page.brightness,
        contrast=page.contrast,
        saturation=page.saturation,
        sharpness=page.sharpness,
    )

    directory = user_dir(current_user.id)
    processed_filename = new_filename("jpg")
    processed_path = os.path.join(directory, f"processed_{processed_filename}")
    cv2.imwrite(processed_path, working, [cv2.IMWRITE_JPEG_QUALITY, 92])

    thumb = ip.make_thumbnail(working)
    thumb_path = os.path.join(directory, f"thumb_{processed_filename}")
    cv2.imwrite(thumb_path, thumb, [cv2.IMWRITE_JPEG_QUALITY, 80])

    if page.processed_path and os.path.exists(page.processed_path):
        os.remove(page.processed_path)
    if page.thumbnail_path and os.path.exists(page.thumbnail_path):
        os.remove(page.thumbnail_path)

    page.processed_path = processed_path
    page.thumbnail_path = thumb_path

    db.commit()
    db.refresh(page)
    return PageOut.model_validate(page)


@router.post("/pages/{page_id}/retake", response_model=PageOut)
async def retake_page(
    page_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Replace this page's photo in place (Adobe Scan's 'Retake') — same page
    slot and position in the document, brand-new capture."""
    page = _get_owned_page(page_id, db, current_user)

    ext = (file.filename or "scan.jpg").rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: .{ext}")

    directory = user_dir(current_user.id)
    new_original = await _save_upload_validated(file, directory, ext)

    image = _read_image(new_original)
    corners, _confidence = ip.detect_document_corners(image)
    if corners is None:
        h, w = image.shape[:2]
        corners = ip.default_corners(w, h)

    for path in (page.original_path, page.processed_path, page.thumbnail_path):
        if path and os.path.exists(path):
            os.remove(path)

    page.original_path = new_original
    page.processed_path = None
    page.thumbnail_path = None
    page.corners = corners
    page.rotation = 0
    page.filter_applied = "original"
    page.brightness = 1.0
    page.contrast = 1.0
    page.saturation = 1.0
    page.sharpness = 1.0
    page.intensity = 1.0

    db.commit()
    db.refresh(page)
    return PageOut.model_validate(page)


@router.post("/pages/{page_id}/cleanup", response_model=PageOut)
def cleanup_page(
    page_id: str,
    payload: CleanupRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove stains/marks the user has brushed a selection over, similar to
    Adobe Scan's Cleanup tool. Operates on the current preview image
    (processed version if one exists, otherwise the raw original) and writes
    the result back as the new processed image."""
    page = _get_owned_page(page_id, db, current_user)

    source_path = page.processed_path or page.original_path
    image = _read_image(source_path)
    cleaned = ip.cleanup_regions(image, payload.regions)

    directory = user_dir(current_user.id)
    processed_filename = new_filename("jpg")
    processed_path = os.path.join(directory, f"processed_{processed_filename}")
    cv2.imwrite(processed_path, cleaned, [cv2.IMWRITE_JPEG_QUALITY, 92])

    thumb = ip.make_thumbnail(cleaned)
    thumb_path = os.path.join(directory, f"thumb_{processed_filename}")
    cv2.imwrite(thumb_path, thumb, [cv2.IMWRITE_JPEG_QUALITY, 80])

    if page.processed_path and os.path.exists(page.processed_path):
        os.remove(page.processed_path)
    if page.thumbnail_path and os.path.exists(page.thumbnail_path):
        os.remove(page.thumbnail_path)

    page.processed_path = processed_path
    page.thumbnail_path = thumb_path

    db.commit()
    db.refresh(page)
    return PageOut.model_validate(page)


@router.post("/pages/{page_id}/duplicate", response_model=PageOut)
def duplicate_page(
    page_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    page = _get_owned_page(page_id, db, current_user)
    directory = user_dir(current_user.id)

    new_original = os.path.join(directory, new_filename("jpg"))
    shutil.copyfile(page.original_path, new_original)

    new_processed = None
    new_thumb = None
    if page.processed_path:
        new_processed = os.path.join(directory, f"processed_{new_filename('jpg')}")
        shutil.copyfile(page.processed_path, new_processed)
    if page.thumbnail_path:
        new_thumb = os.path.join(directory, f"thumb_{new_filename('jpg')}")
        shutil.copyfile(page.thumbnail_path, new_thumb)

    document = db.query(Document).filter(Document.id == page.document_id).first()
    clone = Page(
        document_id=page.document_id,
        order_index=len(document.pages),
        original_path=new_original,
        processed_path=new_processed,
        thumbnail_path=new_thumb,
        corners=page.corners,
        filter_applied=page.filter_applied,
        rotation=page.rotation,
        brightness=page.brightness,
        contrast=page.contrast,
        saturation=page.saturation,
        sharpness=page.sharpness,
        intensity=page.intensity,
        ocr_text=page.ocr_text,
    )
    db.add(clone)
    db.commit()
    db.refresh(clone)
    return PageOut.model_validate(clone)


@router.delete("/pages/{page_id}", status_code=204)
def delete_page(page_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    page = _get_owned_page(page_id, db, current_user)
    for path in (page.original_path, page.processed_path, page.thumbnail_path):
        if path and os.path.exists(path):
            os.remove(path)
    db.delete(page)
    db.commit()
    return None


@router.post("/documents/{document_id}/reorder")
def reorder_pages(
    document_id: str,
    payload: ReorderRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    document = (
        db.query(Document)
        .filter(Document.id == document_id, Document.owner_id == current_user.id)
        .first()
    )
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    pages_by_id = {p.id: p for p in document.pages}
    if set(pages_by_id.keys()) != set(payload.page_ids_in_order):
        raise HTTPException(status_code=400, detail="Page id list does not match document pages")

    for index, page_id in enumerate(payload.page_ids_in_order):
        pages_by_id[page_id].order_index = index

    db.commit()
    return {"status": "reordered"}
