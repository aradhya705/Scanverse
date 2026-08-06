"""add extended filter presets

Revision ID: 0002
Revises: 0001
Create Date: 2026-08-03

"""
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

NEW_VALUES = [
    "magic_color",
    "grayscale",
    "soft",
    "bright",
    "dark",
    "blueprint",
    "newspaper",
    "pencil",
    "ink",
    "vintage",
]


def upgrade() -> None:
    # ALTER TYPE ... ADD VALUE cannot run inside the transaction Alembic
    # normally wraps migrations in (PostgreSQL requires it outside any
    # transaction that might also read the new value), so each addition
    # runs in its own autocommit block.
    for value in NEW_VALUES:
        with op.get_context().autocommit_block():
            op.execute(f"ALTER TYPE filtertype ADD VALUE IF NOT EXISTS '{value}'")


def downgrade() -> None:
    # PostgreSQL has no ALTER TYPE ... DROP VALUE — removing enum values
    # requires rebuilding the type, which isn't worth doing for a downgrade
    # of purely additive filter presets. This is a no-op by design.
    pass
