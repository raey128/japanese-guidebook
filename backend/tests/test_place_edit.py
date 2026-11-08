import pytest
from sqlalchemy import text

from app import ranking
from app.models import Place
from tests.factories import GION, location, make_place, make_user, sign_in, subcategory, user_by_name
from tests.test_places import NAHA, place_body


async def create(client, db, **overrides):
    r = await client.post("/api/places", json=await place_body(db, **overrides))
    assert r.status_code == 201, r.text
    return r.json()["place"]


async def age(db, place_id, hours):
    await db.execute(
        text("UPDATE places SET created_at = now() - make_interval(hours => :h) WHERE id = :id"),
        {"h": hours, "id": place_id},
    )


async def test_creator_can_edit_within_window(client, db):
    await sign_in(client, "maker")
    place = await create(client, db)
    assert place["edit_deadline"] is not None
    sushi = await subcategory(db, "sushi")
    r = await client.patch(
        f"/api/places/{place['id']}",
        json={"name": "Renamed", "name_ja": "改名", "subcategory_id": sushi.id,
              "lat": 35.7125, "lng": 139.7965},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["name"] == "Renamed"
    assert data["name_ja"] == "改名"
    assert data["subcategory"]["slug"] == "sushi"
    assert data["lat"] == pytest.approx(35.7125)
    assert data["lng"] == pytest.approx(139.7965)


async def test_name_ja_can_be_cleared(client, db):
    await sign_in(client, "maker")
    place = await create(client, db, name_ja="テスト")
    r = await client.patch(f"/api/places/{place['id']}", json={"name_ja": None})
    assert r.status_code == 200
    assert r.json()["name_ja"] is None


async def test_edit_after_window_is_403_for_creator(client, db):
    await sign_in(client, "maker")
    place = await create(client, db)
    await age(db, place["id"], 25)
    r = await client.patch(f"/api/places/{place['id']}", json={"name": "Too Late"})
    assert r.status_code == 403
    assert "24-hour edit window" in r.json()["detail"]
    detail = (await client.get(f"/api/places/{place['id']}")).json()
    assert detail["viewer"]["can_edit"] is False
    assert detail["edit_deadline"] is None


async def test_other_user_cannot_edit(client_factory, db):
    a, b = client_factory(), client_factory()
    await sign_in(a, "maker")
    await sign_in(b, "stranger")
    place = await create(a, db)
    r = await b.patch(f"/api/places/{place['id']}", json={"name": "Hijack"})
    assert r.status_code == 403
    assert (await a.get(f"/api/places/{place['id']}")).json()["name"] == "Test Ramen"


async def test_signed_out_edit_is_401(client_factory, db):
    a, anon = client_factory(), client_factory()
    await sign_in(a, "maker")
    place = await create(a, db)
    assert (await anon.patch(f"/api/places/{place['id']}", json={"name": "x"})).status_code == 401


async def test_admin_can_edit_after_window(client_factory, db):
    a, boss = client_factory(), client_factory()
    await sign_in(a, "maker")
    await sign_in(boss, "boss")
    (await user_by_name(db, "boss")).is_admin = True
    await db.flush()
    place = await create(a, db)
    await age(db, place["id"], 48)
    r = await boss.patch(f"/api/places/{place['id']}", json={"name": "Fixed By Admin"})
    assert r.status_code == 200
    assert r.json()["name"] == "Fixed By Admin"


async def test_unknown_place_is_404(client):
    await sign_in(client, "maker")
    assert (await client.patch("/api/places/999999", json={"name": "x"})).status_code == 404


async def test_hidden_place_is_404_for_creator(client, db):
    await sign_in(client, "maker")
    place = await create(client, db)
    await db.execute(text("UPDATE places SET is_hidden = true WHERE id = :id"), {"id": place["id"]})
    r = await client.patch(f"/api/places/{place['id']}", json={"name": "x"})
    assert r.status_code == 404


async def test_edit_validation(client, db):
    await sign_in(client, "maker")
    place = await create(client, db)
    url = f"/api/places/{place['id']}"
    assert (await client.patch(url, json={"name": "  "})).status_code == 422
    assert (await client.patch(url, json={"subcategory_id": 99999})).status_code == 422
    assert (await client.patch(url, json={"location_id": 99999})).status_code == 422
    assert (await client.patch(url, json={"lat": 35.7})).status_code == 422
    gion = await location(db, "gion-higashiyama")
    assert (await client.patch(url, json={"location_id": gion.id})).status_code == 422


async def test_moving_pin_outside_coverage_is_blocked(client, db):
    await sign_in(client, "maker")
    place = await create(client, db)
    r = await client.patch(
        f"/api/places/{place['id']}", json={"lat": NAHA[0], "lng": NAHA[1]}
    )
    assert r.status_code == 422
    assert r.json()["detail"] == "We only cover these cities for now"


async def test_moving_pin_to_another_city_needs_a_matching_location(client, db):
    await sign_in(client, "maker")
    place = await create(client, db)
    url = f"/api/places/{place['id']}"
    r = await client.patch(url, json={"lat": GION[0], "lng": GION[1]})
    assert r.status_code == 422  # still tagged with a Tokyo location
    gion = await location(db, "gion-higashiyama")
    r = await client.patch(
        url, json={"lat": GION[0], "lng": GION[1], "location_id": gion.id}
    )
    assert r.status_code == 200, r.text
    assert r.json()["city"]["slug"] == "kyoto"


async def test_changing_subcategory_moves_existing_ranking(client, db):
    user = await sign_in(client, "maker")
    placed = await create(client, db)
    place = await db.get(Place, placed["id"])
    await ranking.place_ranking(
        db, user_id=user["id"], place=place, bucket="liked", position=1, expected_version=0
    )
    sushi = await subcategory(db, "sushi")
    r = await client.patch(f"/api/places/{placed['id']}", json={"subcategory_id": sushi.id})
    assert r.status_code == 200, r.text
    row = (
        await db.execute(
            text("SELECT subcategory_id, bucket, position FROM rankings WHERE place_id = :id"),
            {"id": placed["id"]},
        )
    ).one()
    assert row.subcategory_id == sushi.id
    assert (row.bucket, row.position) == ("liked", 1)
    # The old List is gone/empty and the place now counts in the new category.
    old = (
        await db.execute(
            text("SELECT count(*) FROM rankings WHERE subcategory_id <> :s AND user_id = :u"),
            {"s": sushi.id, "u": user["id"]},
        )
    ).scalar_one()
    assert old == 0
    assert r.json()["viewer"]["my_ranking"]["bucket"] == "liked"


async def test_other_users_edit_leaves_place_untouched(client_factory, db):
    owner = await make_user(db, "someone")
    place = await make_place(db, name="Seed Spot", creator=owner)
    b = client_factory()
    await sign_in(b, "stranger")
    assert (await b.patch(f"/api/places/{place.id}", json={"name": "x"})).status_code == 403
    assert place.name == "Seed Spot"
