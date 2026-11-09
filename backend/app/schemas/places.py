"""Request/response shapes for adding, checking and editing places, and for geocoding."""

from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.ranking import COMMENT_REQUIRED_BELOW, LOW_RATING_NEEDS_COMMENT, NOTE_MAX_LEN
from app.schemas.common import CityOut, MyRanking, PlaceDetail, PlaceSummary


def _strip_required(value: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError("English name is required.")
    return value


class PlaceCheckRequest(BaseModel):
    """The fields the duplicate check needs (POST /places/duplicates)."""

    name: str = Field(min_length=1, max_length=200)
    name_ja: str | None = Field(default=None, max_length=200)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    subcategory_id: int

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        return _strip_required(v)

    @field_validator("name_ja")
    @classmethod
    def _name_ja(cls, v: str | None) -> str | None:
        return (v.strip() or None) if v is not None else None


class ReviewIn(BaseModel):
    """The adder's own rating when they've been there (R3.6). Rating is required; a comment is
    optional unless the rating is below 3 stars."""

    rating: int = Field(ge=1, le=5)
    note: str | None = Field(default=None, max_length=NOTE_MAX_LEN)
    visit_month: int | None = Field(default=None, ge=1, le=12)
    visit_year: int | None = Field(default=None, ge=1900, le=2100)

    @field_validator("note")
    @classmethod
    def _note(cls, v: str | None) -> str | None:
        return (v.strip() or None) if v is not None else None

    @model_validator(mode="after")
    def _low_rating_needs_comment(self) -> "ReviewIn":
        if self.rating < COMMENT_REQUIRED_BELOW and not self.note:
            raise ValueError(LOW_RATING_NEEDS_COMMENT)
        if (self.visit_month is None) != (self.visit_year is None):
            raise ValueError("Give both a visit month and year, or neither.")
        return self


class PlaceCreateRequest(PlaceCheckRequest):
    location_id: int
    address: str | None = Field(default=None, max_length=500)
    # True once the user has seen the duplicate candidates and chose "this is different".
    confirm_not_duplicate: bool = False
    # "manual" = added via "Add manually" from search: saved pending admin review (R13).
    source: Literal["pin", "manual"] = "pin"
    # "I've been here" (R3.6): then `review` (a star rating) is required and the place is
    # ranked for the adder as it's created.
    visited: bool = False
    review: ReviewIn | None = None

    @model_validator(mode="after")
    def _visited_needs_rating(self) -> "PlaceCreateRequest":
        if self.visited and self.review is None:
            raise ValueError("You've been here, so please give it a star rating.")
        if not self.visited and self.review is not None:
            raise ValueError("Only rate places you've been to.")
        return self


class PlaceCreateResponse(BaseModel):
    """`created` (HTTP 201): `place` is set. `duplicates` (HTTP 200): nothing was created and
    `candidates` lists nearby similar places for the user to pick or dismiss."""

    status: Literal["created", "duplicates"]
    place: PlaceDetail | None = None
    candidates: list[PlaceSummary] = []
    # Set when a review came with the place: the adder's new ranking, and how many other
    # places share its List (if any, the app offers quick comparisons to fine-tune it).
    ranking: MyRanking | None = None
    compare_count: int = 0
    city_name: str = ""
    city_rank_count: int = 0


class DuplicateCheckResponse(BaseModel):
    candidates: list[PlaceSummary]


class PlaceUpdateRequest(BaseModel):
    """PATCH body; only the fields present are changed. lat and lng must come together.
    `name_ja` / `address` may be set to null or "" to clear them."""

    name: str | None = Field(default=None, max_length=200)
    name_ja: str | None = Field(default=None, max_length=200)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    subcategory_id: int | None = None
    location_id: int | None = None
    address: str | None = Field(default=None, max_length=500)


class OutsideCoverageError(BaseModel):
    """Body of the 422 returned when the pin is outside coverage."""

    detail: str  # "We only cover these cities for now"
    covered_cities: list[CityOut]


class ReverseGeocodeResponse(BaseModel):
    address: str | None


class AddressResult(BaseModel):
    label: str
    lat: float
    lng: float


class AddressSearchResponse(BaseModel):
    results: list[AddressResult]


class PlaceLookupResult(BaseModel):
    """A business found by name in OpenStreetMap (via Photon), for the add-place type-ahead."""

    name: str
    address: str | None
    lat: float
    lng: float
    kind: str | None  # OSM tag, e.g. "amenity=restaurant", shown as a hint
    subcategory_id: int | None  # our best guess from the OSM tags; the user can change it


class PlaceLookupResponse(BaseModel):
    results: list[PlaceLookupResult]
