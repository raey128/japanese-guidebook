"""Merging a duplicate place into the surviving one."""

from datetime import UTC, datetime

import pytest
from sqlalchemy import text

from app import ranking
from tests.mod_helpers import (
    admin_client,
    category_count,
    flag,
    list_names,
    make_place,
    make_user,
    rank,
    signed_in,
)


def at(month: int) -> datetime:
    return datetime(2026, month, 1, tzinfo=UTC)


async def rankers_of(db, place_id: int) -> dict[str, str]:
    rows = await db.execute(
        text(
            "SELECT u.username, r.bucket FROM rankings r JOIN users u ON u.id = r.user_id "
            "WHERE r.place_id = :p"
        ),
        {"p": place_id},
    )
    return {r.username: r.bucket for r in rows}


async def bookmarkers_of(db, place_id: int) -> set[str]:
    rows = await db.execute(
        text(
            "SELECT u.username FROM bookmarks b JOIN users u ON u.id = b.user_id "
            "WHERE b.place_id = :p"
        ),
        {"p": place_id},
    )
    return {r.username for r in rows}


async def test_merge_moves_rankings_and_bookmarks(client_factory, client, db):
    owner = await make_user(db, "mergeown")
    source = await make_place(db, name="Dup Ramen", creator=owner)
    target = await make_place(db, name="Real Ramen", creator=owner)
    other = await make_place(db, name="Other Ramen", creator=owner)
    u1, u2, u3, u4, u5 = [await make_user(db, f"merger{i}") for i in range(1, 6)]

    # u1 only ranks the duplicate (after another place), so its position carries over.
    await rank(db, u1, other, position=1)
    await rank(db, u1, source, position=2)
    # u2 and u3 rank both; the most recently updated ranking survives.
    s2 = await rank(db, u2, source, bucket="liked")
    t2 = await rank(db, u2, target, bucket="disliked")
    s3 = await rank(db, u3, source, bucket="liked")
    t3 = await rank(db, u3, target, bucket="disliked")
    s2.updated_at, t2.updated_at = at(3), at(1)  # duplicate's is newer -> keep liked
    s3.updated_at, t3.updated_at = at(1), at(3)  # survivor's is newer -> keep disliked
    await db.flush()
    # Bookmarks: u4 on the duplicate only, u5 on both.
    for uid, pid in ((u4.id, source.id), (u5.id, source.id), (u5.id, target.id)):
        await db.execute(
            text("INSERT INTO bookmarks (user_id, place_id) VALUES (:u, :p)"), {"u": uid, "p": pid}
        )

    u6 = await signed_in(client_factory, "dupflagger")
    await flag(u6, source.id, "duplicate", {"other_place_id": target.id})
    admin = await admin_client(client_factory, db)

    r = await admin.post(f"/api/admin/places/{source.id}/merge", json={"into_place_id": target.id})
    assert r.status_code == 200, r.text
    assert r.json()["id"] == target.id
    assert r.json()["ranker_count"] == 3

    assert await rankers_of(db, target.id) == {
        "merger1": "liked",
        "merger2": "liked",
        "merger3": "disliked",
    }
    assert await rankers_of(db, source.id) == {}
    assert await bookmarkers_of(db, target.id) == {"merger4", "merger5"}
    assert await bookmarkers_of(db, source.id) == set()

    # u1's ranking kept its place in the same List.
    assert await list_names(db, u1.id, "ramen") == ["Other Ramen", "Real Ramen"]
    # u2's Lists: the liked one now holds the survivor; the disliked one is empty.
    assert await list_names(db, u2.id, "ramen", "liked") == ["Real Ramen"]
    assert await list_names(db, u2.id, "ramen", "disliked") == []
    assert await list_names(db, u3.id, "ramen", "liked") == []
    assert await list_names(db, u3.id, "ramen", "disliked") == ["Real Ramen"]

    # The old URL redirects; the old place is out of every public view and the prior.
    old = await client.get(f"/api/places/{source.id}")
    assert old.status_code == 308
    assert old.headers["location"] == f"/api/places/{target.id}"
    followed = await client.get(old.headers["location"])
    assert followed.status_code == 200 and followed.json()["ranker_count"] == 3
    assert await category_count(db, target) == 4  # other(1) + survivor(3)
    # Its open flags are resolved.
    assert (await admin.get("/api/admin/flags")).json()["groups"] == []
    # And it can't take rankings any more.
    snap = await ranking.get_snapshot(db, u4.id, source.city_id, source.subcategory_id)
    with pytest.raises(ranking.RankingNotAllowed):
        await ranking.place_ranking(
            db, user_id=u4.id, place=source, bucket="liked", position=1,
            expected_version=snap["liked"].version,
        )


async def test_merge_into_different_subcategory_reinserts(client_factory, db):
    owner = await make_user(db, "mergeown2")
    user = await make_user(db, "merger7")
    source = await make_place(db, name="Dup Cafe", creator=owner, subcategory_slug="ramen")
    target = await make_place(db, name="Real Cafe", creator=owner, subcategory_slug="cafe")
    first = await make_place(db, name="Cafe First", creator=owner, subcategory_slug="cafe")
    # Source: position 2 of 2 in Ramen -> 7.525. Cafe has one item (8.35). After the move
    # the Cafe List has 2 items, scores 9.175 / 7.525, so the ranking lands at position 2.
    ramen_first = await make_place(db, name="Ramen First", creator=owner, subcategory_slug="ramen")
    await rank(db, user, ramen_first, position=1)
    await rank(db, user, source, position=2)
    await rank(db, user, first, position=1)

    admin = await admin_client(client_factory, db)
    r = await admin.post(f"/api/admin/places/{source.id}/merge", json={"into_place_id": target.id})
    assert r.status_code == 200
    assert await list_names(db, user.id, "cafe") == ["Cafe First", "Real Cafe"]
    assert await list_names(db, user.id, "ramen") == ["Ramen First"]


async def test_merge_validation(client_factory, db):
    owner = await make_user(db, "mergeown3")
    a = await make_place(db, name="Merge A", creator=owner)
    b = await make_place(db, name="Merge B", creator=owner)
    hidden = await make_place(db, name="Merge H", creator=owner, is_hidden=True)
    admin = await admin_client(client_factory, db)

    async def merge(src: int, dst: int):
        return await admin.post(f"/api/admin/places/{src}/merge", json={"into_place_id": dst})

    assert (await merge(a.id, a.id)).status_code == 422
    assert (await merge(a.id, hidden.id)).status_code == 422
    assert (await merge(a.id, 987654)).status_code == 422
    assert (await merge(987654, a.id)).status_code == 404
    assert (await merge(b.id, a.id)).status_code == 200
    # b is merged away now: neither source nor target any more.
    assert (await merge(b.id, a.id)).status_code == 409
    assert (await merge(a.id, b.id)).status_code == 422
    # Hidden places can still be merged (e.g. a hidden duplicate), into a live one.
    assert (await merge(hidden.id, a.id)).status_code == 200
