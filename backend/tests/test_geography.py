import pytest

from tests.factories import ASAKUSA, GION


async def test_suggests_nearest_named_location(client):
    r = await client.get("/api/locations/suggest", params={"lat": ASAKUSA[0], "lng": ASAKUSA[1]})
    body = r.json()
    assert body["outside_coverage"] is False
    assert body["location"]["slug"] == "asakusa"
    assert body["city"]["slug"] == "tokyo"


async def test_suggestion_in_another_city(client):
    r = await client.get("/api/locations/suggest", params={"lat": GION[0], "lng": GION[1]})
    assert r.json()["city"]["slug"] == "kyoto"


@pytest.mark.parametrize(
    "lat,lng",
    [
        (26.2124, 127.6809),  # Naha, Okinawa: far from every launch city
        (51.5074, -0.1278),  # London
    ],
)
async def test_outside_coverage(client, lat, lng):
    body = (await client.get("/api/locations/suggest", params={"lat": lat, "lng": lng})).json()
    assert body["outside_coverage"] is True
    assert body["location"] is None
    assert len(body["covered_cities"]) == 8


async def test_coverage_radius_is_config(client, monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "coverage_radius_km", 0.001)
    body = (await client.get("/api/locations/suggest", params={"lat": 35.70, "lng": 139.80})).json()
    assert body["outside_coverage"] is True


async def test_catch_all_is_never_suggested(client):
    # A grid of points across every city: no suggestion may be a catch-all.
    cities = (await client.get("/api/cities")).json()
    for city in cities:
        for dlat in (-0.1, 0, 0.1):
            for dlng in (-0.1, 0, 0.1):
                body = (
                    await client.get(
                        "/api/locations/suggest",
                        params={"lat": city["lat"] + dlat, "lng": city["lng"] + dlng},
                    )
                ).json()
                if not body["outside_coverage"]:
                    assert body["location"]["is_catch_all"] is False


async def test_city_locations_include_catch_all_last(client):
    locs = (await client.get("/api/cities/tokyo/locations")).json()
    assert locs[-1]["slug"] == "tokyo-elsewhere"
    assert locs[-1]["name"] == "Elsewhere in Tokyo"
    assert all(not loc["is_catch_all"] for loc in locs[:-1])


async def test_subcategories_listed_with_top_category(client):
    subs = (await client.get("/api/subcategories")).json()
    assert len(subs) == 27
    assert {s["top_category"] for s in subs} == {"food", "sights", "stays", "experiences"}
