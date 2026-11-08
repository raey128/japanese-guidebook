from pathlib import Path

import pytest
from sqlalchemy import text

from app.cli.commands import CommandError, run_in_session
from app.config import get_settings
from app.seeding import SeedError, seed_locations, seed_places


async def count(db, sql: str) -> int:
    return (await db.execute(text(sql))).scalar_one()


async def test_geography_is_loaded(db):
    assert await count(db, "SELECT count(*) FROM subcategories") == 27
    assert await count(db, "SELECT count(*) FROM cities") == 8
    assert await count(db, "SELECT count(*) FROM locations") == 70
    assert await count(db, "SELECT count(*) FROM locations WHERE is_catch_all") == 8
    assert await count(db, "SELECT count(*) FROM cities WHERE country_code = 'JP'") == 8


async def test_seed_locations_rerun_upserts_without_duplicates(db):
    message = await run_in_session(db, "seed-locations", {})
    assert "0 created" in message
    assert await count(db, "SELECT count(*) FROM locations") == 70


async def test_seed_locations_upserts_changed_names(db, tmp_path: Path):
    data = get_settings().data_dir
    for name in ("subcategories.csv", "cities.csv", "locations.csv"):
        (tmp_path / name).write_text((data / name).read_text(encoding="utf-8"), encoding="utf-8")
    p = tmp_path / "locations.csv"
    p.write_text(p.read_text(encoding="utf-8").replace("Asakusa,浅草", "Asakusa Area,浅草"), encoding="utf-8")
    await seed_locations(db, tmp_path)
    assert (await db.execute(text("SELECT name FROM locations WHERE slug='asakusa'"))).scalar_one() == "Asakusa Area"


async def test_seed_locations_bad_row_fails_whole_run(db, tmp_path: Path):
    data = get_settings().data_dir
    for name in ("subcategories.csv", "cities.csv"):
        (tmp_path / name).write_text((data / name).read_text(encoding="utf-8"), encoding="utf-8")
    (tmp_path / "locations.csv").write_text(
        (data / "locations.csv").read_text(encoding="utf-8") + "newplace,New,,atlantis,1,1,false\n",
        encoding="utf-8",
    )
    with pytest.raises(SeedError, match="unknown city 'atlantis'"):
        await seed_locations(db, tmp_path)
    assert await count(db, "SELECT count(*) FROM locations WHERE slug='newplace'") == 0


async def test_seed_places_loads_unverified_places_owned_by_guidebook(db, client):
    message = await run_in_session(db, "seed-places", {})
    assert "225 created" in message
    assert await count(db, "SELECT count(*) FROM places") == 225
    assert await count(
        db,
        "SELECT count(*) FROM places p JOIN users u ON u.id = p.creator_id "
        "WHERE u.username = 'guidebook' AND p.is_seed AND NOT p.seed_reviewed",
    ) == 225
    place_id = (await db.execute(text("SELECT id FROM places WHERE name = 'Senso-ji'"))).scalar_one()
    r = await client.get(f"/api/places/{place_id}")
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Senso-ji"
    assert body["name_ja"] == "浅草寺"
    assert body["location"]["slug"] == "asakusa"
    assert body["city"]["slug"] == "tokyo"
    assert body["subcategory"]["slug"] == "temple"
    assert body["badges"] == ["unverified"]
    assert body["public_score"] is None
    assert body["creator"] == "guidebook"
    assert body["lat"] == pytest.approx(35.7148)


async def test_seed_places_rerun_creates_no_duplicates(db):
    await run_in_session(db, "seed-places", {})
    message = await run_in_session(db, "seed-places", {})
    assert "0 created, 225 already present" in message
    assert await count(db, "SELECT count(*) FROM places") == 225


@pytest.mark.parametrize(
    "row, error",
    [
        ("Mystery,,35.71,139.79,ramen,atlantis\n", "unknown location 'atlantis'"),
        ("Mystery,,35.71,139.79,pizza,asakusa\n", "unknown subcategory 'pizza'"),
    ],
)
async def test_seed_places_unknown_reference_fails_whole_run(db, tmp_path: Path, row, error):
    csv_path = tmp_path / "seed.csv"
    good = (get_settings().data_dir / "seed_places.csv").read_text(encoding="utf-8")
    csv_path.write_text(good + row, encoding="utf-8")
    with pytest.raises(SeedError, match=error):
        await seed_places(db, csv_path)
    assert await count(db, "SELECT count(*) FROM places") == 0


async def test_seed_command_reports_failure(db, monkeypatch, tmp_path: Path):
    bad = tmp_path / "seed_places.csv"
    bad.write_text("name,name_ja,lat,lng,subcategory,location\nX,,1,1,pizza,asakusa\n", encoding="utf-8")
    for name in ("subcategories.csv", "cities.csv", "locations.csv"):
        (tmp_path / name).write_text((get_settings().data_dir / name).read_text(encoding="utf-8"), encoding="utf-8")
    monkeypatch.setattr(get_settings(), "data_dir", tmp_path)
    with pytest.raises(CommandError):
        await run_in_session(db, "seed-places", {})
