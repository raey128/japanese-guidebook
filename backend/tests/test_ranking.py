"""Pairwise ranking through the HTTP API: formula, positions, 409, re-rank, delete, access."""

import pytest
from sqlalchemy import text

from app.models import Bookmark
from tests.factories import make_place, make_user, sign_in


async def snapshot(client, place_id):
    r = await client.get("/api/rankings/snapshot", params={"place_id": place_id})
    assert r.status_code == 200, r.text
    return r.json()


def bucket_of(snap, bucket):
    return next(b for b in snap["buckets"] if b["bucket"] == bucket)


RATING_FOR = {"liked": 5, "fine": 3, "disliked": 2}


async def rank(client, place, bucket, position, *, version=None, send_bucket=None, **extra):
    """Fetch the current list version (like the browser does) and submit a ranking. The star
    rating defaults to one that belongs in `bucket`; a low rating gets a default comment."""
    if version is None:
        version = bucket_of(await snapshot(client, place.id), bucket)["version"]
    body = {
        "place_id": place.id,
        "rating": RATING_FOR[bucket],
        "position": position,
        "list_version": version,
        **extra,
    }
    if send_bucket is not None:
        body["bucket"] = send_bucket
    if body["rating"] < 3 and "note" not in body:
        body["note"] = "Not for me."
    return await client.put("/api/rankings", json=body)


async def my_lists(client):
    r = await client.get("/api/me/rankings")
    assert r.status_code == 200, r.text
    return r.json()


def names(bucket_list):
    return [i["name"] for i in bucket_list["items"]]


async def ramen(db, creator, *labels, location_slug="asakusa", subcategory_slug="ramen"):
    return [
        await make_place(
            db,
            name=label,
            creator=creator,
            location_slug=location_slug,
            subcategory_slug=subcategory_slug,
        )
        for label in labels
    ]


async def test_first_item_scores_band_midpoint(client, db):
    maker = await make_user(db, "maker")
    (a,) = await ramen(db, maker, "Solo Ramen")
    await sign_in(client, "alice")
    snap = await snapshot(client, a.id)
    assert [b["bucket"] for b in snap["buckets"]] == ["liked", "fine", "disliked"]
    assert all(b["items"] == [] and b["version"] == 0 for b in snap["buckets"])
    assert snap["my_ranking"] is None and snap["can_rank"] is True

    r = await rank(client, a, "liked", 1)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["rank_list"]["version"] == 1
    assert body["rank_list"]["items"][0]["personal_score"] == pytest.approx(8.35)
    assert body["ranking"]["personal_score"] == pytest.approx(8.35)
    assert body["previous_list"] is None

    fine = await rank(client, (await ramen(db, maker, "Fine One"))[0], "fine", 1)
    assert fine.json()["ranking"]["personal_score"] == pytest.approx(5.05)
    bad = await rank(client, (await ramen(db, maker, "Bad One"))[0], "disliked", 1)
    assert bad.json()["ranking"]["personal_score"] == pytest.approx(1.7)


async def test_three_liked_exact_scores_and_positions(client, db):
    maker = await make_user(db, "maker")
    a, b, c = await ramen(db, maker, "A", "B", "C")
    await sign_in(client, "alice")
    await rank(client, a, "liked", 1)  # [A]
    await rank(client, b, "liked", 2)  # bottom: [A, B]
    r = await rank(client, c, "liked", 1)  # top: [C, A, B]
    items = r.json()["rank_list"]["items"]
    assert [i["name"] for i in items] == ["C", "A", "B"]
    assert [i["position"] for i in items] == [1, 2, 3]
    assert [i["personal_score"] for i in items] == pytest.approx([9.45, 8.35, 7.25])


async def test_insert_in_the_middle(client, db):
    maker = await make_user(db, "maker")
    a, b, c, d = await ramen(db, maker, "A", "B", "C", "D")
    await sign_in(client, "alice")
    await rank(client, a, "liked", 1)
    await rank(client, b, "liked", 2)
    await rank(client, c, "liked", 3)
    r = await rank(client, d, "liked", 2)
    items = r.json()["rank_list"]["items"]
    assert [i["name"] for i in items] == ["A", "D", "B", "C"]
    assert [i["position"] for i in items] == [1, 2, 3, 4]
    scores = [i["personal_score"] for i in items]
    assert scores == sorted(scores, reverse=True)
    assert scores[0] == pytest.approx(6.7 + 3.3 * 3.5 / 4)


