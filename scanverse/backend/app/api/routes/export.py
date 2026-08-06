import os

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.database import get_db
from app.db.models import Document, User
from app.services import export_service
from app.utils.files import new_filename, user_export_dir

router = APIRouter(prefix="/export", tags=["export"])

MEDIA_TYPES = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "txt": "text/plain",
}


@router.get("/documents/{document_id}")
def export_document(
    document_id: str,
    format: str = "pdf",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if format not in MEDIA_TYPES:
        raise HTTPException(status_code=400, detail="format must be one of: pdf, docx, txt")

    document = (
        db.query(Document)
        .filter(Document.id == document_id, Document.owner_id == current_user.id)
        .first()
    )
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    pages = sorted(document.pages, key=lambda p: p.order_index)
    if not pages:
        raise HTTPException(status_code=400, detail="Document has no pages to export")

    image_paths = [p.processed_path or p.original_path for p in pages]
    ocr_texts = [p.ocr_text for p in pages]

    export_dir = user_export_dir(current_user.id)
    safe_title = "".join(c for c in document.title if c.isalnum() or c in " -_").strip() or "scan"
    filename = f"{safe_title}_{new_filename(format)}"
    output_path = os.path.join(export_dir, filename)

    if format == "pdf":
        export_service.build_pdf(image_paths, output_path)
    elif format == "docx":
        export_service.build_docx(image_paths, ocr_texts, output_path)
    elif format == "txt":
        if not any(ocr_texts):
            raise HTTPException(
                status_code=400, detail="Run OCR on at least one page before exporting as TXT"
            )
        export_service.build_txt(ocr_texts, output_path)

    return FileResponse(
        path=output_path,
        media_type=MEDIA_TYPES[format],
        filename=f"{safe_title}.{format}",
    )
