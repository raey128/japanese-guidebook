"""Place review status for manual adds (R13): live / pending / rejected.

Pending places are stored hidden (is_hidden = true) so every existing "not hidden" filter keeps
them out of public surfaces; `status` tells pending apart from moderation-hidden.

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-08
"""

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE places ADD COLUMN status VARCHAR(10) NOT NULL DEFAULT 'live' "
        "CHECK (status IN ('live', 'pending', 'rejected'))"
    )
    op.execute("ALTER TABLE places ADD COLUMN review_reason VARCHAR(200)")
    op.execute("ALTER TABLE places ADD COLUMN reviewed_at TIMESTAMPTZ")
    op.execute("CREATE INDEX ix_places_pending ON places (created_at) WHERE status = 'pending'")
    op.execute("CREATE INDEX ix_places_creator_status ON places (creator_id, status)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_places_creator_status")
    op.execute("DROP INDEX IF EXISTS ix_places_pending")
    op.execute("ALTER TABLE places DROP COLUMN reviewed_at")
    op.execute("ALTER TABLE places DROP COLUMN review_reason")
    op.execute("ALTER TABLE places DROP COLUMN status")
