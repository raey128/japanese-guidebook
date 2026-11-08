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


class MyRanking(Out):
    id: int
    bucket: Bucket
    position: int
    personal_score: float
    note: str | None
    visit_month: int | None
    visit_year: int | None


class ViewerState(Out):
    """What the signed-in viewer can do with / has done to a place."""

    signed_in: bool
    can_edit: bool
    can_flag: bool
    can_rank: bool
    is_bookmarked: bool
    my_ranking: MyRanking | None


class TopNote(Out):
    """The most recent note from a "Liked" ranking, quoted in the place popup (R17.7)."""

    author: str  # username, or "Anonymous" for private users
    note: str


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
