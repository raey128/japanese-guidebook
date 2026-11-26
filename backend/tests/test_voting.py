"""Round 1 vote links (V1): load, tap, name, done, closed results, limits."""

from uuid import uuid4

import pytest
from sqlalchemy import text

from app import voting
from app.config import get_settings
from tests.factories import make_place, make_user


@pytest.fixture(autouse=True)
def _fresh_limits():
    voting.reset_rate_limits()
    yield
    voting.reset_rate_limits()


async def make_list(db, n=3, *, group_size=4, open_=True):
    maker = await make_user(db, "vl_maker")
    places = [await make_place(db, name=f"Vote Place {i}", creator=maker) for i in range(n)]
    city = (await db.execute(text("SELECT id FROM cities WHERE slug = 'tokyo'"))).scalar_one()
    token, _ = await voting.create_list(
        db,
        title="Tokyo trip",
        organizer_name="Maya",
        city_id=city,
        items=[
            (p.id, 5 if i == 0 else None, "2026-11-12" if i == 0 else None)
            for i, p in enumerate(places)
        ],
        group_size=group_size,
    )
    if not open_:
        await db.execute(
            text("UPDATE vote_lists SET is_open = false WHERE token = :t"), {"t": token}
        )
    await db.flush()
    return token, places


async def load(client, token, voter=None):
    r = await client.get(f"/api/v/{token}", params={"voter": str(voter)} if voter else None)
    assert r.status_code == 200, r.text
    return r.json()


async def test_vote_page_needs_no_account_and_lists_places_in_order(client, db):
    token, places = await make_list(db)
    assert len(token) >= 32
    page = await load(client, token)
    assert (page["title"], page["organizer_name"], page["city"]["slug"]) == (
        "Tokyo trip",
        "Maya",
        "tokyo",
    )
    assert page["is_open"] is True and page["group_size"] == 4 and page["item_count"] == 3
    assert [i["place"]["name"] for i in page["items"]] == [p.name for p in places]
    first = page["items"][0]
    assert (first["curator_count"], first["evidence_updated"]) == (5, "2026-11-12")
    assert page["items"][1]["curator_count"] is None  # no evidence: no line, never invented
    assert first["tally"] is None and page["me"] is None and page["voter_count"] == 0


async def test_each_tap_saves_and_last_tap_wins(client, db):
    token, _ = await make_list(db)
    me = uuid4()
    items = (await load(client, token))["items"]
    a, b = items[0]["item_id"], items[1]["item_id"]
    for choice in ("yes", "no"):
        r = await client.put(
            f"/api/v/{token}/vote", json={"voter": str(me), "item_id": a, "choice": choice}
        )
        assert r.status_code == 200 and r.json() == {"choice": choice, "voted_count": 1}
    r = await client.put(
        f"/api/v/{token}/vote", json={"voter": str(me), "item_id": b, "choice": "maybe"}
    )
    assert r.json()["voted_count"] == 2
    page = await load(client, token, me)
    assert [i["my_choice"] for i in page["items"]] == ["no", "maybe", None]
    assert page["me"] == {"name": None, "done": False, "voted_count": 2}
    assert page["voter_count"] == 1
    # Another browser is another voter, with its own choices.
    other = await load(client, token, uuid4())
    assert [i["my_choice"] for i in other["items"]] == [None, None, None] and other["me"] is None


async def test_name_done_and_progress(client, db):
    token, _ = await make_list(db, group_size=4)
    me, friend = uuid4(), uuid4()
    item = (await load(client, token))["items"][0]["item_id"]
    assert (
        await client.put(f"/api/v/{token}/name", json={"voter": str(me), "name": "  Ken  "})
    ).status_code == 200
    for v in (me, friend):
        await client.put(
            f"/api/v/{token}/vote", json={"voter": str(v), "item_id": item, "choice": "yes"}
        )
    r = await client.post(f"/api/v/{token}/done", json={"voter": str(me)})
    assert r.status_code == 200 and r.json() == {"voter_count": 2, "group_size": 4}
    page = await load(client, token, me)
    assert page["me"]["name"] == "Ken" and page["me"]["done"] is True
    assert (
        await client.put(f"/api/v/{token}/name", json={"voter": str(me), "name": ""})
    ).status_code == 200
    assert (await load(client, token, me))["me"]["name"] is None
    long = await client.put(f"/api/v/{token}/name", json={"voter": str(me), "name": "x" * 41})
    assert long.status_code == 422


