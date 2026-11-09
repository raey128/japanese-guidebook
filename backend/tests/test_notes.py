"""Public notes on a place."""

from sqlalchemy import text

from tests.factories import make_place, make_user, sign_in
from tests.test_ranking import rank


async def notes(client, place):
    r = await client.get(f"/api/places/{place.id}/notes")
    assert r.status_code == 200, r.text
    return r.json()["notes"]


async def test_notes_newest_first_with_author_and_ownership(client_factory, db):
    maker = await make_user(db, "maker")
    place = await make_place(db, name="Noted Ramen", creator=maker)
    alice, bob, anon = client_factory(), client_factory(), client_factory()
    await sign_in(alice, "alice")
    await sign_in(bob, "bobby")
    r1 = await rank(alice, place, "liked", 1, note="First!", visit_month=4, visit_year=2024)
    r2 = await rank(bob, place, "fine", 1, note="Okay I guess")
    await db.execute(  # make the ordering deterministic regardless of clock resolution
        text("UPDATE rankings SET created_at = now() - interval '1 day' WHERE id = :id"),
        {"id": r1.json()["ranking"]["id"]},
    )

    out = await notes(anon, place)
    assert [n["author"] for n in out] == ["bobby", "alice"]
    assert out[1] == {
        "ranking_id": r1.json()["ranking"]["id"],
        "author": "alice",
        "note": "First!",
        "visit_month": 4,
        "visit_year": 2024,
        "bucket": "liked",
        "rating": 5,
        "created_at": out[1]["created_at"],
        "is_own": False,
    }
    assert out[0]["bucket"] == "fine" and out[0]["ranking_id"] == r2.json()["ranking"]["id"]
    assert [n["is_own"] for n in await notes(alice, place)] == [False, True]
    assert [n["is_own"] for n in await notes(bob, place)] == [True, False]


async def test_empty_notes_are_left_out(client, db):
    maker = await make_user(db, "maker")
    place = await make_place(db, name="Quiet Ramen", creator=maker)
    await sign_in(client, "alice")
    r = await rank(client, place, "liked", 1, note="   ")
    assert r.status_code == 200
    assert await notes(client, place) == []
    await sign_in(client, "bobby")
    await rank(client, place, "liked", 1)
    assert await notes(client, place) == []


async def test_private_author_is_anonymous(client, db):
    maker = await make_user(db, "maker")
    place = await make_place(db, name="Shy Ramen", creator=maker)
    await make_user(db, "shy", is_private=True)
    await sign_in(client, "shy")
    await rank(client, place, "liked", 1, note="Secretly good")
    out = await notes(client, place)
    assert out[0]["author"] == "Anonymous"
    assert out[0]["is_own"] is True
    assert "shy" not in str(out[0]).replace("Shy", "")


async def test_notes_of_hidden_or_unknown_places_are_404(client, db):
    maker = await make_user(db, "maker")
    place = await make_place(db, name="Soon Hidden", creator=maker)
    await sign_in(client, "alice")
    await rank(client, place, "liked", 1, note="nice")
    place.is_hidden = True
    await db.flush()
    assert (await client.get(f"/api/places/{place.id}/notes")).status_code == 404
    assert (await client.get("/api/places/999999/notes")).status_code == 404


async def test_editing_a_note_updates_the_public_view(client, db):
    maker = await make_user(db, "maker")
    place = await make_place(db, name="Edited Ramen", creator=maker)
    await sign_in(client, "alice")
    rid = (await rank(client, place, "liked", 1, note="v1")).json()["ranking"]["id"]
    await client.patch(f"/api/rankings/{rid}", json={"note": "v2"})
    assert [n["note"] for n in await notes(client, place)] == ["v2"]
    await client.patch(f"/api/rankings/{rid}", json={"note": None})
    assert await notes(client, place) == []


async def test_notes_can_be_sorted_by_rating(client_factory, db):
    from tests.factories import make_place, make_user, sign_in
    from tests.test_ranking import rank

    maker = await make_user(db, "sort_maker")
    place = await make_place(db, name="Sorted", creator=maker)
    for name, bucket, note in (
        ("s_low", "disliked", "Meh"),
        ("s_high", "liked", "Great"),
        ("s_mid", "fine", "Okay"),
    ):
        c = client_factory()
        await sign_in(c, name)
        assert (await rank(c, place, bucket, 1, note=note)).status_code == 200
    anon = client_factory()

    async def order(sort):
        r = await anon.get(f"/api/places/{place.id}/notes", params={"sort": sort})
        assert r.status_code == 200, r.text
        return [n["note"] for n in r.json()["notes"]]

    assert await order("highest") == ["Great", "Okay", "Meh"]
    assert await order("lowest") == ["Meh", "Okay", "Great"]
    assert await order("newest") == ["Okay", "Great", "Meh"]
    assert (
        await anon.get(f"/api/places/{place.id}/notes", params={"sort": "random"})
    ).status_code == 422
