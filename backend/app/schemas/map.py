"""Map endpoint response shapes."""

from typing import Literal

from pydantic import BaseModel

from app.schemas.common import Badge, TopCategory


class MapCluster(BaseModel):
    lat: float  # centroid of the cluster's members
    lng: float
    count: int


class MapPoint(BaseModel):
    id: int
    lat: float
    lng: float
    name: str
    name_ja: str | None
    subcategory_slug: str
    top_category: TopCategory
    public_score: float | None
    ranker_count: int
    badges: list[Badge]


class MapResponse(BaseModel):
    kind: Literal["clusters", "points"]
    clusters: list[MapCluster]
    points: list[MapPoint]
    truncated: bool
