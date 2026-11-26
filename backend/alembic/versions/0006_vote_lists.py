"""Round 1: group vote links (V1). An organizer's list of places, shared by one link; friends
vote yes / maybe / no without an account.

Revision ID: 0006
Revises: 0004
Create Date: 2026-11-27

Note: 0005 belongs to the parked `social-photos` branch. If that branch is ever merged, set this
migration's down_revision to "0005" so the history stays one line.
"""

from alembic import op

revision = "0006"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE vote_lists (
            id BIGSERIAL PRIMARY KEY,
            -- The voting link. Long and random; never listed anywhere public (V1.2).
            token VARCHAR(64) NOT NULL UNIQUE,
            -- For the organizer's private edit link (step 2); not used by voters.
            edit_token VARCHAR(64) NOT NULL UNIQUE,
            title VARCHAR(120) NOT NULL,
            organizer_name VARCHAR(40) NOT NULL,
            city_id INTEGER NOT NULL REFERENCES cities(id),
            -- "3 of 4 have voted"; null shows "3 people have voted" (V1.6).
            group_size SMALLINT CHECK (group_size BETWEEN 1 AND 50),
            is_open BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE TABLE vote_items (
            id BIGSERIAL PRIMARY KEY,
            list_id BIGINT NOT NULL REFERENCES vote_lists(id) ON DELETE CASCADE,
            place_id BIGINT NOT NULL REFERENCES places(id),
            position SMALLINT NOT NULL,
            -- Evidence line from the curators' plans: "Ranked by 5 curators · updated 12 Nov".
            -- Honest counts only (no invented numbers); null hides the line.
            curator_count SMALLINT CHECK (curator_count >= 1),
            evidence_updated DATE,
            CONSTRAINT uq_vote_items_place UNIQUE (list_id, place_id)
        )
        """
    )
    op.execute("CREATE INDEX ix_vote_items_list ON vote_items (list_id, position)")
    op.execute(
        """
        CREATE TABLE voters (
            id BIGSERIAL PRIMARY KEY,
            list_id BIGINT NOT NULL REFERENCES vote_lists(id) ON DELETE CASCADE,
            -- Random id kept in the voter's browser; another device is another voter (V1.3).
            voter_key UUID NOT NULL,
            name VARCHAR(40),
            done_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_voters_key UNIQUE (list_id, voter_key)
        )
        """
    )
    op.execute(
        """
        CREATE TABLE votes (
            voter_id BIGINT NOT NULL REFERENCES voters(id) ON DELETE CASCADE,
            item_id BIGINT NOT NULL REFERENCES vote_items(id) ON DELETE CASCADE,
            choice VARCHAR(5) NOT NULL CHECK (choice IN ('yes', 'maybe', 'no')),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (voter_id, item_id)
        )
        """
    )
    op.execute("CREATE INDEX ix_votes_item ON votes (item_id)")


def downgrade() -> None:
    op.execute("DROP TABLE votes")
    op.execute("DROP TABLE voters")
    op.execute("DROP TABLE vote_items")
    op.execute("DROP TABLE vote_lists")
