import time

from app.config import get_settings
from tests.factories import sign_in

LAT, LNG = 35.71201, 139.79601


async def reverse(client, lat=LAT, lng=LNG):
    r = await client.get("/api/geocode/reverse", params={"lat": lat, "lng": lng})
    assert r.status_code == 200, r.text
    return r.json()["address"]


async def test_requires_sign_in(client, geocoder_stub):
    r = await client.get("/api/geocode/reverse", params={"lat": LAT, "lng": LNG})
    assert r.status_code == 401
    assert geocoder_stub.calls == []


async def test_reverse_geocode_calls_stub_with_user_agent_and_params(client, geocoder_stub):
    await sign_in(client, "geo")
    assert await reverse(client) == "1-2-3 Asakusa, Taito, Tokyo, Japan"
    assert len(geocoder_stub.calls) == 1
    call = geocoder_stub.calls[0]
    assert call.headers["user-agent"] == get_settings().geocoder_user_agent
    assert call.params["format"] == "jsonv2"
    assert float(call.params["lat"]) == LAT
    assert float(call.params["lon"]) == LNG
    assert call.params["accept-language"] == "en"


async def test_cache_hit_does_not_call_out_again(client, geocoder_stub):
    await sign_in(client, "geo")
    first = await reverse(client, 35.71201, 139.79601)
    # Same coordinates to 4 decimals.
    second = await reverse(client, 35.71204, 139.79598)
    assert first == second
    assert len(geocoder_stub.calls) == 1


async def test_server_error_gives_null_address_and_is_not_cached(
    client, geocoder_stub, monkeypatch
):
    monkeypatch.setattr(get_settings(), "geocoder_min_interval_s", 0.0)
    await sign_in(client, "geo")
    geocoder_stub.status = 500
    assert await reverse(client) is None
    geocoder_stub.status = 200
    assert await reverse(client) == "1-2-3 Asakusa, Taito, Tokyo, Japan"
    assert len(geocoder_stub.calls) == 2


async def test_bad_bodies_give_null_address(client, geocoder_stub, monkeypatch):
    monkeypatch.setattr(get_settings(), "geocoder_min_interval_s", 0.0)
    await sign_in(client, "geo")
    for body in (
        {"error": "Unable to geocode"},
        {"display_name": ""},
        ["nope"],
        {"display_name": 5},
    ):
        geocoder_stub.body = body
        assert await reverse(client) is None


async def test_timeout_gives_null_quickly(client, geocoder_stub, monkeypatch):
    monkeypatch.setattr(get_settings(), "geocoder_timeout_s", 0.3)
    await sign_in(client, "geo")
    geocoder_stub.delay_s = 1.5
    started = time.monotonic()
    assert await reverse(client) is None
    assert time.monotonic() - started < 1.2


async def test_unreachable_geocoder_gives_null(client):
    # No stub: the default test URL points at a closed port.
    await sign_in(client, "geo")
    assert await reverse(client) is None


async def test_throttle_blocks_second_call_within_interval(client, geocoder_stub):
    await sign_in(client, "geo")
    assert await reverse(client, 35.7120, 139.7960) is not None
    assert await reverse(client, 35.6595, 139.7005) is None  # different coords, too soon
    assert len(geocoder_stub.calls) == 1


async def test_second_call_allowed_once_interval_has_passed(client, geocoder_stub, monkeypatch):
    monkeypatch.setattr(get_settings(), "geocoder_min_interval_s", 0.0)
    await sign_in(client, "geo")
    assert await reverse(client, 35.7120, 139.7960) is not None
    assert await reverse(client, 35.6595, 139.7005) is not None
    assert len(geocoder_stub.calls) == 2


async def test_search_returns_results(client, geocoder_stub):
    await sign_in(client, "geo")
    geocoder_stub.body = [
        {"display_name": "Senso-ji, Asakusa, Tokyo", "lat": "35.7148", "lon": "139.7967"},
        {"display_name": "broken entry"},
    ]
    r = await client.get("/api/geocode/search", params={"q": "Senso-ji"})
    assert r.status_code == 200
    assert r.json() == {
        "results": [{"label": "Senso-ji, Asakusa, Tokyo", "lat": 35.7148, "lng": 139.7967}]
    }
    call = geocoder_stub.calls[0]
    assert call.path.endswith("/search")
    assert call.params["q"] == "Senso-ji"
    assert call.headers["user-agent"] == get_settings().geocoder_user_agent


async def test_search_failure_gives_empty_results(client, geocoder_stub):
    await sign_in(client, "geo")
    geocoder_stub.status = 500
    r = await client.get("/api/geocode/search", params={"q": "anything"})
    assert r.json() == {"results": []}


