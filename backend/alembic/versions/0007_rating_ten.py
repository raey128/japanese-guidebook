"""Ratings become numbers from 1 to 10 (R3.6, decided 2026-11-27). Existing 1-5 star ratings
are doubled (5 -> 10, 4 -> 8, 3 -> 6, 2 -> 4, 1 -> 2), which keeps their bucket.

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-27
"""

from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE rankings DROP CONSTRAINT ck_rankings_rating")
    op.execute("UPDATE rankings SET rating = rating * 2 WHERE rating IS NOT NULL")
    op.execute(
        "ALTER TABLE rankings ADD CONSTRAINT ck_rankings_rating CHECK (rating BETWEEN 1 AND 10)"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE rankings DROP CONSTRAINT ck_rankings_rating")
    op.execute(
        "UPDATE rankings SET rating = GREATEST(1, (rating + 1) / 2) WHERE rating IS NOT NULL"
    )
    op.execute(
        "ALTER TABLE rankings ADD CONSTRAINT ck_rankings_rating CHECK (rating BETWEEN 1 AND 5)"
    )