async def test_liked_always_beats_fine_beats_disliked(client, db):
    maker = await make_user(db, "maker")
    places = await ramen(db, maker, *[f"P{i}" for i in range(9)])
    await sign_in(client, "alice")
    for i, p in enumerate(places):
        bucket = ("liked", "fine", "disliked")[i % 3]
        r = await rank(client, p, bucket, 1)
        assert r.status_code == 200, r.text
    lists = (await my_lists(client))["cities"][0]["categories"][0]["buckets"]
    by = {b["bucket"]: [i["personal_score"] for i in b["items"]] for b in lists}
    assert len(by["liked"]) == len(by["fine"]) == len(by["disliked"]) == 3
    assert min(by["liked"]) > max(by["fine"])
    assert min(by["fine"]) > max(by["disliked"])
    assert max(by["liked"]) < 10.0 and min(by["disliked"]) > 0.0


async def test_stale_version_returns_409(client, db):
    maker = await make_user(db, "maker")
    a, b = await ramen(db, maker, "A", "B")
    await sign_in(client, "alice")
    snap_1 = bucket_of(await snapshot(client, a.id), "liked")
    snap_2 = bucket_of(await snapshot(client, b.id), "liked")
    assert snap_1["version"] == snap_2["version"] == 0
    first = await rank(client, a, "liked", 1, version=snap_1["version"])
    assert first.status_code == 200
    second = await rank(client, b, "liked", 1, version=snap_2["version"])
    assert second.status_code == 409
    body = second.json()
    assert body["current_version"] == 1
    assert body["detail"]
    # Nothing was saved by the rejected write.
    assert names(bucket_of(await snapshot(client, b.id), "liked")) == ["A"]
    retry = await rank(client, b, "liked", 1, version=body["current_version"])
    assert retry.status_code == 200


async def test_rerank_moves_bucket_and_recomputes_both_lists(client, db):
    maker = await make_user(db, "maker")
    a, b, c = await ramen(db, maker, "A", "B", "C")
    await sign_in(client, "alice")
    await rank(client, a, "liked", 1)
    await rank(client, b, "liked", 2)
    await rank(client, c, "fine", 1)  # fine: [C]

    snap = await snapshot(client, a.id)
    assert snap["my_ranking"]["bucket"] == "liked"
    r = await rank(client, a, "fine", 1)  # A moves to the top of fine
    assert r.status_code == 200, r.text
    body = r.json()
    assert [i["name"] for i in body["rank_list"]["items"]] == ["A", "C"]
    assert [i["personal_score"] for i in body["rank_list"]["items"]] == pytest.approx(
        [3.4 + 3.3 * 1.5 / 2, 3.4 + 3.3 * 0.5 / 2]
    )
    prev = body["previous_list"]
    assert prev["bucket"] == "liked" and names(prev) == ["B"]
    assert prev["items"][0]["personal_score"] == pytest.approx(8.35)
    assert prev["items"][0]["position"] == 1
    assert body["ranking"]["bucket"] == "fine"


async def test_rerank_within_bucket_reorders(client, db):
    maker = await make_user(db, "maker")
    a, b = await ramen(db, maker, "A", "B")
    await sign_in(client, "alice")
    await rank(client, a, "liked", 1)
    await rank(client, b, "liked", 2)
    r = await rank(client, a, "liked", 2)  # A below B (among the other items: 1..2)
    assert r.status_code == 200, r.text
    assert names(r.json()["rank_list"]) == ["B", "A"]
    assert r.json()["previous_list"] is None


async def test_delete_recomputes_scores(client, db):
    maker = await make_user(db, "maker")
    a, b, c = await ramen(db, maker, "A", "B", "C")
    await sign_in(client, "alice")
    ids = {}
    for p in (a, b, c):
        r = await rank(client, p, "liked", 1 + len(ids))
        ids[p.name] = r.json()["ranking"]["id"]
    d = await client.delete(f"/api/rankings/{ids['A']}")
    assert d.status_code == 204
    liked = bucket_of(await snapshot(client, a.id), "liked")
    assert names(liked) == ["B", "C"]
    assert [i["position"] for i in liked["items"]] == [1, 2]
    assert [i["personal_score"] for i in liked["items"]] == pytest.approx([9.175, 7.525])
    assert (await client.delete(f"/api/rankings/{ids['A']}")).status_code == 404
    # The place can be ranked again.
    assert (await rank(client, a, "liked", 1)).status_code == 200


