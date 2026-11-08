import pytest

from app import ranking
from app.config import get_settings
from tests.factories import make_place, make_user, sign_in

JAPAN = {"min_lat": 30, "min_lng": 130, "max_lat": 40, "max_lng": 142}
# Tight box around Asakusa, so other committed data can't interfere.
ASA = {"min_lat": 35.70, "min_lng": 139.78, "max_lat": 35.72, "max_lng": 139.81}


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


async def near_asakusa(db, creator, n, **kw):
    return [
        await make_place(
            db, name=f"P{i}", creator=creator, lat=35.7120 + i * 0.0005, lng=139.7960, **kw
        )
        for i in range(n)
    ]


async def test_cluster_vs_points_switch(client, db):
    owner = await make_user(db, "mapper")
    await near_asakusa(db, owner, 3)
    await make_place(db, name="Far", creator=owner, lat=35.0037, lng=135.7788,
                     location_slug="gion-higashiyama")
    r = (await client.get("/api/map", params={**JAPAN, "zoom": 10})).json()
    assert r["kind"] == "clusters" and r["points"] == [] and r["truncated"] is False
    assert sorted(c["count"] for c in r["clusters"]) == [1, 3]
    big = max(r["clusters"], key=lambda c: c["count"])
    assert abs(big["lat"] - 35.7125) < 0.001 and abs(big["lng"] - 139.796) < 0.001

    r = (await client.get("/api/map", params={**JAPAN, "zoom": 11})).json()
    assert r["kind"] == "points" and r["clusters"] == []
    assert len(r["points"]) == 4 and r["truncated"] is False
    p = r["points"][0]
    assert {"id", "lat", "lng", "name", "name_ja", "subcategory_slug", "top_category",
            "public_score", "ranker_count", "badges"} <= set(p)
    assert p["subcategory_slug"] == "ramen" and p["top_category"] == "food"


async def test_point_cap_and_truncated(client, db):
    owner = await make_user(db, "capper")
    await near_asakusa(db, owner, 5)
    get_settings().map_point_cap = 3
    try:
        r = (await client.get("/api/map", params={**ASA, "zoom": 14})).json()
    finally:
        get_settings().map_point_cap = 2000
    assert len(r["points"]) == 3 and r["truncated"] is True


async def test_cap_exact_is_not_truncated(client, db):
    owner = await make_user(db, "capper2")
    await near_asakusa(db, owner, 3)
    get_settings().map_point_cap = 3
    try:
        r = (await client.get("/api/map", params={**ASA, "zoom": 14})).json()
    finally:
        get_settings().map_point_cap = 2000
    assert len(r["points"]) == 3 and r["truncated"] is False


async def test_bbox_excludes_outside(client, db):
    owner = await make_user(db, "boxer")
    await make_place(db, name="In", creator=owner, lat=35.712, lng=139.796)
    await make_place(db, name="Out", creator=owner, lat=35.65, lng=139.70)
    r = (await client.get("/api/map", params={**ASA, "zoom": 14})).json()
    assert [p["name"] for p in r["points"]] == ["In"]


@pytest.mark.parametrize(
    "box",
    [
        {"min_lat": 36, "min_lng": 130, "max_lat": 35, "max_lng": 140},
        {"min_lat": 30, "min_lng": 140, "max_lat": 35, "max_lng": 130},
        {"min_lat": -95, "min_lng": 130, "max_lat": 35, "max_lng": 140},
    ],
)
async def test_invalid_bbox_is_422(client, box):
    assert (await client.get("/api/map", params={**box, "zoom": 12})).status_code == 422


