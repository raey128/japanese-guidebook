"""Shared response shapes. Module-specific schemas live next to them in app/schemas/."""

from typing import Literal

from pydantic import BaseModel, ConfigDict

Bucket = Literal["liked", "fine", "disliked"]
Badge = Literal["unverified", "closed", "reported_closed", "hidden", "pending"]
PlaceStatus = Literal["live", "pending", "rejected"]
TopCategory = Literal["food", "sights", "stays", "experiences"]

ANONYMOUS = "Anonymous"


class Out(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class UserOut(Out):
    id: int
    username: str
    is_admin: bool
    is_private: bool


class SubcategoryOut(Out):
    id: int
    slug: str
    name: str
    top_category: TopCategory


class LocationOut(Out):
    id: int
    slug: str
    name: str
    name_ja: str | None
    city_id: int
    is_catch_all: bool
    lat: float | None
    lng: float | None


class CityOut(Out):
    id: int
    slug: str
    name: str
    name_ja: str | None
    country_code: str
    lat: float
    lng: float


class CityWithLocations(CityOut):
    locations: list[LocationOut]


class TopNote(Out):
    """The most recent note from a "Liked" ranking, quoted in the place popup (R17.7)."""

    author: str  # username, or "Anonymous" for private users
    note: str


class PlaceImage(Out):
    """The picture shown for a place (decided 2026-11-27): a user's newest photo, else a
    Wikimedia Commons photo (credit required), else none (the app draws poster art)."""

    source: Literal["user", "wikimedia"]
    url: str
    thumb_url: str
    credit: str | None  # "Photo: Kakidai · CC BY-SA 3.0" for Wikimedia; None for users' photos
    credit_url: str | None  # the file's Commons page


class PlaceSummary(Out):
    """A place as it appears in lists, search results, pins and profiles."""

    id: int
    name: str
    name_ja: str | None
    lat: float
    lng: float
    address: str | None
    subcategory: SubcategoryOut
    location: LocationOut
    city: CityOut
    public_score: float | None  # None = "Not yet ranked"
    ranker_count: int
    badges: list[Badge]
    image: PlaceImage | None = None
    # A sneak peek of what people say (decided 2026-11-27): the newest comment, from someone
    # who loved it if possible.
    peek: TopNote | None = None


class PhotoOut(Out):
    id: int
    ranking_id: int
    url: str  # full size (longest side ≤ 1600 px)
    thumb_url: str  # ≤ 400 px
    width: int
    height: int
    author: str
    author_avatar_url: str | None
    created_at: str  # ISO 8601
    is_own: bool


class MyRanking(Out):
    id: int
    bucket: Bucket
    position: int
    personal_score: float
    rating: int | None = None  # 1-10; null for rankings made before ratings
    note: str | None
    visit_month: int | None
    visit_year: int | None
    photos: list[PhotoOut] = []  # filled in by the caller (R20.4)


class ViewerState(Out):
    """What the signed-in viewer can do with / has done to a place."""

    signed_in: bool
    can_edit: bool
    can_flag: bool
    can_rank: bool
    is_bookmarked: bool
    my_ranking: MyRanking | None


class PlaceDetail(PlaceSummary):
    creator: str  # username, or "Anonymous" for private users
    created_at: str
    is_seed: bool
    edit_deadline: str | None  # ISO time the creator's edit window closes
    status: PlaceStatus
    top_note: TopNote | None
    viewer: ViewerState


class Message(BaseModel):
    detail: str
