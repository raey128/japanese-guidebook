from tests.factories import make_place, make_user, sign_in, user_by_name


async def test_unknown_place_is_404(client):
    assert (await client.get("/api/places/999999")).status_code == 404


async def test_hidden_place_is_404_except_for_admins(client, db):
    owner = await make_user(db, "owner1")
    place = await make_place(db, name="Hidden Ramen", creator=owner, is_hidden=True)
    assert (await client.get(f"/api/places/{place.id}")).status_code == 404
    await sign_in(client, "boss")
    (await user_by_name(db, "boss")).is_admin = True
    await db.flush()
    r = await client.get(f"/api/places/{place.id}")
    assert r.status_code == 200
    assert "hidden" in r.json()["badges"]


async def test_merged_place_redirects(client, db):
    owner = await make_user(db, "owner2")
    survivor = await make_place(db, name="Survivor", creator=owner)
    old = await make_place(db, name="Old", creator=owner)
    old.merged_into_id = survivor.id
    await db.flush()
    r = await client.get(f"/api/places/{old.id}")
    assert r.status_code == 308
    assert r.headers["location"] == f"/api/places/{survivor.id}"


async def test_private_creator_shows_as_anonymous(client, db):
    owner = await make_user(db, "shy", is_private=True)
    place = await make_place(db, name="Quiet Cafe", creator=owner, subcategory_slug="cafe")
    assert (await client.get(f"/api/places/{place.id}")).json()["creator"] == "Anonymous"


async def test_viewer_state(client, db):
    owner = await make_user(db, "maker")
    place = await make_place(db, name="Viewer Ramen", creator=owner)
    anon = (await client.get(f"/api/places/{place.id}")).json()["viewer"]
    assert anon == {
        "signed_in": False,
        "can_edit": False,
        "can_flag": False,
        "can_rank": False,
        "is_bookmarked": False,
        "my_ranking": None,
    }
    await sign_in(client, "visitor")
    v = (await client.get(f"/api/places/{place.id}")).json()["viewer"]
    assert v["signed_in"] and v["can_flag"] and v["can_rank"] and not v["can_edit"]
