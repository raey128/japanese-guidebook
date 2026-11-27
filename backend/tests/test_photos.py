"""Review photos (R20): upload, cleaning, limits, listing, delete, report, admin."""

import io

from PIL import Image

from app import media
from tests.factories import make_place, make_user, sign_in
from tests.mod_helpers import admin_client, signed_in
from tests.test_ranking import rank


def jpeg(w=3000, h=2000, *, exif=True) -> bytes:
    """A camera-like JPEG with a Make tag and a GPS block in its EXIF."""
    img = Image.new("RGB", (w, h), (200, 80, 40))
    out = io.BytesIO()
    if exif:
        ex = Image.Exif()
        ex[0x010F] = "SpyCam"  # Make
        ex[0x8825] = {1: "N", 2: (35.0, 39.0, 29.0)}  # GPSInfo
        img.save(out, "JPEG", exif=ex.tobytes())
    else:
        img.save(out, "JPEG")
    return out.getvalue()


def files(*blobs, name="p.jpg", ctype="image/jpeg"):
    return [("files", (name, b, ctype)) for b in blobs]


async def my_review(client, db, name="Photo Ramen"):
    maker = await make_user(db, f"mk_{name.replace(' ', '').lower()}"[:20])
    place = await make_place(db, name=name, creator=maker)
    r = await rank(client, place, "liked", 1, note="Great")
    return place, r.json()["ranking"]["id"]


async def test_upload_strips_location_and_resizes(client, db, media_dir):
    await sign_in(client, "snapper")
    place, rid = await my_review(client, db)
    r = await client.post(f"/api/rankings/{rid}/photos", files=files(jpeg()))
    assert r.status_code == 201, r.text
    (photo,) = r.json()
    assert photo["url"].startswith("/api/media/photos/") and photo["thumb_url"].endswith("_t.jpg")
    assert (photo["width"], photo["height"]) == (1600, 1067)
    assert photo["author"] == "snapper" and photo["is_own"] is True

    key = photo["url"].removeprefix("/api/media/").removesuffix(".jpg")
    for suffix in ("", "_t"):
        stored = Image.open(media_dir / f"{key}{suffix}.jpg")
        assert not stored.getexif(), "EXIF (incl. GPS) must be gone"
        assert "exif" not in stored.info
    assert max(Image.open(media_dir / f"{key}_t.jpg").size) == 400

    # Served, and listed on the place, newest first.
    assert (await client.get(photo["url"])).status_code == 200
    listed = (await client.get(f"/api/places/{place.id}/photos")).json()["photos"]
    assert [p["id"] for p in listed] == [photo["id"]]


async def test_limits_and_bad_files(client, db, monkeypatch):
    await sign_in(client, "limiter")
    _, rid = await my_review(client, db, "Limit Ramen")
    small = jpeg(50, 50, exif=False)
    assert (
        await client.post(f"/api/rankings/{rid}/photos", files=files(*[small] * 5))
    ).status_code == 422
    assert (
        await client.post(f"/api/rankings/{rid}/photos", files=files(*[small] * 3))
    ).status_code == 201
    too_many = await client.post(f"/api/rankings/{rid}/photos", files=files(small, small))
    assert too_many.status_code == 422 and "up to 4" in too_many.json()["detail"]

    _, rid2 = await my_review(client, db, "Bad Ramen")
    not_photo = await client.post(
        f"/api/rankings/{rid2}/photos",
        files=files(b"%PDF-1.4 nope", name="x.pdf", ctype="application/pdf"),
    )
    assert not_photo.status_code == 422 and "photo" in not_photo.json()["detail"]
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "photo_max_bytes", 100)
    big = await client.post(f"/api/rankings/{rid2}/photos", files=files(small))
    assert big.status_code == 422 and "12 MB" in big.json()["detail"]


async def test_only_your_own_review(client_factory, db):
    a = client_factory()
    await sign_in(a, "owner_a")
    _, rid = await my_review(a, db, "Own Ramen")
    b = client_factory()
    await sign_in(b, "other_b")
    r = await b.post(f"/api/rankings/{rid}/photos", files=files(jpeg(60, 60, exif=False)))
    assert r.status_code == 403
    anon = client_factory()
    assert (
        await anon.post(f"/api/rankings/{rid}/photos", files=files(jpeg(60, 60)))
    ).status_code == 401


async def test_delete_own_photo_and_files(client_factory, db, media_dir):
    a = client_factory()
    await sign_in(a, "deleter")
    _, rid = await my_review(a, db, "Del Ramen")
    (photo,) = (await a.post(f"/api/rankings/{rid}/photos", files=files(jpeg(80, 80)))).json()
    key = photo["url"].removeprefix("/api/media/").removesuffix(".jpg")
    b = client_factory()
    await sign_in(b, "not_owner")
    assert (await b.delete(f"/api/photos/{photo['id']}")).status_code == 403
    assert (await a.delete(f"/api/photos/{photo['id']}")).status_code == 204
    assert not (media_dir / f"{key}.jpg").exists() and not (media_dir / f"{key}_t.jpg").exists()


