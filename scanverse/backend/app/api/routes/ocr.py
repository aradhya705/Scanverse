import os

import cv2
import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.database import get_db
from app.db.models import Document, Page, User
from app.services import ocr_service

router = APIRouter(prefix="/ocr", tags=["ocr"])


class OcrTextUpdate(BaseModel):
    ocr_text: str


def _resync_document_text(document_id: str, db: Session) -> None:
    document = db.query(Document).filter(Document.id == document_id).first()
    all_texts = [p.ocr_text for p in sorted(document.pages, key=lambda p: p.order_index) if p.ocr_text]
    document.ocr_text = "\n\n".join(all_texts)
    db.commit()


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


@router.post("/pages/{page_id}")
def run_ocr_on_page(
    page_id: str,
    language: str | None = None,
    languages: str | None = None,
    preprocess: bool = True,
    auto_deskew: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Run OCR on a single page.

    `languages` accepts a comma-separated list (e.g. `en,fr`) for
    multi-language documents; `language` remains for backwards compatibility
    with a single-language call. `preprocess`/`auto_deskew` can be disabled
    to OCR the raw processed image if the automatic cleanup ever hurts more
    than it helps on a particular scan.
    """
    page = _get_owned_page(page_id, db, current_user)
    # Read image from DB first (survives free-tier restarts), fall back to disk.
    image = None
    for data in [page.original_data, page.processed_data]:
        if data is not None:
            arr = np.frombuffer(data, dtype=np.uint8)
            image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            if image is not None:
                break
    if image is None:
        for path in [page.original_path, page.processed_path]:
            if path and os.path.exists(path):
                image = cv2.imread(path)
                if image is not None:
                    break
    if image is None:
        raise HTTPException(status_code=422, detail="Image not found — please re-upload this page")

    lang_list = [l.strip() for l in languages.split(",")] if languages else ([language] if language else None)
    if lang_list:
        error = ocr_service.validate_languages(lang_list)
        if error:
            raise HTTPException(status_code=400, detail=error)

    result = ocr_service.extract_text(image, lang_list, preprocess=preprocess, auto_deskew=auto_deskew)

    page.ocr_text = result["full_text"]
    db.commit()
    _resync_document_text(page.document_id, db)

    # Return full result including word-level data for advanced OCR view
    return {
        "full_text": result["full_text"],
        "lines": result["lines"],
        "words": result["words"],
        "language": result["language"],
        "average_confidence": result["average_confidence"],
        "low_confidence_line_count": result["low_confidence_line_count"],
        "line_count": result["line_count"],
        "word_count": result["word_count"],
        "preprocessed": result["preprocessed"],
        "page_id": page.id,
    }


@router.post("/documents/{document_id}")
def run_ocr_on_document(
    document_id: str,
    language: str | None = None,
    languages: str | None = None,
    preprocess: bool = True,
    auto_deskew: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Run OCR across every page of a document in one call (page order),
    instead of the caller having to loop over `/ocr/pages/{id}` per page."""
    document = (
        db.query(Document)
        .filter(Document.id == document_id, Document.owner_id == current_user.id)
        .first()
    )
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    lang_list = [l.strip() for l in languages.split(",")] if languages else ([language] if language else None)
    if lang_list:
        error = ocr_service.validate_languages(lang_list)
        if error:
            raise HTTPException(status_code=400, detail=error)

    page_results = []
    for page in sorted(document.pages, key=lambda p: p.order_index):
        # Read from DB first, fall back to disk
        image = None
        for data in [page.original_data, page.processed_data]:
            if data is not None:
                arr = np.frombuffer(data, dtype=np.uint8)
                image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
                if image is not None:
                    break
        if image is None:
            for path in [page.original_path, page.processed_path]:
                if path and os.path.exists(path):
                    image = cv2.imread(path)
                    if image is not None:
                        break
        if image is None:
            page_results.append({"page_id": page.id, "error": "Image not found"})
            continue
        result = ocr_service.extract_text(image, lang_list, preprocess=preprocess, auto_deskew=auto_deskew)
        page.ocr_text = result["full_text"]
        page_results.append(
            {
                "page_id": page.id,
                "full_text": result["full_text"],
                "lines": result["lines"],
                "words": result["words"],
                "average_confidence": result["average_confidence"],
                "low_confidence_line_count": result["low_confidence_line_count"],
                "line_count": result["line_count"],
                "word_count": result["word_count"],
            }
        )

    db.commit()
    _resync_document_text(document.id, db)

    confidences = [r["average_confidence"] for r in page_results if "average_confidence" in r]
    return {
        "document_id": document.id,
        "pages": page_results,
        "ocr_text": document.ocr_text,
        "average_confidence": round(sum(confidences) / len(confidences), 3) if confidences else 0.0,
    }


@router.get("/pages/{page_id}")
def get_page_ocr(page_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    page = _get_owned_page(page_id, db, current_user)
    return {"page_id": page.id, "ocr_text": page.ocr_text}


@router.patch("/pages/{page_id}")
def update_page_ocr(
    page_id: str,
    payload: OcrTextUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    page = _get_owned_page(page_id, db, current_user)
    page.ocr_text = payload.ocr_text
    db.commit()
    _resync_document_text(page.document_id, db)
    return {"page_id": page.id, "ocr_text": page.ocr_text}
