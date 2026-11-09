"""Search by English or Japanese name, with filters."""

from sqlalchemy import text

from app.models import Bookmark
from tests.factories import make_place, make_user, sign_in
from tests.test_ranking import rank


async def search(client, **params):
    r = await client.get("/api/search", params=params)
    assert r.status_code == 200, r.text
    return r.json()["items"]


async def test_english_search_and_response_shape(client, db):
    maker = await make_user(db, "maker")
    p = await make_place(
        db,
        name="Ichiran Shibuya",
        creator=maker,
        name_ja="一蘭 渋谷店",
        location_slug="shibuya-harajuku",
    )
    await make_place(db, name="Totally Different", creator=maker)
    for q in ("ichiran", "Ichiran Shib", "ICHIRAN SHIBUYA"):
        items = await search(client, q=q)
        assert [i["id"] for i in items] == [p.id], q
    item = (await search(client, q="ichiran"))[0]
    assert item["name_ja"] == "一蘭 渋谷店"
    assert item["city"]["slug"] == "tokyo" and item["location"]["slug"] == "shibuya-harajuku"
    assert item["public_score"] is None and item["ranker_count"] == 0
    assert item["is_bookmarked"] is False and item["my_ranking_id"] is None


async def test_close_misspelling_matches_by_trigram(client, db):
    maker = await make_user(db, "maker")
    p = await make_place(db, name="Ichiran Ramen Honten", creator=maker)
    assert [i["id"] for i in await search(client, q="Ichiran Ramen Hontan")] == [p.id]


async def test_japanese_search_full_and_substring(client, db):
    maker = await make_user(db, "maker")
    sensoji = await make_place(
        db, name="Senso-ji", creator=maker, name_ja="浅草寺", subcategory_slug="temple"
    )
    gate = await make_place(
        db, name="Kaminarimon", creator=maker, name_ja="雷門", subcategory_slug="landmark"
    )
    assert [i["id"] for i in await search(client, q="浅草寺")] == [sensoji.id]
    assert [i["id"] for i in await search(client, q="浅草")] == [sensoji.id]
    assert [i["id"] for i in await search(client, q="雷")] == [gate.id]


async def test_no_match_and_blank_query_return_empty(client, db):
    maker = await make_user(db, "maker")
    await make_place(db, name="Some Ramen", creator=maker)
    assert await search(client, q="zzzqqqxxx") == []
    assert await search(client, q="") == []
    assert await search(client) == []
    assert await search(client, q="   ") == []


async def test_like_wildcards_in_query_are_literal(client, db):
    maker = await make_user(db, "maker")
    await make_place(db, name="Plain Ramen", creator=maker)
    assert await search(client, q="%%%%") == []
    assert await search(client, q="____") == []


async def test_filters_by_city_location_and_category(client, db):
    maker = await make_user(db, "maker")
    t_ramen = await make_place(db, name="Moon Ramen", creator=maker)
    t_cafe = await make_place(
        db,
        name="Moon Cafe",
        creator=maker,
        subcategory_slug="cafe",
        location_slug="shibuya-harajuku",
    )
    k_ramen = await make_place(
        db, name="Moon Kyoto", creator=maker, location_slug="gion-higashiyama"
    )
    temple = await make_place(db, name="Moon Temple", creator=maker, subcategory_slug="temple")

    def ids(items):
        return sorted(i["id"] for i in items)

    everything = [t_ramen.id, t_cafe.id, k_ramen.id, temple.id]
    assert ids(await search(client, q="moon")) == sorted(everything)
    assert ids(await search(client, q="moon", city="kyoto")) == [k_ramen.id]
    assert ids(await search(client, q="moon", city="tokyo")) == sorted(
        [t_ramen.id, t_cafe.id, temple.id]
    )
    assert ids(await search(client, q="moon", location="shibuya-harajuku")) == [t_cafe.id]
    assert ids(await search(client, q="moon", category="cafe")) == [t_cafe.id]
    assert ids(await search(client, q="moon", category="food")) == sorted(
        [t_ramen.id, t_cafe.id, k_ramen.id]
    )
    assert ids(await search(client, q="moon", category="sights")) == [temple.id]
    assert ids(await search(client, q="moon", city="kyoto", category="sights")) == []
    assert await search(client, q="moon", city="atlantis") == []
    assert await search(client, q="moon", category="nonsense") == []


async def test_hidden_and_merged_places_are_not_found(client, db):
    maker = await make_user(db, "maker")
    await make_place(db, name="Secret Ramen", creator=maker, is_hidden=True)
    survivor = await make_place(db, name="Survivor Ramen", creator=maker)
    merged = await make_place(db, name="Secret Merged Ramen", creator=maker)
    merged.merged_into_id = survivor.id
    await db.flush()
    assert await search(client, q="secret") == []
    assert [i["id"] for i in await search(client, q="survivor")] == [survivor.id]


async def test_ordering_and_limit(client, db):
    maker = await make_user(db, "maker")
    exact = await make_place(db, name="Tonkotsu", creator=maker)
    longer = await make_place(db, name="Tonkotsu House of Noodles", creator=maker)
    items = await search(client, q="Tonkotsu")
    assert [i["id"] for i in items] == [exact.id, longer.id]
    assert len(await search(client, q="Tonkotsu", limit=1)) == 1


async def test_results_carry_scores_and_viewer_flags(client, db):
    maker = await make_user(db, "maker")
    ranked = await make_place(db, name="Moon Ranked", creator=maker)
    wanted = await make_place(db, name="Moon Wanted", creator=maker)
    plain = await make_place(db, name="Moon Plain", creator=maker)
    alice = await sign_in(client, "alice")
    my_id = (await rank(client, ranked, "liked", 1)).json()["ranking"]["id"]
    db.add(Bookmark(user_id=alice["id"], place_id=wanted.id))
    await db.flush()

    items = {i["id"]: i for i in await search(client, q="moon")}
    assert items[ranked.id]["my_ranking_id"] == my_id
    assert items[ranked.id]["public_score"] is not None and items[ranked.id]["ranker_count"] == 1
    assert items[wanted.id]["is_bookmarked"] is True and items[wanted.id]["my_ranking_id"] is None
    assert items[plain.id]["is_bookmarked"] is False


async def test_search_uses_the_trigram_indexes(db):
    """With sequential scans discouraged the planner must be able to use the GIN indexes."""
    await db.execute(text("SET LOCAL enable_seqscan = off"))
    plan = "\n".join(
        r[0]
        for r in await db.execute(
            text(
                "EXPLAIN SELECT id FROM places WHERE name % 'ramen' OR name_ja % 'ramen' "
                "OR name ILIKE '%ramen%' OR name_ja ILIKE '%ramen%'"
            )
        )
    )
    assert "ix_places_name_trgm" in plan and "ix_places_name_ja_trgm" in plan
