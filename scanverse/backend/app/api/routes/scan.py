import base64
import io
import os
import shutil

import cv2
import numpy as np
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, Form
from PIL import Image
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.db.database import get_db
from app.db.models import Document, Page, User
from app.schemas.page import CleanupRequest, PageAdjustRequest, PageOut, ReorderRequest, SignatureRequest
from app.services import image_processing as ip
from app.services import signature_service
from app.utils.files import new_filename, user_dir, validate_image_content
from app.utils.image_io import read_page_image, save_page_image

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


def _read_image_from_page(page: Page, prefer: str = "original"):
    """Read image from DB (binary) or disk (fallback). Returns BGR numpy array."""
    for data in ([page.original_data, page.processed_data] if prefer == "original"
                 else [page.processed_data, page.original_data]):
        if data is not None:
            import numpy as np
            arr = np.frombuffer(data, dtype=np.uint8)
            img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            if img is not None:
                return img
    # Last resort: try disk paths
    for path in ([page.original_path, page.processed_path] if prefer == "original"
                 else [page.processed_path, page.original_path]):
        if path and os.path.exists(path):
            img = cv2.imread(path)
            if img is not None:
                return img
    raise HTTPException(status_code=422, detail="Image not found — please re-upload this page")


def _read_image(path: str):
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=422, detail="Image file not found on server — please re-upload")
    img = cv2.imread(path)
    if img is None:
        raise HTTPException(status_code=422, detail="Could not decode image file — it may be corrupted")
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

    # Read the saved file and store bytes in DB (survives free-tier restarts)
    image = _read_image(original_path)
    corners, confidence = ip.detect_document_corners(image)
    if corners is None:
        # Edge detection failed — use the full image, no crop at all
        h, w = image.shape[:2]
        corners = ip.default_corners(w, h)
    else:
        # Low confidence: expand detected corners to include full image
        # boundary as a safety margin so edge content is never cut.
        if confidence < 0.5:
            h, w = image.shape[:2]
            corners = ip.default_corners(w, h)

    next_index = len(document.pages)
    page = Page(
        document_id=document.id,
        order_index=next_index,
        original_path=original_path,
        corners=corners,
    )
    # Store image bytes in DB so they survive free-tier restarts
    try:
        _, buf = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 95])
        page.original_data = buf.tobytes()
    except Exception:
        pass  # Column may not exist yet — migration pending
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
    image = _read_image_from_page(page, prefer="original")
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
    image = _read_image_from_page(page, prefer="original")

    if payload.corners is not None:
        page.corners = payload.corners
    if payload.rotation is not None:
        page.rotation = payload.rotation % 360
    if payload.filter_applied is not None:
        if payload.filter_applied not in ip.FILTER_PRESETS:
            raise HTTPException(status_code=400, detail="Unknown filter")
        page.filter_applied = payload.filter_applied
    if payload.scale is not None:
        if not (0.1 <= payload.scale <= 1.0):
            raise HTTPException(status_code=400, detail="Scale must be between 0.1 and 1.0")
        page.scale = payload.scale
    for field in ("brightness", "contrast", "saturation", "sharpness", "intensity"):
        value = getattr(payload, field)
        if value is not None:
            setattr(page, field, value)

    working = image
    if page.corners:
        # Check if corners cover essentially the full image — if so,
        # skip the perspective warp entirely (no benefit, risks distortion).
        h, w = image.shape[:2]
        corners_arr = page.corners
        is_full_image = (
            len(corners_arr) == 4
            and corners_arr[0][0] < w * 0.05
            and corners_arr[0][1] < h * 0.05
            and corners_arr[2][0] > w * 0.95
            and corners_arr[2][1] > h * 0.95
        )
        if not is_full_image:
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

    # Resize the finished page to the stored scale ("Resize" tool)
    if page.scale and page.scale < 1.0:
        h, w = working.shape[:2]
        working = cv2.resize(
            working,
            (max(1, int(w * page.scale)), max(1, int(h * page.scale))),
            interpolation=cv2.INTER_AREA,
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
    # Store processed image in DB too (survives free-tier restarts)
    try:
        _, proc_buf = cv2.imencode(".jpg", working, [cv2.IMWRITE_JPEG_QUALITY, 92])
        page.processed_data = proc_buf.tobytes()
    except Exception:
        pass

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
    page.scale = 1.0
    # Store new image in DB
    try:
        _, buf = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 95])
        page.original_data = buf.tobytes()
        page.processed_data = None
    except Exception:
        pass

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

    image = _read_image_from_page(page)
    if image is None:
        raise HTTPException(status_code=422, detail="Image not found — please re-upload this page")
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
    try:
        _, proc_buf = cv2.imencode(".jpg", cleaned, [cv2.IMWRITE_JPEG_QUALITY, 92])
        page.processed_data = proc_buf.tobytes()
    except Exception:
        pass

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
    if page.original_path and os.path.exists(page.original_path):
        shutil.copyfile(page.original_path, new_original)
    else:
        new_original = None

    new_processed = None
    new_thumb = None
    if page.processed_path and os.path.exists(page.processed_path):
        new_processed = os.path.join(directory, f"processed_{new_filename('jpg')}")
        shutil.copyfile(page.processed_path, new_processed)
    if page.thumbnail_path and os.path.exists(page.thumbnail_path):
        new_thumb = os.path.join(directory, f"thumb_{new_filename('jpg')}")
        shutil.copyfile(page.thumbnail_path, new_thumb)

    document = db.query(Document).filter(Document.id == page.document_id).first()
    clone = Page(
        document_id=page.document_id,
        order_index=len(document.pages),
        original_path=new_original,
        processed_path=new_processed,
        thumbnail_path=new_thumb,
        original_data=getattr(page, 'original_data', None),
        processed_data=getattr(page, 'processed_data', None),
        corners=page.corners,
        filter_applied=page.filter_applied,
        rotation=page.rotation,
        brightness=page.brightness,
        contrast=page.contrast,
        saturation=page.saturation,
        sharpness=page.sharpness,
        intensity=page.intensity,
        scale=page.scale,
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


@router.post("/pages/{page_id}/signature", response_model=PageOut)
def add_signature(
    page_id: str,
    payload: SignatureRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Composite a drawn/uploaded signature onto this page's current preview
    and write it back as the new processed image (like applying a filter).
    Undo by re-processing the page, which regenerates from the original."""
    page = _get_owned_page(page_id, db, current_user)

    try:
        signature_png = base64.b64decode(payload.signature_png_b64, validate=True)
        # Confirm it decodes as an image at all before compositing
        Image.open(io.BytesIO(signature_png)).verify()
    except Exception:
        raise HTTPException(status_code=400, detail="signature_png_b64 is not valid PNG data")

    # Read image from DB first, fall back to disk
    sig_image = None
    for data in [page.processed_data, page.original_data]:
        if data is not None:
            import numpy as np
            arr = np.frombuffer(data, dtype=np.uint8)
            sig_image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            if sig_image is not None:
                break
    if sig_image is None:
        for path in [page.processed_path, page.original_path]:
            if path and os.path.exists(path):
                sig_image = cv2.imread(path)
                if sig_image is not None:
                    break
    if sig_image is None:
        raise HTTPException(status_code=422, detail="Image not found — please re-upload this page")
    # Save temp file for signature service (it expects a file path)
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
        cv2.imwrite(tmp.name, sig_image, [cv2.IMWRITE_JPEG_QUALITY, 92])
        source_path = tmp.name
    try:
        composited = signature_service.composite_signature(
            page_path=source_path,
            signature_png=signature_png,
            x=payload.x,
            y=payload.y,
            width_fraction=payload.width_fraction,
            opacity=payload.opacity,
        )
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not place signature: {exc}") from exc

    directory = user_dir(current_user.id)
    processed_filename = new_filename("jpg")
    processed_path = os.path.join(directory, f"processed_{processed_filename}")
    composited.save(processed_path, "JPEG", quality=92)

    thumb_bgr = cv2.cvtColor(np.asarray(composited.convert("RGB")), cv2.COLOR_RGB2BGR)
    thumb = ip.make_thumbnail(thumb_bgr)
    thumb_path = os.path.join(directory, f"thumb_{processed_filename}")
    cv2.imwrite(thumb_path, thumb, [cv2.IMWRITE_JPEG_QUALITY, 80])

    if page.processed_path and os.path.exists(page.processed_path):
        os.remove(page.processed_path)
    if page.thumbnail_path and os.path.exists(page.thumbnail_path):
        os.remove(page.thumbnail_path)

    page.processed_path = processed_path
    page.thumbnail_path = thumb_path
    # Store signed image in DB
    try:
        import numpy as np
        signed_bgr = cv2.cvtColor(np.asarray(composited.convert("RGB")), cv2.COLOR_RGB2BGR)
        _, sig_buf = cv2.imencode(".jpg", signed_bgr, [cv2.IMWRITE_JPEG_QUALITY, 92])
        page.processed_data = sig_buf.tobytes()
    except Exception:
        pass

    db.commit()
    db.refresh(page)
    return PageOut.model_validate(page)


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
