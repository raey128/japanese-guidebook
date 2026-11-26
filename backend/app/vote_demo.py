"""Fake data for round 1 (V1): a demo vote link for the mockup test and for e2e.

"Maya picked 12 places for Tokyo": a mix of categories from the seed places, with honest-looking
curator evidence (these are demo numbers, used only on demo links).
"""

from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app import voting
from app.config import get_settings

DEMO_TITLE = "Tokyo, early December"
DEMO_ORGANIZER = "Maya"
DEMO_SIZE = 12


async def create(db: AsyncSession, *, token: str | None = None, closed: bool = False) -> str:
    city = (
        await db.execute(text("SELECT id FROM cities WHERE slug = 'tokyo'"))
    ).scalar_one_or_none()
    if city is None:
        raise LookupError("No Tokyo yet: run seed-locations and seed-places first.")
    # A spread across categories: round-robin over subcategories, by name.
    rows = (
        await db.execute(
            text(
                """
                SELECT id FROM (
                    SELECT p.id, row_number() OVER (PARTITION BY p.subcategory_id ORDER BY p.name)
                           AS n, p.subcategory_id
                    FROM places p
                    WHERE p.city_id = :c AND NOT p.is_hidden AND p.merged_into_id IS NULL
                ) x ORDER BY n, subcategory_id LIMIT :k
                """
            ),
            {"c": city, "k": DEMO_SIZE},
        )
    ).all()
    if not rows:
        raise LookupError("No Tokyo places yet: run seed-places first.")
    items = [(r.id, 2 + (i * 3) % 5, "2026-11-12") for i, r in enumerate(rows)]
    if token is not None:
        await db.execute(text("DELETE FROM vote_lists WHERE token = :t"), {"t": token})
    token, edit = await voting.create_list(
        db,
        title=DEMO_TITLE,
        organizer_name=DEMO_ORGANIZER,
        city_id=city,
        items=items,
        group_size=4,
        token=token,
    )
    if closed:
        list_id = (
            await db.execute(text("SELECT id FROM vote_lists WHERE token = :t"), {"t": token})
        ).scalar_one()
        item_ids = [
            r.id
            for r in await db.execute(
                text("SELECT id FROM vote_items WHERE list_id = :l ORDER BY position"),
                {"l": list_id},
            )
        ]
        for name, pattern in (("Ken", "ymn"), ("Aiko", "yyn"), (None, "mym")):
            vid = (
                await db.execute(
                    text(
                        "INSERT INTO voters (list_id, voter_key, name, done_at) "
                        "VALUES (:l, :k, :n, now()) RETURNING id"
                    ),
                    {"l": list_id, "k": uuid4(), "n": name},
                )
            ).scalar_one()
            for i, item in enumerate(item_ids):
                choice = {"y": "yes", "m": "maybe", "n": "no"}[pattern[i % len(pattern)]]
                await db.execute(
                    text("INSERT INTO votes (voter_id, item_id, choice) VALUES (:v, :i, :c)"),
                    {"v": vid, "i": item, "c": choice},
                )
        await db.execute(
            text("UPDATE vote_lists SET is_open = false WHERE id = :l"), {"l": list_id}
        )
    url = get_settings().site_url.rstrip("/")
    return f"vote link: {url}/v/{token}\nedit token (step 2): {edit}"
