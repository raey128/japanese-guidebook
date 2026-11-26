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
    place: PlaceSummary
    # "Ranked by 5 curators · updated 12 Nov"; both null when there's no curator evidence.
    curator_count: int | None
    evidence_updated: str | None  # ISO date
    my_choice: VoteChoice | None
    tally: Tally | None  # only once voting is closed (read-only results)


class MeOut(Out):
    name: str | None
    done: bool
    voted_count: int


class VoteListOut(Out):
    title: str
    organizer_name: str
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
