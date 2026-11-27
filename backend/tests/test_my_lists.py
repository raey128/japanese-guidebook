"""Shared lists (decided 2026-11-27): owner editing, batch add/remove, reorder, voting switch,
live counts with names only for the owner, Save these places, and the share preview."""

from uuid import uuid4

from sqlalchemy import text

from tests.factories import make_place, make_user, sign_in
from tests.test_ranking import rank


async def ramen_places(db, n, prefix="L"):
    maker = await make_user(db, f"lm_{prefix.lower()}")
    return [await make_place(db, name=f"{prefix} Place {i}", creator=maker) for i in range(n)]


async def test_create_prefills_with_places_you_loved(client, db):
    a, b, c = await ramen_places(db, 3)
    await sign_in(client, "owner1")
    await rank(client, a, "liked", 1, rating=10)
    await rank(client, b, "liked", 2, rating=8)
    await rank(client, c, "fine", 1)  # 6: not "loved", not prefilled
    r = await client.post(
        "/api/me/lists", json={"title": "  Rei's   Tokyo recs ", "city_slug": "tokyo"}
    )
    assert r.status_code == 201, r.text
    lst = r.json()
    assert lst["title"] == "Rei's Tokyo recs" and lst["is_open"] is True
    assert [i["place"]["name"] for i in lst["items"]] == [a.name, b.name]
    assert lst["share_url"].endswith(f"/share/l/{lst['token']}")
    assert lst["cover"]["name"] == a.name
    mine = (await client.get("/api/me/lists")).json()
    assert [m["id"] for m in mine] == [lst["id"]] and mine[0]["place_count"] == 2


async def test_batch_add_remove_and_reorder(client, db):
    places = await ramen_places(db, 4, "B")
    kyoto_maker = await make_user(db, "lm_kyoto")
    kyoto = await make_place(
        db, name="Kyoto Spot", creator=kyoto_maker, location_slug="gion-higashiyama"
    )
    await sign_in(client, "owner2")
    lst = (await client.post("/api/me/lists", json={"title": "Plan", "city_slug": "tokyo"})).json()
    lid = lst["id"]
    ids = [p.id for p in places]
    r = await client.post(
        f"/api/me/lists/{lid}/items", json={"place_ids": [*ids, ids[0], kyoto.id]}
    )
    assert r.json() == {"added": 4, "already": 0, "other_city": 1}
    again = await client.post(f"/api/me/lists/{lid}/items", json={"place_ids": [ids[1]]})
    assert again.json() == {"added": 0, "already": 1, "other_city": 0}

    detail = (await client.get(f"/api/me/lists/{lid}")).json()
    item_ids = [i["item_id"] for i in detail["items"]]
    assert [i["position"] for i in detail["items"]] == [1, 2, 3, 4]

    new_order = [item_ids[3], item_ids[0], item_ids[2], item_ids[1]]
    r = await client.put(f"/api/me/lists/{lid}/order", json={"item_ids": new_order})
    assert [i["item_id"] for i in r.json()["items"]] == new_order
    bad = await client.put(f"/api/me/lists/{lid}/order", json={"item_ids": new_order[:2]})
    assert bad.status_code == 422

    r = await client.post(
        f"/api/me/lists/{lid}/items/remove", json={"item_ids": [item_ids[0], item_ids[2]]}
    )
    left = r.json()["items"]
    assert [i["item_id"] for i in left] == [item_ids[3], item_ids[1]]
    assert [i["position"] for i in left] == [1, 2]


async def test_only_the_owner_can_edit(client_factory, db):
    owner = client_factory()
    await sign_in(owner, "owner3")
    lid = (await owner.post("/api/me/lists", json={"title": "Mine", "city_slug": "tokyo"})).json()[
        "id"
    ]
    other = client_factory()
    await sign_in(other, "stranger3")
    assert (await other.get(f"/api/me/lists/{lid}")).status_code == 404
    assert (await other.patch(f"/api/me/lists/{lid}", json={"title": "Hacked"})).status_code == 404
    assert (await other.delete(f"/api/me/lists/{lid}")).status_code == 404
    assert (await client_factory().get("/api/me/lists")).status_code == 401
    assert (await owner.delete(f"/api/me/lists/{lid}")).status_code == 204
    assert (await owner.get("/api/me/lists")).json() == []