async def test_closed_list_is_read_only_results(client, db):
    token, _ = await make_list(db)
    items = (await load(client, token))["items"]
    voters = [
        (uuid4(), "Ken", ["yes", "no"]),
        (uuid4(), "Aiko", ["yes", "maybe"]),
        (uuid4(), None, ["no", "maybe"]),
    ]
    for v, name, choices in voters:
        if name:
            await client.put(f"/api/v/{token}/name", json={"voter": str(v), "name": name})
        for item, choice in zip(items, choices, strict=False):
            await client.put(
                f"/api/v/{token}/vote",
                json={"voter": str(v), "item_id": item["item_id"], "choice": choice},
            )
    await db.execute(text("UPDATE vote_lists SET is_open = false WHERE token = :t"), {"t": token})
    await db.flush()

    page = await load(client, token, voters[0][0])
    assert page["is_open"] is False
    first, second, third = (i["tally"] for i in page["items"])
    assert (first["yes"], first["maybe"], first["no"]) == (2, 0, 1)
    assert (
        first["yes_names"] == ["Aiko", "Ken"] and first["no_names"] == []
    )  # unnamed: counted only
    assert (second["yes"], second["maybe"], second["no"]) == (0, 2, 1)
    assert third == {
        "yes": 0,
        "maybe": 0,
        "no": 0,
        "yes_names": [],
        "maybe_names": [],
        "no_names": [],
    }

    r = await client.put(
        f"/api/v/{token}/vote",
        json={"voter": str(voters[0][0]), "item_id": items[0]["item_id"], "choice": "no"},
    )
    assert r.status_code == 409 and "closed" in r.json()["detail"]
    assert (
        await client.put(f"/api/v/{token}/name", json={"voter": str(uuid4()), "name": "X"})
    ).status_code == 409


async def test_bad_links_and_items(client, db):
    token, _ = await make_list(db)
    other_token, _ = await make_list_two(db)
    foreign_item = (await load(client, other_token))["items"][0]["item_id"]
    assert (await client.get("/api/v/not-a-real-token")).status_code == 404
    r = await client.put(
        f"/api/v/{token}/vote",
        json={"voter": str(uuid4()), "item_id": foreign_item, "choice": "yes"},
    )
    assert r.status_code == 404
    bad = await client.put(
        f"/api/v/{token}/vote", json={"voter": "nope", "item_id": foreign_item, "choice": "yes"}
    )
    assert bad.status_code == 422
    bad = await client.put(
        f"/api/v/{token}/vote",
        json={"voter": str(uuid4()), "item_id": foreign_item, "choice": "love"},
    )
    assert bad.status_code == 422


async def make_list_two(db):
    maker = await make_user(db, "vl_maker2")
    place = await make_place(db, name="Elsewhere Place", creator=maker)
    city = (await db.execute(text("SELECT id FROM cities WHERE slug = 'tokyo'"))).scalar_one()
    return await voting.create_list(
        db, title="Other", organizer_name="Jo", city_id=city, items=[(place.id, None, None)]
    )


async def test_rate_limited_per_voter_and_per_link(client, db, monkeypatch):
    token, _ = await make_list(db)
    item = (await load(client, token))["items"][0]["item_id"]
    monkeypatch.setattr(get_settings(), "vote_writes_per_voter_per_minute", 3)
    monkeypatch.setattr(get_settings(), "vote_writes_per_list_per_minute", 5)
    me = uuid4()
    codes = [
        (
            await client.put(
                f"/api/v/{token}/vote", json={"voter": str(me), "item_id": item, "choice": "yes"}
            )
        ).status_code
        for _ in range(4)
    ]
    assert codes == [200, 200, 200, 429]
    other = [
        (
            await client.put(
                f"/api/v/{token}/vote",
                json={"voter": str(uuid4()), "item_id": item, "choice": "yes"},
            )
        ).status_code
        for _ in range(3)
    ]
    assert other == [200, 200, 429]  # the link's 5 per minute are used up


async def test_vote_demo_command(db):
    from app.cli.commands import run_in_session

    maker = await make_user(db, "demo_maker")
    for i in range(3):
        await make_place(db, name=f"Demo Place {i}", creator=maker)

    out = await run_in_session(
        db, "vote-demo", {"token": "demo-test-token-0000000000000000", "closed": True}
    )
    assert "/v/demo-test-token-0000000000000000" in out
    row = (
        await db.execute(
            text(
                "SELECT is_open, (SELECT count(*) FROM vote_items i WHERE i.list_id = l.id) AS n "
                "FROM vote_lists l WHERE token = 'demo-test-token-0000000000000000'"
            )
        )
    ).one()
    assert row.is_open is False and row.n >= 1
