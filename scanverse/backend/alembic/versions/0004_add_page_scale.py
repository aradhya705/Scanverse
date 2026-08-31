"""add page scale column

Revision ID: 0004
Revises: 0003
Create Date: 2026-08-07

"""
import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("pages", sa.Column("scale", sa.Float(), nullable=False, server_default="1.0"))


def downgrade() -> None:
    op.drop_column("pages", "scale")
