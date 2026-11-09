"""Flags (any signed-in user) and the admin moderation endpoints."""

from typing import Literal

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app import moderation
from app.deps import DB, AdminUser, CurrentUser
from app.schemas.common import Message, PlaceSummary
from app.schemas.moderation import (
    FlagCreated,
    FlagQueue,
    FlagStatusOut,
    MergeIn,
    NoteFlagIn,
    PlaceFlagIn,
    SeedItem,
    SeedReview,
    SeedReviewIn,
)

router = APIRouter(tags=["moderation"])

ERRORS: dict[int | str, dict] = {
    401: {"model": Message},
    403: {"model": Message},
    404: {"model": Message},
    409: {"model": Message},
}


# ---- Flags ----------------------------------------------------------------------------------


@router.post(
    "/places/{place_id}/flags",
    response_model=FlagCreated,
    status_code=201,
    responses=ERRORS,
    operation_id="flagPlace",
)
async def flag_place(place_id: int, body: PlaceFlagIn, db: DB, user: CurrentUser) -> FlagCreated:
    payload = (
        body.payload.model_dump(exclude_none=True) if isinstance(body.payload, BaseModel) else None
    )
    flag, action = await moderation.flag_place(db, user, place_id, body.flag_type, payload)
    await db.commit()
    return FlagCreated(
        id=flag.id,
        flag_type=flag.flag_type,
        status=flag.status,  # type: ignore[arg-type]
        auto_action=action,  # type: ignore[arg-type]
    )


@router.post(
    "/rankings/{ranking_id}/flags",
    response_model=FlagCreated,
    status_code=201,
    responses=ERRORS,
    operation_id="flagNote",
)
async def flag_note(ranking_id: int, body: NoteFlagIn, db: DB, user: CurrentUser) -> FlagCreated:
    flag = await moderation.flag_note(db, user, ranking_id, body.flag_type)
    await db.commit()
    return FlagCreated(
        id=flag.id,
        flag_type=flag.flag_type,
        status=flag.status,  # type: ignore[arg-type]
        auto_action=None,
    )


# ---- Admin queue ----------------------------------------------------------------------------


@router.get(
    "/admin/flags",
    response_model=FlagQueue,
    responses=ERRORS,
    operation_id="listAdminFlags",
)
async def list_flags(
    db: DB,
    _admin: AdminUser,
    status: Literal["open", "dismissed", "resolved", "all"] = Query("open"),
) -> FlagQueue:
    return await moderation.flag_queue(db, status)


@router.post(
    "/admin/flags/{flag_id}/apply",
    response_model=PlaceSummary,
    responses=ERRORS,
    operation_id="applyFlag",
)
async def apply_flag(flag_id: int, db: DB, _admin: AdminUser) -> PlaceSummary:
    out = await moderation.apply_flag(db, flag_id)
    await db.commit()
    return out


@router.post(
    "/admin/flags/{flag_id}/dismiss",
    response_model=FlagStatusOut,
    responses=ERRORS,
    operation_id="dismissFlag",
)
async def dismiss_flag(flag_id: int, db: DB, _admin: AdminUser) -> FlagStatusOut:
    flag = await moderation.dismiss_flag(db, flag_id)
    await db.commit()
    return FlagStatusOut(id=flag.id, status=flag.status)  # type: ignore[arg-type]


# ---- Admin place actions --------------------------------------------------------------------


@router.post(
    "/admin/places/{place_id}/hide",
    response_model=PlaceSummary,
    responses=ERRORS,
    operation_id="hidePlace",
)
async def hide_place(place_id: int, db: DB, _admin: AdminUser) -> PlaceSummary:
    out = await moderation.hide_place(db, place_id)
    await db.commit()
    return out


@router.post(
    "/admin/places/{place_id}/unhide",
    response_model=PlaceSummary,
    responses=ERRORS,
    operation_id="unhidePlace",
)
async def unhide_place(place_id: int, db: DB, _admin: AdminUser) -> PlaceSummary:
    out = await moderation.unhide_place(db, place_id)
    await db.commit()
    return out


@router.post(
    "/admin/places/{place_id}/close",
    response_model=PlaceSummary,
    responses=ERRORS,
    operation_id="closePlace",
)
async def close_place(place_id: int, db: DB, _admin: AdminUser) -> PlaceSummary:
    out = await moderation.close_place(db, place_id)
    await db.commit()
    return out


@router.post(
    "/admin/places/{place_id}/reopen",
    response_model=PlaceSummary,
    responses=ERRORS,
    operation_id="reopenPlace",
)
async def reopen_place(place_id: int, db: DB, _admin: AdminUser) -> PlaceSummary:
    out = await moderation.reopen_place(db, place_id)
    await db.commit()
    return out


@router.post(
    "/admin/places/{place_id}/merge",
    response_model=PlaceSummary,
    responses=ERRORS,
    operation_id="mergePlace",
)
async def merge_place(place_id: int, body: MergeIn, db: DB, _admin: AdminUser) -> PlaceSummary:
    out = await moderation.merge_places(db, place_id, body.into_place_id)
    await db.commit()
    return out


@router.post(
    "/admin/notes/{ranking_id}/remove",
    response_model=Message,
    responses=ERRORS,
    operation_id="removeNote",
)
async def remove_note(ranking_id: int, db: DB, _admin: AdminUser) -> Message:
    await moderation.remove_note(db, ranking_id)
    await db.commit()
    return Message(detail="Note removed.")


# ---- Seed review ----------------------------------------------------------------------------


@router.get(
    "/admin/seeds",
    response_model=SeedReview,
    responses=ERRORS,
    operation_id="listSeeds",
)
async def list_seeds(
    db: DB, _admin: AdminUser, city: str | None = Query(default=None)
) -> SeedReview:
    return await moderation.seed_review(db, city)


@router.put(
    "/admin/seeds/{place_id}",
    response_model=SeedItem,
    responses=ERRORS,
    operation_id="setSeedReviewed",
)
async def set_seed_reviewed(
    place_id: int, body: SeedReviewIn, db: DB, _admin: AdminUser
) -> SeedItem:
    out = await moderation.set_seed_reviewed(db, place_id, body.reviewed)
    await db.commit()
    return out
