"""Flags: payload rules, uniqueness, own-content refusal and the two 3-flagger thresholds."""

import pytest
from sqlalchemy import text

from app import ranking
from app.config import get_settings
from tests.mod_helpers import (
    category_count,
    flag,
    make_place,
    make_user,
    rank,
    signed_in,
    user_by_name,
)


async def flaggers(client_factory, n: int, prefix: str = "flagger"):
    return [await signed_in(client_factory, f"{prefix}{i}") for i in range(n)]


async def test_threshold_setting_is_three():
    assert get_settings().flag_threshold == 3


async def test_flag_requires_sign_in(client, db):
    place = await make_place(db, name="Ramen A", creator=await make_user(db, "own1"))
    assert (await flag(client, place.id, "closed")).status_code == 401


async def test_unknown_and_hidden_places_are_404(client_factory, db):
    c = await signed_in(client_factory, "visitor1")
    owner = await make_user(db, "own2")
    hidden = await make_place(db, name="Hidden", creator=owner, is_hidden=True)
    assert (await flag(c, hidden.id, "closed")).status_code == 404
    assert (await flag(c, 987654, "closed")).status_code == 404


async def test_cannot_flag_own_place(client_factory, db):
    c = await signed_in(client_factory, "maker1")
    me = await user_by_name(db, "maker1")
    place = await make_place(db, name="Mine", creator=me)
    r = await flag(c, place.id, "spam")
    assert r.status_code == 403


async def test_one_flag_per_user_per_type(client_factory, db):
    c = await signed_in(client_factory, "visitor2")
    place = await make_place(db, name="Ramen B", creator=await make_user(db, "own3"))
    first = await flag(c, place.id, "closed")
    assert first.status_code == 201
    assert first.json()["status"] == "open"
    assert (await flag(c, place.id, "closed")).status_code == 409
    # A different type is fine.
    assert (await flag(c, place.id, "spam")).status_code == 201


async def test_wrong_location_payload(client_factory, db):
    c = await signed_in(client_factory, "visitor3")
    place = await make_place(
        db, name="Ramen C", creator=await make_user(db, "own4"), lat=35.7120, lng=139.7960
    )
    assert (await flag(c, place.id, "wrong_location")).status_code == 422
    assert (await flag(c, place.id, "wrong_location", {"lat": 35.7})).status_code == 422
    assert (await flag(c, place.id, "wrong_location", {"lat": 95, "lng": 139})).status_code == 422
    # Same as the current pin
    same = await flag(c, place.id, "wrong_location", {"lat": 35.7120, "lng": 139.7960})
    assert same.status_code == 422
    ok = await flag(c, place.id, "wrong_location", {"lat": 35.7130, "lng": 139.7960})
    assert ok.status_code == 201


async def test_wrong_info_payload(client_factory, db):
    c = await signed_in(client_factory, "visitor4")
    place = await make_place(db, name="Ramen D", creator=await make_user(db, "own5"))
    assert (await flag(c, place.id, "wrong_info")).status_code == 422
    assert (await flag(c, place.id, "wrong_info", {})).status_code == 422
    assert (await flag(c, place.id, "wrong_info", {"name": "  "})).status_code == 422
    assert (await flag(c, place.id, "wrong_info", {"subcategory_id": 99999})).status_code == 422
    assert (await flag(c, place.id, "wrong_info", {"location_id": 99999})).status_code == 422
    # Suggesting what is already there is not a correction.
    assert (await flag(c, place.id, "wrong_info", {"name": "Ramen D"})).status_code == 422
    ok = await flag(c, place.id, "wrong_info", {"name": "Ramen Dee", "name_ja": "ラーメンD"})
    assert ok.status_code == 201


async def test_duplicate_payload(client_factory, db):
    c = await signed_in(client_factory, "visitor5")
    owner = await make_user(db, "own6")
    place = await make_place(db, name="Ramen E", creator=owner)
    other = await make_place(db, name="Ramen E2", creator=owner)
    hidden = await make_place(db, name="Ramen E3", creator=owner, is_hidden=True)
    assert (await flag(c, place.id, "duplicate")).status_code == 422
    assert (await flag(c, place.id, "duplicate", {"other_place_id": place.id})).status_code == 422
    assert (await flag(c, place.id, "duplicate", {"other_place_id": 987654})).status_code == 422
    assert (await flag(c, place.id, "duplicate", {"other_place_id": hidden.id})).status_code == 422
    ok = await flag(c, place.id, "duplicate", {"other_place_id": other.id})
    assert ok.status_code == 201
    assert (await flag(c, place.id, "duplicate", {"other_place_id": other.id})).status_code == 409


async def test_unknown_flag_type_is_422(client_factory, db):
    c = await signed_in(client_factory, "visitor6")
    place = await make_place(db, name="Ramen F", creator=await make_user(db, "own7"))
    assert (await flag(c, place.id, "bogus")).status_code == 422


# ---- Note flags -------------------------------------------------------------------------------


