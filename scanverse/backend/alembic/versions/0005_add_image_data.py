"""add image binary data columns to pages

Revision ID: 0005
Revises: 0004
Create Date: 2026-08-31

"""
import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("pages", sa.Column("original_data", sa.LargeBinary(), nullable=True))
    op.add_column("pages", sa.Column("processed_data", sa.LargeBinary(), nullable=True))
    op.alter_column("pages", "original_path", nullable=True)


def downgrade() -> None:
    op.drop_column("pages", "processed_data")
    op.drop_column("pages", "original_data")
