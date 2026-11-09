from app import ranking
from tests.factories import make_place, make_user, sign_in


async def test_add_is_idempotent_and_remove(client, db):
    owner = await make_user(db, "bm_owner")
    place = await make_place(db, name="Wanted Ramen", creator=owner)
    await sign_in(client, "bm_user")
    for _ in range(2):
        r = await client.put(f"/api/bookmarks/{place.id}")
        assert r.status_code == 200
        assert r.json() == {"place_id": place.id, "is_bookmarked": True}
    assert (await client.get(f"/api/places/{place.id}")).json()["viewer"]["is_bookmarked"] is True
    assert len((await client.get("/api/me/bookmarks")).json()["items"]) == 1

    for _ in range(2):
        r = await client.delete(f"/api/bookmarks/{place.id}")
        assert r.status_code == 200 and r.json()["is_bookmarked"] is False
    assert (await client.get("/api/me/bookmarks")).json() == {"items": []}


async def test_hidden_or_unknown_is_404(client, db):
    owner = await make_user(db, "bm_owner2")
    hidden = await make_place(db, name="Hidden", creator=owner, is_hidden=True)
    await sign_in(client, "bm_user2")
    assert (await client.put(f"/api/bookmarks/{hidden.id}")).status_code == 404
    assert (await client.put("/api/bookmarks/999999")).status_code == 404


async def test_requires_sign_in(client, db):
    owner = await make_user(db, "bm_owner3")
    place = await make_place(db, name="P", creator=owner)
    assert (await client.put(f"/api/bookmarks/{place.id}")).status_code == 401
    assert (await client.delete(f"/api/bookmarks/{place.id}")).status_code == 401
    assert (await client.get("/api/me/bookmarks")).status_code == 401


async def test_list_newest_first_and_excludes_hidden(client, db):
    owner = await make_user(db, "bm_owner4")
    first = await make_place(db, name="First", creator=owner)
    second = await make_place(db, name="Second", creator=owner)
    third = await make_place(db, name="Third", creator=owner)
    await sign_in(client, "bm_user4")
    for p in (first, second, third):
        await client.put(f"/api/bookmarks/{p.id}")
    third.is_hidden = True
    await db.flush()
    items = (await client.get("/api/me/bookmarks")).json()["items"]
    assert [i["name"] for i in items] == ["Second", "First"]
    assert items[0]["subcategory"]["slug"] == "ramen"


async def test_ranking_removes_bookmark(client, db):
    owner = await make_user(db, "bm_owner5")
    place = await make_place(db, name="Ranked Later", creator=owner)
    me = await sign_in(client, "bm_user5")
    await client.put(f"/api/bookmarks/{place.id}")
    snap = await ranking.get_snapshot(db, me["id"], place.city_id, place.subcategory_id)
    await ranking.place_ranking(
        db,
        user_id=me["id"],
        place=place,
        bucket="liked",
        position=1,
        expected_version=snap["liked"].version,
    )
    await db.flush()
    assert (await client.get("/api/me/bookmarks")).json() == {"items": []}
    assert (await client.get(f"/api/places/{place.id}")).json()["viewer"]["is_bookmarked"] is False
