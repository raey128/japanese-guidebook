"""Anonymous usage events (R18)."""

import uuid

from sqlalchemy import text

from app import events
from tests.factories import make_user, sign_in

B1 = str(uuid.uuid4())


async def test_events_table_has_no_identity_columns(db):
    cols = {
        r.column_name
        for r in await db.execute(
            text("SELECT column_name FROM information_schema.columns WHERE table_name = 'events'")
        )
    }
    assert cols == {"id", "browser_id", "type", "source", "created_at"}


async def test_post_events_keeps_allowed_and_drops_unknown(client, db):
    r = await client.post(
        "/api/events",
        json={
            "browser_id": B1,
            "events": [
                {"type": "app_open", "source": "first"},
                {"type": "place_open", "source": "top_pick"},
                {"type": "place_open", "source": "bogus"},
                {"type": "delete_everything"},
            ],
        },
    )
    assert r.status_code == 204
    rows = (
        await db.execute(
            text("SELECT type, source FROM events WHERE browser_id = :b ORDER BY id"), {"b": B1}
        )
    ).all()
    assert [(r.type, r.source) for r in rows] == [("app_open", "first"), ("place_open", "top_pick")]


async def test_batch_size_is_capped(client):
    r = await client.post(
        "/api/events", json={"browser_id": B1, "events": [{"type": "near_me"}] * 21}
    )
    assert r.status_code == 422


async def test_hourly_cap_per_browser(client, db, monkeypatch):
    monkeypatch.setattr(events, "PER_BROWSER_HOURLY_CAP", 3)
    b = str(uuid.uuid4())
    await client.post("/api/events", json={"browser_id": b, "events": [{"type": "near_me"}] * 5})
    n = (
        await db.execute(text("SELECT count(*) FROM events WHERE browser_id = :b"), {"b": b})
    ).scalar_one()
    assert n == 3


async def test_rollup_and_expiry(db):
    b = uuid.uuid4()
    await db.execute(
        text(
            "INSERT INTO events (browser_id, type, source, created_at) VALUES "
            "(:b, 'save', 'pin', now() - interval '2 days'), "
            "(:b, 'save', 'pin', now() - interval '2 days'), "
            "(:b, 'save', 'pin', now() - interval '100 days')"
        ),
        {"b": b},
    )
    await events.rollup_and_expire(db)
    daily = (
        await db.execute(
            text(
                "SELECT count, browsers FROM event_daily "
                "WHERE type = 'save' AND day = current_date - 2"
            )
        )
    ).one()
    assert (daily.count, daily.browsers) == (2, 1)
    left = (
        await db.execute(text("SELECT count(*) FROM events WHERE browser_id = :b"), {"b": b})
    ).scalar_one()
    assert left == 2


async def test_stats_funnel_is_admin_only(client_factory, db):
    user, admin = client_factory(), client_factory()
    await sign_in(user, "stats_user")
    await make_user(db, "stats_admin", is_admin=True)
    await sign_in(admin, "stats_admin")
    assert (await user.get("/api/admin/stats")).status_code == 403

    b = str(uuid.uuid4())
    await user.post(
        "/api/events",
        json={
            "browser_id": b,
            "events": [
                {"type": "app_open", "source": "first"},
                {"type": "place_open", "source": "pin"},
                {"type": "save"},
                {"type": "search_no_result"},
            ],
        },
    )
    weeks = (await admin.get("/api/admin/stats")).json()["weeks"]
    w = weeks[0]
    assert w["first_visits"] >= 1 and w["opened_place"] >= 1 and w["opened_within_2min"] >= 1
    assert w["saved"] >= 1 and w["searches_no_result"] >= 1
