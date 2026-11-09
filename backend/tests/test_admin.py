"""Admin queue and actions: hide/unhide, close/reopen, apply, dismiss, remove note, seed review."""

import pytest
from sqlalchemy import text

from app import ranking
from tests.factories import location, subcategory
from tests.mod_helpers import (
    admin_client,
    category_count,
    flag,
    list_names,
    make_place,
    make_user,
    rank,
    signed_in,
)

ADMIN_ROUTES = [
    ("get", "/api/admin/flags", None),
    ("post", "/api/admin/flags/1/apply", None),
    ("post", "/api/admin/flags/1/dismiss", None),
    ("post", "/api/admin/places/1/hide", None),
    ("post", "/api/admin/places/1/unhide", None),
    ("post", "/api/admin/places/1/close", None),
    ("post", "/api/admin/places/1/reopen", None),
    ("post", "/api/admin/places/1/merge", {"into_place_id": 2}),
    ("post", "/api/admin/notes/1/remove", None),
    ("get", "/api/admin/seeds", None),
    ("put", "/api/admin/seeds/1", {"reviewed": True}),
]


@pytest.mark.parametrize(("method", "path", "body"), ADMIN_ROUTES)
async def test_admin_routes_refuse_non_admins(client_factory, method, path, body):
    anon = client_factory()
    r = await anon.request(method, path, json=body)
    assert r.status_code == 401
    user = await signed_in(client_factory, "plainuser")
    r = await user.request(method, path, json=body)
    assert r.status_code == 403


# ---- Queue ------------------------------------------------------------------------------------


async def test_queue_groups_by_target_newest_first(client_factory, db):
    owner = await make_user(db, "queueown")
    p1 = await make_place(db, name="Queue One", creator=owner)
    p2 = await make_place(db, name="Queue Two", creator=owner)
    author = await make_user(db, "noteauthor", is_private=True)
    ranked = await rank(db, author, p1, note="Visit my site now!")
    ranked.visit_month, ranked.visit_year = 5, 2025
    await db.flush()

    a, b, c = [await signed_in(client_factory, n) for n in ("qflaga", "qflagb", "qflagc")]
    admin = await admin_client(client_factory, db)
    await flag(a, p1.id, "closed")
    await flag(b, p2.id, "spam")
    await c.post(f"/api/rankings/{ranked.id}/flags", json={"flag_type": "spam"})
    await flag(b, p1.id, "wrong_location", {"lat": 35.7200, "lng": 139.7960})
    await flag(c, p1.id, "closed")

    r = await admin.get("/api/admin/flags?status=open")
    assert r.status_code == 200
    groups = r.json()["groups"]
    assert [g["key"] for g in groups] == [f"place:{p1.id}", f"note:{ranked.id}", f"place:{p2.id}"]

    g1 = groups[0]
    assert g1["target_type"] == "place"
    assert g1["counts"] == {"closed": 2, "wrong_location": 1}
    assert g1["place"]["name"] == "Queue One"
    assert g1["note"] is None
    assert [f["flag_type"] for f in g1["flags"]] == ["closed", "wrong_location", "closed"]
    assert g1["flags"][0]["flagger"] == "qflagc"
    suggested = next(f for f in g1["flags"] if f["flag_type"] == "wrong_location")
    assert suggested["payload"] == {"lat": 35.72, "lng": 139.796}

    g2 = groups[1]
    assert g2["target_type"] == "note"
    assert g2["note"]["note"] == "Visit my site now!"
    assert g2["note"]["author"] == "noteauthor"  # admins see the real username
    assert g2["note"]["author_is_private"] is True
    assert g2["note"]["visit_month"] == 5
    assert g2["place"]["id"] == p1.id
    assert g2["counts"] == {"spam": 1}

    assert groups[2]["place"]["id"] == p2.id
    assert groups[2]["counts"] == {"spam": 1}


