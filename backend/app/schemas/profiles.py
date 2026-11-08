"""Public profile response shapes."""

from pydantic import BaseModel

from app.schemas.common import Bucket, CityOut, PlaceSummary, SubcategoryOut, TopCategory


class ProfileItem(BaseModel):
    place: PlaceSummary
    bucket: Bucket
    position: int
    personal_score: float


class ProfileList(BaseModel):
    city: CityOut
    subcategory: SubcategoryOut
    top_category: TopCategory
    items: list[ProfileItem]  # liked, then fine, then disliked; each by position


class ProfileOut(BaseModel):
    username: str
    created_at: str  # ISO 8601
    is_self: bool
    lists: list[ProfileList]  # ordered by city name, then subcategory name


class UpdateMeRequest(BaseModel):
    is_private: bool
