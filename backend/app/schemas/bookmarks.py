"""Bookmark (want-to-go) response shapes."""

from pydantic import BaseModel

from app.schemas.common import PlaceSummary


class BookmarkState(BaseModel):
    place_id: int
    is_bookmarked: bool


class BookmarkList(BaseModel):
    items: list[PlaceSummary]  # newest bookmark first