async def test_queue_shows_duplicate_target_and_info_suggestions(client_factory, db):
    owner = await make_user(db, "queueown2")
    place = await make_place(db, name="Maybe Dup", creator=owner)
    other = await make_place(db, name="Original", creator=owner)
    sub = await subcategory(db, "sushi")
    loc = await location(db, "shibuya-harajuku")
    u = await signed_in(client_factory, "qflagd")
    await flag(u, place.id, "duplicate", {"other_place_id": other.id})
    await flag(u, place.id, "wrong_info", {"subcategory_id": sub.id, "location_id": loc.id})
    admin = await admin_client(client_factory, db)
    (group,) = (await admin.get("/api/admin/flags")).json()["groups"]
    by_type = {f["flag_type"]: f for f in group["flags"]}
    assert by_type["duplicate"]["duplicate_place"]["name"] == "Original"
    assert by_type["wrong_info"]["suggested_subcategory"]["slug"] == "sushi"
    assert by_type["wrong_info"]["suggested_location"]["slug"] == "shibuya-harajuku"
    assert by_type["wrong_info"]["duplicate_place"] is None


async def test_queue_status_filter_and_dismiss(client_factory, db):
    place = await make_place(db, name="Dismiss Me", creator=await make_user(db, "queueown3"))
    u = await signed_in(client_factory, "qflage")
    flag_id = (await flag(u, place.id, "closed")).json()["id"]
    admin = await admin_client(client_factory, db)

    r = await admin.post(f"/api/admin/flags/{flag_id}/dismiss")
    assert r.status_code == 200
    assert r.json() == {"id": flag_id, "status": "dismissed"}
    assert (await admin.get("/api/admin/flags")).json()["groups"] == []
    dismissed = (await admin.get("/api/admin/flags?status=dismissed")).json()["groups"]
    assert len(dismissed) == 1 and dismissed[0]["flags"][0]["status"] == "dismissed"
    assert len((await admin.get("/api/admin/flags?status=all")).json()["groups"]) == 1
    assert (await admin.post(f"/api/admin/flags/{flag_id}/dismiss")).status_code == 409
    assert (await admin.post("/api/admin/flags/987654/dismiss")).status_code == 404
    assert (await admin.get("/api/admin/flags?status=bogus")).status_code == 422


# ---- Hide / unhide ----------------------------------------------------------------------------


async def test_hide_unhide_round_trip(client_factory, client, db):
    owner = await make_user(db, "hideown")
    place = await make_place(db, name="Hide Me", creator=owner)
    other = await make_place(db, name="Stay Visible", creator=owner)
    ranker = await make_user(db, "hideranker")
    await rank(db, ranker, other, position=1)
    await rank(db, ranker, place, position=2)
    assert await category_count(db, place) == 2
    admin = await admin_client(client_factory, db)
    u = await signed_in(client_factory, "qflagf")
    await flag(u, place.id, "spam")

    r = await admin.post(f"/api/admin/places/{place.id}/hide")
    assert r.status_code == 200
    assert "hidden" in r.json()["badges"]
    assert (await client.get(f"/api/places/{place.id}")).status_code == 404
    assert await category_count(db, place) == 1
    # The ranker's own List is untouched.
    assert await list_names(db, ranker.id, "ramen") == ["Stay Visible", "Hide Me"]
    # Resolving the hide closes the spam flags.
    assert (await admin.get("/api/admin/flags")).json()["groups"] == []

    r = await admin.post(f"/api/admin/places/{place.id}/unhide")
    assert r.status_code == 200
    assert "hidden" not in r.json()["badges"]
    assert (await client.get(f"/api/places/{place.id}")).status_code == 200
    assert await category_count(db, place) == 2
    assert await list_names(db, ranker.id, "ramen") == ["Stay Visible", "Hide Me"]


async def test_admin_hide_unknown_place_is_404(client_factory, db):
    admin = await admin_client(client_factory, db)
    assert (await admin.post("/api/admin/places/987654/hide")).status_code == 404


