"""Anonymous usage events (R18): raw events (90-day retention) and daily totals.

There is deliberately no user_id, username, IP or user-agent column (R18.2).

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-08
"""

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE events (
            id BIGSERIAL PRIMARY KEY,
            browser_id UUID NOT NULL,
            type VARCHAR(30) NOT NULL,
            source VARCHAR(20),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX ix_events_created ON events (created_at)")
    op.execute("CREATE INDEX ix_events_browser ON events (browser_id, created_at)")
    op.execute(
        """
        CREATE TABLE event_daily (
            day DATE NOT NULL,
            type VARCHAR(30) NOT NULL,
            source VARCHAR(20) NOT NULL DEFAULT '',
            count INTEGER NOT NULL,
            browsers INTEGER NOT NULL,
            PRIMARY KEY (day, type, source)
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE event_daily")
    op.execute("DROP TABLE events")
