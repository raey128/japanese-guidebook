"""Top picks (R15, R17.8) and type-ahead suggestions (R12)."""

from typing import Literal

from pydantic import BaseModel

from app.schemas.common import LocationOut, PlaceSummary, SubcategoryOut


class TopPicks(BaseModel):
    # ranked: best public scores in view; team: reviewed seed places (nothing ranked in view);
    # nearby: nothing ranked or reviewed, so any places in view, nearest the centre first;
    # empty: no places in view at all.
    kind: Literal["ranked", "team", "nearby", "empty"]
    items: list[PlaceSummary]


class Suggestions(BaseModel):
    areas: list[LocationOut]  # ≤ 3, never the catch-all
    subcategories: list[SubcategoryOut]  # ≤ 3
    on_map: list[PlaceSummary]  # ≤ 5, inside the bbox
    elsewhere: list[PlaceSummary]  # ≤ 5, rest of the city
