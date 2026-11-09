"""Seeding: curated geography (upsert by slug) and seed places (idempotent by name + 50 m).

Any bad row fails the whole run: functions raise SeedError before anything is committed,
and callers roll back.
"""

import csv
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import TOP_CATEGORIES, Location, Subcategory, User


class SeedError(Exception):
    pass


@dataclass
class SeedReport:
    created: int = 0
    updated: int = 0
    skipped: int = 0


def _read_csv(path: Path, required: list[str]) -> list[dict[str, str]]:
    if not path.exists():
        raise SeedError(f"{path}: file not found")
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        missing = [c for c in required if c not in (reader.fieldnames or [])]
        if missing:
            raise SeedError(f"{path.name}: missing columns {missing}")
        return [{k: (v or "").strip() for k, v in row.items()} for row in reader]


def _float(value: str, what: str, where: str) -> float:
    try:
        return float(value)
    except ValueError:
        raise SeedError(f"{where}: {what} {value!r} is not a number") from None


def _check(errors: list[str]) -> None:
    if errors:
        raise SeedError("\n".join(errors))


async def seed_locations(db: AsyncSession, data_dir: Path | None = None) -> dict[str, SeedReport]:
    """Load subcategories, cities and locations from CSV, upserting by slug."""
    data_dir = data_dir or get_settings().data_dir
    subcats = _read_csv(data_dir / "subcategories.csv", ["slug", "name", "top_category"])
    cities = _read_csv(
        data_dir / "cities.csv", ["slug", "name", "name_ja", "country_code", "lat", "lng"]
    )
    locations = _read_csv(
        data_dir / "locations.csv",
        ["slug", "name", "name_ja", "city", "lat", "lng", "is_catch_all"],
    )

    errors: list[str] = []
    for n, row in enumerate(subcats, start=2):
        where = f"subcategories.csv line {n}"
        if not row["slug"] or not row["name"]:
            errors.append(f"{where}: slug and name are required")
        if row["top_category"] not in TOP_CATEGORIES:
            errors.append(f"{where}: unknown top_category {row['top_category']!r}")
    for n, row in enumerate(cities, start=2):
        where = f"cities.csv line {n}"
        if not row["slug"] or not row["name"]:
            errors.append(f"{where}: slug and name are required")
        if len(row["country_code"]) != 2:
            errors.append(f"{where}: country_code must be 2 letters")
        try:
            _float(row["lat"], "lat", where), _float(row["lng"], "lng", where)
        except SeedError as e:
            errors.append(str(e))
    city_slugs = {r["slug"] for r in cities}
    catch_all_cities: list[str] = []
    for n, row in enumerate(locations, start=2):
        where = f"locations.csv line {n}"
        if not row["slug"] or not row["name"]:
            errors.append(f"{where}: slug and name are required")
        if row["city"] not in city_slugs:
            errors.append(f"{where}: unknown city {row['city']!r}")
        if row["is_catch_all"] not in ("true", "false"):
            errors.append(f"{where}: is_catch_all must be true or false")
        if row["is_catch_all"] == "true":
            catch_all_cities.append(row["city"])
        elif not row["lat"] or not row["lng"]:
            errors.append(f"{where}: a named location needs lat and lng")
        else:
            try:
                _float(row["lat"], "lat", where), _float(row["lng"], "lng", where)
            except SeedError as e:
                errors.append(str(e))
    for slug in city_slugs:
        if catch_all_cities.count(slug) != 1:
            errors.append(f"locations.csv: city {slug!r} needs exactly one catch-all location")
    _check(errors)

    reports = {"subcategories": SeedReport(), "cities": SeedReport(), "locations": SeedReport()}
    for row in subcats:
        inserted = (
            await db.execute(
                text(
                    """
                    INSERT INTO subcategories (slug, name, top_category)
                    VALUES (:slug, :name, :top)
                    ON CONFLICT (slug) DO UPDATE
                        SET name = EXCLUDED.name, top_category = EXCLUDED.top_category
                    RETURNING (xmax = 0) AS inserted
                    """
                ),
                {"slug": row["slug"], "name": row["name"], "top": row["top_category"]},
            )
        ).scalar_one()
        _count(reports["subcategories"], inserted)
    for row in cities:
        inserted = (
            await db.execute(
                text(
                    """
                    INSERT INTO cities (slug, name, name_ja, country_code, centroid)
                    VALUES (:slug, :name, :name_ja, :cc, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326))
                    ON CONFLICT (slug) DO UPDATE
                        SET name = EXCLUDED.name, name_ja = EXCLUDED.name_ja,
                            country_code = EXCLUDED.country_code, centroid = EXCLUDED.centroid
                    RETURNING (xmax = 0) AS inserted
                    """
                ),
                {
                    "slug": row["slug"],
                    "name": row["name"],
                    "name_ja": row["name_ja"] or None,
                    "cc": row["country_code"].upper(),
                    "lat": float(row["lat"]),
                    "lng": float(row["lng"]),
                },
            )
        ).scalar_one()
        _count(reports["cities"], inserted)
    for row in locations:
        catch_all = row["is_catch_all"] == "true"
        inserted = (
            await db.execute(
                text(
                    """
                    INSERT INTO locations (slug, name, name_ja, city_id, centroid, is_catch_all)
                    VALUES (
                        :slug, :name, :name_ja,
                        (SELECT id FROM cities WHERE slug = :city),
                        CASE WHEN CAST(:has_point AS boolean)
                             THEN ST_SetSRID(ST_MakePoint(:lng, :lat), 4326) END,
                        :catch_all
                    )
                    ON CONFLICT (slug) DO UPDATE
                        SET name = EXCLUDED.name, name_ja = EXCLUDED.name_ja,
                            city_id = EXCLUDED.city_id, centroid = EXCLUDED.centroid,
                            is_catch_all = EXCLUDED.is_catch_all
                    RETURNING (xmax = 0) AS inserted
                    """
                ),
                {
                    "slug": row["slug"],
                    "name": row["name"],
                    "name_ja": row["name_ja"] or None,
                    "city": row["city"],
                    "has_point": not catch_all,
                    "lat": 0.0 if catch_all else float(row["lat"]),
                    "lng": 0.0 if catch_all else float(row["lng"]),
                    "catch_all": catch_all,
                },
            )
        ).scalar_one()
        _count(reports["locations"], inserted)
    await db.flush()
    return reports


