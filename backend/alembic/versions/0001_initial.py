"""Initial schema: identity, geography, places, rankings, scores, bookmarks, flags, geocoding.

Revision ID: 0001
Revises:
Create Date: 2026-11-08
"""

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    # asyncpg prepares each statement, so run them one at a time.
    for statement in SCHEMA.split(";"):
        if statement.strip():
            op.execute(statement)


SCHEMA = """
        CREATE TABLE users (
            id BIGSERIAL PRIMARY KEY,
            username VARCHAR(20) NOT NULL,
            is_admin BOOLEAN NOT NULL DEFAULT false,
            is_private BOOLEAN NOT NULL DEFAULT false,
            is_system BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT ck_users_username CHECK (username ~ '^[a-z0-9_]{3,20}$')
        );
        CREATE UNIQUE INDEX uq_users_username_lower ON users (lower(username));

        CREATE TABLE sessions (
            token_hash VARCHAR(64) PRIMARY KEY,
            user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            expires_at TIMESTAMPTZ NOT NULL
        );
        CREATE INDEX ix_sessions_user_id ON sessions (user_id);

        CREATE TABLE subcategories (
            id SERIAL PRIMARY KEY,
            slug VARCHAR(40) NOT NULL UNIQUE,
            name VARCHAR(80) NOT NULL,
            top_category VARCHAR(20) NOT NULL
        );

        CREATE TABLE cities (
            id SERIAL PRIMARY KEY,
            slug VARCHAR(40) NOT NULL UNIQUE,
            name VARCHAR(80) NOT NULL,
            name_ja VARCHAR(80),
            country_code VARCHAR(2) NOT NULL,
            centroid geometry(Point, 4326) NOT NULL
        );

        CREATE TABLE locations (
            id SERIAL PRIMARY KEY,
            slug VARCHAR(60) NOT NULL UNIQUE,
            name VARCHAR(120) NOT NULL,
            name_ja VARCHAR(120),
            city_id INTEGER NOT NULL REFERENCES cities(id),
            centroid geometry(Point, 4326),
            is_catch_all BOOLEAN NOT NULL DEFAULT false,
            CONSTRAINT ck_locations_centroid CHECK (is_catch_all OR centroid IS NOT NULL)
        );
        CREATE INDEX ix_locations_city_id ON locations (city_id);
        CREATE UNIQUE INDEX uq_locations_one_catch_all ON locations (city_id) WHERE is_catch_all;

        CREATE TABLE places (
            id BIGSERIAL PRIMARY KEY,
            name VARCHAR(200) NOT NULL,
            name_ja VARCHAR(200),
            address TEXT,
            geom geometry(Point, 4326) NOT NULL,
            subcategory_id INTEGER NOT NULL REFERENCES subcategories(id),
            location_id INTEGER NOT NULL REFERENCES locations(id),
            city_id INTEGER NOT NULL REFERENCES cities(id),
            creator_id BIGINT NOT NULL REFERENCES users(id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            is_hidden BOOLEAN NOT NULL DEFAULT false,
            is_closed BOOLEAN NOT NULL DEFAULT false,
            closed_by_reports BOOLEAN NOT NULL DEFAULT false,
            is_seed BOOLEAN NOT NULL DEFAULT false,
            seed_reviewed BOOLEAN NOT NULL DEFAULT false,
            merged_into_id BIGINT REFERENCES places(id)
        );
        CREATE INDEX ix_places_geom ON places USING gist (geom);
        CREATE INDEX ix_places_geog ON places USING gist ((geom::geography));
        CREATE INDEX ix_places_name_trgm ON places USING gin (name gin_trgm_ops);
        CREATE INDEX ix_places_name_ja_trgm ON places USING gin (name_ja gin_trgm_ops);
        CREATE INDEX ix_places_city_subcategory ON places (city_id, subcategory_id);
        CREATE INDEX ix_places_location ON places (location_id);
        CREATE INDEX ix_places_creator_created ON places (creator_id, created_at);

        CREATE TABLE place_stats (
            place_id BIGINT PRIMARY KEY REFERENCES places(id) ON DELETE CASCADE,
            rank_sum DOUBLE PRECISION NOT NULL DEFAULT 0,
            rank_count INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE category_stats (
            city_id INTEGER NOT NULL REFERENCES cities(id),
            subcategory_id INTEGER NOT NULL REFERENCES subcategories(id),
            rank_sum DOUBLE PRECISION NOT NULL DEFAULT 0,
            rank_count INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (city_id, subcategory_id)
        );

        CREATE TABLE rank_lists (
            user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            city_id INTEGER NOT NULL REFERENCES cities(id),
            subcategory_id INTEGER NOT NULL REFERENCES subcategories(id),
            bucket VARCHAR(10) NOT NULL,
            version INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (user_id, city_id, subcategory_id, bucket)
        );

        CREATE TABLE rankings (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            place_id BIGINT NOT NULL REFERENCES places(id),
            city_id INTEGER NOT NULL REFERENCES cities(id),
            subcategory_id INTEGER NOT NULL REFERENCES subcategories(id),
            bucket VARCHAR(10) NOT NULL,
            position INTEGER NOT NULL,
            personal_score DOUBLE PRECISION NOT NULL,
            note TEXT,
            visit_month SMALLINT,
            visit_year SMALLINT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_rankings_user_place UNIQUE (user_id, place_id),
            CONSTRAINT uq_rankings_list_position
                UNIQUE (user_id, city_id, subcategory_id, bucket, position)
                DEFERRABLE INITIALLY DEFERRED,
            CONSTRAINT ck_rankings_bucket CHECK (bucket IN ('liked', 'fine', 'disliked')),
            CONSTRAINT ck_rankings_position CHECK (position >= 1),
            CONSTRAINT ck_rankings_note_len CHECK (char_length(note) <= 1000),
            CONSTRAINT ck_rankings_visit_month CHECK (visit_month BETWEEN 1 AND 12)
        );
        CREATE INDEX ix_rankings_place_id ON rankings (place_id);
        CREATE INDEX ix_rankings_category ON rankings (city_id, subcategory_id);

        CREATE TABLE bookmarks (
            user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            place_id BIGINT NOT NULL REFERENCES places(id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (user_id, place_id)
        );

        CREATE TABLE flags (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            target_type VARCHAR(10) NOT NULL,
            place_id BIGINT REFERENCES places(id),
            ranking_id BIGINT REFERENCES rankings(id) ON DELETE CASCADE,
            flag_type VARCHAR(20) NOT NULL,
            payload JSONB,
            status VARCHAR(10) NOT NULL DEFAULT 'open',
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT ck_flags_target CHECK (
                (target_type = 'place' AND place_id IS NOT NULL AND ranking_id IS NULL)
                OR (target_type = 'note' AND ranking_id IS NOT NULL)
            ),
            CONSTRAINT ck_flags_status CHECK (status IN ('open', 'dismissed', 'resolved'))
        );
        CREATE UNIQUE INDEX uq_flags_place ON flags (user_id, place_id, flag_type)
            WHERE target_type = 'place';
        CREATE UNIQUE INDEX uq_flags_note ON flags (user_id, ranking_id, flag_type)
            WHERE target_type = 'note';
        CREATE INDEX ix_flags_place_id ON flags (place_id);
        CREATE INDEX ix_flags_ranking_id ON flags (ranking_id);

        CREATE TABLE geocode_cache (
            lat_e4 INTEGER NOT NULL,
            lng_e4 INTEGER NOT NULL,
            address TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (lat_e4, lng_e4)
        );

        CREATE TABLE geocode_throttle (
            id INTEGER PRIMARY KEY,
            last_called_at TIMESTAMPTZ
        );
        INSERT INTO geocode_throttle (id, last_called_at) VALUES (1, NULL);

        -- Reserved system user that owns seed places. is_system users can never sign in.
        INSERT INTO users (username, is_system) VALUES ('guidebook', true);
"""


def downgrade() -> None:
    op.execute(
        """
        DROP TABLE IF EXISTS geocode_throttle, geocode_cache, flags, bookmarks, rankings,
            rank_lists, category_stats, place_stats, places, locations, cities, subcategories,
            sessions, users CASCADE;
        """
    )
