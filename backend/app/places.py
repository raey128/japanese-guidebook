"""Places service: pin/location validation, rate limit, duplicate check, creation.

Raises small domain errors; routers translate them to HTTP responses.
"""

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app import geography
from app.config import get_settings
from app.models import Location, Place, Subcategory, User

MAX_DUPLICATE_CANDIDATES = 5


class PlaceRuleError(Exception):
    pass


class FieldError(PlaceRuleError):
    """A validation problem attached to one request field (HTTP 422)."""

    def __init__(self, field: str, message: str):
        super().__init__(message)
        self.field = field
        self.message = message


class OutsideCoverage(PlaceRuleError):
    """The pin is farther than the coverage radius from every curated location (HTTP 422)."""


class RateLimited(PlaceRuleError):
    def __init__(self, limit: int):
        super().__init__(f"You can add {limit} places per 24 hours. Try again later.")
        self.limit = limit


async def check_subcategory(db: AsyncSession, subcategory_id: int) -> Subcategory:
    sub = await db.get(Subcategory, subcategory_id)
    if sub is None:
        raise FieldError("subcategory_id", "Unknown subcategory.")
    return sub


async def check_pin_and_location(
    db: AsyncSession, lat: float, lng: float, location_id: int
) -> Location:
    """The pin must be inside coverage and the location must belong to the pin's city.

    The location need not be the suggested one: any location of that city (including the
    catch-all) is fine.
    """
    location = await db.get(Location, location_id)
    if location is None:
        raise FieldError("location_id", "Unknown location.")
    suggestion = await geography.suggest_location(db, lat, lng)
    if suggestion.outside_coverage or suggestion.city is None:
        raise OutsideCoverage()
    if location.city_id != suggestion.city.id:
        raise FieldError(
            "location_id", f"That location isn't in {suggestion.city.name}, where the pin is."
        )
    return location


async def check_rate_limit(db: AsyncSession, user: User) -> None:
    """Rolling 24 h cap on places added; stricter for accounts younger than N days."""
    s = get_settings()
    row = (
        await db.execute(
            text(
                """
                SELECT (now() - u.created_at < make_interval(days => :days)) AS is_new,
                       (SELECT count(*) FROM places p
                         WHERE p.creator_id = u.id
                           AND p.created_at > now() - interval '24 hours') AS recent
                FROM users u WHERE u.id = :uid
                """
            ),
            {"days": s.new_account_days, "uid": user.id},
        )
    ).one()
    limit = s.new_account_daily_places if row.is_new else s.established_daily_places
    if row.recent >= limit:
        raise RateLimited(limit)


async def find_duplicates(
    db: AsyncSession,
    *,
    name: str,
    name_ja: str | None,
    lat: float,
    lng: float,
    subcategory_id: int,
) -> list[int]:
    """Ids of likely duplicates, nearest first: same subcategory within 50 m, or a
    trigram-similar name (English or Japanese) within 200 m. Hidden and merged places are
    ignored. ST_DWithin on the geography cast uses the ix_places_geog index."""
    s = get_settings()
    rows = await db.execute(
        text(
            """
            WITH pt AS (SELECT ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography AS g)
            SELECT p.id
            FROM places p, pt
            WHERE NOT p.is_hidden AND p.merged_into_id IS NULL
              AND (
                (p.subcategory_id = :sub AND ST_DWithin(p.geom::geography, pt.g, :same_m))
                OR (
                  ST_DWithin(p.geom::geography, pt.g, :name_m)
                  AND (
                    similarity(p.name, :name) > :thr
                    OR similarity(p.name_ja, :name) > :thr
                    OR similarity(p.name, CAST(:name_ja AS text)) > :thr
                    OR similarity(p.name_ja, CAST(:name_ja AS text)) > :thr
                  )
                )
              )
            ORDER BY ST_Distance(p.geom::geography, pt.g), p.id
            LIMIT :lim
            """
        ),
        {
            "lat": lat,
            "lng": lng,
            "sub": subcategory_id,
            "same_m": s.duplicate_same_subcategory_m,
            "name_m": s.duplicate_name_m,
            "name": name,
            "name_ja": name_ja,
            "thr": s.duplicate_name_similarity,
            "lim": MAX_DUPLICATE_CANDIDATES,
        },
    )
    return [r.id for r in rows]


async def create_place(
    db: AsyncSession,
    user: User,
    *,
    name: str,
    name_ja: str | None,
    lat: float,
    lng: float,
    subcategory_id: int,
    location: Location,
    address: str | None,
    pending: bool = False,
) -> Place:
    """Insert a place. Manual adds from search (R13) are stored pending and hidden until reviewed."""
    place_id = (
        await db.execute(
            text(
                """
                INSERT INTO places (name, name_ja, address, geom, subcategory_id, location_id,
                                    city_id, creator_id, status, is_hidden)
                VALUES (:name, :name_ja, :address, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326),
                        :sub, :loc, :city, :creator, :status, :hidden)
                RETURNING id
                """
            ),
            {
                "name": name,
                "name_ja": name_ja,
                "address": address,
                "lat": lat,
                "lng": lng,
                "sub": subcategory_id,
                "loc": location.id,
                "city": location.city_id,
                "creator": user.id,
                "status": "pending" if pending else "live",
                "hidden": pending,
            },
        )
    ).scalar_one()
    place = (
        await db.execute(
            select(Place).where(Place.id == place_id).execution_options(populate_existing=True)
        )
    ).scalar_one()
    return place


async def db_now(db: AsyncSession):  # type: ignore[no-untyped-def]
    return (await db.execute(select(func.now()))).scalar_one()
