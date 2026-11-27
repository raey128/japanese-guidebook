"""Community lists (decided 2026-11-27): an owner can show a shared list on Community lists,
where anyone can browse lists other people made. Off by default: links stay unlisted.

Revision ID: 0011
Revises: 0010
Create Date: 2026-11-27
"""

from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE vote_lists ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT false")
    op.execute(
        "CREATE INDEX ix_vote_lists_public ON vote_lists (city_id, updated_at DESC) WHERE is_public"
    )


def downgrade() -> None:
    op.execute("DROP INDEX ix_vote_lists_public")
    op.execute("ALTER TABLE vote_lists DROP COLUMN is_public")
