"""Synthetic data for load / performance testing (ticket 12). Never run in production.

`generate(db, count)` bulk-inserts `count` places around the location centroids of every city,
plus synthetic users who rank random places in a few Lists each, then refreshes the aggregates.
It is deterministic for a given seed and uses array-parameter INSERT ... SELECT batches, so 50k
places load in well under a minute. Re-running with the same seed adds another batch of places.
The owner is the ordinary (non-system, non-reserved) user `synthetic_data`.
"""

import math
import random
from collections import defaultdict

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app import scores
from app.ranking import personal_score

OWNER_USERNAME = "synthetic_data"
USER_PREFIX = "synth_"
SPREAD_KM = 1.5
BATCH = 5000

# Search words (also used by perf/k6.js): every synthetic name is "<ADJ> <NOUN> <subcategory> <n>".
ADJECTIVES = [
    "Golden",
    "Quiet",
    "Little",
    "Old",
    "Hidden",
    "Grand",
    "Lucky",
    "Misty",
    "Red",
    "Blue",
    "Happy",
    "Sunny",
    "Secret",
    "Royal",
    "Tiny",
    "Eastern",
    "Northern",
    "Lazy",
    "Bright",
    "Calm",
]
NOUNS = [
    "Dragon",
    "Lantern",
    "Crane",
    "Bamboo",
    "Maple",
    "Koi",
    "Fox",
    "Tiger",
    "Sakura",
    "Fuji",
    "Harbor",
    "Garden",
    "Bridge",
    "Temple",
    "Pine",
    "River",
    "Moon",
    "Mountain",
    "Wave",
    "Lotus",
]
NOUNS_JA = ["龍", "提灯", "鶴", "竹", "紅葉", "鯉", "狐", "虎", "桜", "富士"]
SUFFIX_JA = ["の店", "亭", "屋", "庵", "堂"]


def _array_insert_places() -> str:
    return """
    INSERT INTO places (name, name_ja, geom, subcategory_id, location_id, city_id, creator_id)
    SELECT t.name, t.name_ja, ST_SetSRID(ST_MakePoint(t.lng, t.lat), 4326),
           t.sub_id, t.loc_id, t.city_id, :owner
    FROM unnest(
        CAST(:names AS text[]), CAST(:names_ja AS text[]), CAST(:lngs AS float8[]),
        CAST(:lats AS float8[]), CAST(:subs AS int[]), CAST(:locs AS int[]), CAST(:cities AS int[])
    ) AS t(name, name_ja, lng, lat, sub_id, loc_id, city_id)
    RETURNING id, city_id, subcategory_id
    """


async def _ensure_user(db: AsyncSession, username: str) -> int:
    await db.execute(
        text("INSERT INTO users (username) VALUES (:u) ON CONFLICT DO NOTHING"), {"u": username}
    )
    return (
        await db.execute(text("SELECT id FROM users WHERE lower(username) = :u"), {"u": username})
    ).scalar_one()


async def generate(db: AsyncSession, count: int, seed: int = 42) -> int:
    """Insert `count` synthetic places (+ users and rankings); return the number of places."""
    if count <= 0:
        return 0
    rng = random.Random(seed)
    owner = await _ensure_user(db, OWNER_USERNAME)

    locations = (
        await db.execute(
            text(
                """
                SELECT l.id, l.city_id, ST_Y(l.centroid) AS lat, ST_X(l.centroid) AS lng
                FROM locations l WHERE l.centroid IS NOT NULL ORDER BY l.id
                """
            )
        )
    ).all()
    subs = (await db.execute(text("SELECT id, name FROM subcategories ORDER BY id"))).all()
    if not locations or not subs:
        raise LookupError("No locations/subcategories loaded; run seed-locations first.")

    place_rows: list[tuple[int, int, int]] = []  # (id, city_id, subcategory_id)
    for start in range(0, count, BATCH):
        cols: dict[str, list] = defaultdict(list)
        for n in range(start, min(start + BATCH, count)):
            loc = rng.choice(locations)
            sub = rng.choice(subs)
            dlat = rng.gauss(0, SPREAD_KM) / 111.32
            dlng = rng.gauss(0, SPREAD_KM) / (111.32 * max(math.cos(math.radians(loc.lat)), 0.01))
            adj, noun = rng.choice(ADJECTIVES), rng.choice(NOUNS)
            ja = None
            if rng.random() < 0.3:
                ja = f"{rng.choice(NOUNS_JA)}{rng.choice(SUFFIX_JA)}{n}"
            cols["names"].append(f"{adj} {noun} {sub.name} {n}"[:200])
            cols["names_ja"].append(ja)
            cols["lats"].append(max(-90.0, min(90.0, loc.lat + dlat)))
            cols["lngs"].append(max(-180.0, min(180.0, loc.lng + dlng)))
            cols["subs"].append(sub.id)
            cols["locs"].append(loc.id)
            cols["cities"].append(loc.city_id)
        result = await db.execute(text(_array_insert_places()), {**cols, "owner": owner})
        place_rows.extend((r.id, r.city_id, r.subcategory_id) for r in result)

    await _generate_rankings(db, rng, place_rows, count)

    cats = {(c, s) for _, c, s in place_rows}
    await scores.refresh_aggregates(db, [p for p, _, _ in place_rows], cats)
    return len(place_rows)


