"""Request / response shapes for flags and the admin moderation endpoints."""

from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.common import CityOut, LocationOut, Out, PlaceSummary, SubcategoryOut

PlaceFlagType = Literal["closed", "wrong_location", "wrong_info", "duplicate", "spam"]
FlagStatus = Literal["open", "dismissed", "resolved"]


# ---- Creating flags -------------------------------------------------------------------------


class WrongLocationPayload(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class WrongInfoPayload(BaseModel):
    """Suggested corrections; at least one field. An empty name_ja suggests clearing it."""

    name: str | None = Field(default=None, max_length=200)
    name_ja: str | None = Field(default=None, max_length=200)
    subcategory_id: int | None = None
    location_id: int | None = None

    @field_validator("name")
    @classmethod
    def _name_not_blank(cls, v: str | None) -> str | None:
        if v is not None and not v.strip():
            raise ValueError("name can't be blank")
        return v.strip() if v is not None else None

    @model_validator(mode="after")
    def _at_least_one(self) -> "WrongInfoPayload":
        if (
            self.name is None
            and self.name_ja is None
            and self.subcategory_id is None
            and self.location_id is None
        ):
            raise ValueError("Suggest a correction to at least one field.")
        return self


class DuplicatePayload(BaseModel):
    other_place_id: int


class ClosedFlagIn(BaseModel):
    flag_type: Literal["closed"]
    payload: dict[str, Any] | None = None  # ignored


class SpamFlagIn(BaseModel):
    flag_type: Literal["spam"]
    payload: dict[str, Any] | None = None  # ignored


class WrongLocationFlagIn(BaseModel):
    flag_type: Literal["wrong_location"]
    payload: WrongLocationPayload


class WrongInfoFlagIn(BaseModel):
    flag_type: Literal["wrong_info"]
    payload: WrongInfoPayload


class DuplicateFlagIn(BaseModel):
    flag_type: Literal["duplicate"]
    payload: DuplicatePayload


PlaceFlagIn = Annotated[
    ClosedFlagIn | SpamFlagIn | WrongLocationFlagIn | WrongInfoFlagIn | DuplicateFlagIn,
    Field(discriminator="flag_type"),
]


class NoteFlagIn(BaseModel):
    flag_type: Literal["spam"]
    payload: dict[str, Any] | None = None  # ignored


class FlagCreated(Out):
    id: int
    flag_type: str
    status: FlagStatus
    # Set when this flag was the one that tipped the place over the threshold.
    auto_action: Literal["hidden", "closed"] | None


# ---- Admin queue ----------------------------------------------------------------------------


class FlagOut(Out):
    id: int
    flag_type: str
    status: FlagStatus
    flagger: str  # username (admins see real usernames, even for private users)
    created_at: str
    payload: dict[str, Any] | None
    # Resolved from the payload so the UI needs no extra lookups:
    duplicate_place: PlaceSummary | None  # duplicate: the other place
    suggested_subcategory: SubcategoryOut | None  # wrong_info
    suggested_location: LocationOut | None  # wrong_info


class NoteTarget(Out):
    ranking_id: int
    note: str | None
    author: str  # real username (admin view)
    author_is_private: bool
    visit_month: int | None
    visit_year: int | None


class FlagGroup(Out):
    key: str  # "place:<id>" or "note:<ranking_id>"
    target_type: Literal["place", "note"]
    latest_at: str
    counts: dict[str, int]  # flag_type -> number of flags in this group (for the status filter)
    place: PlaceSummary | None  # the flagged place; for a note, the place it belongs to
    note: NoteTarget | None
    flags: list[FlagOut]  # newest first


class FlagQueue(Out):
    groups: list[FlagGroup]  # newest latest-flag first


class FlagStatusOut(Out):
    id: int
    status: FlagStatus


# ---- Admin actions --------------------------------------------------------------------------


class MergeIn(BaseModel):
    into_place_id: int


class SeedReviewIn(BaseModel):
    reviewed: bool


class SeedCityCount(Out):
    city: CityOut
    total: int
    unreviewed: int


class SeedItem(Out):
    place: PlaceSummary
    reviewed: bool


class SeedReview(Out):
    counts: list[SeedCityCount]
    items: list[SeedItem]
