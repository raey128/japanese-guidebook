from app import ranking
from tests.factories import make_place, make_user, sign_in


async def rank(db, user_id, place, bucket="liked"):
    snap = await ranking.get_snapshot(db, user_id, place.city_id, place.subcategory_id)
    await ranking.place_ranking(
        db,
        user_id=user_id,
        place=place,
        bucket=bucket,
        position=len(snap[bucket].items) + 1,
        expected_version=snap[bucket].version,
    )
    await db.flush()


async def test_profile_visible_logged_out_and_grouped(client, db):
    creator = await make_user(db, "pf_creator")
    fan = await make_user(db, "pf_fan")
    a = await make_place(db, name="Ramen A", creator=creator)
    b = await make_place(db, name="Ramen B", creator=creator)
    c = await make_place(db, name="Ramen C", creator=creator)
    d = await make_place(db, name="Cafe D", creator=creator, subcategory_slug="cafe")
    k = await make_place(
        db,
        name="Kyoto Ramen",
        creator=creator,
        location_slug="gion-higashiyama",
        lat=35.0,
        lng=135.779,
    )
    await rank(db, fan.id, c, "disliked")
    await rank(db, fan.id, a, "liked")
    await rank(db, fan.id, b, "liked")
    await rank(db, fan.id, d, "fine")
    await rank(db, fan.id, k, "liked")

    r = await client.get("/api/users/pf_fan")
    assert r.status_code == 200
    body = r.json()
    assert body["username"] == "pf_fan" and body["is_self"] is False and body["created_at"]
    lists = body["lists"]
    assert [(lst["city"]["slug"], lst["subcategory"]["slug"]) for lst in lists] == [
        ("kyoto", "ramen"),
        ("tokyo", "cafe"),
        ("tokyo", "ramen"),
    ]
    tokyo_ramen = lists[2]
    assert tokyo_ramen["top_category"] == "food"
    assert [(i["place"]["name"], i["bucket"], i["position"]) for i in tokyo_ramen["items"]] == [
        ("Ramen A", "liked", 1),
        ("Ramen B", "liked", 2),
        ("Ramen C", "disliked", 1),
    ]
    assert tokyo_ramen["items"][0]["personal_score"] > tokyo_ramen["items"][2]["personal_score"]


async def test_unknown_and_system_user_are_404(client, db):
    assert (await client.get("/api/users/nobody_here")).status_code == 404
    from sqlalchemy import text

    await db.execute(
        text(
            "INSERT INTO users (username, is_system) VALUES ('guidebook', true) "
            "ON CONFLICT DO NOTHING"
        )
    )
    assert (await client.get("/api/users/guidebook")).status_code == 404


async def test_private_profile_404_for_others_200_for_self(client_factory, db):
    await make_user(db, "pf_shy", is_private=True)
    anon = client_factory()
    assert (await anon.get("/api/users/pf_shy")).status_code == 404
    other = client_factory()
    await sign_in(other, "pf_other")
    assert (await other.get("/api/users/pf_shy")).status_code == 404
    me = client_factory()
    await sign_in(me, "pf_shy")
    r = await me.get("/api/users/pf_shy")
    assert r.status_code == 200 and r.json()["is_self"] is True


async def test_hidden_places_not_on_profile(client, client_factory, db):
    creator = await make_user(db, "pf_creator2")
    me = await sign_in(client, "pf_ranker")
    keep = await make_place(db, name="Keep", creator=creator)
    gone = await make_place(db, name="Gone", creator=creator)
    await rank(db, me["id"], keep)
    await rank(db, me["id"], gone)
    gone.is_hidden = True
    await db.flush()
    for c in (client, client_factory()):  # owner and a logged-out visitor
        items = (await c.get("/api/users/pf_ranker")).json()["lists"][0]["items"]
        assert [i["place"]["name"] for i in items] == ["Keep"]


async def test_patch_me_toggles_privacy(client, db):
    await sign_in(client, "pf_toggle")
    assert (await client.patch("/api/me", json={"is_private": True})).json()["is_private"] is True
    assert (await client.get("/api/me")).json()["user"]["is_private"] is True
    assert (await client.patch("/api/me", json={"is_private": False})).json()["is_private"] is False


async def test_patch_me_requires_sign_in(client):
    assert (await client.patch("/api/me", json={"is_private": True})).status_code == 401


async def test_private_creator_anonymous_but_rankings_still_count(client, db):
    shy = await make_user(db, "pf_shy2", is_private=True)
    place = await make_place(db, name="Quiet Ramen", creator=shy)
    before = (await client.get(f"/api/places/{place.id}")).json()
    assert before["creator"] == "Anonymous" and before["ranker_count"] == 0
    await rank(db, shy.id, place)
    after = (await client.get(f"/api/places/{place.id}")).json()
    assert after["ranker_count"] == 1 and after["creator"] == "Anonymous"
