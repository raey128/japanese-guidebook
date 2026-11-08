"""Ranked public lists and search."""

from pydantic import Field

from app.schemas.common import (
    CityOut,
    LocationOut,
    Out,
    PlaceSummary,
    SubcategoryOut,
    TopCategory,
)


class ListItem(PlaceSummary):
    # 1-based rank in the whole list; None for places nobody has ranked yet ("Not yet ranked").
    rank: int | None


class PublicList(Out):
    title: str  # "Ramen in Tokyo", "Food in Kyoto", plus " › Asakusa" when filtered by location
    city: CityOut
    subcategory: SubcategoryOut | None  # None for a top-category roll-up
    top_category: TopCategory
    location: LocationOut | None
    total: int
    limit: int
    offset: int
    items: list[ListItem]


class SearchItem(PlaceSummary):
    is_bookmarked: bool = False  # always false when signed out
    my_ranking_id: int | None = None  # the viewer's ranking of this place, if any


class SearchResults(Out):
    items: list[SearchItem] = Field(default_factory=list)
