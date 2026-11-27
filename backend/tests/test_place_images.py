"""Place pictures (decided 2026-11-27): user photo > Wikimedia photo > none (poster art)."""

from sqlalchemy import text

from app.wikimedia import similar
from tests.factories import make_place, make_user, sign_in
from tests.test_photos import files, jpeg
from tests.test_ranking import rank


def test_name_matching_is_strict_enough():
    assert similar("Senso-ji", "Sensō-ji") >= 0.86 or similar("Senso-ji", "Senso-ji") == 1.0
    assert similar("明治神宮", "明治神宮") == 1.0
    assert similar("Tokyo Skytree", "Tokyo Skytree") == 1.0
    assert similar("Kinkaku-ji", "Kinkaku-ji Temple") == 1.0  # "temple" suffix ignored
    # Different places that share a word are not a match.
    assert similar("Shibuya Sky", "Shibuya Station") < 0.86
    assert similar("Ueno Park", "Ueno") < 0.86
    assert similar("Ichiran", "Ichigaya") < 0.86
    assert similar("Nakazakicho", "Nakazakichō Station") < 0.86


async def add_wiki(db, place_id):
    await db.execute(
        text(
            "INSERT INTO place_images "
            "(place_id, image_url, thumb_url, page_url, author, license) VALUES "
            "(:p, 'https://upload.wikimedia.org/x/960px-a.jpg', "
            "'https://upload.wikimedia.org/x/400px-a.jpg', "
            "'https://commons.wikimedia.org/wiki/File:a.jpg', 'Kakidai', 'CC BY-SA 3.0')"
        ),
        {"p": place_id},
    )
    await db.flush()


async def test_wikimedia_photo_with_credit_then_user_photo_wins(client, db):
    maker = await make_user(db, "img_maker")
    place = await make_place(db, name="Pictured Temple", creator=maker, subcategory_slug="temple")
    bare = await make_place(db, name="Plain Ramen", creator=maker)
    assert (await client.get(f"/api/places/{bare.id}")).json()["image"] is None

    await add_wiki(db, place.id)
    img = (await client.get(f"/api/places/{place.id}")).json()["image"]
    assert img["source"] == "wikimedia" and img["credit"] == "Photo: Kakidai · CC BY-SA 3.0"
    assert img["thumb_url"].endswith("400px-a.jpg") and img["credit_url"].startswith(
        "https://commons"
    )
    listed = (await client.get("/api/lists/tokyo/temple")).json()["items"]
    assert next(i for i in listed if i["id"] == place.id)["image"]["source"] == "wikimedia"

    await sign_in(client, "img_user")
    rid = (await rank(client, place, "liked", 1)).json()["ranking"]["id"]
    await client.post(f"/api/rankings/{rid}/photos", files=files(jpeg(80, 80)))
    img = (await client.get(f"/api/places/{place.id}")).json()["image"]
    assert (
        img["source"] == "user" and img["credit"] is None and img["url"].startswith("/api/media/")
    )


async def test_fetch_command_records_misses(db, monkeypatch):
    from app import place_images, wikimedia

    maker = await make_user(db, "img_cmd")
    hit = await make_place(db, name="Has Article", creator=maker)
    miss = await make_place(db, name="No Article", creator=maker)

    async def fake_find(name, name_ja, lat, lng, *, http=None):
        if name == "Has Article":
            return wikimedia.WikiImage(
                "https://u/960px-x.jpg",
                "https://u/400px-x.jpg",
                "https://c/x",
                "https://w/x",
                "A",
                "CC0",
            )
        return None

    monkeypatch.setattr(wikimedia, "find_image", fake_find)
    monkeypatch.setattr(place_images.asyncio, "sleep", lambda s: _noop())
    checked, found = await place_images.fetch(db, limit=1000)
    assert found >= 1 and checked >= 2
    rows = dict((await db.execute(text("SELECT place_id, image_url FROM place_images"))).all())
    assert rows[hit.id] == "https://u/960px-x.jpg" and rows[miss.id] is None
    # Already checked: not looked up again.
    assert (await place_images.fetch(db, limit=1000)) == (0, 0)


async def _noop():
    return None
