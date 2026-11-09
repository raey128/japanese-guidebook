"""Adding, checking and editing places; geocoding helpers for the add-place form.

Error shapes (all under /api):
* 401 not signed in, 403 not allowed to edit, 404 unknown/hidden place, 429 rate limited:
  `{"detail": "<human readable>"}`.
* 422 field problems: FastAPI's list form, `{"detail": [{"loc": ["body", "<field>"],
  "msg": "...", "type": "value_error"}]}`, so inline errors can key on `loc`.
* 422 outside coverage: `{"detail": "We only cover these cities for now",
  "covered_cities": [CityOut...]}` (a string `detail`, unlike the list form above).
"""

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy import select, text

from app import geocoding, place_edits
from app import places as svc
from app import ranking as ranking_core
from app.deps import DB, CurrentUser
from app.models import Place
from app.place_views import can_edit, load_reference, place_detail, place_summaries
from app.schemas.common import Message, MyRanking, PlaceDetail
from app.schemas.places import (
    AddressResult,
    AddressSearchResponse,
    DuplicateCheckResponse,
    OutsideCoverageError,
    PlaceCheckRequest,
    PlaceCreateRequest,
    PlaceCreateResponse,
    PlaceLookupResponse,
    PlaceLookupResult,
    PlaceUpdateRequest,
    ReverseGeocodeResponse,
)
from app.visibility import can_see

router = APIRouter(tags=["places"])

COVERAGE_MESSAGE = "We only cover these cities for now"


def _field_error(field: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={"detail": [{"loc": ["body", field], "msg": message, "type": "value_error"}]},
    )


async def _coverage_error(db: DB) -> JSONResponse:
    ref = await load_reference(db)
    cities = sorted(ref.cities.values(), key=lambda c: c.id)
    body = OutsideCoverageError(detail=COVERAGE_MESSAGE, covered_cities=cities)
    return JSONResponse(status_code=422, content=body.model_dump(mode="json"))


async def _rule_error_response(db: DB, e: svc.PlaceRuleError) -> JSONResponse:
    if isinstance(e, svc.FieldError):
        return _field_error(e.field, e.message)
    if isinstance(e, svc.OutsideCoverage):
        return await _coverage_error(db)
    raise e


async def _candidates(db: DB, ids: list[int]):  # type: ignore[no-untyped-def]
    summaries = await place_summaries(db, ids)
    return [summaries[i] for i in ids if i in summaries]


@router.post(
    "/places",
    response_model=PlaceCreateResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        200: {"model": PlaceCreateResponse, "description": "Possible duplicates; nothing created"},
        422: {"description": "Validation error, or outside coverage (see module docs)"},
        429: {"model": Message},
    },
    operation_id="createPlace",
)
async def create_place(body: PlaceCreateRequest, response: Response, db: DB, user: CurrentUser):  # type: ignore[no-untyped-def]
    try:
        await svc.check_subcategory(db, body.subcategory_id)
        location = await svc.check_pin_and_location(db, body.lat, body.lng, body.location_id)
        await svc.check_rate_limit(db, user)
    except svc.RateLimited as e:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, str(e)) from e
    except svc.PlaceRuleError as e:
        return await _rule_error_response(db, e)

    if not body.confirm_not_duplicate:
        ids = await svc.find_duplicates(
            db,
            name=body.name,
            name_ja=body.name_ja,
            lat=body.lat,
            lng=body.lng,
            subcategory_id=body.subcategory_id,
        )
        if ids:
            response.status_code = status.HTTP_200_OK
            return PlaceCreateResponse(status="duplicates", candidates=await _candidates(db, ids))

    address = (body.address or "").strip() or await geocoding.cached_address(db, body.lat, body.lng)
    place = await svc.create_place(
        db,
        user,
        name=body.name,
        name_ja=body.name_ja,
        lat=body.lat,
        lng=body.lng,
        subcategory_id=body.subcategory_id,
        location=location,
        address=address,
        pending=body.source == "manual",
    )
    extra: dict = {}
    if body.review is not None:
        # R3.6: the adder has been here, so rank it from their stars in the same transaction.
        review = body.review
        ranked = await ranking_core.rank_by_rating(
            db, user_id=user.id, place=place, rating=review.rating
        )
        await ranking_core.update_note(
            db,
            ranked,
            note=review.note,
            visit_month=review.visit_month,
            visit_year=review.visit_year,
        )
        snaps = await ranking_core.get_snapshot(db, user.id, place.city_id, place.subcategory_id)
        city_count = (
            await db.execute(
                text(
                    "SELECT count(*) FROM rankings r JOIN places p ON p.id = r.place_id "
                    "WHERE r.user_id = :u AND p.city_id = :c"
                ),
                {"u": user.id, "c": place.city_id},
            )
        ).scalar_one()
        ref = await load_reference(db)
        extra = {
            "ranking": MyRanking.model_validate(ranked),
            "compare_count": len(snaps[ranked.bucket].items) - 1,
            "city_name": ref.cities[place.city_id].name,
            "city_rank_count": city_count,
        }
    await db.commit()
    return PlaceCreateResponse(status="created", place=await place_detail(db, place, user), **extra)


