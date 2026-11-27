"""Round 1 group vote links (V1)."""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import CityOut, Out, PlaceSummary

VoteChoice = Literal["yes", "maybe", "no"]


class Tally(Out):
    """Counts per choice, and the names of voters who gave one (unnamed voters count but
    aren't listed)."""

    yes: int
    maybe: int
    no: int
    yes_names: list[str]
    maybe_names: list[str]
    no_names: list[str]


class VoteItemOut(Out):
    item_id: int
    position: int = 0
    place: PlaceSummary
    # "Ranked by 5 curators · updated 12 Nov"; both null when there's no curator evidence.
    curator_count: int | None
    evidence_updated: str | None  # ISO date
    my_choice: VoteChoice | None
    # Live counts for everyone (decided 2026-11-27); the *_names are filled only for the owner.
    tally: Tally | None


class MeOut(Out):
    name: str | None
    done: bool
    voted_count: int


class VoteListOut(Out):
    title: str
    organizer_name: str
    is_owner: bool = False  # the signed-in viewer made this list (sees voters' names)
    city: CityOut
    is_open: bool
    group_size: int | None
    item_count: int
    voter_count: int  # people who have voted on at least one place
    items: list[VoteItemOut]  # the organizer's order
    me: MeOut | None  # this browser's voter, if it has voted or named itself


class VoterRequest(BaseModel):
    voter: UUID


class VoteRequest(VoterRequest):
    item_id: int
    choice: VoteChoice


class NameRequest(VoterRequest):
    name: str | None = Field(default=None, max_length=40)

    @field_validator("name")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        return (" ".join(v.split()) or None) if v is not None else None


class VoteSaved(Out):
    choice: VoteChoice
    voted_count: int  # how many places this voter has voted on


class Progress(Out):
    voter_count: int
    group_size: int | None


# ---- Shared lists, owner side (decided 2026-11-27) -----------------------------------------


class MyListSummary(Out):
    id: int
    token: str
    title: str
    city: CityOut
    is_open: bool  # "Let friends vote"
    place_count: int
    voter_count: int
    updated_at: str
    share_url: str  # the link to send: shows a preview in chat apps, then opens the list
    cover: PlaceSummary | None  # the first place, for the card's picture


class MyListDetail(MyListSummary):
    items: list[VoteItemOut]  # in order, with live tallies and voters' names


class CreateListRequest(BaseModel):
    title: str = Field(min_length=1, max_length=80)
    city_slug: str
    # Start with the places you loved there (rated 8+), best first.
    prefill: bool = True

    @field_validator("title")
    @classmethod
    def _title(cls, v: str) -> str:
        v = " ".join(v.split())
        if not v:
            raise ValueError("Give the list a name.")
        return v


class UpdateListRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=80)
    is_open: bool | None = None


class AddItemsRequest(BaseModel):
    place_ids: list[int] = Field(min_length=1, max_length=100)


class AddItemsResult(Out):
    added: int
    already: int  # on the list already
    other_city: int  # skipped: a list is one city


class ItemIdsRequest(BaseModel):
    item_ids: list[int] = Field(min_length=1, max_length=200)


class SaveAllResult(Out):
    saved: int  # newly on your Want to go
    already: int  # rated or saved already