async def test_note_flags(client_factory, db):
    owner = await make_user(db, "own8")
    place = await make_place(db, name="Ramen G", creator=owner)
    author = await make_user(db, "author1")
    with_note = await rank(db, author, place, note="Buy my crypto at example.com")
    other_user = await make_user(db, "author2")
    no_note = await rank(db, other_user, place, bucket="fine")

    anon = client_factory()
    assert (
        await anon.post(f"/api/rankings/{with_note.id}/flags", json={"flag_type": "spam"})
    ).status_code == 401

    c = await signed_in(client_factory, "visitor7")
    url = f"/api/rankings/{with_note.id}/flags"
    assert (
        await c.post(f"/api/rankings/{no_note.id}/flags", json={"flag_type": "spam"})
    ).status_code == 404
    assert (
        await c.post("/api/rankings/987654/flags", json={"flag_type": "spam"})
    ).status_code == 404
    assert (await c.post(url, json={"flag_type": "closed"})).status_code == 422
    ok = await c.post(url, json={"flag_type": "spam"})
    assert ok.status_code == 201
    assert ok.json()["auto_action"] is None
    assert (await c.post(url, json={"flag_type": "spam"})).status_code == 409


async def test_cannot_flag_own_note(client_factory, db):
    c = await signed_in(client_factory, "writer1")
    me = await user_by_name(db, "writer1")
    place = await make_place(db, name="Ramen H", creator=await make_user(db, "own9"))
    mine = await rank(db, me, place, note="my own note")
    r = await c.post(f"/api/rankings/{mine.id}/flags", json={"flag_type": "spam"})
    assert r.status_code == 403


async def test_notes_on_hidden_places_cannot_be_flagged(client_factory, db):
    place = await make_place(db, name="Ramen I", creator=await make_user(db, "own10"))
    author = await make_user(db, "author3")
    r = await rank(db, author, place, note="note")
    place.is_hidden = True
    await db.flush()
    c = await signed_in(client_factory, "visitor8")
    assert (
        await c.post(f"/api/rankings/{r.id}/flags", json={"flag_type": "spam"})
    ).status_code == 404


# ---- Thresholds -------------------------------------------------------------------------------


async def test_three_spam_flaggers_hide_the_place(client_factory, client, db):
    owner = await make_user(db, "own11")
    place = await make_place(db, name="Spam Ramen", creator=owner)
    ranker = await make_user(db, "ranker1")
    await rank(db, ranker, place)
    assert await category_count(db, place) == 1

    cs = await flaggers(client_factory, 3, "spamr")
    for c in cs[:2]:
        r = await flag(c, place.id, "spam")
        assert r.status_code == 201 and r.json()["auto_action"] is None
    assert (await client.get(f"/api/places/{place.id}")).status_code == 200
    assert "hidden" not in (await client.get(f"/api/places/{place.id}")).json()["badges"]

    # The same user flagging again does not count (and is a 409).
    assert (await flag(cs[0], place.id, "spam")).status_code == 409
    assert (await client.get(f"/api/places/{place.id}")).status_code == 200

    third = await flag(cs[2], place.id, "spam")
    assert third.status_code == 201
    assert third.json()["auto_action"] == "hidden"
    assert (await client.get(f"/api/places/{place.id}")).status_code == 404
    # Out of the category prior, but still in the ranker's own List at the same position.
    assert await category_count(db, place) == 0
    pos = (
        await db.execute(
            text("SELECT position FROM rankings WHERE place_id = :p AND user_id = :u"),
            {"p": place.id, "u": ranker.id},
        )
    ).scalar_one()
    assert pos == 1


async def test_different_flag_types_do_not_combine(client_factory, client, db):
    place = await make_place(db, name="Mixed Ramen", creator=await make_user(db, "own12"))
    cs = await flaggers(client_factory, 3, "mixr")
    await flag(cs[0], place.id, "spam")
    await flag(cs[1], place.id, "spam")
    await flag(cs[2], place.id, "closed")
    body = (await client.get(f"/api/places/{place.id}")).json()
    assert "hidden" not in body["badges"]
    assert body["badges"] == ["unverified"]


async def test_three_closed_flaggers_mark_reported_closed(client_factory, client, db):
    owner = await make_user(db, "own13")
    place = await make_place(db, name="Shut Ramen", creator=owner)
    ranker = await make_user(db, "ranker2")
    await rank(db, ranker, place)
    newcomer = await make_user(db, "newcomer1")

    cs = await flaggers(client_factory, 3, "closr")
    for c in cs[:2]:
        assert (await flag(c, place.id, "closed")).json()["auto_action"] is None
    assert (await flag(cs[0], place.id, "closed")).status_code == 409
    assert "reported_closed" not in (await client.get(f"/api/places/{place.id}")).json()["badges"]

    third = await flag(cs[2], place.id, "closed")
    assert third.json()["auto_action"] == "closed"
    body = (await client.get(f"/api/places/{place.id}")).json()
    assert "reported_closed" in body["badges"]
    # Still visible and still counting toward the public score...
    assert body["ranker_count"] == 1
    assert body["public_score"] is not None
    assert await category_count(db, place) == 1
    # ...but it takes no new rankings.
    snap = await ranking.get_snapshot(db, newcomer.id, place.city_id, place.subcategory_id)
    with pytest.raises(ranking.RankingNotAllowed):
        await ranking.place_ranking(
            db,
            user_id=newcomer.id,
            place=place,
            bucket="liked",
            position=1,
            expected_version=snap["liked"].version,
        )
    # The flags stay open for the admin.
    status = (
        (
            await db.execute(
                text("SELECT DISTINCT status FROM flags WHERE place_id = :p"), {"p": place.id}
            )
        )
        .scalars()
        .all()
    )
    assert list(status) == ["open"]
