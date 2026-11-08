"""Place detail page data (GET only; creation/editing lives in routers/places.py)."""

from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse

from app.deps import DB, OptionalUser
from app.models import Place
from app.place_views import place_detail
from app.schemas.common import PlaceDetail
from app.visibility import can_see

router = APIRouter(tags=["places"])


@router.get(
    "/places/{place_id}",
    response_model=PlaceDetail,
    responses={308: {"description": "Merged: redirects to the surviving place"}},
    operation_id="getPlace",
)
async def get_place(place_id: int, db: DB, viewer: OptionalUser):  # type: ignore[no-untyped-def]
    place = await db.get(Place, place_id)
    if place is None:
        raise HTTPException(404, "Place not found.")
    if place.merged_into_id is not None:
        return RedirectResponse(f"/api/places/{place.merged_into_id}", status_code=308)
    if not can_see(place, viewer):
        raise HTTPException(404, "Place not found.")
    return await place_detail(db, place, viewer)
