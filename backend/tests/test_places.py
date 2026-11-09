from sqlalchemy import text

from app.config import get_settings
from tests.factories import ASAKUSA, location, make_place, make_user, sign_in, subcategory

NAHA = (26.2124, 127.6809)


async def place_body(db, **overrides):
    sub = await subcategory(db, "ramen")
    loc = await location(db, "asakusa")
    body = {
        "name": "Test Ramen",
        "lat": ASAKUSA[0],
        "lng": ASAKUSA[1],
        "subcategory_id": sub.id,
        "location_id": loc.id,
    }
    body.update(overrides)
    return body


def error_fields(response):
    return {e["loc"][-1] for e in response.json()["detail"]}


async def test_signed_out_gets_401(client, db):
    r = await client.post("/api/places", json=await place_body(db))
    assert r.status_code == 401


async def test_create_place_is_unverified_with_creator(client, db):
    await sign_in(client, "adder")
    r = await client.post("/api/places", json=await place_body(db, name_ja="テストラーメン"))
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["status"] == "created"
    assert data["candidates"] == []
    place = data["place"]
    assert place["badges"] == ["unverified"]
    assert place["creator"] == "adder"
    assert place["name"] == "Test Ramen"
    assert place["name_ja"] == "テストラーメン"
    assert place["city"]["slug"] == "tokyo"
    assert place["location"]["slug"] == "asakusa"
    assert place["public_score"] is None
    assert place["viewer"]["can_edit"] is True
    # It is immediately readable on its detail page.
    got = await client.get(f"/api/places/{place['id']}")
    assert got.status_code == 200
    assert got.json()["badges"] == ["unverified"]


async def test_each_required_field_is_validated(client, db):
    await sign_in(client, "adder")
    for field in ("name", "lat", "lng", "subcategory_id", "location_id"):
        body = await place_body(db)
        del body[field]
        r = await client.post("/api/places", json=body)
        assert r.status_code == 422, field
        assert field in error_fields(r)


async def test_blank_name_is_rejected(client, db):
    await sign_in(client, "adder")
    r = await client.post("/api/places", json=await place_body(db, name="   "))
    assert r.status_code == 422
    assert "name" in error_fields(r)


async def test_unknown_subcategory_and_location(client, db):
    await sign_in(client, "adder")
    r = await client.post("/api/places", json=await place_body(db, subcategory_id=99999))
    assert r.status_code == 422
    assert error_fields(r) == {"subcategory_id"}
    r = await client.post("/api/places", json=await place_body(db, location_id=99999))
    assert r.status_code == 422
    assert error_fields(r) == {"location_id"}


async def test_location_from_another_city_is_rejected(client, db):
    await sign_in(client, "adder")
    gion = await location(db, "gion-higashiyama")
    r = await client.post("/api/places", json=await place_body(db, location_id=gion.id))
    assert r.status_code == 422
    assert error_fields(r) == {"location_id"}


async def test_any_location_of_the_pin_city_is_allowed(client, db):
    await sign_in(client, "adder")
    elsewhere = await location(db, "tokyo-elsewhere")
    r = await client.post("/api/places", json=await place_body(db, location_id=elsewhere.id))
    assert r.status_code == 201, r.text
    assert r.json()["place"]["location"]["is_catch_all"] is True


async def test_outside_coverage_is_blocked_with_city_list(client, db):
    await sign_in(client, "adder")
    r = await client.post("/api/places", json=await place_body(db, lat=NAHA[0], lng=NAHA[1]))
    assert r.status_code == 422
    data = r.json()
    assert data["detail"] == "We only cover these cities for now"
    names = {c["name"] for c in data["covered_cities"]}
    assert {"Tokyo", "Kyoto", "Osaka"} <= names


async def test_address_is_optional_and_stored(client, db):
    await sign_in(client, "adder")
    r = await client.post("/api/places", json=await place_body(db, address="1-2-3 Asakusa"))
    assert r.json()["place"]["address"] == "1-2-3 Asakusa"
    r = await client.post(
        "/api/places", json=await place_body(db, name="No Address Place", lat=35.74, lng=139.80)
    )
    assert r.status_code == 201
    assert r.json()["place"]["address"] is None


async def test_address_filled_from_geocode_cache(client, db, geocoder_stub):
    await sign_in(client, "adder")
    reverse = await client.get(
        "/api/geocode/reverse", params={"lat": ASAKUSA[0], "lng": ASAKUSA[1]}
    )
    assert reverse.json()["address"]
    r = await client.post("/api/places", json=await place_body(db))
    assert r.json()["place"]["address"] == reverse.json()["address"]
    assert len(geocoder_stub.calls) == 1


async def test_duplicate_check_endpoint_matches_create(client, db):
    owner = await make_user(db, "owner")
    await make_place(db, name="Existing", creator=owner, lat=ASAKUSA[0], lng=ASAKUSA[1])
    await sign_in(client, "adder")
    body = await place_body(db, name="Something Else")
    body.pop("location_id")
    r = await client.post("/api/places/duplicates", json=body)
    assert r.status_code == 200
    assert [c["name"] for c in r.json()["candidates"]] == ["Existing"]


# --- Adding a place you've been to (R3.6) -----------------------------------------------------


async def test_visited_place_needs_a_rating(client, db):
    await sign_in(client, "adder")
    r = await client.post("/api/places", json=await place_body(db, visited=True))
    assert r.status_code == 422
    assert "star rating" in r.text


