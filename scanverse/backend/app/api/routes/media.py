"""Serve images stored in the database when disk files are missing.

On Render free tier (no persistent disk), uploaded files are wiped on
restart.  This endpoint reads the binary image data from PostgreSQL and
serves it directly so the frontend can still display the images.

Note: This endpoint is intentionally unauthenticated because <img> tags
in the frontend cannot send Authorization headers.  Security relies on
the unguessability of the UUID page IDs.
"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import Document, Page

router = APIRouter(prefix="/media", tags=["media"])


@router.get("/pages/{page_id}/image")
def serve_page_image(
    page_id: str,
    variant: str = "original",  # "original" or "processed"
    db: Session = Depends(get_db),
):
    """Serve the page image from DB as JPEG. Used when disk files are missing."""
    page = db.query(Page).filter(Page.id == page_id).first()
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    data = getattr(page, 'processed_data' if variant == 'processed' else 'original_data', None)
    if data is None:
        # Try the other variant
        data = getattr(page, 'original_data' if variant == 'processed' else 'processed_data', None)
    if data is None:
        raise HTTPException(status_code=404, detail="Image not found in database")

    return Response(content=data, media_type="image/jpeg")
