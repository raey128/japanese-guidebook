from sqlalchemy import text

from tests.factories import sign_in
from tests.test_places import place_body


async def add(client, db, i, lat0=35.70):
    """Add a distinct place far enough from the others to never look like a duplicate."""
    body = await place_body(db, name=f"Spam Place {i} Xq{i}", lat=lat0 + i * 0.004, lng=139.796)
    body["confirm_not_duplicate"] = True
    return await client.post("/api/places", json=body)


async def test_new_account_gets_five_places_per_day(client, db):
    await sign_in(client, "newbie")
    for i in range(5):
        assert (await add(client, db, i)).status_code == 201, i
    r = await add(client, db, 5)
    assert r.status_code == 429
    assert r.json()["detail"] == "You can add 5 places per 24 hours. Try again later."


async def test_established_account_gets_twenty_places_per_day(client, db):
    user = await sign_in(client, "veteran")
    await db.execute(
        text("UPDATE users SET created_at = now() - interval '8 days' WHERE id = :id"),
        {"id": user["id"]},
    )
    for i in range(20):
        assert (await add(client, db, i, lat0=35.60)).status_code == 201, i
    r = await add(client, db, 20, lat0=35.60)
    assert r.status_code == 429
    assert "20 places per 24 hours" in r.json()["detail"]


async def test_places_older_than_a_day_do_not_count(client, db):
    user = await sign_in(client, "newbie2")
    for i in range(5):
        assert (await add(client, db, i)).status_code == 201
    await db.execute(
        text("UPDATE places SET created_at = now() - interval '25 hours' WHERE creator_id = :id"),
        {"id": user["id"]},
    )
    assert (await add(client, db, 5)).status_code == 201


async def test_limits_are_per_user(client_factory, db):
    a, b = client_factory(), client_factory()
    await sign_in(a, "user_a")
    await sign_in(b, "user_b")
    for i in range(5):
        assert (await add(a, db, i)).status_code == 201
    assert (await add(a, db, 5)).status_code == 429
    assert (await add(b, db, 6)).status_code == 201


async def test_rate_limit_applies_before_duplicate_check(client, db):
    await sign_in(client, "newbie3")
    for i in range(5):
        assert (await add(client, db, i)).status_code == 201
    body = await place_body(db, name="Spam Place 0 Xq0", lat=35.70)  # also a duplicate
    assert (await client.post("/api/places", json=body)).status_code == 429
