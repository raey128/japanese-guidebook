"""ORM models. The schema itself is owned by Alembic migrations; keep both in sync.

Nothing here is Japan-specific: cities carry a country_code and are data, not code.
There are no email, password or other PII columns.
"""

from datetime import datetime
from typing import Any

from geoalchemy2 import Geometry
from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

BUCKETS = ("liked", "fine", "disliked")
TOP_CATEGORIES = ("food", "sights", "stays", "experiences")
PLACE_FLAG_TYPES = ("closed", "wrong_location", "wrong_info", "duplicate", "spam")
NOTE_FLAG_TYPES = ("spam",)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    username: Mapped[str] = mapped_column(String(20), nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_private: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # System users (e.g. `guidebook`, owner of seed places) can never sign in.
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Session(Base):
    __tablename__ = "sessions"

    # sha256 of the opaque cookie token; the raw token is never stored.
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class Subcategory(Base):
    __tablename__ = "subcategories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    top_category: Mapped[str] = mapped_column(String(20), nullable=False)


class City(Base):
    __tablename__ = "cities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    name_ja: Mapped[str | None] = mapped_column(String(80))
    country_code: Mapped[str] = mapped_column(String(2), nullable=False)
    centroid: Mapped[Any] = mapped_column(Geometry("POINT", srid=4326), nullable=False)


class Location(Base):
    __tablename__ = "locations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(60), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    name_ja: Mapped[str | None] = mapped_column(String(120))
    city_id: Mapped[int] = mapped_column(ForeignKey("cities.id"), index=True, nullable=False)
    centroid: Mapped[Any | None] = mapped_column(Geometry("POINT", srid=4326))
    is_catch_all: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class Place(Base):
    __tablename__ = "places"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    name_ja: Mapped[str | None] = mapped_column(String(200))
    address: Mapped[str | None] = mapped_column(Text)
    geom: Mapped[Any] = mapped_column(Geometry("POINT", srid=4326), nullable=False)
    subcategory_id: Mapped[int] = mapped_column(ForeignKey("subcategories.id"), nullable=False)
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id"), nullable=False)
    # Denormalised from location_id; always set together with it (see places service).
    city_id: Mapped[int] = mapped_column(ForeignKey("cities.id"), nullable=False)
    creator_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    is_hidden: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_closed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # True when is_closed was set by the 3-flagger auto-action ("Reported closed").
    closed_by_reports: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_seed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    seed_reviewed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    merged_into_id: Mapped[int | None] = mapped_column(ForeignKey("places.id"))
    # Manual adds (R13): 'pending' until an admin approves ('live') or rejects ('rejected').
    status: Mapped[str] = mapped_column(String(10), default="live", server_default="live", nullable=False)
    review_reason: Mapped[str | None] = mapped_column(String(200))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PlaceStats(Base):
    """Per-place public-score aggregate, maintained in every ranking write transaction."""

    __tablename__ = "place_stats"

    place_id: Mapped[int] = mapped_column(
        ForeignKey("places.id", ondelete="CASCADE"), primary_key=True
    )
    rank_sum: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    rank_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class CategoryStats(Base):
    """Per-(city, subcategory) aggregate of non-hidden rankings; the Bayesian prior."""

    __tablename__ = "category_stats"

    city_id: Mapped[int] = mapped_column(ForeignKey("cities.id"), primary_key=True)
    subcategory_id: Mapped[int] = mapped_column(ForeignKey("subcategories.id"), primary_key=True)
    rank_sum: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    rank_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class RankList(Base):
    """A List: one user's places for (city, subcategory, bucket). Holds the version for 409s."""

    __tablename__ = "rank_lists"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    city_id: Mapped[int] = mapped_column(ForeignKey("cities.id"), primary_key=True)
    subcategory_id: Mapped[int] = mapped_column(ForeignKey("subcategories.id"), primary_key=True)
    bucket: Mapped[str] = mapped_column(String(10), primary_key=True)
    version: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class Ranking(Base):
    __tablename__ = "rankings"
    __table_args__ = (
        UniqueConstraint("user_id", "place_id", name="uq_rankings_user_place"),
        CheckConstraint("bucket IN ('liked','fine','disliked')", name="ck_rankings_bucket"),
        CheckConstraint("char_length(note) <= 1000", name="ck_rankings_note_len"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    place_id: Mapped[int] = mapped_column(ForeignKey("places.id"), index=True, nullable=False)
    # The List this ranking sits in. Equal to the place's city/subcategory except while a
    # re-insertion is in flight.
    city_id: Mapped[int] = mapped_column(ForeignKey("cities.id"), nullable=False)
    subcategory_id: Mapped[int] = mapped_column(ForeignKey("subcategories.id"), nullable=False)
    bucket: Mapped[str] = mapped_column(String(10), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)  # 1 = best
    personal_score: Mapped[float] = mapped_column(Float, nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
    visit_month: Mapped[int | None] = mapped_column(SmallInteger)
    visit_year: Mapped[int | None] = mapped_column(SmallInteger)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Bookmark(Base):
    __tablename__ = "bookmarks"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    place_id: Mapped[int] = mapped_column(ForeignKey("places.id"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Flag(Base):
    __tablename__ = "flags"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    target_type: Mapped[str] = mapped_column(String(10), nullable=False)  # 'place' | 'note'
    place_id: Mapped[int | None] = mapped_column(ForeignKey("places.id"), index=True)
    # A note is the note on a ranking.
    ranking_id: Mapped[int | None] = mapped_column(
        ForeignKey("rankings.id", ondelete="CASCADE"), index=True
    )
    flag_type: Mapped[str] = mapped_column(String(20), nullable=False)
    payload: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(10), default="open", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class GeocodeCache(Base):
    __tablename__ = "geocode_cache"

    # Coordinates rounded to 4 decimals, stored as integers (x 10_000) to keep keys exact.
    lat_e4: Mapped[int] = mapped_column(Integer, primary_key=True)
    lng_e4: Mapped[int] = mapped_column(Integer, primary_key=True)
    address: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class GeocodeThrottle(Base):
    """Single row; with a Postgres advisory lock it enforces <=1 outgoing call/s globally."""

    __tablename__ = "geocode_throttle"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    last_called_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
