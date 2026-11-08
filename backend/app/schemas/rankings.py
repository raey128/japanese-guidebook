"""Request/response shapes for rankings, the snapshot, my-rankings and place notes."""

from pydantic import BaseModel, Field

from app.schemas.common import (
    Badge,
    Bucket,
    CityOut,
    MyRanking,
    Out,
    SubcategoryOut,
)

NOTE_MAX = 1000


class RankingItem(Out):
    ranking_id: int
    place_id: int
    name: str
    name_ja: str | None
    position: int  # 1 = best
    personal_score: float
    badges: list[Badge]  # "closed" / "reported_closed" / "hidden" (hidden only ever shown to owner)


class BucketList(Out):
    """One List (user, city, subcategory, bucket) with the version to send back on writes."""

    bucket: Bucket
    version: int
    items: list[RankingItem]  # best first


class Snapshot(Out):
    place_id: int
    city: CityOut
    subcategory: SubcategoryOut
    can_rank: bool  # False for a closed place the user hasn't ranked yet
    my_ranking: MyRanking | None  # exclude this place's item from the comparisons
    buckets: list[BucketList]  # always liked, fine, disliked


class RankRequest(BaseModel):
    place_id: int
    bucket: Bucket
    position: int = Field(ge=1, description="1-based among the target List's other items")
    list_version: int = Field(ge=0)
    # Optional. Fields that are present (even null) overwrite the saved values; fields that
    # are omitted leave an existing note/visit date untouched.
    note: str | None = Field(default=None, max_length=NOTE_MAX)
    visit_month: int | None = Field(default=None, ge=1, le=12)
    visit_year: int | None = Field(default=None, ge=1900, le=2100)


class RankResponse(Out):
    rank_list: BucketList  # the updated target List
    previous_list: BucketList | None  # the List it left, when a re-rank changed bucket
    ranking: MyRanking
    is_new: bool = True  # False for a re-rank
    city_name: str = ""
    city_rank_count: int = 0  # the user's rankings in this place's city, after this save


class StaleListOut(BaseModel):
    detail: str
    current_version: int


class NotePatch(BaseModel):
    """Fields present in the body overwrite; omitted fields keep their saved value."""

    note: str | None = Field(default=None, max_length=NOTE_MAX)
    visit_month: int | None = Field(default=None, ge=1, le=12)
    visit_year: int | None = Field(default=None, ge=1900, le=2100)


class CategoryLists(Out):
    subcategory: SubcategoryOut
    buckets: list[BucketList]  # always liked, fine, disliked


class CityLists(Out):
    city: CityOut
    categories: list[CategoryLists]


class MyRankings(Out):
    cities: list[CityLists]


class PlaceNote(Out):
    ranking_id: int
    author: str  # username, or "Anonymous" for private users
    note: str
    visit_month: int | None
    visit_year: int | None
    bucket: Bucket
    created_at: str
    is_own: bool


class PlaceNotes(Out):
    notes: list[PlaceNote]
