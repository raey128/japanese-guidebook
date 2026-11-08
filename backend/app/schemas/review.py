"""Manual-add review (R13.4–R13.7, R13.9)."""

from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import PlaceSummary


class PendingPlace(BaseModel):
    place: PlaceSummary
    submitter: str
    created_at: str
    nearby: list[PlaceSummary]  # live places within 200 m


class PendingQueue(BaseModel):
    items: list[PendingPlace]


class PendingCount(BaseModel):
    count: int


class RejectIn(BaseModel):
    reason: str | None = Field(default=None, max_length=200)


class Submission(BaseModel):
    place_id: int
    name: str
    status: Literal["pending", "live", "rejected"]
    review_reason: str | None
    created_at: str
    reviewed_at: str | None


class Submissions(BaseModel):
    items: list[Submission]
