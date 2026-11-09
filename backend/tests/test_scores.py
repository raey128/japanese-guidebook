"""Public (Bayesian) scores, prior fallbacks, ranker counts and the Unverified rule."""

import pytest
from sqlalchemy import select, text

from app import scores
from app.config import get_settings
from app.models import User
from tests.factories import make_place, make_user, sign_in
from tests.test_ranking import rank

K = 5.0  # prior_weight in the default config


def bayes(prior, total, count):
    return (K * prior + total) / (K + count)


async def public(client, place):
    r = await client.get(f"/api/places/{place.id}")
    assert r.status_code == 200, r.text
    return r.json()


async def rank_as(client, username, place, bucket="liked", position=1):
    await sign_in(client, username)
    r = await rank(client, place, bucket, position)
    assert r.status_code == 200, r.text
    return r.json()["ranking"]["personal_score"]


def test_prior_weight_is_five():
    assert get_settings().prior_weight == K
    assert get_settings().default_prior == 5.0


async def test_unranked_place_has_no_score(client, db):
    maker = await make_user(db, "maker")
    p = await make_place(db, name="Nobody Yet", creator=maker)
    body = await public(client, p)
    assert body["public_score"] is None and body["ranker_count"] == 0


async def test_single_ranker_is_pulled_toward_the_category_mean(client, db):
    maker = await make_user(db, "maker")
    target = await make_place(db, name="Target", creator=maker)
    others = [await make_place(db, name=f"Meh {i}", creator=maker) for i in range(4)]
    # One user dislikes four other ramen places: category mean far below 10.
    for o in others:
        await rank_as(client, "grump", o, "disliked", 1)
    top = await rank_as(client, "fan", target, "liked", 1)  # sole liked ranking: 8.35

    mean = (await db.execute(text("SELECT AVG(personal_score) FROM rankings"))).scalar_one()
    assert mean < 4
    body = await public(client, target)
    assert body["ranker_count"] == 1
    assert body["public_score"] == pytest.approx(bayes(mean, top, 1), abs=0.006)
    assert body["public_score"] < top - 3  # well below the raw 8.35


async def test_score_approaches_the_raw_mean_as_rankers_grow(client, db):
    maker = await make_user(db, "maker")
    target = await make_place(db, name="Target", creator=maker)
    other = await make_place(db, name="Other", creator=maker)
    await rank_as(client, "grump", other, "disliked", 1)  # 1.7

    seen = []
    for n in range(1, 13):
        await rank_as(client, f"fan{n:02d}", target, "liked", 1)  # 8.35 each
        seen.append((await public(client, target))["public_score"])
    assert seen == sorted(seen)  # more agreeing rankers, higher score
    assert seen[0] < 6.0
    assert 8.35 - seen[-1] < 0.35 * (8.35 - seen[0])  # most of the gap closed
    assert seen[-1] < 8.35
    # Exact check for the last point: prior is the (city, subcategory) mean of all rankings.
    prior = (12 * 8.35 + 1.7) / 13
    assert seen[-1] == pytest.approx(bayes(prior, 12 * 8.35, 12), abs=0.006)


async def test_prior_falls_back_through_the_levels(client, db):
    maker = await make_user(db, "maker")
    k_ramen = await make_place(
        db, name="Kyoto Ramen", creator=maker, location_slug="gion-higashiyama"
    )
    t_ramen = await make_place(db, name="Tokyo Ramen", creator=maker)
    t_cafe = await make_place(db, name="Tokyo Cafe", creator=maker, subcategory_slug="cafe")
    await rank_as(client, "u_one", k_ramen, "liked")  # 8.35
    await rank_as(client, "u_two", t_ramen, "disliked")  # 1.7
    await rank_as(client, "u_three", t_cafe, "fine")  # 5.05
    city_id, sub_id = k_ramen.city_id, k_ramen.subcategory_id

    # 1. (city, subcategory) mean: the only ranking there is the place's own.
    assert (await public(client, k_ramen))["public_score"] == pytest.approx(
        bayes(8.35, 8.35, 1), abs=0.006
    )

    # 2. Without a (city, subcategory) aggregate: subcategory nationwide (Tokyo ramen = 1.7).
    await db.execute(
        text("DELETE FROM category_stats WHERE city_id = :c AND subcategory_id = :s"),
        {"c": city_id, "s": sub_id},
    )
    assert (await public(client, k_ramen))["public_score"] == pytest.approx(
        bayes(1.7, 8.35, 1), abs=0.006
    )

    # 3. Without any ramen aggregate: the mean of all remaining rankings (Tokyo cafe = 5.05).
    await db.execute(text("DELETE FROM category_stats WHERE subcategory_id = :s"), {"s": sub_id})
    assert (await public(client, k_ramen))["public_score"] == pytest.approx(
        bayes(5.05, 8.35, 1), abs=0.006
    )

    # 4. No aggregates at all: the default prior, 5.0.
    await db.execute(text("DELETE FROM category_stats"))
    assert (await public(client, k_ramen))["public_score"] == pytest.approx(
        bayes(5.0, 8.35, 1), abs=0.006
    )