async def test_note_length_limit(client, db):
    maker = await make_user(db, "maker")
    a, b = await ramen(db, maker, "A", "B")
    await sign_in(client, "alice")
    ok = await rank(client, a, "liked", 1, note="x" * 1000)
    assert ok.status_code == 200, ok.text
    assert len(ok.json()["ranking"]["note"]) == 1000
    too_long = await rank(client, b, "liked", 1, note="x" * 1001)
    assert too_long.status_code == 422
    # The failed write saved nothing.
    assert names(bucket_of(await snapshot(client, b.id), "liked")) == ["A"]
    rid = ok.json()["ranking"]["id"]
    assert (
        await client.patch(f"/api/rankings/{rid}", json={"note": "y" * 1001})
    ).status_code == 422
    assert (
        await client.patch(f"/api/rankings/{rid}", json={"note": "y" * 1000})
    ).status_code == 200


async def test_patch_note_does_not_change_position_or_scores(client, db):
    maker = await make_user(db, "maker")
    a, b = await ramen(db, maker, "A", "B")
    await sign_in(client, "alice")
    await rank(client, a, "liked", 1)
    r = await rank(client, b, "liked", 2)
    rid = r.json()["ranking"]["id"]
    before = await snapshot(client, a.id)

    p = await client.patch(
        f"/api/rankings/{rid}", json={"note": "Great broth", "visit_month": 3, "visit_year": 2024}
    )
    assert p.status_code == 200, p.text
    out = p.json()
    assert (out["note"], out["visit_month"], out["visit_year"]) == ("Great broth", 3, 2024)
    assert out["position"] == 2

    after = await snapshot(client, a.id)
    assert after["buckets"] == before["buckets"]  # same versions, positions and scores
    assert after["my_ranking"]["bucket"] == "liked"


async def test_patch_can_clear_note_and_validates_date(client, db):
    maker = await make_user(db, "maker")
    (a,) = await ramen(db, maker, "A")
    await sign_in(client, "alice")
    rid = (await rank(client, a, "liked", 1, note="hi", visit_month=1, visit_year=2023)).json()[
        "ranking"
    ]["id"]
    assert (await client.patch(f"/api/rankings/{rid}", json={"visit_month": 5})).status_code == 200
    # Month without year is rejected.
    half = await client.patch(f"/api/rankings/{rid}", json={"visit_year": None})
    assert half.status_code == 422
    cleared = await client.patch(
        f"/api/rankings/{rid}", json={"note": None, "visit_month": None, "visit_year": None}
    )
    assert cleared.status_code == 200
    assert cleared.json()["note"] is None and cleared.json()["visit_year"] is None
    assert (await client.patch(f"/api/rankings/{rid}", json={"visit_month": 13})).status_code == 422


async def test_rerank_without_note_fields_keeps_the_note(client, db):
    maker = await make_user(db, "maker")
    a, b = await ramen(db, maker, "A", "B")
    await sign_in(client, "alice")
    await rank(client, a, "liked", 1, note="keep me", visit_month=2, visit_year=2022)
    await rank(client, b, "liked", 2)
    r = await rank(client, a, "liked", 2)
    assert r.json()["ranking"]["note"] == "keep me"
    assert r.json()["ranking"]["visit_year"] == 2022


async def test_cannot_touch_other_users_rankings(client_factory, db):
    maker = await make_user(db, "maker")
    (a,) = await ramen(db, maker, "A")
    alice, bob = client_factory(), client_factory()
    await sign_in(alice, "alice")
    await sign_in(bob, "bobby")
    rid = (await rank(alice, a, "liked", 1)).json()["ranking"]["id"]
    assert (await bob.patch(f"/api/rankings/{rid}", json={"note": "mine now"})).status_code == 403
    assert (await bob.delete(f"/api/rankings/{rid}")).status_code == 403
    # Still there, unchanged.
    assert len(bucket_of(await snapshot(alice, a.id), "liked")["items"]) == 1
    assert (await snapshot(alice, a.id))["my_ranking"]["note"] is None
    assert (await bob.patch("/api/rankings/999999", json={"note": "x"})).status_code == 404


async def test_signed_out_is_401(client, db):
    maker = await make_user(db, "maker")
    (a,) = await ramen(db, maker, "A")
    assert (
        await client.get("/api/rankings/snapshot", params={"place_id": a.id})
    ).status_code == 401
    body = {"place_id": a.id, "rating": 5, "position": 1, "list_version": 0}
    assert (await client.put("/api/rankings", json=body)).status_code == 401
    assert (await client.patch("/api/rankings/1", json={"note": "x"})).status_code == 401
    assert (await client.delete("/api/rankings/1")).status_code == 401
    assert (await client.get("/api/me/rankings")).status_code == 401


