"""Curated reference data and location suggestion."""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app import geography
from app.deps import DB
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