async def test_aggregates_follow_rerank_and_delete(client, db):
    """Other places in a changed List are rescored, so their public scores move too."""
    maker = await make_user(db, "maker")
    a = await make_place(db, name="A", creator=maker)
    b = await make_place(db, name="B", creator=maker)
    await sign_in(client, "alice")
    await rank(client, a, "liked", 1)  # A 8.35
    await rank(client, b, "liked", 2)  # A 9.175, B 7.525
    prior = (9.175 + 7.525) / 2
    assert (await public(client, a))["public_score"] == pytest.approx(
        bayes(prior, 9.175, 1), abs=0.006
    )
    assert (await public(client, b))["public_score"] == pytest.approx(
        bayes(prior, 7.525, 1), abs=0.006
    )

    ranking_a = (await client.get("/api/rankings/snapshot", params={"place_id": a.id})).json()[
        "my_ranking"
    ]["id"]
    assert (await client.delete(f"/api/rankings/{ranking_a}")).status_code == 204
    assert (await public(client, a))["public_score"] is None
    assert (await public(client, a))["ranker_count"] == 0
    # B is now alone at the band midpoint.
    assert (await public(client, b))["public_score"] == pytest.approx(
        bayes(8.35, 8.35, 1), abs=0.006
    )


async def test_unverified_clears_after_two_distinct_non_creator_rankers(client, db):
    creator = await make_user(db, "maker")
    p = await make_place(db, name="Fresh Ramen", creator=creator)
    assert "unverified" in (await public(client, p))["badges"]
    await rank_as(client, "first", p)
    assert "unverified" in (await public(client, p))["badges"]
    # The creator's own ranking doesn't count.
    await sign_in(client, "maker")
    assert (await rank(client, p, "liked", 1)).status_code == 200
    detail = await public(client, p)
    assert detail["ranker_count"] == 2 and "unverified" in detail["badges"]
    await rank_as(client, "second", p)
    detail = await public(client, p)
    assert detail["ranker_count"] == 3 and "unverified" not in detail["badges"]


async def test_seed_place_needs_any_two_users(client, db):
    # The system "guidebook" user is created by the migrations; reuse it.
    guidebook = (
        await db.execute(select(User).where(User.username == "guidebook"))
    ).scalar_one_or_none()
    if guidebook is None:
        guidebook = User(username="guidebook", is_system=True)
        db.add(guidebook)
        await db.flush()
    p = await make_place(db, name="Seed Ramen", creator=guidebook, is_seed=True)
    assert "unverified" in (await public(client, p))["badges"]
    await rank_as(client, "first", p)
    assert "unverified" in (await public(client, p))["badges"]
    await rank_as(client, "second", p)
    assert "unverified" not in (await public(client, p))["badges"]


async def test_hidden_places_do_not_feed_the_prior_or_score(client, db):
    maker = await make_user(db, "maker")
    visible = await make_place(db, name="Visible", creator=maker)
    shady = await make_place(db, name="Shady", creator=maker)
    await rank_as(client, "u_one", visible, "disliked")  # 1.7
    await rank_as(client, "u_two", shady, "liked")  # 8.35
    shady.is_hidden = True
    await db.flush()
    await scores.refresh_place(db, shady.id)

    stats = (
        await db.execute(
            text("SELECT rank_sum, rank_count FROM category_stats WHERE subcategory_id = :s"),
            {"s": visible.subcategory_id},
        )
    ).one()
    assert stats.rank_count == 1 and stats.rank_sum == pytest.approx(1.7)
    assert (await public(client, visible))["public_score"] == pytest.approx(
        bayes(1.7, 1.7, 1), abs=0.006
    )
    rows = await db.execute(
        text(
            f"WITH {scores.place_scores_cte()} SELECT public_score FROM place_scores "
            "WHERE place_id = :id"
        ),
        {"id": shady.id, **scores.score_params()},
    )
    assert rows.scalar_one() is None


async def test_closed_place_keeps_its_score(client, db):
    maker = await make_user(db, "maker")
    p = await make_place(db, name="Gone Ramen", creator=maker)
    await rank_as(client, "u_one", p)
    before = (await public(client, p))["public_score"]
    p.is_closed = True
    await db.flush()
    body = await public(client, p)
    assert body["public_score"] == before and body["public_score"] is not None
    assert "closed" in body["badges"]