async def test_search_shares_the_throttle(client, geocoder_stub):
    await sign_in(client, "geo")
    geocoder_stub.body = [{"display_name": "X", "lat": "1", "lon": "2"}]
    assert (await client.get("/api/geocode/search", params={"q": "first"})).json()["results"]
    assert (await client.get("/api/geocode/search", params={"q": "second"})).json() == {
        "results": []
    }
    assert len(geocoder_stub.calls) == 1


async def test_submit_works_when_geocoding_fails(client, db, geocoder_stub):
    from tests.test_places import place_body

    await sign_in(client, "geo")
    geocoder_stub.status = 500
    assert await reverse(client) is None
    r = await client.post("/api/places", json=await place_body(db))
    assert r.status_code == 201
    assert r.json()["place"]["address"] is None


# --- Business lookup: subcategory guesses (R13.11) ---------------------------------------------


def test_guess_slug_from_tags_and_names():
    from app.geocoding import guess_slug

    cases = [
        ("amenity", "cafe", "Blue Bottle", "cafe"),
        ("amenity", "restaurant", "Ichiran Ramen", "ramen"),
        ("amenity", "restaurant", "すし匠", "sushi"),
        ("amenity", "restaurant", "Generic Bistro", None),
        ("amenity", "restaurant", "Miyajima Grill 宮", None),  # shrine word ignored for food
        ("amenity", "place_of_worship", "Meiji Jingu 明治神宮", "shrine"),
        ("amenity", "place_of_worship", "Senso-ji", "temple"),
        ("tourism", "hotel", "Park Hyatt", "hotel"),
        ("tourism", "guest_house", "Ryokan Sawanoya", "ryokan"),
        ("tourism", "guest_house", "K's House", "hostel"),
        ("shop", "bakery", "Pan", "sweets"),
        ("shop", "clothes", "Beams", "shopping"),
        ("historic", "castle", "Osaka Castle", "castle"),
        ("amenity", "public_bath", "Jakotsuyu", "onsen"),
        (None, None, "Mystery", None),
    ]
    for key, value, name, expected in cases:
        assert guess_slug(key, value, name) == expected, (key, value, name)


def test_parse_photon_skips_malformed_features():
    from app.geocoding import parse_photon

    assert parse_photon(None) == [] and parse_photon({"features": "x"}) == []
    good = {"geometry": {"coordinates": [139.7, 35.6]}, "properties": {"name": "Cafe A"}}
    bad = [
        {"geometry": {}},
        {"properties": {"name": "No geometry"}},
        {"geometry": {"coordinates": [1, 2]}, "properties": {}},
    ]
    out = parse_photon({"features": [*bad, good]})
    assert [(r.name, r.lat, r.lng, r.address) for r in out] == [("Cafe A", 35.6, 139.7, None)]


# --- Area lookup for the map search bar (R12.7) ------------------------------------------------

AREA_BODY = {
    "features": [
        {
            "geometry": {"coordinates": [139.7583, 35.6663]},
            "properties": {
                "name": "Shimbashi",
                "osm_key": "railway",
                "osm_value": "station",
                "district": "Minato",
                "city": "Tokyo",
                "countrycode": "JP",
            },
        },
        {
            "geometry": {"coordinates": [139.7584, 35.6664]},
            "properties": {
                "name": "Shimbashi",
                "osm_key": "public_transport",
                "osm_value": "station",
            },
        },
        {
            "geometry": {"coordinates": [139.757, 35.667]},
            "properties": {
                "name": "Shinbashi",
                "osm_key": "place",
                "osm_value": "quarter",
                "city": "Tokyo",
            },
        },
        {
            "geometry": {"coordinates": [139.75, 35.66]},
            "properties": {"name": "Some Cafe", "osm_key": "amenity", "osm_value": "cafe"},
        },
    ]
}


async def test_area_lookup_is_public_and_flies_to_areas_and_stations(client, geocoder_stub):
    geocoder_stub.body = AREA_BODY
    r = await client.get("/api/geo/areas", params={"q": "shimbashi", "lat": 35.68, "lng": 139.76})
    assert r.status_code == 200, r.text
    results = r.json()["results"]
    assert [(x["name"], x["kind"], x["zoom"]) for x in results] == [
        ("Shimbashi", "station", 16),  # the duplicate station is dropped
        ("Shinbashi", "area", 15),
    ]
    assert results[0]["detail"] == "Minato, Tokyo"
    call = geocoder_stub.calls[0]
    assert call.path == "/lookup" and call.params["q"] == "shimbashi"


async def test_area_lookup_failure_is_empty(client, geocoder_stub):
    geocoder_stub.status = 500
    r = await client.get("/api/geo/areas", params={"q": "nowhere"})
    assert r.status_code == 200 and r.json() == {"results": []}
