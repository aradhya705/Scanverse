"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-08-02

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("email", sa.String, nullable=False, unique=True, index=True),
        sa.Column("full_name", sa.String, nullable=True),
        sa.Column("hashed_password", sa.String, nullable=False),
        sa.Column("is_active", sa.Boolean, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    op.create_table(
        "documents",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("owner_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("title", sa.String, server_default="Untitled Scan"),
        sa.Column("category", sa.String, server_default="Uncategorized"),
        sa.Column("tags", sa.JSON, server_default="[]"),
        sa.Column("is_favorite", sa.Boolean, server_default=sa.false()),
        sa.Column("ocr_text", sa.Text, nullable=True),
        sa.Column("ocr_language", sa.String, server_default="en"),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )

    filter_enum = postgresql.ENUM(
        "original",
        "auto",
        "color_boost",
        "clean_document",
        "black_and_white",
        "high_contrast",
        "soft_gray",
        "warm_paper",
        "cool_tone",
        name="filtertype",
    )
    filter_enum.create(op.get_bind(), checkfirst=True)
    # Already created above — prevent create_table from re-issuing CREATE TYPE
    # for this column, which otherwise fails on a fresh database.
    filter_enum_col = postgresql.ENUM(
        "original",
        "auto",
        "color_boost",
        "clean_document",
        "black_and_white",
        "high_contrast",
        "soft_gray",
        "warm_paper",
        "cool_tone",
        name="filtertype",
        create_type=False,
    )

    op.create_table(
        "pages",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("document_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("documents.id"), nullable=False),
        sa.Column("order_index", sa.Integer, server_default="0"),
        sa.Column("original_path", sa.String, nullable=False),
        sa.Column("processed_path", sa.String, nullable=True),
        sa.Column("thumbnail_path", sa.String, nullable=True),
        sa.Column("corners", sa.JSON, nullable=True),
        sa.Column("filter_applied", filter_enum_col, server_default="original"),
        sa.Column("rotation", sa.Integer, server_default="0"),
        sa.Column("brightness", sa.Float, server_default="1.0"),
        sa.Column("contrast", sa.Float, server_default="1.0"),
        sa.Column("saturation", sa.Float, server_default="1.0"),
        sa.Column("sharpness", sa.Float, server_default="1.0"),
        sa.Column("intensity", sa.Float, server_default="1.0"),
        sa.Column("ocr_text", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("pages")
    op.execute("DROP TYPE IF EXISTS filtertype")
    op.drop_table("documents")
    op.drop_table("users")
