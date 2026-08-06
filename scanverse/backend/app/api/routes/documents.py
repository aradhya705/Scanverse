import os

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.database import get_db
from app.db.models import Document, User
from app.schemas.document import DocumentListItem, DocumentOut, DocumentUpdate

router = APIRouter(prefix="/documents", tags=["documents"])


@router.get("", response_model=list[DocumentListItem])
def list_documents(
    q: str | None = None,
    category: str | None = None,
    favorites_only: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Document).filter(Document.owner_id == current_user.id)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(Document.title.ilike(like), Document.ocr_text.ilike(like)))
    if category:
        query = query.filter(Document.category == category)
    if favorites_only:
        query = query.filter(Document.is_favorite.is_(True))

    documents = query.order_by(Document.updated_at.desc()).all()
    results = []
    for d in documents:
        item = DocumentListItem.model_validate(d)
        item.page_count = len(d.pages)
        results.append(item)
    return results


@router.get("/{document_id}", response_model=DocumentOut)
def get_document(
    document_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    document = (
        db.query(Document)
        .filter(Document.id == document_id, Document.owner_id == current_user.id)
        .first()
    )
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    return document


@router.patch("/{document_id}", response_model=DocumentOut)
def update_document(
    document_id: str,
    payload: DocumentUpdate,
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

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(document, field, value)

    db.commit()
    db.refresh(document)
    return document


@router.delete("/{document_id}", status_code=204)
def delete_document(
    document_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    document = (
        db.query(Document)
        .filter(Document.id == document_id, Document.owner_id == current_user.id)
        .first()
    )
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    for page in document.pages:
        for path in (page.original_path, page.processed_path, page.thumbnail_path):
            if path and os.path.exists(path):
                os.remove(path)

    db.delete(document)
    db.commit()
    return None
