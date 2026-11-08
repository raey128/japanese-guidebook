"""Open data dump (R10): places, rankings, notes and public scores as CSV + Parquet.

One folder per UTC day: `<out_base or settings.dump_dir>/YYYY-MM-DD/`, rewritten on every run.
`python -m app.cli dump` (cron) and `make dump` both end up in `write_dump`.

Privacy: the `user` / `creator` columns hold the username for public users and an opaque, stable
id (`anon-` + 16 hex chars of sha256) for private users. Usernames of private users never reach
any file. The id is stable across runs so a private user's rankings can be grouped, but it
cannot be reversed to a username. Set GUIDEBOOK_DUMP_SALT to a private random string to also
make the ids unguessable from internal user ids.

Moderation: hidden places (and so merged-away ones) are excluded together with their rankings,
notes and scores; notes an admin removed are NULL in the database and therefore absent.
"""

import csv
import hashlib
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pyarrow as pa
import pyarrow.parquet as pq
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app import scores
from app.config import get_settings

LICENSE_TEXT = """\
Japanese Guidebook open data dump
=================================

All places, rankings, notes and scores in this dump were contributed by the users of Japanese
Guidebook and are licensed under the Creative Commons Attribution-ShareAlike 4.0 International
licence (CC BY-SA 4.0):

    https://creativecommons.org/licenses/by-sa/4.0/

You may share and adapt the data for any purpose, including commercially, provided you give
appropriate credit and distribute your contributions under the same licence.

Address data (the `address` column of places.csv / places.parquet) is
(c) OpenStreetMap contributors and available under the Open Database Licence (ODbL):

    Address data © OpenStreetMap contributors, ODbL
    https://www.openstreetmap.org/copyright
    https://opendatacommons.org/licenses/odbl/1-0/

Privacy: users with a private profile appear only as an opaque, stable id of the form
"anon-<16 hex characters>" in the `user` and `creator` columns; they have no username here.
Places hidden by moderators, and notes removed by moderators, are not included.

Files: places, rankings, notes and scores, each as .csv and .parquet (same content).
"""

_TS = pa.timestamp("us", tz="UTC")

# name -> arrow schema; column order is the CSV column order.
TABLES: dict[str, pa.Schema] = {
    "places": pa.schema(
        [
            ("id", pa.int64()),
            ("name", pa.string()),
            ("name_ja", pa.string()),
            ("lat", pa.float64()),
            ("lng", pa.float64()),
            ("address", pa.string()),
            ("subcategory", pa.string()),
            ("top_category", pa.string()),
            ("location", pa.string()),
            ("location_name", pa.string()),
            ("city", pa.string()),
            ("city_name", pa.string()),
            ("country_code", pa.string()),
            ("created_at", _TS),
            ("is_closed", pa.bool_()),
            ("creator", pa.string()),
        ]
    ),
    "rankings": pa.schema(
        [
            ("place_id", pa.int64()),
            ("user", pa.string()),
            ("bucket", pa.string()),
            ("position", pa.int32()),
            ("personal_score", pa.float64()),
            ("city", pa.string()),
            ("subcategory", pa.string()),
            ("created_at", _TS),
        ]
    ),
    "notes": pa.schema(
        [
            ("place_id", pa.int64()),
            ("user", pa.string()),
            ("note", pa.string()),
            ("visit_month", pa.int32()),
            ("visit_year", pa.int32()),
            ("created_at", _TS),
        ]
    ),
    "scores": pa.schema(
        [
            ("place_id", pa.int64()),
            ("public_score", pa.float64()),
            ("ranker_count", pa.int32()),
        ]
    ),
}

_VISIBLE = "NOT p.is_hidden AND p.merged_into_id IS NULL"


def dump_user(user_id: int, username: str, is_private: bool) -> str:
    """Username for public users; an opaque, stable id for private ones."""
    if not is_private:
        return username
    salt = os.environ.get("GUIDEBOOK_DUMP_SALT", "")
    digest = hashlib.sha256(f"guidebook-dump:{salt}:{user_id}".encode()).hexdigest()
    return "anon-" + digest[:16]


async def _rows(db: AsyncSession, sql: str, params: dict[str, Any] | None = None) -> list[Any]:
    return list((await db.execute(text(sql), params or {})).all())


