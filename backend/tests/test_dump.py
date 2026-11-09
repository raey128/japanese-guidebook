"""Open data dump via the CLI seam."""

import csv
import re
from datetime import UTC, datetime
from pathlib import Path

import pyarrow.parquet as pq
from sqlalchemy import text

from app import scores
from app.cli.commands import run_in_session
from app.config import get_settings
from tests.mod_helpers import make_place, make_user, rank

TABLES = ("places", "rankings", "notes", "scores")
ANON = re.compile(r"^anon-[0-9a-f]{16}$")


def today_folder(base: Path) -> Path:
    return base / datetime.now(UTC).date().isoformat()


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


async def scenario(db):
    """pubalice (public) and sneaky_sam (private) with one hidden place and one removed note."""
    pub = await make_user(db, "pubalice")
    priv = await make_user(db, "sneaky_sam", is_private=True)
    p1 = await make_place(
        db, name="Dump Ramen", name_ja="ダンプラーメン", creator=pub, lat=35.7120, lng=139.7960
    )
    p2 = await make_place(db, name="Dump Cafe", creator=priv, subcategory_slug="cafe")
    hidden = await make_place(db, name="Hidden Gem Zzz", creator=pub)
    await db.execute(
        text("UPDATE places SET address = 'Taito City, Tokyo, Japan' WHERE id = :id"), {"id": p1.id}
    )

    r1 = await rank(db, pub, p1, note="Great broth, long queue")
    r1.visit_month, r1.visit_year = 4, 2025
    await rank(db, priv, p1, note="Secret verdict")
    await rank(db, pub, p2)  # no note
    await rank(db, priv, p2)  # note later removed by an admin (NULL)
    await rank(db, pub, hidden, position=2, note="Hidden note text")
    await rank(db, priv, hidden, position=2, note="Another hidden note")
    hidden.is_hidden = True
    await db.flush()
    await scores.refresh_place(db, hidden.id)
    return pub, priv, p1, p2, hidden


async def test_dump_writes_all_files_and_license(db, tmp_path):
    await scenario(db)
    message = await run_in_session(db, "dump", {"out": str(tmp_path)})
    folder = today_folder(tmp_path)
    assert str(folder) in message
    assert sorted(p.name for p in folder.iterdir()) == sorted(
        [f"{t}.{ext}" for t in TABLES for ext in ("csv", "parquet")] + ["LICENSE"]
    )
    license_text = (folder / "LICENSE").read_text(encoding="utf-8")
    assert "CC BY-SA 4.0" in license_text
    assert "creativecommons.org/licenses/by-sa/4.0" in license_text
    assert "Address data © OpenStreetMap contributors, ODbL" in license_text


async def test_dump_csv_contents(db, tmp_path):
    pub, priv, p1, p2, hidden = await scenario(db)
    await run_in_session(db, "dump", {"out": str(tmp_path)})
    folder = today_folder(tmp_path)

    places = {r["name"]: r for r in read_csv(folder / "places.csv")}
    assert set(places) == {"Dump Ramen", "Dump Cafe"}
    ramen = places["Dump Ramen"]
    assert ramen["id"] == str(p1.id)
    assert ramen["name_ja"] == "ダンプラーメン"
    assert float(ramen["lat"]) == 35.712 and float(ramen["lng"]) == 139.796
    assert ramen["address"] == "Taito City, Tokyo, Japan"
    assert ramen["subcategory"] == "ramen" and ramen["top_category"] == "food"
    assert ramen["location"] == "asakusa" and ramen["location_name"]
    assert ramen["city"] == "tokyo" and ramen["city_name"] == "Tokyo"
    assert ramen["country_code"] == "JP"
    assert ramen["is_closed"] == "false"
    assert ramen["creator"] == "pubalice"
    assert ramen["created_at"].endswith("+00:00")
    cafe = places["Dump Cafe"]
    assert cafe["name_ja"] == "" and cafe["address"] == ""
    assert ANON.match(cafe["creator"])

    rankings = read_csv(folder / "rankings.csv")
    assert {int(r["place_id"]) for r in rankings} == {p1.id, p2.id}
    assert len(rankings) == 4
    mine = next(r for r in rankings if r["place_id"] == str(p1.id) and r["user"] == "pubalice")
    assert (mine["bucket"], mine["position"], mine["city"], mine["subcategory"]) == (
        "liked",
        "1",
        "tokyo",
        "ramen",
    )
    assert 6.7 <= float(mine["personal_score"]) <= 10

    notes = read_csv(folder / "notes.csv")
    by_text = {n["note"]: n for n in notes}
    assert set(by_text) == {"Great broth, long queue", "Secret verdict"}
    assert by_text["Great broth, long queue"]["user"] == "pubalice"
    assert by_text["Great broth, long queue"]["visit_month"] == "4"
    assert by_text["Great broth, long queue"]["visit_year"] == "2025"
    assert ANON.match(by_text["Secret verdict"]["user"])
    assert by_text["Secret verdict"]["visit_month"] == ""

    score_rows = {int(r["place_id"]): r for r in read_csv(folder / "scores.csv")}
    assert set(score_rows) == {p1.id, p2.id}
    assert score_rows[p1.id]["ranker_count"] == "2"
    assert 0 < float(score_rows[p1.id]["public_score"]) < 10