async def test_ranking_removes_the_bookmark(client, db):
    maker = await make_user(db, "maker")
    a, b = await ramen(db, maker, "A", "B")
    alice = await sign_in(client, "alice")
    db.add(Bookmark(user_id=alice["id"], place_id=a.id))
    db.add(Bookmark(user_id=alice["id"], place_id=b.id))
    await db.flush()
    assert (await rank(client, a, "liked", 1)).status_code == 200
    rows = (
        await db.execute(
            text("SELECT place_id FROM bookmarks WHERE user_id = :u"), {"u": alice["id"]}
        )
    ).all()
    assert [r.place_id for r in rows] == [b.id]


async def test_closed_place_blocks_new_rankings_but_not_rerank(client, db):
    maker = await make_user(db, "maker")
    open_place, shut = await ramen(db, maker, "Open", "Shut")
    await sign_in(client, "alice")
    await rank(client, open_place, "liked", 1)
    await rank(client, shut, "liked", 2)

    closed_new = await make_place(db, name="Closed New", creator=maker, is_closed=True)
    r = await rank(client, closed_new, "liked", 1)
    assert r.status_code == 409
    assert "closed" in r.json()["detail"]
    assert (await snapshot(client, closed_new.id))["can_rank"] is False

    # Already ranked by this user: re-ranking stays possible after it closes.
    shut.is_closed = True
    await db.flush()
    again = await rank(client, shut, "liked", 1)
    assert again.status_code == 200, again.text
    assert (await snapshot(client, shut.id))["can_rank"] is True


async def test_unknown_hidden_and_merged_places_are_404(client, db):
    maker = await make_user(db, "maker")
    hidden = await make_place(db, name="Hidden", creator=maker, is_hidden=True)
    survivor, merged = await ramen(db, maker, "Survivor", "Merged")
    merged.merged_into_id = survivor.id
    await db.flush()
    await sign_in(client, "alice")
    for pid in (999999, hidden.id, merged.id):
        assert (
            await client.get("/api/rankings/snapshot", params={"place_id": pid})
        ).status_code == 404
        body = {"place_id": pid, "rating": 5, "position": 1, "list_version": 0}
        assert (await client.put("/api/rankings", json=body)).status_code == 404


async def test_bad_position_and_bucket_are_422(client, db):
    maker = await make_user(db, "maker")
    (a,) = await ramen(db, maker, "A")
    await sign_in(client, "alice")
    assert (await rank(client, a, "liked", 0)).status_code == 422
    assert (await rank(client, a, "liked", 2)).status_code == 422  # only position 1 exists
    assert (await rank(client, a, "liked", 1, rating=6)).status_code == 422
    assert (await rank(client, a, "liked", 1, rating=0)).status_code == 422
    assert (await rank(client, a, "liked", 1, send_bucket="great")).status_code == 422
    assert (await snapshot(client, a.id))["my_ranking"] is None


async def test_my_rankings_groups_by_city_and_category(client, db):
    maker = await make_user(db, "maker")
    r1, r2 = await ramen(db, maker, "Ramen One", "Ramen Two")
    (kyoto_ramen,) = await ramen(db, maker, "Kyoto Ramen", location_slug="gion-higashiyama")
    (cafe,) = await ramen(db, maker, "Tokyo Cafe", subcategory_slug="cafe")
    await sign_in(client, "alice")
    await rank(client, r1, "liked", 1)
    await rank(client, r2, "disliked", 1)
    await rank(client, kyoto_ramen, "fine", 1)
    await rank(client, cafe, "liked", 1)

    out = await my_lists(client)
    assert [c["city"]["slug"] for c in out["cities"]] == ["kyoto", "tokyo"]
    tokyo = out["cities"][1]
    assert [c["subcategory"]["slug"] for c in tokyo["categories"]] == ["cafe", "ramen"]
    ramen_lists = tokyo["categories"][1]["buckets"]
    assert [b["bucket"] for b in ramen_lists] == ["liked", "fine", "disliked"]
    assert names(ramen_lists[0]) == ["Ramen One"] and names(ramen_lists[2]) == ["Ramen Two"]
    item = ramen_lists[0]["items"][0]
    assert set(item) >= {
        "ranking_id",
        "place_id",
        "name",
        "name_ja",
        "position",
        "personal_score",
        "badges",
    }
    assert ramen_lists[0]["version"] == 1


