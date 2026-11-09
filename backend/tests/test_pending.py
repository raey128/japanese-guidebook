"""Manual adds from search are pending until reviewed (R13, tickets 20-21)."""

from sqlalchemy import text

from tests.factories import ASAKUSA, location, make_user, sign_in, subcategory, user_by_name
from tests.test_map import ASA, rank


async def manual_add(client, db, name="Hidden Gem Ramen", source="manual", lat=ASAKUSA[0], lng=ASAKUSA[1]):
    loc = await location(db, "asakusa")
    sub = await subcategory(db, "ramen")
    r = await client.post(
        "/api/places",
        json={
            "name": name,
            "lat": lat,
            "lng": lng,
            "subcategory_id": sub.id,
            "location_id": loc.id,
            "address": "Asakusa, Tokyo",
            "confirm_not_duplicate": True,
            "source": source,
        },
    )
    assert r.status_code == 201, r.text
    return r.json()["place"]


async def test_manual_add_is_pending_and_only_visible_to_submitter(client_factory, db):
    alice, bob = client_factory(), client_factory()
    await sign_in(alice, "alice_p")
    await sign_in(bob, "bob_p")
    place = await manual_add(alice, db)
    assert place["status"] == "pending"
    assert "pending" in place["badges"]
    pid = place["id"]

    # Submitter: detail, map and suggestions show it.
    assert (await alice.get(f"/api/places/{pid}")).status_code == 200
    pins = (await alice.get("/api/map", params={**ASA, "zoom": 15})).json()["points"]
    assert [p["id"] for p in pins] == [pid] and "pending" in pins[0]["badges"]
    sug = (await alice.get("/api/suggest", params={"q": "Hidden Gem", "city": "tokyo"})).json()
    assert pid in [p["id"] for p in sug["on_map"] + sug["elsewhere"]]

    # Everyone else: nothing.
    assert (await bob.get(f"/api/places/{pid}")).status_code == 404
    assert (await bob.get("/api/map", params={**ASA, "zoom": 15})).json()["points"] == []
    sug = (await bob.get("/api/suggest", params={"q": "Hidden Gem", "city": "tokyo"})).json()
    assert sug["on_map"] == [] and sug["elsewhere"] == []
    assert (await bob.get("/api/search", params={"q": "Hidden Gem"})).json()["items"] == []
    assert (await bob.put(f"/api/bookmarks/{pid}")).status_code == 404
    lst = (await bob.get("/api/lists/tokyo/ramen")).json()
    assert pid not in [i["id"] for i in lst["items"]]


async def test_pin_drop_add_is_live_at_once(client_factory, db):
    alice, bob = client_factory(), client_factory()
    await sign_in(alice, "alice_live")
    await sign_in(bob, "bob_live")
    place = await manual_add(alice, db, name="Live Ramen", source="pin")
    assert place["status"] == "live"
    assert (await bob.get(f"/api/places/{place['id']}")).status_code == 200


async def test_submitter_can_rank_and_save_pending_but_it_does_not_count(client, db):
    me = await sign_in(client, "ranker_p")
    place = await manual_add(client, db)
    pid = place["id"]
    assert (await client.put(f"/api/bookmarks/{pid}")).status_code == 200
    saved = (await client.get("/api/me/bookmarks")).json()["items"]
    assert [p["id"] for p in saved] == [pid]

    snap = (await client.get("/api/rankings/snapshot", params={"place_id": pid})).json()
    r = await client.put(
        "/api/rankings",
        json={"place_id": pid, "rating": 5, "position": 1, "list_version": snap["buckets"][0]["version"]},
    )
    assert r.status_code == 200, r.text
    mine = (await client.get("/api/me/rankings")).json()["cities"]
    assert mine and mine[0]["categories"][0]["buckets"][0]["items"][0]["place_id"] == pid

    detail = (await client.get(f"/api/places/{pid}")).json()
    assert detail["public_score"] is None  # hidden from public scores until approved
    prior = (
        await db.execute(text("SELECT COALESCE(SUM(rank_count), 0) FROM category_stats WHERE city_id = :c"),
                         {"c": detail["city"]["id"]})
    ).scalar_one()
    assert prior == 0
    assert me["username"] == "ranker_p"