@router.post(
    "/places/duplicates",
    response_model=DuplicateCheckResponse,
    operation_id="checkPlaceDuplicates",
)
async def check_duplicates(body: PlaceCheckRequest, db: DB, user: CurrentUser):  # type: ignore[no-untyped-def]
    ids = await svc.find_duplicates(
        db,
        name=body.name,
        name_ja=body.name_ja,
        lat=body.lat,
        lng=body.lng,
        subcategory_id=body.subcategory_id,
    )
    return DuplicateCheckResponse(candidates=await _candidates(db, ids))


@router.patch(
    "/places/{place_id}",
    response_model=PlaceDetail,
    responses={403: {"model": Message}, 404: {"model": Message}},
    operation_id="updatePlace",
)
async def update_place(  # type: ignore[no-untyped-def]
    place_id: int, body: PlaceUpdateRequest, db: DB, user: CurrentUser
):
    place = (
        await db.execute(
            select(Place).where(Place.id == place_id).execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if place is None or place.merged_into_id is not None:
        raise HTTPException(404, "Place not found.")
    if not can_see(place, user):
        raise HTTPException(404, "Place not found.")
    if not can_edit(user, place, now=await svc.db_now(db)):
        if place.creator_id == user.id:
            raise HTTPException(403, "The 24-hour edit window has closed.")
        raise HTTPException(403, "You can only edit places you added.")

    fields = body.model_fields_set
    if (body.lat is None) != (body.lng is None):
        return _field_error("lat", "Give both lat and lng.")
    if "name" in fields and (body.name is None or not body.name.strip()):
        return _field_error("name", "English name is required.")
    if "subcategory_id" in fields and body.subcategory_id is None:
        return _field_error("subcategory_id", "Subcategory is required.")
    if "location_id" in fields and body.location_id is None:
        return _field_error("location_id", "Location is required.")

    try:
        if body.subcategory_id is not None:
            await svc.check_subcategory(db, body.subcategory_id)
        if body.lat is not None or body.location_id is not None:
            if body.lat is not None and body.lng is not None:
                lat, lng = body.lat, body.lng
            else:
                pin = (
                    await db.execute(
                        text(
                            "SELECT ST_Y(geom) AS lat, ST_X(geom) AS lng FROM places WHERE id = :id"
                        ),
                        {"id": place.id},
                    )
                ).one()
                lat, lng = pin.lat, pin.lng
            await svc.check_pin_and_location(db, lat, lng, body.location_id or place.location_id)
    except svc.PlaceRuleError as e:
        return await _rule_error_response(db, e)

    try:
        await place_edits.apply_place_changes(
            db,
            place,
            name=body.name,
            name_ja=body.name_ja,
            clear_name_ja="name_ja" in fields and not (body.name_ja or "").strip(),
            lat=body.lat,
            lng=body.lng,
            subcategory_id=body.subcategory_id,
            location_id=body.location_id,
        )
    except place_edits.PlaceEditError as e:
        return _field_error("name", str(e))
    if "address" in fields:
        place.address = (body.address or "").strip() or None
    await db.commit()
    return await place_detail(db, place, user)


@router.get(
    "/places/lookup",
    response_model=PlaceLookupResponse,
    operation_id="lookupPlace",
)
async def lookup_place(
    db: DB,
    _: CurrentUser,
    q: Annotated[str, Query(min_length=2, max_length=200)],
    lat: Annotated[float | None, Query(ge=-90, le=90)] = None,
    lng: Annotated[float | None, Query(ge=-180, le=180)] = None,
) -> PlaceLookupResponse:
    """Signed-in only. Businesses matching a name, near (lat, lng) when given, for the add-place
    type-ahead (R13.11). Empty `results` when the lookup service is down or slow."""
    ref = await load_reference(db)
    slugs = {sub.slug: sub.id for sub in ref.subcategories.values()}
    results = await geocoding.lookup_places(q, lat, lng)
    return PlaceLookupResponse(
        results=[
            PlaceLookupResult(
                name=r.name,
                address=r.address,
                lat=r.lat,
                lng=r.lng,
                kind=r.kind,
                subcategory_id=slugs.get(r.slug) if r.slug else None,
            )
            for r in results
        ]
    )


@router.get(
    "/geocode/reverse",
    response_model=ReverseGeocodeResponse,
    operation_id="reverseGeocode",
)
async def reverse_geocode(
    db: DB,
    _: CurrentUser,
    lat: Annotated[float, Query(ge=-90, le=90)],
    lng: Annotated[float, Query(ge=-180, le=180)],
) -> ReverseGeocodeResponse:
    """Signed-in only (so anonymous traffic can't use up the shared 1 call/s budget).
    `address` is null on any failure or throttling; the form then just stays blank."""
    address = await geocoding.reverse_geocode(db, lat, lng)
    await db.commit()
    return ReverseGeocodeResponse(address=address)


@router.get(
    "/geocode/search",
    response_model=AddressSearchResponse,
    operation_id="searchAddress",
)
async def search_address(
    db: DB, _: CurrentUser, q: Annotated[str, Query(min_length=2, max_length=200)]
) -> AddressSearchResponse:
    """Signed-in only. Empty `results` on failure or throttling."""
    results = await geocoding.search_address(db, q)
    await db.commit()
    return AddressSearchResponse(results=[AddressResult(**r) for r in results])
