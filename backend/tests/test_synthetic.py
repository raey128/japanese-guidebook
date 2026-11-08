from sqlalchemy import text

from app.cli.commands import run_in_session


async def test_synthetic_cli_creates_visible_ranked_places(db, client):
    message = await run_in_session(db, "synthetic", {"count": 200, "seed": 7})
    assert "200 places" in message

    owner = (
        await db.execute(text("SELECT is_system FROM users WHERE username = 'synthetic_data'"))
    ).scalar_one()
    assert owner is False
    n = (
        await db.execute(
            text(
                "SELECT count(*) FROM places p JOIN users u ON u.id = p.creator_id "
                "WHERE u.username = 'synthetic_data'"
            )
        )
    ).scalar_one()
    assert n == 200

    # Search finds a synthetic name.
    name = (
        await db.execute(text("SELECT name FROM places ORDER BY id DESC LIMIT 1"))
    ).scalar_one()
    word = name.split()[0]
    r = await client.get("/api/search", params={"q": word})
    assert r.status_code == 200
    assert r.json()["items"]

    # The map sees them.
    r = await client.get(
        "/api/map",
        params={"min_lat": 30, "min_lng": 129, "max_lat": 46, "max_lng": 146, "zoom": 5},
    )
    assert r.status_code == 200
    assert sum(c["count"] for c in r.json()["clusters"]) >= 200

    # Aggregates are populated and consistent with the rankings.
    stats = (await db.execute(text("SELECT coalesce(sum(rank_count), 0) FROM place_stats"))).scalar_one()
    rankings = (await db.execute(text("SELECT count(*) FROM rankings"))).scalar_one()
    assert rankings > 0
    assert stats == rankings
    cats = (await db.execute(text("SELECT coalesce(sum(rank_count), 0) FROM category_stats"))).scalar_one()
    assert cats == rankings