async def _generate_rankings(
    db: AsyncSession, rng: random.Random, place_rows: list[tuple[int, int, int]], count: int
) -> None:
    by_list: dict[tuple[int, int], list[int]] = defaultdict(list)
    for pid, city_id, sub_id in place_rows:
        by_list[(city_id, sub_id)].append(pid)
    keys = sorted(by_list)
    if not keys:
        return

    n_users = max(10, min(2000, count // 25))
    names = [f"{USER_PREFIX}{i:05d}" for i in range(n_users)]
    await db.execute(
        text(
            "INSERT INTO users (username) SELECT unnest(CAST(:n AS text[])) ON CONFLICT DO NOTHING"
        ),
        {"n": names},
    )
    user_ids = [
        r.id
        for r in await db.execute(
            text("SELECT id FROM users WHERE username = ANY(:n) ORDER BY username"), {"n": names}
        )
    ]

    rk: dict[str, list] = defaultdict(list)
    lists: list[tuple[int, int, int, str]] = []
    for uid in user_ids:
        for key in rng.sample(keys, min(rng.randint(2, 4), len(keys))):
            pool = by_list[key]
            chosen = rng.sample(pool, min(rng.randint(4, 12), len(pool)))
            buckets: dict[str, list[int]] = defaultdict(list)
            for pid in chosen:
                buckets[rng.choices(["liked", "fine", "disliked"], [5, 3, 2])[0]].append(pid)
            for bucket, pids in buckets.items():
                lists.append((uid, key[0], key[1], bucket))
                for i, pid in enumerate(pids, start=1):
                    rk["user"].append(uid)
                    rk["place"].append(pid)
                    rk["city"].append(key[0])
                    rk["sub"].append(key[1])
                    rk["bucket"].append(bucket)
                    rk["pos"].append(i)
                    rk["score"].append(personal_score(bucket, i, len(pids)))

    for start in range(0, len(rk["user"]), BATCH):
        part = {k: v[start : start + BATCH] for k, v in rk.items()}
        await db.execute(
            text(
                """
                INSERT INTO rankings (user_id, place_id, city_id, subcategory_id, bucket,
                                      position, personal_score)
                SELECT * FROM unnest(
                    CAST(:user AS bigint[]), CAST(:place AS bigint[]), CAST(:city AS int[]),
                    CAST(:sub AS int[]), CAST(:bucket AS text[]), CAST(:pos AS int[]),
                    CAST(:score AS float8[])
                )
                -- Name the arbiter: the list-position constraint is deferrable, which a bare
                -- ON CONFLICT can't use.
                ON CONFLICT (user_id, place_id) DO NOTHING
                """
            ),
            part,
        )
    for start in range(0, len(lists), BATCH):
        part_l = lists[start : start + BATCH]
        await db.execute(
            text(
                """
                INSERT INTO rank_lists (user_id, city_id, subcategory_id, bucket)
                SELECT * FROM unnest(
                    CAST(:u AS bigint[]), CAST(:c AS int[]), CAST(:s AS int[]), CAST(:b AS text[])
                )
                ON CONFLICT DO NOTHING
                """
            ),
            {
                "u": [x[0] for x in part_l],
                "c": [x[1] for x in part_l],
                "s": [x[2] for x in part_l],
                "b": [x[3] for x in part_l],
            },
        )
