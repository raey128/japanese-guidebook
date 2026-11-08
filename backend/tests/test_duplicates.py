from tests.factories import ASAKUSA, location, make_place, make_user, sign_in, subcategory
from tests.test_places import place_body

# ~0.0009 deg of latitude is ~100 m.
M33 = 0.0003
M100 = 0.0009
M300 = 0.0027


async def existing(db, **kw):
    owner = await make_user(db, kw.pop("owner", "dupowner"))
    kw.setdefault("lat", ASAKUSA[0])
    kw.setdefault("lng", ASAKUSA[1])
    return await make_place(db, creator=owner, **kw)


async def test_same_subcategory_within_50m_is_a_duplicate(client, db):
    other = await existing(db, name="Zzz Qqq", subcategory_slug="ramen")
    await sign_in(client, "adder")
    body = await place_body(db, name="Completely Different", lat=ASAKUSA[0] + M33)
    r = await client.post("/api/places", json=body)
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "duplicates"
    assert data["place"] is None
    assert [c["id"] for c in data["candidates"]] == [other.id]
    assert data["candidates"][0]["name"] == "Zzz Qqq"


async def test_same_subcategory_beyond_50m_is_not_a_duplicate(client, db):
    await existing(db, name="Zzz Qqq", subcategory_slug="ramen")
    await sign_in(client, "adder")
    body = await place_body(db, name="Completely Different", lat=ASAKUSA[0] + M100)
    assert (await client.post("/api/places", json=body)).status_code == 201


async def test_different_subcategory_nearby_is_not_a_duplicate(client, db):
    await existing(db, name="Zzz Qqq", subcategory_slug="sushi")
    await sign_in(client, "adder")
    body = await place_body(db, name="Completely Different", lat=ASAKUSA[0] + M33)
    assert (await client.post("/api/places", json=body)).status_code == 201


async def test_similar_name_in_other_subcategory_within_200m(client, db):
    other = await existing(db, name="Ichiran Ramen", subcategory_slug="ramen")
    await sign_in(client, "adder")
    izakaya = await subcategory(db, "izakaya")
    body = await place_body(
        db, name="Ichiran Ramen House", subcategory_id=izakaya.id, lat=ASAKUSA[0] + M100
    )
    r = await client.post("/api/places", json=body)
    assert r.status_code == 200
    assert [c["id"] for c in r.json()["candidates"]] == [other.id]


async def test_similar_name_at_300m_is_not_flagged(client, db):
    await existing(db, name="Ichiran Ramen", subcategory_slug="ramen")
    await sign_in(client, "adder")
    izakaya = await subcategory(db, "izakaya")
    body = await place_body(
        db, name="Ichiran Ramen House", subcategory_id=izakaya.id, lat=ASAKUSA[0] + M300
    )
    assert (await client.post("/api/places", json=body)).status_code == 201


async def test_japanese_name_trigram_similarity(client, db):
    other = await existing(db, name="Unrelated English", name_ja="浅草ラーメン", subcategory_slug="ramen")
    await sign_in(client, "adder")
    izakaya = await subcategory(db, "izakaya")
    body = await place_body(
        db,
        name="Other Words",
        name_ja="浅草ラーメン店",
        subcategory_id=izakaya.id,
        lat=ASAKUSA[0] + M100,
    )
    r = await client.post("/api/places", json=body)
    assert r.status_code == 200
    assert [c["id"] for c in r.json()["candidates"]] == [other.id]


async def test_confirm_not_duplicate_creates_anyway(client, db):
    await existing(db, name="Zzz Qqq", subcategory_slug="ramen")
    await sign_in(client, "adder")
    body = await place_body(db, name="Completely Different", lat=ASAKUSA[0] + M33)
    body["confirm_not_duplicate"] = True
    r = await client.post("/api/places", json=body)
    assert r.status_code == 201
    assert r.json()["status"] == "created"


async def test_hidden_and_merged_places_are_not_candidates(client, db):
    await existing(db, name="Hidden One", subcategory_slug="ramen", is_hidden=True)
    survivor = await existing(db, name="Survivor", subcategory_slug="sushi", owner="dup2",
                              lat=ASAKUSA[0] + 0.01)
    merged = await existing(db, name="Merged One", subcategory_slug="ramen", owner="dup3")
    merged.merged_into_id = survivor.id
    await db.flush()
    await sign_in(client, "adder")
    body = await place_body(db, name="Hidden One", lat=ASAKUSA[0] + M33)
    r = await client.post("/api/places", json=body)
    assert r.status_code == 201, r.text


async def test_closed_places_are_still_candidates(client, db):
    other = await existing(db, name="Closed Spot", subcategory_slug="ramen", is_closed=True)
    await sign_in(client, "adder")
    body = await place_body(db, name="Fresh Name", lat=ASAKUSA[0] + M33)
    r = await client.post("/api/places", json=body)
    assert r.status_code == 200
    assert r.json()["candidates"][0]["id"] == other.id


async def test_duplicates_endpoint_requires_sign_in(client, db):
    body = await place_body(db)
    body.pop("location_id")
    assert (await client.post("/api/places/duplicates", json=body)).status_code == 401
