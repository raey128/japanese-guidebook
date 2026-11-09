"""Top picks with the Team picks fallback (R15.2, R17.8), suggestions (R12), top note (R17.7)."""

from sqlalchemy import text

from tests.factories import make_place, make_user, sign_in, user_by_name
from tests.test_map import ASA, rank


async def test_top_picks_orders_by_score_and_skips_unranked(client, db):
    owner = await make_user(db, "tp_owner")
    raters = [await make_user(db, f"tp_r{i}") for i in range(2)]
    good = await make_place(db, name="Good", creator=owner, lat=35.712, lng=139.796)
    meh = await make_place(db, name="Meh", creator=owner, lat=35.713, lng=139.796)
    await make_place(db, name="Unranked", creator=owner, lat=35.714, lng=139.796)
    hidden = await make_place(db, name="Hidden", creator=owner, lat=35.715, lng=139.796, is_hidden=True)
    for u in raters:
        await rank(db, u.id, good, "liked")
        await rank(db, u.id, meh, "disliked")
    await rank(db, raters[0].id, hidden, "liked")

    r = (await client.get("/api/top-picks", params=ASA)).json()
    assert r["kind"] == "ranked"
    assert [p["name"] for p in r["items"]] == ["Good", "Meh"]

    # Category filter.
    assert (await client.get("/api/top-picks", params={**ASA, "category": "sights"})).json()["kind"] == "empty"
    assert (await client.get("/api/top-picks", params={**ASA, "category": "food"})).json()["kind"] == "ranked"
    assert len((await client.get("/api/top-picks", params={**ASA, "limit": 1})).json()["items"]) == 1


async def test_team_picks_fallback_uses_reviewed_seeds_nearest_first(client, db):
    owner = await make_user(db, "team_owner")
    near = await make_place(db, name="Seed Near", creator=owner, lat=35.7101, lng=139.7951, is_seed=True)
    far = await make_place(db, name="Seed Far", creator=owner, lat=35.7190, lng=139.8090, is_seed=True)
    await make_place(db, name="Seed Unreviewed", creator=owner, lat=35.7100, lng=139.7950, is_seed=True)
    await db.execute(text("UPDATE places SET seed_reviewed = true WHERE id = ANY(:ids)"), {"ids": [near.id, far.id]})
    r = (await client.get("/api/top-picks", params=ASA)).json()
    assert r["kind"] == "team"
    assert [p["name"] for p in r["items"]] == ["Seed Near", "Seed Far"]


async def test_top_picks_empty_when_nothing_in_view(client):
    r = (await client.get("/api/top-picks", params=ASA)).json()
    assert r == {"kind": "empty", "items": []}


async def test_suggest_groups_areas_categories_and_places_by_viewport(client, db):
    owner = await make_user(db, "sg_owner")
    await make_place(db, name="Roppongi Ramen Inside", creator=owner, lat=35.7120, lng=139.7960)
    await make_place(db, name="Roppongi Ramen Outside", creator=owner, location_slug="shibuya-harajuku",
                     lat=35.6595, lng=139.7005)
    await make_place(db, name="Kyoto Roppongi", creator=owner, location_slug="gion-higashiyama")

    r = (await client.get("/api/suggest", params={"q": "Roppo", "city": "tokyo", **ASA})).json()
    assert [a["slug"] for a in r["areas"]] == ["roppongi-azabu"]
    assert [p["name"] for p in r["on_map"]] == ["Roppongi Ramen Inside"]
    assert [p["name"] for p in r["elsewhere"]] == ["Roppongi Ramen Outside"]  # other cities excluded

    r = (await client.get("/api/suggest", params={"q": "ram", "city": "tokyo"})).json()
    assert r["subcategories"][0]["slug"] == "ramen"
    r = (await client.get("/api/suggest", params={"q": "ram", "city": "tokyo", "category": "sights"})).json()
    assert r["subcategories"] == [] and r["on_map"] == [] and r["elsewhere"] == []
    assert (await client.get("/api/suggest", params={"q": "  ", "city": "tokyo"})).json()["areas"] == []
    assert (await client.get("/api/suggest", params={"q": "x", "city": "atlantis"})).json()["areas"] == []


async def test_suggest_area_matches_japanese_names(client):
    r = (await client.get("/api/suggest", params={"q": "六本木", "city": "tokyo"})).json()
    assert [a["slug"] for a in r["areas"]] == ["roppongi-azabu"]


async def test_place_detail_top_note_is_latest_liked_note(client_factory, db):
    owner = await make_user(db, "tn_owner")
    place = await make_place(db, name="Noted", creator=owner)
    a, b = client_factory(), client_factory()
    await sign_in(a, "tn_a")
    await sign_in(b, "tn_b")
    ua, ub = await user_by_name(db, "tn_a"), await user_by_name(db, "tn_b")
    await rank(db, ua.id, place, "liked")
    await rank(db, ub.id, place, "disliked")
    await db.execute(text("UPDATE rankings SET note = 'Rich broth!' WHERE user_id = :u"), {"u": ua.id})
    await db.execute(text("UPDATE rankings SET note = 'Too salty' WHERE user_id = :u"), {"u": ub.id})
    detail = (await a.get(f"/api/places/{place.id}")).json()
    assert detail["top_note"] == {"author": "tn_a", "note": "Rich broth!"}
    ua.is_private = True
    await db.flush()
    detail = (await b.get(f"/api/places/{place.id}")).json()
    assert detail["top_note"]["author"] == "Anonymous"


async def test_map_points_carry_saved_and_ranked_for_the_viewer(client_factory, db):
    owner = await make_user(db, "flags_owner")
    p1 = await make_place(db, name="Saved One", creator=owner, lat=35.712, lng=139.796)
    p2 = await make_place(db, name="Ranked One", creator=owner, lat=35.713, lng=139.796)
    me, other = client_factory(), client_factory()
    await sign_in(me, "flags_me")
    await me.put(f"/api/bookmarks/{p1.id}")
    await rank(db, (await user_by_name(db, "flags_me")).id, p2)
    pts = {p["name"]: p for p in (await me.get("/api/map", params={**ASA, "zoom": 15})).json()["points"]}
    assert pts["Saved One"]["saved"] and not pts["Saved One"]["ranked"]
    assert pts["Ranked One"]["ranked"] and not pts["Ranked One"]["saved"]
    anon = (await other.get("/api/map", params={**ASA, "zoom": 15})).json()["points"]
    assert not any(p["saved"] or p["ranked"] for p in anon)


async def test_rank_response_has_city_count(client, db):
    owner = await make_user(db, "cc_owner")
    places = [await make_place(db, name=f"CC {i}", creator=owner, lat=35.712 + i * 0.001, lng=139.796)
              for i in range(2)]
    await sign_in(client, "cc_me")
    for i, p in enumerate(places, start=1):
        snap = (await client.get("/api/rankings/snapshot", params={"place_id": p.id})).json()
        r = (await client.put("/api/rankings", json={
            "place_id": p.id, "rating": 5, "position": i, "list_version": snap["buckets"][0]["version"],
        })).json()
        assert r["city_rank_count"] == i and r["city_name"] == "Tokyo" and r["is_new"] is True
