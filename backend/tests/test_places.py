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