async def test_owner_still_sees_hidden_place_at_same_position(client, db):
    maker = await make_user(db, "maker")
    a, b, c = await ramen(db, maker, "A", "B", "C")
    await sign_in(client, "alice")
    await rank(client, a, "liked", 1)
    await rank(client, b, "liked", 2)
    await rank(client, c, "liked", 3)
    b.is_hidden = True
    await db.flush()
    liked = (await my_lists(client))["cities"][0]["categories"][0]["buckets"][0]
    assert names(liked) == ["A", "B", "C"]
    assert [i["position"] for i in liked["items"]] == [1, 2, 3]
    assert liked["items"][1]["badges"] == ["hidden"]
    assert liked["items"][0]["badges"] == []


# --- Star ratings (R3.6) ----------------------------------------------------------------------


async def test_rating_is_required(client, db):
    maker = await make_user(db, "maker")
    (a,) = await ramen(db, maker, "A")
    await sign_in(client, "alice")
    body = {"place_id": a.id, "position": 1, "list_version": 0}
    assert (await client.put("/api/rankings", json=body)).status_code == 422
    assert (await snapshot(client, a.id))["my_ranking"] is None


async def test_rating_decides_the_bucket(client, db):
    maker = await make_user(db, "maker")
    places = await ramen(db, maker, "One", "Two", "Three", "Four", "Five")
    await sign_in(client, "alice")
    expected = {1: "disliked", 2: "disliked", 3: "fine", 4: "liked", 5: "liked"}
    for stars, p in zip(range(1, 6), places, strict=True):
        bucket = expected[stars]
        version = bucket_of(await snapshot(client, p.id), bucket)["version"]
        body = {"place_id": p.id, "rating": stars, "position": 1, "list_version": version}
        if stars < 3:
            body["note"] = "Too salty."
        r = await client.put("/api/rankings", json=body)
        assert r.status_code == 200, r.text
        assert r.json()["ranking"]["bucket"] == bucket
        assert r.json()["ranking"]["rating"] == stars
        assert r.json()["rank_list"]["items"][0]["rating"] == stars


async def test_bucket_that_disagrees_with_rating_is_422(client, db):
    maker = await make_user(db, "maker")
    (a,) = await ramen(db, maker, "A")
    await sign_in(client, "alice")
    r = await rank(client, a, "liked", 1, rating=5, send_bucket="fine")
    assert r.status_code == 422
    assert (await rank(client, a, "liked", 1, rating=4, send_bucket="liked")).status_code == 200


async def test_low_rating_needs_a_comment_but_high_does_not(client, db):
    maker = await make_user(db, "maker")
    a, b, c = await ramen(db, maker, "A", "B", "C")
    await sign_in(client, "alice")
    for note in (None, "", "   "):
        r = await rank(client, a, "disliked", 1, note=note)
        assert r.status_code == 422, note
        assert "comment" in r.json()["detail"]
    assert (await rank(client, a, "disliked", 1, note="Rude staff")).status_code == 200
    # 3 stars and up: comment optional.
    assert (await rank(client, b, "fine", 1)).status_code == 200
    assert (await rank(client, c, "liked", 1)).status_code == 200


async def test_low_rated_comment_cannot_be_cleared(client, db):
    maker = await make_user(db, "maker")
    a, b = await ramen(db, maker, "A", "B")
    await sign_in(client, "alice")
    rid = (await rank(client, a, "disliked", 1, note="Cold food")).json()["ranking"]["id"]
    for note in (None, ""):
        assert (await client.patch(f"/api/rankings/{rid}", json={"note": note})).status_code == 422
    assert (
        await client.patch(f"/api/rankings/{rid}", json={"note": "Cold, slow"})
    ).status_code == 200

    async def rerank(place, stars, bucket):
        version = bucket_of(await snapshot(client, place.id), bucket)["version"]
        body = {"place_id": place.id, "rating": stars, "position": 1, "list_version": version}
        return await client.put("/api/rankings", json=body)

    # Re-rank without sending a note: the saved comment counts...
    r = await rerank(a, 1, "disliked")
    assert r.status_code == 200, r.text
    assert r.json()["ranking"]["note"] == "Cold, slow"
    # ...but a place with no comment can't drop below 3 stars without one.
    assert (await rank(client, b, "fine", 1)).status_code == 200
    assert (await rerank(b, 2, "disliked")).status_code == 422