async def test_unhide_after_auto_hide_clears_the_spam_count(client_factory, client, db):
    place = await make_place(db, name="Wrongly Hidden", creator=await make_user(db, "hideown2"))
    cs = [await signed_in(client_factory, f"unhider{i}") for i in range(4)]
    for c in cs[:3]:
        await flag(c, place.id, "spam")
    assert (await client.get(f"/api/places/{place.id}")).status_code == 404
    admin = await admin_client(client_factory, db)
    await admin.post(f"/api/admin/places/{place.id}/unhide")
    assert (await client.get(f"/api/places/{place.id}")).status_code == 200
    # One more flag must not re-hide it: the earlier ones were dismissed.
    assert (await flag(cs[3], place.id, "spam")).json()["auto_action"] is None
    assert (await client.get(f"/api/places/{place.id}")).status_code == 200


# ---- Close / reopen ---------------------------------------------------------------------------


async def test_close_reopen(client_factory, client, db):
    owner = await make_user(db, "closeown")
    place = await make_place(db, name="Close Me", creator=owner)
    ranker = await make_user(db, "closeranker")
    await rank(db, ranker, place)
    newcomer = await make_user(db, "closenew")
    admin = await admin_client(client_factory, db)

    r = await admin.post(f"/api/admin/places/{place.id}/close")
    assert r.status_code == 200
    assert "closed" in r.json()["badges"] and "reported_closed" not in r.json()["badges"]
    body = (await client.get(f"/api/places/{place.id}")).json()
    assert body["ranker_count"] == 1 and body["public_score"] is not None  # still counts

    snap = await ranking.get_snapshot(db, newcomer.id, place.city_id, place.subcategory_id)
    with pytest.raises(ranking.RankingNotAllowed):
        await ranking.place_ranking(
            db,
            user_id=newcomer.id,
            place=place,
            bucket="liked",
            position=1,
            expected_version=snap["liked"].version,
        )

    r = await admin.post(f"/api/admin/places/{place.id}/reopen")
    assert r.status_code == 200
    assert "closed" not in r.json()["badges"]
    await ranking.place_ranking(
        db,
        user_id=newcomer.id,
        place=place,
        bucket="liked",
        position=1,
        expected_version=snap["liked"].version,
    )


async def test_reopen_clears_reported_closed(client_factory, client, db):
    place = await make_place(db, name="Reported", creator=await make_user(db, "closeown2"))
    cs = [await signed_in(client_factory, f"reporter{i}") for i in range(4)]
    for c in cs[:3]:
        await flag(c, place.id, "closed")
    assert "reported_closed" in (await client.get(f"/api/places/{place.id}")).json()["badges"]
    admin = await admin_client(client_factory, db)
    await admin.post(f"/api/admin/places/{place.id}/reopen")
    badges = (await client.get(f"/api/places/{place.id}")).json()["badges"]
    assert "reported_closed" not in badges and "closed" not in badges
    # The old reports were dismissed, so one more report doesn't re-close it.
    assert (await flag(cs[3], place.id, "closed")).json()["auto_action"] is None


# ---- Apply suggestions ------------------------------------------------------------------------