async def test_rate_limit_is_shared_between_manual_and_pin_adds(client, db):
    await sign_in(client, "quota_p")
    for i in range(5):
        await manual_add(client, db, name=f"Quota {i}", source="manual" if i % 2 else "pin",
                         lat=ASAKUSA[0] + i * 0.002, lng=ASAKUSA[1])
    loc = await location(db, "asakusa")
    sub = await subcategory(db, "ramen")
    r = await client.post(
        "/api/places",
        json={"name": "Quota 6", "lat": ASAKUSA[0] + 0.02, "lng": ASAKUSA[1], "subcategory_id": sub.id,
              "location_id": loc.id, "address": "x", "confirm_not_duplicate": True, "source": "manual"},
    )
    assert r.status_code == 429


async def test_admin_approve_makes_it_live_and_counts_the_ranking(client_factory, db):
    alice, admin, bob = client_factory(), client_factory(), client_factory()
    await sign_in(alice, "alice_ap")
    await sign_in(bob, "bob_ap")
    await make_user(db, "admin_ap", is_admin=True)
    await sign_in(admin, "admin_ap")
    pid = (await manual_add(alice, db))["id"]
    alice_user = await user_by_name(db, "alice_ap")
    from app.models import Place

    await rank(db, alice_user.id, await db.get(Place, pid))

    assert (await bob.get("/api/admin/pending")).status_code == 403
    assert (await admin.get("/api/admin/pending/count")).json() == {"count": 1}
    queue = (await admin.get("/api/admin/pending")).json()["items"]
    assert [q["place"]["id"] for q in queue] == [pid] and queue[0]["submitter"] == "alice_ap"

    r = await admin.post(f"/api/admin/pending/{pid}/approve")
    assert r.status_code == 200, r.text
    assert "unverified" in r.json()["badges"] and "pending" not in r.json()["badges"]
    detail = (await bob.get(f"/api/places/{pid}")).json()
    assert detail["status"] == "live" and detail["ranker_count"] == 1 and detail["public_score"] is not None
    assert (await admin.get("/api/admin/pending/count")).json() == {"count": 0}
    subs = (await alice.get("/api/me/submissions")).json()["items"]
    assert subs[0]["status"] == "live" and subs[0]["reviewed_at"]
    assert (await admin.post(f"/api/admin/pending/{pid}/approve")).status_code == 409


async def test_admin_reject_removes_it_with_rankings_and_bookmarks(client_factory, db):
    alice, admin = client_factory(), client_factory()
    await sign_in(alice, "alice_rj")
    await make_user(db, "admin_rj", is_admin=True)
    await sign_in(admin, "admin_rj")
    pid = (await manual_add(alice, db))["id"]
    await alice.put(f"/api/bookmarks/{pid}")
    alice_user = await user_by_name(db, "alice_rj")
    from app.models import Place

    await rank(db, alice_user.id, await db.get(Place, pid))

    assert (await admin.post(f"/api/admin/pending/{pid}/reject", json={"reason": "x" * 201})).status_code == 422
    r = await admin.post(f"/api/admin/pending/{pid}/reject", json={"reason": "Permanently closed"})
    assert r.status_code == 200
    assert (await alice.get(f"/api/places/{pid}")).status_code == 404
    assert (await alice.get("/api/me/bookmarks")).json()["items"] == []
    assert (await alice.get("/api/me/rankings")).json()["cities"] == []
    subs = (await alice.get("/api/me/submissions")).json()["items"]
    assert subs[0]["status"] == "rejected" and subs[0]["review_reason"] == "Permanently closed"