async def test_deleting_the_review_deletes_its_photo_files(client, db, media_dir):
    await sign_in(client, "rev_deleter")
    _, rid = await my_review(client, db, "Gone Ramen")
    (photo,) = (await client.post(f"/api/rankings/{rid}/photos", files=files(jpeg(80, 80)))).json()
    key = photo["url"].removeprefix("/api/media/").removesuffix(".jpg")
    assert (await client.delete(f"/api/rankings/{rid}")).status_code == 204
    assert not (media_dir / f"{key}.jpg").exists()


async def test_reports_hide_after_three_and_admin_can_keep(client_factory, db):
    owner = client_factory()
    await sign_in(owner, "reported")
    place, rid = await my_review(owner, db, "Report Ramen")
    (photo,) = (await owner.post(f"/api/rankings/{rid}/photos", files=files(jpeg(80, 80)))).json()
    pid = photo["id"]
    assert (await owner.post(f"/api/photos/{pid}/report")).status_code == 422  # not your own

    for i in range(3):
        c = await signed_in(client_factory, f"reporter{i}")
        r = await c.post(f"/api/photos/{pid}/report")
        assert r.status_code == 200
        r = await c.post(f"/api/photos/{pid}/report")  # twice counts once
        assert r.json()["hidden"] is (i == 2)
    assert (await owner.get(f"/api/places/{place.id}/photos")).json()["photos"] == []

    admin = await admin_client(client_factory, db)
    queue = (await admin.get("/api/admin/photos")).json()
    assert queue[0]["id"] == pid and queue[0]["report_count"] == 3 and queue[0]["is_hidden"]
    assert (await admin.post(f"/api/admin/photos/{pid}/keep")).status_code == 200
    assert len((await owner.get(f"/api/places/{place.id}/photos")).json()["photos"]) == 1
    assert (await admin.get("/api/admin/photos")).json() == []
    non_admin = await signed_in(client_factory, "not_admin")
    assert (await non_admin.get("/api/admin/photos")).status_code == 403


def test_media_url_helpers():
    assert media.url(None) is None
    assert media.url("photos/abc") == "/api/media/photos/abc.jpg"
    assert media.url("photos/abc", thumb=True) == "/api/media/photos/abc_t.jpg"


async def test_media_route_refuses_paths_outside_the_folder(client):
    for path in ("../../etc/passwd", "photos/nope.jpg", "photos/x.png"):
        assert (await client.get(f"/api/media/{path}")).status_code == 404


async def test_photos_show_in_reviews_and_my_rankings(client_factory, db):
    a = client_factory()
    await sign_in(a, "reviewer_p")
    place, rid = await my_review(a, db, "Shown Ramen")
    (photo,) = (await a.post(f"/api/rankings/{rid}/photos", files=files(jpeg(80, 80)))).json()
    anon = client_factory()
    notes = (await anon.get(f"/api/places/{place.id}/notes")).json()["notes"]
    assert [p["id"] for p in notes[0]["photos"]] == [photo["id"]]
    assert notes[0]["photos"][0]["is_own"] is False
    detail = (await a.get(f"/api/places/{place.id}")).json()
    assert [p["id"] for p in detail["viewer"]["my_ranking"]["photos"]] == [photo["id"]]
    mine = (await a.get("/api/me/rankings")).json()
    item = mine["cities"][0]["categories"][0]["buckets"][0]["items"][0]
    assert [p["id"] for p in item["photos"]] == [photo["id"]]


async def test_photo_only_review_is_listed(client, db):
    maker = await make_user(db, "mk_photoonly")
    place = await make_place(db, name="Photo Only", creator=maker)
    await sign_in(client, "silent")
    rid = (await rank(client, place, "liked", 1)).json()["ranking"]["id"]  # no comment
    assert (await client.get(f"/api/places/{place.id}/notes")).json()["notes"] == []
    await client.post(f"/api/rankings/{rid}/photos", files=files(jpeg(80, 80)))
    notes = (await client.get(f"/api/places/{place.id}/notes")).json()["notes"]
    assert len(notes) == 1 and notes[0]["note"] is None and len(notes[0]["photos"]) == 1


async def test_broken_image_is_a_friendly_422(client, db):
    await sign_in(client, "broken_pic")
    _, rid = await my_review(client, db, "Broken Ramen")
    broken = b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\rIHDRgarbage"
    r = await client.post(
        f"/api/rankings/{rid}/photos", files=files(broken, name="b.png", ctype="image/png")
    )
    assert r.status_code == 422 and "photo" in r.json()["detail"]