async def test_live_counts_for_everyone_names_only_for_the_owner(client_factory, db):
    places = await ramen_places(db, 2, "V")
    owner = client_factory()
    await sign_in(owner, "owner4")
    lst = (await owner.post("/api/me/lists", json={"title": "Vote", "city_slug": "tokyo"})).json()
    await owner.post(f"/api/me/lists/{lst['id']}/items", json={"place_ids": [p.id for p in places]})
    token = lst["token"]
    anon = client_factory()
    item = (await anon.get(f"/api/v/{token}")).json()["items"][0]["item_id"]
    friend = uuid4()
    await anon.put(f"/api/v/{token}/name", json={"voter": str(friend), "name": "Ken"})
    await anon.put(
        f"/api/v/{token}/vote", json={"voter": str(friend), "item_id": item, "choice": "yes"}
    )

    public = (await anon.get(f"/api/v/{token}")).json()
    assert public["is_owner"] is False and public["voter_count"] == 1
    t = public["items"][0]["tally"]
    assert (t["yes"], t["yes_names"]) == (1, [])  # counts, no names
    own_view = (await owner.get(f"/api/v/{token}")).json()
    assert own_view["is_owner"] is True and own_view["items"][0]["tally"]["yes_names"] == ["Ken"]
    detail = (await owner.get(f"/api/me/lists/{lst['id']}")).json()
    assert detail["items"][0]["tally"]["yes_names"] == ["Ken"] and detail["voter_count"] == 1

    # Voting off: the link is just recommendations; votes are refused but nothing is lost.
    await owner.patch(f"/api/me/lists/{lst['id']}", json={"is_open": False})
    r = await anon.put(
        f"/api/v/{token}/vote", json={"voter": str(friend), "item_id": item, "choice": "no"}
    )
    assert r.status_code == 409
    assert (await anon.get(f"/api/v/{token}")).json()["items"][0]["tally"]["yes"] == 1


async def test_save_these_places(client_factory, db):
    a, b, c = await ramen_places(db, 3, "S")
    owner = client_factory()
    await sign_in(owner, "owner5")
    lst = (await owner.post("/api/me/lists", json={"title": "Recs", "city_slug": "tokyo"})).json()
    await owner.post(f"/api/me/lists/{lst['id']}/items", json={"place_ids": [a.id, b.id, c.id]})
    visitor = client_factory()
    assert (await visitor.post(f"/api/v/{lst['token']}/save")).status_code == 401
    await sign_in(visitor, "visitor5")
    await rank(visitor, a, "liked", 1)  # already been: not added to Want to go
    r = await visitor.post(f"/api/v/{lst['token']}/save")
    assert r.json() == {"saved": 2, "already": 1}
    assert (await visitor.post(f"/api/v/{lst['token']}/save")).json() == {"saved": 0, "already": 3}
    saved = {p["id"] for p in (await visitor.get("/api/me/bookmarks")).json()["items"]}
    assert saved == {b.id, c.id}


async def test_share_page_has_a_preview_and_redirects(client, db):
    (a,) = await ramen_places(db, 1, "P")
    await sign_in(client, "owner6")
    lst = (
        await client.post(
            "/api/me/lists", json={"title": "Rei's <Tokyo> recs", "city_slug": "tokyo"}
        )
    ).json()
    await client.post(f"/api/me/lists/{lst['id']}/items", json={"place_ids": [a.id]})
    r = await client.get(f"/share/l/{lst['token']}")
    assert r.status_code == 200
    body = r.text
    assert '<meta property="og:title" content="Rei&#x27;s &lt;Tokyo&gt; recs">' in body
    assert "1 place in Tokyo, picked by owner6." in body
    assert f"url=/l/{lst['token']}" in body
    assert (await client.get("/share/l/nope")).status_code == 404


async def test_demo_lists_have_no_owner(db):
    row = (
        await db.execute(text("SELECT count(*) FROM vote_lists WHERE owner_id IS NOT NULL"))
    ).scalar_one()
    assert row == 0


async def test_community_lists_show_only_lists_people_chose_to_show(client_factory, db):
    (a,) = await ramen_places(db, 1, "C")
    owner = client_factory()
    await sign_in(owner, "owner7")
    shown = (
        await owner.post("/api/me/lists", json={"title": "Shown", "city_slug": "tokyo"})
    ).json()
    hidden = (
        await owner.post("/api/me/lists", json={"title": "Hidden", "city_slug": "tokyo"})
    ).json()
    empty = (
        await owner.post("/api/me/lists", json={"title": "Empty", "city_slug": "tokyo"})
    ).json()
    for lst in (shown, hidden):
        await owner.post(f"/api/me/lists/{lst['id']}/items", json={"place_ids": [a.id]})
    for lst in (shown, empty):
        r = await owner.patch(f"/api/me/lists/{lst['id']}", json={"is_public": True})
        assert r.json()["is_public"] is True
    anon = client_factory()
    got = (await anon.get("/api/community-lists?city=tokyo")).json()
    assert [(g["title"], g["owner"]) for g in got] == [("Shown", "owner7")]
    assert (await anon.get("/api/community-lists?city=kyoto")).json() == []