async def test_review_without_visit_is_rejected(client, db):
    await sign_in(client, "adder")
    body = await place_body(db, review={"rating": 5})
    assert (await client.post("/api/places", json=body)).status_code == 422


async def test_low_rating_on_add_needs_a_comment(client, db):
    await sign_in(client, "adder")
    for review in ({"rating": 2}, {"rating": 1, "note": "  "}):
        r = await client.post("/api/places", json=await place_body(db, visited=True, review=review))
        assert r.status_code == 422, review
        assert "comment" in r.text
    count = await db.execute(text("SELECT count(*) FROM places WHERE name = 'Test Ramen'"))
    assert count.scalar_one() == 0


async def test_add_with_rating_ranks_it_for_the_adder(client, db):
    await sign_in(client, "adder")
    review = {"rating": 4, "note": "Rich broth", "visit_month": 5, "visit_year": 2025}
    r = await client.post("/api/places", json=await place_body(db, visited=True, review=review))
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["ranking"]["bucket"] == "liked"
    assert data["ranking"]["rating"] == 4
    assert data["ranking"]["note"] == "Rich broth"
    assert (data["ranking"]["visit_month"], data["ranking"]["visit_year"]) == (5, 2025)
    assert data["compare_count"] == 0
    assert data["city_name"] == "Tokyo" and data["city_rank_count"] == 1
    assert data["place"]["viewer"]["my_ranking"]["rating"] == 4


async def test_add_with_rating_lands_below_equal_or_better_ratings(client, db):
    await sign_in(client, "adder")
    made = {}
    for name, stars, lat in (("Five", 5, 0.0), ("Four", 4, 0.001), ("Also Five", 5, 0.002)):
        body = await place_body(
            db,
            name=name,
            lat=ASAKUSA[0] + lat,
            visited=True,
            review={"rating": stars},
            confirm_not_duplicate=True,
        )
        r = await client.post("/api/places", json=body)
        assert r.status_code == 201, r.text
        made[name] = r.json()
    assert made["Also Five"]["compare_count"] == 2
    mine = (await client.get("/api/me/rankings")).json()
    liked = mine["cities"][0]["categories"][0]["buckets"][0]["items"]
    assert [i["name"] for i in liked] == ["Five", "Also Five", "Four"]


async def test_plain_add_has_no_ranking(client, db):
    await sign_in(client, "adder")
    r = await client.post("/api/places", json=await place_body(db))
    assert r.status_code == 201, r.text
    assert r.json()["ranking"] is None


# --- Business lookup by name (R13.11) ----------------------------------------------------------

PHOTON_BODY = {
    "type": "FeatureCollection",
    "features": [
        {
            "geometry": {"type": "Point", "coordinates": [139.7966, 35.7101]},
            "properties": {
                "name": "Asakusa Ramen Yoroiya",
                "osm_key": "amenity",
                "osm_value": "restaurant",
                "housenumber": "1-36-7",
                "street": "Asakusa",
                "city": "Taito",
                "postcode": "111-0032",
                "countrycode": "JP",
            },
        },
        {
            "geometry": {"type": "Point", "coordinates": [139.7, 35.7]},
            "properties": {"name": "Some Road", "osm_key": "highway", "countrycode": "JP"},
        },
        {
            "geometry": {"type": "Point", "coordinates": [-0.1, 51.5]},
            "properties": {"name": "London Ramen", "osm_key": "amenity", "countrycode": "GB"},
        },
    ],
}


async def test_lookup_requires_sign_in(client, geocoder_stub):
    assert (await client.get("/api/places/lookup", params={"q": "ramen"})).status_code == 401
    assert geocoder_stub.calls == []


async def test_lookup_returns_named_japanese_businesses_with_a_guess(client, db, geocoder_stub):
    geocoder_stub.body = PHOTON_BODY
    await sign_in(client, "adder")
    r = await client.get("/api/places/lookup", params={"q": "yoroiya", "lat": 35.71, "lng": 139.79})
    assert r.status_code == 200, r.text
    results = r.json()["results"]
    assert len(results) == 1
    hit = results[0]
    assert hit["name"] == "Asakusa Ramen Yoroiya"
    assert hit["address"] == "1-36-7 Asakusa, Taito, 111-0032"
    assert (hit["lat"], hit["lng"]) == (35.7101, 139.7966)
    assert hit["kind"] == "amenity=restaurant"
    assert hit["subcategory_id"] == (await subcategory(db, "ramen")).id
    call = geocoder_stub.calls[0]
    assert call.path == "/lookup"
    assert call.params["q"] == "yoroiya" and call.params["lang"] == "en"
    assert float(call.params["lat"]) == 35.71 and float(call.params["lon"]) == 139.79
    assert call.headers["user-agent"] == get_settings().geocoder_user_agent


async def test_lookup_is_cached(client, geocoder_stub):
    geocoder_stub.body = PHOTON_BODY
    await sign_in(client, "adder")
    for _ in range(2):
        await client.get("/api/places/lookup", params={"q": "Yoroiya"})
    assert len(geocoder_stub.calls) == 1


async def test_lookup_failure_gives_empty_results(client, geocoder_stub):
    geocoder_stub.status = 500
    await sign_in(client, "adder")
    r = await client.get("/api/places/lookup", params={"q": "anything"})
    assert r.status_code == 200 and r.json() == {"results": []}
