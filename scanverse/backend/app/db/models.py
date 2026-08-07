import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Column,
    String,
    Integer,
    Float,
    DateTime,
    ForeignKey,
    Text,
    Enum,
    Boolean,
    JSON,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.db.database import Base


def gen_uuid():
    return str(uuid.uuid4())


class FilterType(str, enum.Enum):
    original = "original"
    auto = "auto"
    smart_document = "smart_document"
    color_boost = "color_boost"
    clean_document = "clean_document"
    black_and_white = "black_and_white"
    high_contrast = "high_contrast"
    soft_gray = "soft_gray"
    warm_paper = "warm_paper"
    cool_tone = "cool_tone"
    # extended filter set (added alongside pdf-tools/compression work)
    magic_color = "magic_color"
    grayscale = "grayscale"
    soft = "soft"
    bright = "bright"
    dark = "dark"
    blueprint = "blueprint"
    newspaper = "newspaper"
    pencil = "pencil"
    ink = "ink"
    vintage = "vintage"


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    email = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, nullable=True)
    hashed_password = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    documents = relationship("Document", back_populates="owner", cascade="all, delete-orphan")


class Document(Base):
    __tablename__ = "documents"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    owner_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    title = Column(String, default="Untitled Scan")
    category = Column(String, default="Uncategorized")
    tags = Column(JSON, default=list)
    is_favorite = Column(Boolean, default=False)
    ocr_text = Column(Text, nullable=True)
    ocr_language = Column(String, default="en")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    owner = relationship("User", back_populates="documents")
    pages = relationship(
        "Page", back_populates="document", cascade="all, delete-orphan", order_by="Page.order_index"
    )


class Page(Base):
    __tablename__ = "pages"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    document_id = Column(UUID(as_uuid=False), ForeignKey("documents.id"), nullable=False)
    order_index = Column(Integer, default=0)

    original_path = Column(String, nullable=False)
    processed_path = Column(String, nullable=True)
    thumbnail_path = Column(String, nullable=True)

    corners = Column(JSON, nullable=True)  # [[x,y] x4] detected/adjusted corners
    filter_applied = Column(Enum(FilterType), default=FilterType.original)
    rotation = Column(Integer, default=0)  # degrees, 0/90/180/270

    brightness = Column(Float, default=1.0)
    contrast = Column(Float, default=1.0)
    saturation = Column(Float, default=1.0)
    sharpness = Column(Float, default=1.0)
    intensity = Column(Float, default=1.0)

    ocr_text = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    document = relationship("Document", back_populates="pages")
