from uuid import UUID

from pydantic import BaseModel, Field


class EventItem(BaseModel):
    type: str = Field(max_length=30)
    source: str | None = Field(default=None, max_length=20)


class EventBatch(BaseModel):
    browser_id: UUID
    events: list[EventItem] = Field(max_length=20)


class FunnelWeek(BaseModel):
    week: str  # ISO date of the week's Monday
    first_visits: int
    opened_place: int
    opened_within_2min: int
    saved: int
    ranked: int
    searches_no_result: int


class Stats(BaseModel):
    weeks: list[FunnelWeek]  # newest first