async def test_apply_wrong_info_subcategory_reinserts_ranking(client_factory, client, db):
    owner = await make_user(db, "applyown")
    user = await make_user(db, "applyranker")
    ramen = [
        await make_place(db, name=f"Ramen {i}", creator=owner, subcategory_slug="ramen")
        for i in range(4)
    ]
    moved = ramen[1]
    cafes = [
        await make_place(db, name=f"Cafe {i}", creator=owner, subcategory_slug="cafe")
        for i in range(3)
    ]
    # Ramen List (liked): Ramen 0, Ramen 1 (the one that moves), Ramen 2, Ramen 3 -> 4 items.
    for position, place in enumerate(ramen, start=1):
        await rank(db, user, place, position=position)
    for position, place in enumerate(cafes, start=1):
        await rank(db, user, place, position=position)
    assert await list_names(db, user.id, "ramen") == [p.name for p in ramen]

    cafe = await subcategory(db, "cafe")
    reporter = await signed_in(client_factory, "qflagg")
    r = await flag(reporter, moved.id, "wrong_info", {"subcategory_id": cafe.id})
    admin = await admin_client(client_factory, db)
    r = await admin.post(f"/api/admin/flags/{r.json()['id']}/apply")
    assert r.status_code == 200, r.text
    assert r.json()["subcategory"]["slug"] == "cafe"

    # Position 2 of 4 scored 8.7625; in the 4-item Cafe List that is exactly position 2.
    assert await list_names(db, user.id, "cafe") == ["Cafe 0", "Ramen 1", "Cafe 1", "Cafe 2"]
    assert await list_names(db, user.id, "ramen") == ["Ramen 0", "Ramen 2", "Ramen 3"]
    scores = (
        await db.execute(
            text("SELECT personal_score FROM rankings WHERE user_id = :u AND place_id = :p"),
            {"u": user.id, "p": moved.id},
        )
    ).scalar_one()
    assert scores == pytest.approx(6.7 + 3.3 * 2.5 / 4)
    # Flag is resolved, place now in the new category everywhere.
    assert (await admin.get("/api/admin/flags")).json()["groups"] == []
    assert (await client.get(f"/api/places/{moved.id}")).json()["subcategory"]["slug"] == "cafe"


async def test_apply_wrong_info_name_and_location(client_factory, client, db):
    place = await make_place(db, name="Old Name", creator=await make_user(db, "applyown2"))
    loc = await location(db, "shibuya-harajuku")
    u = await signed_in(client_factory, "qflagh")
    f = (await flag(u, place.id, "wrong_info", {"name": "New Name", "location_id": loc.id})).json()
    admin = await admin_client(client_factory, db)
    r = await admin.post(f"/api/admin/flags/{f['id']}/apply")
    assert r.status_code == 200
    body = (await client.get(f"/api/places/{place.id}")).json()
    assert body["name"] == "New Name"
    assert body["location"]["slug"] == "shibuya-harajuku"
    assert (await admin.post(f"/api/admin/flags/{f['id']}/apply")).status_code == 409


async def test_apply_wrong_location_moves_the_pin(client_factory, client, db):
    place = await make_place(
        db, name="Pin Me", creator=await make_user(db, "applyown3"), lat=35.7120, lng=139.7960
    )
    u = await signed_in(client_factory, "qflagi")
    f = (await flag(u, place.id, "wrong_location", {"lat": 35.7150, "lng": 139.7990})).json()
    admin = await admin_client(client_factory, db)
    assert (await admin.post(f"/api/admin/flags/{f['id']}/apply")).status_code == 200
    body = (await client.get(f"/api/places/{place.id}")).json()
    assert body["lat"] == pytest.approx(35.7150)
    assert body["lng"] == pytest.approx(139.7990)


async def test_apply_wrong_location_outside_coverage_is_422(client_factory, client, db):
    place = await make_place(db, name="Far Pin", creator=await make_user(db, "applyown4"))
    u = await signed_in(client_factory, "qflagj")
    f = (await flag(u, place.id, "wrong_location", {"lat": 0.0, "lng": 0.0})).json()
    admin = await admin_client(client_factory, db)
    r = await admin.post(f"/api/admin/flags/{f['id']}/apply")
    assert r.status_code == 422
    # Nothing changed; the flag is still waiting.
    assert (await client.get(f"/api/places/{place.id}")).json()["lat"] != 0.0
    assert len((await admin.get("/api/admin/flags")).json()["groups"]) == 1


