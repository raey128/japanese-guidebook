"""Shared lists (decided 2026-11-27): a vote list belongs to the signed-in user who made it.
Demo lists keep a null owner. `is_open` now means "Let friends vote".

Revision ID: 0010
Revises: 0009
Create Date: 2026-11-27
"""

from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE vote_lists ADD COLUMN owner_id BIGINT REFERENCES users(id) ON DELETE CASCADE, "
        "ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now()"
    )
    op.execute("CREATE INDEX ix_vote_lists_owner ON vote_lists (owner_id, updated_at DESC)")


def downgrade() -> None:
    op.execute("DROP INDEX ix_vote_lists_owner")
    op.execute("ALTER TABLE vote_lists DROP COLUMN owner_id, DROP COLUMN updated_at")
