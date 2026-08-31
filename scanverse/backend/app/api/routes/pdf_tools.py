import os
import shutil
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.db.database import get_db
from app.db.models import Document, User
from app.schemas.pdf_tools import CompressRequest, CompressResponse
from app.services import export_service, pdf_compression_service, pdf_tools_service
from app.services.image_conversion_service import zip_files
from app.utils.files import user_export_dir

router = APIRouter(prefix="/pdf-tools", tags=["pdf-tools"])


class PageSelectionRequest(BaseModel):
    """1-indexed page numbers for extract/delete operations."""

    pages: list[int]

    @field_validator("pages")
    @classmethod
    def pages_must_be_valid(cls, value: list[int]) -> list[int]:
        if not value:
            raise ValueError("At least one page number is required")
        if any(p < 1 for p in value):
            raise ValueError("Page numbers are 1-indexed")
        return value


class RearrangeRequest(BaseModel):
    """New 1-indexed page order, e.g. [2, 1, 3] puts page 2 first."""

    order: list[int]

    @field_validator("order")
    @classmethod
    def order_must_not_be_empty(cls, value: list[int]) -> list[int]:
        if not value:
            raise ValueError("order must not be empty")
        if any(p < 1 for p in value):
            raise ValueError("Page numbers are 1-indexed")
        return value


async def _save_pdf_upload(file: UploadFile, work_dir: str) -> str:
    """Write an uploaded PDF to disk, enforcing the size limit while
    streaming (cap checked incrementally so an oversized upload is rejected
    without ever being fully buffered in memory)."""
    ext = (file.filename or "doc.pdf").rsplit(".", 1)[-1].lower()
    if ext != "pdf":
        raise HTTPException(status_code=400, detail="Expected a .pdf file")

    max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024
    path = os.path.join(work_dir, f".pdfsrc_{uuid.uuid4()}.pdf")
    size = 0
    try:
        with open(path, "wb") as f:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > max_bytes:
                    raise HTTPException(
                        status_code=413,
                        detail=f"File exceeds the {settings.MAX_UPLOAD_MB} MB upload limit",
                    )
                f.write(chunk)
    except Exception:
        if os.path.exists(path):
            os.remove(path)
        raise
    return path


@router.post("/documents/{document_id}/compress", response_model=CompressResponse)
def compress_document(
    document_id: str,
    payload: CompressRequest,
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

    pages = sorted(document.pages, key=lambda p: p.order_index)
    if not pages:
        raise HTTPException(status_code=400, detail="Document has no pages to compress")

    export_dir = user_export_dir(current_user.id)
    image_paths = [p.processed_path or p.original_path for p in pages]

    # Build a fresh, full-quality source PDF from the current page images,
    # then compress *that* — this always reflects the document's latest
    # crop/filter/page-order state rather than a stale cached export.
    source_path = os.path.join(export_dir, f".source_{uuid.uuid4()}.pdf")
    output_filename = f"compressed_{uuid.uuid4()}.pdf"
    output_path = os.path.join(export_dir, output_filename)

    try:
        export_service.build_pdf(image_paths, source_path)
        stats = pdf_compression_service.compress_pdf(
            input_path=source_path,
            output_path=output_path,
            preset=payload.preset,
            target_size_bytes=payload.target_size_bytes,
        )
    finally:
        if os.path.exists(source_path):
            os.remove(source_path)

    return CompressResponse(**stats, preset=payload.preset, download_filename=output_filename)


ALLOWED_OUTPUT_PREFIXES = (
    "compressed_",
    "merged_",
    "split_pages_",
    "extracted_",
    "remaining_",
    "rearranged_",
)


@router.get("/download/{filename}")
def download_compressed(
    filename: str,
    current_user: User = Depends(get_current_user),
):
    # Filenames are server-generated UUIDs (see compress_document above);
    # reject anything that isn't a bare filename to rule out path traversal.
    if filename != os.path.basename(filename) or not filename.startswith(ALLOWED_OUTPUT_PREFIXES):
        raise HTTPException(status_code=400, detail="Invalid filename")

    export_dir = user_export_dir(current_user.id)
    path = os.path.join(export_dir, filename)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="File not found")

    media_type = "application/zip" if filename.endswith(".zip") else "application/pdf"
    return FileResponse(path=path, media_type=media_type, filename=f"download.{'zip' if media_type == 'application/zip' else 'pdf'}")


# ---------------------------------------------------------------------------
# General PDF manipulation (upload a PDF, get a new PDF/zip back)
# ---------------------------------------------------------------------------

