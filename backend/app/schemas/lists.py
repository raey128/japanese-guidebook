"""Ranked public lists and search."""

from typing import Literal

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
    top_category: TopCategory | None  # None for "all" (every category in the city)
    location: LocationOut | None
    total: int
    limit: int
    offset: int
    items: list[ListItem]


class FeaturedList(Out):
    """One list on the Lists tab (R14.7): the top few places, with a link to the full list."""

    key: str  # the `category` path part of /lists/{city}/{category}: "all", "food", "ramen" ...
    kind: Literal["all", "top", "sub"]
    title: str  # "Top rated in Tokyo", "Top Food in Tokyo", "Top Ramen in Tokyo"
    top_category: TopCategory | None
    total: int  # places in the full list
    ranked: int  # how many of them have a public score
    items: list[ListItem]


class FeaturedLists(Out):
    city: CityOut
    lists: list[FeaturedList]


class SearchItem(PlaceSummary):
    is_bookmarked: bool = False  # always false when signed out
    my_ranking_id: int | None = None  # the viewer's ranking of this place, if any


class SearchResults(Out):
    items: list[SearchItem] = Field(default_factory=list)
