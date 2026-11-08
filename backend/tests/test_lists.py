"""Public ranked lists: sorting, roll-up, location filter, hidden/closed handling."""

import pytest

from tests.factories import make_place, make_user, sign_in
from tests.test_ranking import rank


async def get_list(client, city, category, **params):
    r = await client.get(f"/api/lists/{city}/{category}", params=params)
    assert r.status_code == 200, r.text
    return r.json()


async def test_sorted_by_score_then_unranked_last_by_name(client, db):
    maker = await make_user(db, "maker")
    a = await make_place(db, name="Zeta Ramen", creator=maker)
    b = await make_place(db, name="Beta Ramen", creator=maker)
    await make_place(db, name="Alpha Unranked", creator=maker)
    await make_place(db, name="Beta Unranked", creator=maker)

    await sign_in(client, "u_one")
    await rank(client, a, "liked", 1)
    await rank(client, b, "liked", 2)  # u_one: Zeta 9.175, Beta 7.525
    await sign_in(client, "u_two")
    await rank(client, b, "liked", 1)  # Beta 8.35 more

    out = await get_list(client, "tokyo", "ramen")
    assert out["title"] == "Ramen in Tokyo"
    assert out["subcategory"]["slug"] == "ramen" and out["top_category"] == "food"
    assert out["location"] is None and out["city"]["slug"] == "tokyo"
    assert [i["name"] for i in out["items"]] == [
        "Zeta Ramen",
        "Beta Ramen",
        "Alpha Unranked",
        "Beta Unranked",
    ]
    assert [i["rank"] for i in out["items"]] == [1, 2, None, None]
    scores = [i["public_score"] for i in out["items"]]
    assert scores[0] > scores[1] > 0 and scores[2] is None and scores[3] is None
    assert [i["ranker_count"] for i in out["items"]] == [1, 2, 0, 0]
    assert out["total"] == 4


async def test_top_category_rollup_and_location_filter(client, db):
    maker = await make_user(db, "maker")
    ramen = await make_place(db, name="Asakusa Ramen", creator=maker)
    cafe = await make_place(db, name="Shibuya Cafe", creator=maker, subcategory_slug="cafe",
                            location_slug="shibuya-harajuku")
    temple = await make_place(db, name="Old Temple", creator=maker, subcategory_slug="temple")
    kyoto = await make_place(db, name="Kyoto Ramen", creator=maker, location_slug="gion-higashiyama")
    await sign_in(client, "alice")
    for p in (ramen, cafe, temple, kyoto):
        await rank(client, p, "liked", 1)

    food = await get_list(client, "tokyo", "food")
    assert food["title"] == "Food in Tokyo"
    assert food["subcategory"] is None and food["top_category"] == "food"
    assert sorted(i["name"] for i in food["items"]) == ["Asakusa Ramen", "Shibuya Cafe"]

    filtered = await get_list(client, "tokyo", "food", location="asakusa")
    assert filtered["title"] == "Food in Tokyo › Asakusa"
    assert filtered["location"]["slug"] == "asakusa"
    assert [i["name"] for i in filtered["items"]] == ["Asakusa Ramen"]

    sights = await get_list(client, "tokyo", "sights")
    assert [i["name"] for i in sights["items"]] == ["Old Temple"]
    kyoto_food = await get_list(client, "kyoto", "food")
    assert [i["name"] for i in kyoto_food["items"]] == ["Kyoto Ramen"]


async def test_empty_list_and_unknown_slugs(client, db):
    out = await get_list(client, "kyoto", "hostel")
    assert out["items"] == [] and out["total"] == 0
    assert out["title"] == "Hostel in Kyoto"
    assert (await client.get("/api/lists/atlantis/ramen")).status_code == 404
    assert (await client.get("/api/lists/tokyo/not-a-category")).status_code == 404
    assert (await client.get("/api/lists/tokyo/ramen", params={"location": "nowhere"})).status_code == 404
    # A real location in another city doesn't match.
    other = await client.get("/api/lists/tokyo/ramen", params={"location": "gion-higashiyama"})
    assert other.status_code == 404


async def test_hidden_and_merged_places_are_excluded(client, db):
    maker = await make_user(db, "maker")
    shown = await make_place(db, name="Shown", creator=maker)
    hidden = await make_place(db, name="Hidden", creator=maker, is_hidden=True)
    merged = await make_place(db, name="Merged", creator=maker)
    merged.merged_into_id = shown.id
    await db.flush()
    out = await get_list(client, "tokyo", "ramen")
    assert [i["name"] for i in out["items"]] == ["Shown"]
    assert out["total"] == 1
    assert hidden.id not in [i["id"] for i in out["items"]]


async def test_closed_place_stays_with_its_score_and_badge(client, db):
    maker = await make_user(db, "maker")
    gone = await make_place(db, name="Gone Ramen", creator=maker)
    await sign_in(client, "alice")
    await rank(client, gone, "liked", 1)
    before = (await get_list(client, "tokyo", "ramen"))["items"][0]["public_score"]
    gone.is_closed = True
    await db.flush()
    item = (await get_list(client, "tokyo", "ramen"))["items"][0]
    assert item["name"] == "Gone Ramen" and item["public_score"] == before is not None
    assert "closed" in item["badges"] and "unverified" in item["badges"]


async def test_pagination_keeps_global_rank_numbers(client, db):
    maker = await make_user(db, "maker")
    places = [await make_place(db, name=f"Ramen {i}", creator=maker) for i in range(3)]
    await sign_in(client, "alice")
    for i, p in enumerate(places):
        await rank(client, p, "liked", i + 1)
    page = await get_list(client, "tokyo", "ramen", limit=1, offset=1)
    assert page["total"] == 3 and page["offset"] == 1
    assert [(i["name"], i["rank"]) for i in page["items"]] == [("Ramen 1", 2)]


async def test_hidden_places_do_not_move_the_prior_in_lists(client, db):
    from app import scores

    maker = await make_user(db, "maker")
    visible = await make_place(db, name="Visible", creator=maker)
    shady = await make_place(db, name="Shady", creator=maker)
    await sign_in(client, "u_one")
    await rank(client, visible, "disliked", 1)  # 1.7
    await sign_in(client, "u_two")
    await rank(client, shady, "liked", 1)  # 8.35
    shady.is_hidden = True
    await db.flush()
    await scores.refresh_place(db, shady.id)
    out = await get_list(client, "tokyo", "ramen")
    assert [i["name"] for i in out["items"]] == ["Visible"]
    assert out["items"][0]["public_score"] == pytest.approx(1.7, abs=0.006)
