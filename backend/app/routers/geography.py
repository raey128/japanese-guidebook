"""Curated reference data and location suggestion."""

import re
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Response, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select

from app import geography
from app.deps import DB, CurrentUser
from app.models import Subcategory
from app.place_views import load_reference
from app.schemas.common import CityOut, CityWithLocations, LocationOut, SubcategoryOut

router = APIRouter(tags=["geography"])


class Suggestion(BaseModel):
    location: LocationOut | None
    city: CityOut | None
    outside_coverage: bool
    # When outside coverage: the cities we do cover, for "We only cover these cities for now".
    covered_cities: list[CityOut]


@router.get("/subcategories", response_model=list[SubcategoryOut], operation_id="listSubcategories")
async def list_subcategories(db: DB) -> list[SubcategoryOut]:
    ref = await load_reference(db)
    return sorted(ref.subcategories.values(), key=lambda s: s.id)


class SubcategoryCreate(BaseModel):
    """A new subcategory from the add-place form (R13.13), e.g. "Curry" under food."""

    name: str = Field(min_length=2, max_length=40)
    top_category: Literal["food", "sights", "stays", "experiences"]

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = " ".join(v.split())
        if len(v) < 2:
            raise ValueError("Give the category a name.")
        return v[:1].upper() + v[1:]


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")
    return slug[:32]


@router.post(
    "/subcategories",
    response_model=SubcategoryOut,
    status_code=status.HTTP_201_CREATED,
    responses={200: {"model": SubcategoryOut, "description": "Already exists: returned as is"}},
    operation_id="createSubcategory",
)
async def create_subcategory(
    body: SubcategoryCreate, response: Response, db: DB, _: CurrentUser
) -> SubcategoryOut:
    """Signed-in only. A name that already exists (any case) returns that subcategory."""
    existing = (
        await db.execute(
            select(Subcategory).where(func.lower(Subcategory.name) == body.name.lower())
        )
    ).scalar_one_or_none()
    if existing is not None:
        response.status_code = status.HTTP_200_OK
        return SubcategoryOut.model_validate(existing)
    base = _slugify(body.name) or "category"
    slug, n = base, 1
    taken = set((await db.execute(select(Subcategory.slug))).scalars())
    while slug in taken:
        n += 1
        slug = f"{base}_{n}"
    sub = Subcategory(slug=slug, name=body.name, top_category=body.top_category)
    db.add(sub)
    await db.commit()
    return SubcategoryOut.model_validate(sub)


@router.get("/cities", response_model=list[CityWithLocations], operation_id="listCities")
async def list_cities(db: DB) -> list[CityWithLocations]:
    ref = await load_reference(db)
    out = []
    for city in sorted(ref.cities.values(), key=lambda c: c.id):
        locs = [loc for loc in ref.locations.values() if loc.city_id == city.id]
        locs.sort(key=lambda loc: (loc.is_catch_all, loc.name))
        out.append(CityWithLocations(**city.model_dump(), locations=locs))
    return out


@router.get(
    "/cities/{slug}/locations", response_model=list[LocationOut], operation_id="listCityLocations"
)
async def list_city_locations(slug: str, db: DB) -> list[LocationOut]:
    ref = await load_reference(db)
    city = next((c for c in ref.cities.values() if c.slug == slug), None)
    if city is None:
        raise HTTPException(404, "Unknown city.")
    locs = [loc for loc in ref.locations.values() if loc.city_id == city.id]
    return sorted(locs, key=lambda loc: (loc.is_catch_all, loc.name))


@router.get("/locations/suggest", response_model=Suggestion, operation_id="suggestLocation")
async def suggest_location(
    db: DB,
    lat: float = Query(ge=-90, le=90),
    lng: float = Query(ge=-180, le=180),
) -> Suggestion:
    result = await geography.suggest_location(db, lat, lng)
    ref = await load_reference(db)
    covered = sorted(ref.cities.values(), key=lambda c: c.id)
    if result.outside_coverage or result.location is None:
        return Suggestion(location=None, city=None, outside_coverage=True, covered_cities=covered)
    return Suggestion(
        location=ref.locations[result.location.id],
        city=ref.cities[result.location.city_id],
        outside_coverage=False,
        covered_cities=covered,
    )
