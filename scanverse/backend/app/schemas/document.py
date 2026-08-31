from pydantic import BaseModel, ConfigDict
from datetime import datetime

from app.schemas.page import PageOut


class DocumentUpdate(BaseModel):
    title: str | None = None
    category: str | None = None
    tags: list[str] | None = None
    is_favorite: bool | None = None


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    category: str
    tags: list[str]
    is_favorite: bool
    ocr_text: str | None
    ocr_language: str
    created_at: datetime
    updated_at: datetime
    pages: list[PageOut] = []


class DocumentListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    category: str
    tags: list[str]
    is_favorite: bool
    created_at: datetime
    updated_at: datetime
    page_count: int = 0
