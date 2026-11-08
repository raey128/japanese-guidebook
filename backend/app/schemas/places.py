"""Request/response shapes for adding, checking and editing places, and for geocoding."""

from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import CityOut, PlaceDetail, PlaceSummary


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


class PlaceCreateRequest(PlaceCheckRequest):
    location_id: int
    address: str | None = Field(default=None, max_length=500)
    # True once the user has seen the duplicate candidates and chose "this is different".
    confirm_not_duplicate: bool = False


class PlaceCreateResponse(BaseModel):
    """`created` (HTTP 201): `place` is set. `duplicates` (HTTP 200): nothing was created and
    `candidates` lists nearby similar places for the user to pick or dismiss."""

    status: Literal["created", "duplicates"]
    place: PlaceDetail | None = None
    candidates: list[PlaceSummary] = []


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
