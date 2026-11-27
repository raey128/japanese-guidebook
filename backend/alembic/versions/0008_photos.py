"""Review photos (R20), brought back from the parked social-photos branch (decided 2026-11-27:
user photos + Wikimedia photos + poster art). Only the photo tables; follows and avatars stay
parked.

Revision ID: 0008
Revises: 0007
Create Date: 2026-11-27
"""

from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE photos (
            id BIGSERIAL PRIMARY KEY,
            ranking_id BIGINT NOT NULL REFERENCES rankings(id) ON DELETE CASCADE,
            user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            key VARCHAR(80) NOT NULL UNIQUE,
            width INTEGER NOT NULL,
            height INTEGER NOT NULL,
            is_hidden BOOLEAN NOT NULL DEFAULT false,
            report_count INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX ix_photos_ranking ON photos (ranking_id)")
    op.execute("CREATE INDEX ix_photos_user ON photos (user_id, created_at DESC)")
    op.execute(
        """
        CREATE TABLE photo_reports (
            photo_id BIGINT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
            user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (photo_id, user_id)
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE photo_reports")
    op.execute("DROP TABLE photos")