async def test_dump_parquet_matches_csv(db, tmp_path):
    await scenario(db)
    await run_in_session(db, "dump", {"out": str(tmp_path)})
    folder = today_folder(tmp_path)
    for table in TABLES:
        csv_rows = read_csv(folder / f"{table}.csv")
        parquet = pq.read_table(folder / f"{table}.parquet")
        rows = parquet.to_pylist()
        assert parquet.column_names == list(csv_rows[0].keys())
        assert len(rows) == len(csv_rows)

    places = pq.read_table(folder / "places.parquet").to_pylist()
    ramen = next(r for r in places if r["name"] == "Dump Ramen")
    assert ramen["lat"] == 35.712 and ramen["is_closed"] is False
    assert ramen["created_at"].tzinfo is not None
    assert ramen["creator"] == "pubalice"

    rankings = pq.read_table(folder / "rankings.parquet").to_pylist()
    assert {(r["user"], r["position"]) for r in rankings if r["user"] == "pubalice"} == {
        ("pubalice", 1)
    }
    notes = pq.read_table(folder / "notes.parquet").to_pylist()
    assert sorted(n["note"] for n in notes) == ["Great broth, long queue", "Secret verdict"]
    scores_rows = pq.read_table(folder / "scores.parquet").to_pylist()
    assert all(isinstance(s["ranker_count"], int) for s in scores_rows)


async def test_private_users_are_only_opaque_ids(db, tmp_path):
    pub, priv, p1, p2, hidden = await scenario(db)
    await run_in_session(db, "dump", {"out": str(tmp_path)})
    folder = today_folder(tmp_path)

    for path in folder.iterdir():
        data = path.read_bytes()
        assert b"sneaky_sam" not in data, path.name
        assert b"sneaky" not in data, path.name

    anon_ids = {r["user"] for r in read_csv(folder / "rankings.csv") if r["user"] != "pubalice"} | {
        r["creator"] for r in read_csv(folder / "places.csv") if r["creator"] != "pubalice"
    }
    assert len(anon_ids) == 1 and ANON.match(next(iter(anon_ids)))

    # The id is stable across runs, so a private user's rankings stay linkable.
    await run_in_session(db, "dump", {"out": str(tmp_path)})
    again = {r["user"] for r in read_csv(folder / "rankings.csv") if r["user"] != "pubalice"}
    assert again == anon_ids


async def test_hidden_places_and_their_data_are_absent(db, tmp_path):
    pub, priv, p1, p2, hidden = await scenario(db)
    await run_in_session(db, "dump", {"out": str(tmp_path)})
    folder = today_folder(tmp_path)
    for path in folder.iterdir():
        data = path.read_bytes()
        assert b"Hidden Gem Zzz" not in data, path.name
        assert b"Hidden note text" not in data, path.name
        assert b"Another hidden note" not in data, path.name
    for table in ("rankings", "notes", "scores"):
        assert all(int(r["place_id"]) != hidden.id for r in read_csv(folder / f"{table}.csv"))


async def test_merged_places_are_absent(db, tmp_path):
    pub = await make_user(db, "mergedpub")
    survivor = await make_place(db, name="Survivor Place", creator=pub)
    gone = await make_place(db, name="Merged Away Place", creator=pub)
    gone.merged_into_id = survivor.id
    gone.is_hidden = True
    await db.flush()
    await run_in_session(db, "dump", {"out": str(tmp_path)})
    names = {r["name"] for r in read_csv(today_folder(tmp_path) / "places.csv")}
    assert names == {"Survivor Place"}


async def test_rerun_overwrites_cleanly(db, tmp_path):
    pub, priv, p1, p2, hidden = await scenario(db)
    await run_in_session(db, "dump", {"out": str(tmp_path)})
    folder = today_folder(tmp_path)
    assert len(read_csv(folder / "places.csv")) == 2

    # Moderation changes between runs: the second dump reflects them, with no leftovers.
    p2.is_hidden = True
    await db.flush()
    await scores.refresh_place(db, p2.id)
    await run_in_session(db, "dump", {"out": str(tmp_path)})
    assert [r["name"] for r in read_csv(folder / "places.csv")] == ["Dump Ramen"]
    assert len(pq.read_table(folder / "places.parquet")) == 1
    assert {int(r["place_id"]) for r in read_csv(folder / "rankings.csv")} == {p1.id}
    assert sorted(p.name for p in tmp_path.iterdir()) == [folder.name]
    assert len(list(folder.iterdir())) == 9


async def test_default_output_directory_is_the_configured_dump_dir(db, tmp_path):
    settings = get_settings()
    previous = settings.dump_dir
    settings.dump_dir = tmp_path / "dumps"
    try:
        await scenario(db)
        await run_in_session(db, "dump", {})
    finally:
        settings.dump_dir = previous
    assert (today_folder(tmp_path / "dumps") / "places.csv").exists()
