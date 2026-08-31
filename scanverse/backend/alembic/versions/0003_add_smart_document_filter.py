"""add smart_document filter

Revision ID: 0003
Revises: 0002
Create Date: 2026-08-07

"""
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ALTER TYPE ... ADD VALUE cannot run inside the transaction Alembic
    # normally wraps migrations in, so it runs in its own autocommit block.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE filtertype ADD VALUE IF NOT EXISTS 'smart_document'")


def downgrade() -> None:
    # PostgreSQL has no ALTER TYPE ... DROP VALUE — removing enum values
    # requires rebuilding the type. No-op by design (same as 0002).
    pass