async def test_apply_only_for_location_and_info_flags(client_factory, db):
    place = await make_place(db, name="No Apply", creator=await make_user(db, "applyown5"))
    u = await signed_in(client_factory, "qflagk")
    f = (await flag(u, place.id, "closed")).json()
    admin = await admin_client(client_factory, db)
    assert (await admin.post(f"/api/admin/flags/{f['id']}/apply")).status_code == 422


# ---- Notes ------------------------------------------------------------------------------------


async def test_remove_note_resolves_its_flags(client_factory, db):
    place = await make_place(db, name="Note Place", creator=await make_user(db, "noteown"))
    author = await make_user(db, "spamwriter")
    r = await rank(db, author, place, note="spam spam spam")
    u = await signed_in(client_factory, "qflagl")
    assert (
        await u.post(f"/api/rankings/{r.id}/flags", json={"flag_type": "spam"})
    ).status_code == 201
    admin = await admin_client(client_factory, db)

    out = await admin.post(f"/api/admin/notes/{r.id}/remove")
    assert out.status_code == 200
    row = (
        await db.execute(
            text("SELECT note, bucket, position FROM rankings WHERE id = :id"), {"id": r.id}
        )
    ).one()
    assert row.note is None and row.bucket == "liked" and row.position == 1  # ranking stays
    assert (await admin.get("/api/admin/flags")).json()["groups"] == []
    resolved = (await admin.get("/api/admin/flags?status=resolved")).json()["groups"]
    assert len(resolved) == 1
    assert (await admin.post(f"/api/admin/notes/{r.id}/remove")).status_code == 409
    assert (await admin.post("/api/admin/notes/987654/remove")).status_code == 404


# ---- Seed review ------------------------------------------------------------------------------


async def test_seed_review_counts_and_toggle(client_factory, db):
    guide = await make_user(db, "seedowner")
    t1 = await make_place(db, name="Seed T1", creator=guide, is_seed=True)
    t2 = await make_place(db, name="Seed T2", creator=guide, is_seed=True)
    k1 = await make_place(
        db, name="Seed K1", creator=guide, location_slug="gion-higashiyama", is_seed=True
    )
    plain = await make_place(db, name="Not Seed", creator=guide)
    admin = await admin_client(client_factory, db)

    body = (await admin.get("/api/admin/seeds")).json()
    counts = {c["city"]["slug"]: c for c in body["counts"]}
    assert len(body["counts"]) == 8
    assert (counts["tokyo"]["total"], counts["tokyo"]["unreviewed"]) == (2, 2)
    assert (counts["kyoto"]["total"], counts["kyoto"]["unreviewed"]) == (1, 1)
    assert counts["osaka"]["total"] == 0
    assert {i["place"]["name"] for i in body["items"]} == {"Seed T1", "Seed T2", "Seed K1"}
    assert all(i["reviewed"] is False for i in body["items"])

    r = await admin.put(f"/api/admin/seeds/{t1.id}", json={"reviewed": True})
    assert r.status_code == 200
    assert r.json()["reviewed"] is True
    # Reviewed is independent of the Unverified badge.
    assert "unverified" in r.json()["place"]["badges"]

    body = (await admin.get("/api/admin/seeds?city=tokyo")).json()
    assert {i["place"]["name"]: i["reviewed"] for i in body["items"]} == {
        "Seed T1": True,
        "Seed T2": False,
    }
    counts = {c["city"]["slug"]: c for c in body["counts"]}
    assert counts["tokyo"]["unreviewed"] == 1 and counts["tokyo"]["total"] == 2
    assert counts["kyoto"]["unreviewed"] == 1  # counts cover every city, whatever the filter

    r = await admin.put(f"/api/admin/seeds/{t1.id}", json={"reviewed": False})
    assert r.json()["reviewed"] is False
    assert (
        await admin.put(f"/api/admin/seeds/{plain.id}", json={"reviewed": True})
    ).status_code == 404
    assert (await admin.get("/api/admin/seeds?city=atlantis")).status_code == 404
    assert t2.id and k1.id