async def test_category_and_location_filters(client, db):
    owner = await make_user(db, "filterer")
    await make_place(db, name="Ramen A", creator=owner, lat=35.712, lng=139.796)
    await make_place(db, name="Cafe A", creator=owner, subcategory_slug="cafe",
                     lat=35.713, lng=139.796)
    await make_place(db, name="Temple A", creator=owner, subcategory_slug="temple",
                     lat=35.714, lng=139.796)
    await make_place(db, name="Ramen Shibuya", creator=owner, location_slug="shibuya-harajuku",
                     lat=35.711, lng=139.797)

    async def names(**extra):
        r = await client.get("/api/map", params={**ASA, "zoom": 14, **extra})
        assert r.status_code == 200
        return sorted(p["name"] for p in r.json()["points"])

    assert await names(category="ramen") == ["Ramen A", "Ramen Shibuya"]
    assert await names(category="food") == ["Cafe A", "Ramen A", "Ramen Shibuya"]
    assert await names(category="sights") == ["Temple A"]
    assert await names(location="asakusa") == ["Cafe A", "Ramen A", "Temple A"]
    assert await names(location="asakusa", category="food") == ["Cafe A", "Ramen A"]
    assert await names(location="no-such-place") == []


async def test_hidden_and_merged_excluded(client, db):
    owner = await make_user(db, "hider")
    live = await make_place(db, name="Live", creator=owner, lat=35.712, lng=139.796)
    await make_place(db, name="Hidden", creator=owner, is_hidden=True, lat=35.7121, lng=139.796)
    merged = await make_place(db, name="Merged", creator=owner, lat=35.7122, lng=139.796)
    merged.merged_into_id = live.id
    await db.flush()
    r = (await client.get("/api/map", params={**ASA, "zoom": 14})).json()
    assert [p["name"] for p in r["points"]] == ["Live"]
    r = (await client.get("/api/map", params={**ASA, "zoom": 8})).json()
    assert sum(c["count"] for c in r["clusters"]) == 1


async def test_points_carry_scores_and_badges(client, db):
    owner = await make_user(db, "scorer")
    other = await make_user(db, "scorer2")
    place = await make_place(db, name="Scored", creator=owner, lat=35.712, lng=139.796)
    await make_place(db, name="Plain", creator=owner, lat=35.7125, lng=139.796, is_closed=True)
    await rank(db, other.id, place)
    r = (await client.get("/api/map", params={**ASA, "zoom": 14})).json()
    by_name = {p["name"]: p for p in r["points"]}
    assert r["points"][0]["name"] == "Scored"  # ranked places sort first
    assert by_name["Scored"]["ranker_count"] == 1 and by_name["Scored"]["public_score"] > 0
    assert by_name["Plain"]["public_score"] is None
    assert "closed" in by_name["Plain"]["badges"]


async def test_mine_and_want_to_go_modes(client, db):
    owner = await make_user(db, "someone")
    me = await sign_in(client, "traveller")
    ranked = await make_place(db, name="Ranked", creator=owner, lat=35.712, lng=139.796)
    wanted = await make_place(db, name="Wanted", creator=owner, lat=35.7125, lng=139.796)
    await make_place(db, name="Neither", creator=owner, lat=35.713, lng=139.796)
    await rank(db, me["id"], ranked)
    assert (await client.put(f"/api/bookmarks/{wanted.id}")).status_code == 200

    async def names(zoom, mode):
        r = await client.get("/api/map", params={**ASA, "zoom": zoom, "mode": mode})
        assert r.status_code == 200
        return r.json()

    assert [p["name"] for p in (await names(14, "mine"))["points"]] == ["Ranked"]
    assert [p["name"] for p in (await names(14, "want_to_go"))["points"]] == ["Wanted"]
    assert len((await names(14, "all"))["points"]) == 3
    clusters = (await names(8, "mine"))["clusters"]
    assert sum(c["count"] for c in clusters) == 1


async def test_my_mode_hides_hidden_places(client, db):
    owner = await make_user(db, "someone2")
    me = await sign_in(client, "traveller2")
    place = await make_place(db, name="Soon Hidden", creator=owner, lat=35.712, lng=139.796)
    await rank(db, me["id"], place)
    place.is_hidden = True
    await db.flush()
    r = (await client.get("/api/map", params={**ASA, "zoom": 14, "mode": "mine"})).json()
    assert r["points"] == []


@pytest.mark.parametrize("mode", ["mine", "want_to_go"])
async def test_personal_modes_require_sign_in(client, mode):
    r = await client.get("/api/map", params={**ASA, "zoom": 14, "mode": mode})
    assert r.status_code == 401