def _count(report: SeedReport, inserted: bool) -> None:
    if inserted:
        report.created += 1
    else:
        report.updated += 1


async def system_user(db: AsyncSession) -> User:
    result = await db.execute(select(User).where(User.username == "guidebook", User.is_system))
    user = result.scalar_one_or_none()
    if user is None:
        raise SeedError("The reserved system user 'guidebook' is missing; run migrations first.")
    return user


async def seed_places(db: AsyncSession, csv_path: Path | None = None) -> SeedReport:
    """Load seed places as Unverified places owned by `guidebook`.

    Fails the whole run on an unknown subcategory or location. A row matching an existing
    place by name (case-insensitive) within 50 m is skipped, so reruns create nothing.
    """
    csv_path = csv_path or get_settings().data_dir / "seed_places.csv"
    rows = _read_csv(csv_path, ["name", "name_ja", "lat", "lng", "subcategory", "location"])
    subcats = {s.slug: s for s in (await db.execute(select(Subcategory))).scalars()}
    locs = {loc.slug: loc for loc in (await db.execute(select(Location))).scalars()}

    errors: list[str] = []
    for n, row in enumerate(rows, start=2):
        where = f"{csv_path.name} line {n}"
        if not row["name"]:
            errors.append(f"{where}: name is required")
        if row["subcategory"] not in subcats:
            errors.append(f"{where}: unknown subcategory {row['subcategory']!r}")
        if row["location"] not in locs:
            errors.append(f"{where}: unknown location {row['location']!r}")
        try:
            lat = _float(row["lat"], "lat", where)
            lng = _float(row["lng"], "lng", where)
            if not (-90 <= lat <= 90 and -180 <= lng <= 180):
                errors.append(f"{where}: coordinates out of range")
        except SeedError as e:
            errors.append(str(e))
    _check(errors)

    owner = await system_user(db)
    radius = get_settings().seed_duplicate_m
    report = SeedReport()
    for row in rows:
        params = {"name": row["name"], "lat": float(row["lat"]), "lng": float(row["lng"])}
        exists = (
            await db.execute(
                text(
                    """
                    SELECT 1 FROM places
                    WHERE lower(name) = lower(:name)
                      AND ST_DWithin(geom::geography,
                                     ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
                                     :radius)
                    LIMIT 1
                    """
                ),
                {**params, "radius": radius},
            )
        ).first()
        if exists:
            report.skipped += 1
            continue
        loc = locs[row["location"]]
        await db.execute(
            text(
                """
                INSERT INTO places (name, name_ja, geom, subcategory_id, location_id, city_id,
                                    creator_id, is_seed)
                VALUES (:name, :name_ja, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326),
                        :subcategory_id, :location_id, :city_id, :creator_id, true)
                """
            ),
            {
                **params,
                "name_ja": row["name_ja"] or None,
                "subcategory_id": subcats[row["subcategory"]].id,
                "location_id": loc.id,
                "city_id": loc.city_id,
                "creator_id": owner.id,
            },
        )
        report.created += 1
    await db.flush()
    return report
