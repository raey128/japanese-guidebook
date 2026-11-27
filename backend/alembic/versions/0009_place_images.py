"""Photos of places from Wikimedia Commons (decided 2026-11-27): the main image of a nearby
Wikipedia article whose title matches the place. Hotlinked from upload.wikimedia.org with the
author and licence for the credit line. A row with no image_url means "looked, none found".

Revision ID: 0009
Revises: 0008
Create Date: 2026-11-27
"""

from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE place_images (
            place_id BIGINT PRIMARY KEY REFERENCES places(id) ON DELETE CASCADE,
            source VARCHAR(20) NOT NULL DEFAULT 'wikimedia',
            image_url TEXT,
            thumb_url TEXT,
            page_url TEXT,
            article_url TEXT,
            author VARCHAR(300),
            license VARCHAR(80),
            checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE place_images")
