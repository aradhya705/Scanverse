import os

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user
from app.db.database import get_db
from app.db.models import Document, User

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("")
def get_stats(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Dashboard aggregates: document/page counts, favorites, total storage
    used (sum of every page's original/processed/thumbnail bytes on disk),
    OCR text volume, and a short "recently edited" list.

    All computed on demand from existing rows + files — no separate
    counters to drift out of sync.
    """
    documents = (
        db.query(Document)
        .options(selectinload(Document.pages))
        .filter(Document.owner_id == current_user.id)
        .order_by(Document.updated_at.desc())
        .all()
    )

    page_count = 0
    favorite_count = 0
    total_storage_bytes = 0
    ocr_char_count = 0

    for doc in documents:
        if doc.is_favorite:
            favorite_count += 1
        if doc.ocr_text:
            ocr_char_count += len(doc.ocr_text)
        for page in doc.pages:
            page_count += 1
            for path in (page.original_path, page.processed_path, page.thumbnail_path):
                if path and os.path.isfile(path):
                    try:
                        total_storage_bytes += os.path.getsize(path)
                    except OSError:
                        continue

    recently_edited = [
        {
            "id": d.id,
            "title": d.title,
            "category": d.category,
            "is_favorite": d.is_favorite,
            "page_count": len(d.pages),
            "updated_at": d.updated_at.isoformat(),
        }
        for d in documents[:5]
    ]

    return {
        "document_count": len(documents),
        "page_count": page_count,
        "favorite_count": favorite_count,
        "total_storage_bytes": total_storage_bytes,
        "ocr_char_count": ocr_char_count,
        "recently_edited": recently_edited,
    }