@router.post("/merge")
async def merge_pdfs(
    files: list[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
):
    """Merge multiple PDFs into one, in upload order."""
    if not files:
        raise HTTPException(status_code=400, detail="No PDFs provided")

    work_dir = user_export_dir(current_user.id)
    batch_id = uuid.uuid4()
    source_paths: list[str] = []
    output_filename = f"merged_{batch_id}.pdf"
    output_path = os.path.join(work_dir, output_filename)

    try:
        for file in files:
            source_paths.append(await _save_pdf_upload(file, work_dir))
        page_count = pdf_tools_service.merge_pdfs(source_paths, output_path)
        if page_count == 0:
            raise HTTPException(status_code=400, detail="Merged document has no pages")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not merge PDFs: {exc}") from exc
    finally:
        for path in source_paths:
            if os.path.exists(path):
                os.remove(path)

    return {"page_count": page_count, "download_filename": output_filename}


@router.post("/split")
async def split_pdf(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Split a PDF into one file per page, delivered as a .zip."""
    work_dir = user_export_dir(current_user.id)
    batch_id = uuid.uuid4()
    source_path = await _save_pdf_upload(file, work_dir)
    page_dir = os.path.join(work_dir, f".pages_{batch_id}")
    os.makedirs(page_dir, exist_ok=True)
    download_filename = f"split_pages_{batch_id}.zip"
    zip_path = os.path.join(work_dir, download_filename)

    try:
        page_paths = pdf_tools_service.split_pdf(source_path, page_dir, prefix="page")
        if not page_paths:
            raise HTTPException(status_code=400, detail="PDF has no pages to split")
        zip_files(page_paths, zip_path)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not split PDF: {exc}") from exc
    finally:
        if os.path.exists(source_path):
            os.remove(source_path)
        shutil.rmtree(page_dir, ignore_errors=True)

    return {"page_count": len(page_paths), "download_filename": download_filename}


@router.post("/extract")
async def extract_pages(
    file: UploadFile = File(...),
    pages: str = Form(...),
    current_user: User = Depends(get_current_user),
):
    """Extract the given 1-indexed pages into a new PDF (e.g. "1,3,5")."""
    try:
        page_numbers = _parse_page_list(pages)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    work_dir = user_export_dir(current_user.id)
    batch_id = uuid.uuid4()
    source_path = await _save_pdf_upload(file, work_dir)
    download_filename = f"extracted_{batch_id}.pdf"
    output_path = os.path.join(work_dir, download_filename)

    try:
        page_count = pdf_tools_service.extract_pages(source_path, output_path, page_numbers)
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not extract pages: {exc}") from exc
    finally:
        if os.path.exists(source_path):
            os.remove(source_path)

    return {"page_count": page_count, "download_filename": download_filename}


@router.post("/delete-pages")
async def delete_pages(
    file: UploadFile = File(...),
    pages: str = Form(...),
    current_user: User = Depends(get_current_user),
):
    """Delete the given 1-indexed pages, returning the remaining PDF."""
    try:
        page_numbers = _parse_page_list(pages)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    work_dir = user_export_dir(current_user.id)
    batch_id = uuid.uuid4()
    source_path = await _save_pdf_upload(file, work_dir)
    download_filename = f"remaining_{batch_id}.pdf"
    output_path = os.path.join(work_dir, download_filename)

    try:
        page_count = pdf_tools_service.delete_pages(source_path, output_path, page_numbers)
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not delete pages: {exc}") from exc
    finally:
        if os.path.exists(source_path):
            os.remove(source_path)

    return {"page_count": page_count, "download_filename": download_filename}


@router.post("/rearrange")
async def rearrange_pages(
    file: UploadFile = File(...),
    order: str = Form(...),
    current_user: User = Depends(get_current_user),
):
    """Reorder pages by a 1-indexed order string (e.g. "3,1,2")."""
    try:
        order_list = _parse_page_list(order)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    work_dir = user_export_dir(current_user.id)
    batch_id = uuid.uuid4()
    source_path = await _save_pdf_upload(file, work_dir)
    download_filename = f"rearranged_{batch_id}.pdf"
    output_path = os.path.join(work_dir, download_filename)

    try:
        page_count = pdf_tools_service.rearrange_pages(source_path, output_path, order_list)
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not rearrange pages: {exc}") from exc
    finally:
        if os.path.exists(source_path):
            os.remove(source_path)

    return {"page_count": page_count, "download_filename": download_filename}


def _parse_page_list(raw: str) -> list[int]:
    """Parse a comma-separated page list ("1,3,5") into 1-indexed ints."""
    try:
        numbers = [int(part.strip()) for part in raw.split(",") if part.strip()]
    except ValueError as exc:
        raise ValueError("Pages must be comma-separated integers, e.g. 1,3,5") from exc
    if not numbers:
        raise ValueError("At least one page number is required")
    if any(n < 1 for n in numbers):
        raise ValueError("Page numbers are 1-indexed")
    return numbers
