"""Star rating (1-5) on rankings (R3.6). Nullable: rankings made before ratings have none.

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-09
"""

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE rankings ADD COLUMN rating SMALLINT "
        "CONSTRAINT ck_rankings_rating CHECK (rating BETWEEN 1 AND 5)"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE rankings DROP COLUMN rating")
