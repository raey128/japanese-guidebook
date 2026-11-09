import pytest
from sqlalchemy import inspect, text

from app.cli.commands import run_in_session
from tests.factories import sign_in


async def test_new_username_needs_confirmation_then_creates(client):
    r = await client.post("/api/auth/sign-in", json={"username": "hanako"})
    assert r.status_code == 200
    assert r.json() == {"status": "needs_confirmation", "username": "hanako", "user": None}
    assert (await client.get("/api/me")).json() == {"user": None}

    r = await client.post("/api/auth/sign-in", json={"username": "hanako", "create": True})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "signed_in"
    assert body["user"]["username"] == "hanako"
    assert (await client.get("/api/me")).json()["user"]["username"] == "hanako"


async def test_existing_username_signs_straight_in(client_factory):
    await sign_in(client_factory(), "taro")
    other_device = client_factory()
    r = await other_device.post("/api/auth/sign-in", json={"username": "taro"})
    assert r.json()["status"] == "signed_in"
    assert (await other_device.get("/api/me")).json()["user"]["username"] == "taro"


async def test_usernames_are_case_insensitive(client_factory):
    await sign_in(client_factory(), "kenji")
    r = await client_factory().post("/api/auth/sign-in", json={"username": "KENJI"})
    assert r.json()["status"] == "signed_in"
    assert r.json()["user"]["username"] == "kenji"


@pytest.mark.parametrize(
    "username",
    [
        "ab",
        "a" * 21,
        "has space",
        "dash-name",
        "émile",
        "名前さん",
        "guidebook",
        "admin",
        "GuideBook",
    ],
)
async def test_invalid_or_reserved_usernames_are_rejected(client, username):
    r = await client.post("/api/auth/sign-in", json={"username": username, "create": True})
    assert r.status_code == 400
    assert r.json()["detail"]
    assert (await client.get("/api/me")).json() == {"user": None}


async def test_nobody_can_sign_in_as_the_system_user(client):
    r = await client.post("/api/auth/sign-in", json={"username": "guidebook"})
    assert r.status_code == 400


async def test_session_cookie_is_opaque_httponly_lax_30_days(client):
    r = await client.post("/api/auth/sign-in", json={"username": "yuki", "create": True})
    cookie = r.headers["set-cookie"]
    assert cookie.startswith("gb_session=")
    assert "HttpOnly" in cookie
    assert "samesite=lax" in cookie.lower()
    assert "Max-Age=2592000" in cookie
    token = cookie.split(";")[0].split("=", 1)[1]
    assert "yuki" not in token and len(token) >= 32


async def test_sign_in_creates_and_sign_out_deletes_session_row(client, db):
    await sign_in(client, "momo")
    count = text(
        "SELECT count(*) FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.username='momo'"
    )
    assert (await db.execute(count)).scalar_one() == 1
    r = await client.post("/api/auth/sign-out")
    assert r.status_code == 204
    assert (await db.execute(count)).scalar_one() == 0
    assert (await client.get("/api/me")).json() == {"user": None}


async def test_expired_session_is_not_accepted(client, db):
    await sign_in(client, "sora")
    await db.execute(text("UPDATE sessions SET expires_at = now() - interval '1 second'"))
    assert (await client.get("/api/me")).json() == {"user": None}


async def test_admin_area_requires_sign_in_then_admin(client, db):
    assert (await client.get("/api/admin/ping")).status_code == 401
    await sign_in(client, "mika")
    assert (await client.get("/api/admin/ping")).status_code == 403
    await run_in_session(db, "make-admin", {"username": "mika"})
    assert (await client.get("/api/admin/ping")).status_code == 200


async def test_make_admin_unknown_user_fails(db):
    from app.cli.commands import CommandError

    with pytest.raises(CommandError):
        await run_in_session(db, "make-admin", {"username": "nobody_here"})


async def test_users_table_has_no_pii_columns(db):
    columns = await db.run_sync(
        lambda s: {c["name"] for c in inspect(s.connection()).get_columns("users")}
    )
    assert columns == {"id", "username", "is_admin", "is_private", "is_system", "created_at"}