async def collect(db: AsyncSession) -> dict[str, list[dict[str, Any]]]:
    """The four tables as lists of dicts (private users already made opaque)."""
    places = []
    for r in await _rows(
        db,
        f"""
        SELECT p.id, p.name, p.name_ja, ST_Y(p.geom) AS lat, ST_X(p.geom) AS lng, p.address,
               sc.slug AS subcategory, sc.top_category, l.slug AS location,
               l.name AS location_name, c.slug AS city, c.name AS city_name, c.country_code,
               p.created_at, p.is_closed, u.id AS uid, u.username, u.is_private
        FROM places p
        JOIN subcategories sc ON sc.id = p.subcategory_id
        JOIN locations l ON l.id = p.location_id
        JOIN cities c ON c.id = p.city_id
        JOIN users u ON u.id = p.creator_id
        WHERE {_VISIBLE}
        ORDER BY p.id
        """,
    ):
        places.append(
            {
                "id": r.id,
                "name": r.name,
                "name_ja": r.name_ja,
                "lat": r.lat,
                "lng": r.lng,
                "address": r.address,
                "subcategory": r.subcategory,
                "top_category": r.top_category,
                "location": r.location,
                "location_name": r.location_name,
                "city": r.city,
                "city_name": r.city_name,
                "country_code": r.country_code,
                "created_at": r.created_at,
                "is_closed": r.is_closed,
                "creator": dump_user(r.uid, r.username, r.is_private),
            }
        )

    rankings = []
    notes = []
    for r in await _rows(
        db,
        f"""
        SELECT r.place_id, r.bucket, r.position, r.personal_score, r.note, r.visit_month,
               r.visit_year, r.created_at, c.slug AS city, sc.slug AS subcategory,
               u.id AS uid, u.username, u.is_private
        FROM rankings r
        JOIN places p ON p.id = r.place_id
        JOIN users u ON u.id = r.user_id
        JOIN cities c ON c.id = r.city_id
        JOIN subcategories sc ON sc.id = r.subcategory_id
        WHERE {_VISIBLE}
        ORDER BY r.place_id, r.id
        """,
    ):
        who = dump_user(r.uid, r.username, r.is_private)
        rankings.append(
            {
                "place_id": r.place_id,
                "user": who,
                "bucket": r.bucket,
                "position": r.position,
                "personal_score": r.personal_score,
                "city": r.city,
                "subcategory": r.subcategory,
                "created_at": r.created_at,
            }
        )
        if r.note is not None and r.note.strip():
            notes.append(
                {
                    "place_id": r.place_id,
                    "user": who,
                    "note": r.note,
                    "visit_month": r.visit_month,
                    "visit_year": r.visit_year,
                    "created_at": r.created_at,
                }
            )

    score_rows = await _rows(
        db,
        f"""
        WITH {scores.place_scores_cte()}
        SELECT s.place_id, s.public_score, s.ranker_count
        FROM place_scores s JOIN places p ON p.id = s.place_id
        WHERE {_VISIBLE}
        ORDER BY s.place_id
        """,
        scores.score_params(),
    )
    score_list = [
        {
            "place_id": r.place_id,
            "public_score": None if r.public_score is None else round(r.public_score, 4),
            "ranker_count": r.ranker_count,
        }
        for r in score_rows
    ]
    return {"places": places, "rankings": rankings, "notes": notes, "scores": score_list}


def _csv_value(value: Any) -> Any:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, datetime):
        return value.astimezone(UTC).isoformat()
    return value


def _write_csv(path: Path, schema: pa.Schema, rows: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f, lineterminator="\n")
        writer.writerow(schema.names)
        for row in rows:
            writer.writerow([_csv_value(row[name]) for name in schema.names])


def _write_parquet(path: Path, schema: pa.Schema, rows: list[dict[str, Any]]) -> None:
    table = pa.Table.from_pylist(rows, schema=schema)
    pq.write_table(table, path)


async def write_dump(db: AsyncSession, out_base: Path | None = None) -> Path:
    """Write today's dump (UTC date) and return its folder. Re-running overwrites the files."""
    base = Path(out_base) if out_base else get_settings().dump_dir
    folder = base / datetime.now(UTC).date().isoformat()
    folder.mkdir(parents=True, exist_ok=True)

    data = await collect(db)
    for name, schema in TABLES.items():
        _write_csv(folder / f"{name}.csv", schema, data[name])
        _write_parquet(folder / f"{name}.parquet", schema, data[name])
    (folder / "LICENSE").write_text(LICENSE_TEXT, encoding="utf-8")
    return folder
