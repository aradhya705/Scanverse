import os
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.database import get_db
from app.db.models import Document, User
from app.schemas.pdf_tools import CompressRequest, CompressResponse
from app.services import export_service, pdf_compression_service
from app.utils.files import user_export_dir

router = APIRouter(prefix="/pdf-tools", tags=["pdf-tools"])


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


@router.get("/download/{filename}")
def download_compressed(
    filename: str,
    current_user: User = Depends(get_current_user),
):
    # Filenames are server-generated UUIDs (see compress_document above);
    # reject anything that isn't a bare filename to rule out path traversal.
    if filename != os.path.basename(filename) or not filename.startswith("compressed_"):
        raise HTTPException(status_code=400, detail="Invalid filename")

    export_dir = user_export_dir(current_user.id)
    path = os.path.join(export_dir, filename)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(path=path, media_type="application/pdf", filename="compressed.pdf")
