"""Review photos (R20): upload to your own review, list a place's photos, delete, report;
an admin queue for reported photos."""

from typing import Annotated

from fastapi import APIRouter, File, HTTPException, Query, Response, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from sqlalchemy import select, text

from app import media
from app import photos as photo_views
from app.config import get_settings
from app.deps import DB, AdminUser, CurrentUser, OptionalUser
from app.models import Photo, Place, Ranking
from app.schemas.common import Message
from app.schemas.photos import AdminPhoto, PhotoOut, PlacePhotos, ReportResult
from app.visibility import can_see

router = APIRouter(tags=["photos"])


@router.get("/media/{path:path}", include_in_schema=False)
async def serve_media(path: str) -> FileResponse:
    """Uploaded photos and avatars (already cleaned and resized, R20.3). Names are random and
    never reused, so they're cached for a year. In production a web server or CDN can serve
    the folder directly instead."""
    root = get_settings().media_dir.resolve()
    target = (root / path).resolve()
    if not target.is_relative_to(root) or target.suffix != ".jpg" or not target.is_file():
        raise HTTPException(404, "Not found.")
    return FileResponse(
        target,
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


@router.post(
    "/rankings/{ranking_id}/photos",
    response_model=list[PhotoOut],
    status_code=201,
    responses={403: {"model": Message}, 404: {"model": Message}, 422: {"model": Message}},
    operation_id="uploadReviewPhotos",
)
async def upload_photos(
    ranking_id: int,
    db: DB,
    user: CurrentUser,
    files: Annotated[list[UploadFile], File(description="1-4 photos")],
) -> list[PhotoOut]:
    """Add photos to your own review. At most `photos_per_review` in total; every file is
    cleaned (location and camera data removed) and resized before it's kept."""
    ranking = await db.get(Ranking, ranking_id)
    if ranking is None:
        raise HTTPException(404, "Review not found.")
    if ranking.user_id != user.id:
        raise HTTPException(403, "You can only add photos to your own review.")
    s = get_settings()
    have = (
        await db.execute(
            text("SELECT count(*) FROM photos WHERE ranking_id = :r"), {"r": ranking_id}
        )
    ).scalar_one()
    if not files:
        raise HTTPException(422, "Choose a photo to add.")
    if have + len(files) > s.photos_per_review:
        raise HTTPException(422, f"A review can have up to {s.photos_per_review} photos.")

    saved: list[media.Saved] = []
    try:
        for f in files:
            data = await f.read(s.photo_max_bytes + 1)
            saved.append(await run_in_threadpool(media.save, data, "photos"))
    except media.PhotoError as e:
        for x in saved:
            media.delete(x.key)
        raise HTTPException(422, str(e)) from e

    rows = []
    for x in saved:
        p = Photo(ranking_id=ranking_id, user_id=user.id, key=x.key, width=x.width, height=x.height)
        db.add(p)
        rows.append(p)
    await db.commit()
    by_ranking = await photo_views.photos_for_rankings(db, [ranking_id], user.id)
    new_ids = {p.id for p in rows}
    return [ph for ph in by_ranking[ranking_id] if ph.id in new_ids]


@router.get(
    "/places/{place_id}/photos",
    response_model=PlacePhotos,
    responses={404: {"model": Message}},
    operation_id="getPlacePhotos",
)
async def place_photos(
    place_id: int, db: DB, viewer: OptionalUser, limit: int = Query(30, ge=1, le=60)
) -> PlacePhotos:
    """Everyone's photos of a place, newest first (the photo strip on the place card)."""
    place = await db.get(Place, place_id)
    if place is None or not can_see(place, viewer):
        raise HTTPException(404, "Place not found.")
    photos = await photo_views.photos_for_place(
        db, place.merged_into_id or place.id, viewer.id if viewer else None, limit
    )
    return PlacePhotos(photos=photos)


@router.delete(
    "/photos/{photo_id}",
    status_code=204,
    responses={403: {"model": Message}, 404: {"model": Message}},
    operation_id="deletePhoto",
)
async def delete_photo(photo_id: int, db: DB, user: CurrentUser) -> Response:
    photo = await db.get(Photo, photo_id)
    if photo is None:
        raise HTTPException(404, "Photo not found.")
    if photo.user_id != user.id and not user.is_admin:
        raise HTTPException(403, "You can only delete your own photos.")
    key = photo.key
    await db.delete(photo)
    await db.commit()
    media.delete(key)
    return Response(status_code=204)


@router.post(
    "/photos/{photo_id}/report",
    response_model=ReportResult,
    responses={404: {"model": Message}, 422: {"model": Message}},
    operation_id="reportPhoto",
)
async def report_photo(photo_id: int, db: DB, user: CurrentUser) -> ReportResult:
    """Flag a photo (R20.6). Once `photo_reports_to_hide` different people have, it's hidden
    until an admin looks at it. Reporting twice counts once."""
    photo = await db.get(Photo, photo_id)
    if photo is None:
        raise HTTPException(404, "Photo not found.")
    if photo.user_id == user.id:
        raise HTTPException(422, "You can't report your own photo.")
    added = (
        await db.execute(
            text(
                "INSERT INTO photo_reports (photo_id, user_id) VALUES (:p, :u) "
                "ON CONFLICT DO NOTHING RETURNING photo_id"
            ),
            {"p": photo_id, "u": user.id},
        )
    ).first()
    if added is not None:
        photo.report_count += 1
        if photo.report_count >= get_settings().photo_reports_to_hide:
            photo.is_hidden = True
    hidden = photo.is_hidden
    await db.commit()
    return ReportResult(hidden=hidden)


# ---- Admin -------------------------------------------------------------------------------


@router.get("/admin/photos", response_model=list[AdminPhoto], operation_id="listReportedPhotos")
async def reported_photos(db: DB, admin: AdminUser) -> list[AdminPhoto]:
    """Photos that were reported or hidden, most reported first."""
    rows = (
        await db.execute(
            text(
                """
                SELECT ph.id, ph.ranking_id, ph.key, ph.width, ph.height, ph.created_at,
                       ph.user_id, ph.report_count, ph.is_hidden, u.username,
                       p.id AS place_id, p.name AS place_name
                FROM photos ph
                JOIN users u ON u.id = ph.user_id
                JOIN rankings r ON r.id = ph.ranking_id
                JOIN places p ON p.id = r.place_id
                WHERE ph.report_count > 0 OR ph.is_hidden
                ORDER BY ph.report_count DESC, ph.created_at DESC
                LIMIT 200
                """
            )
        )
    ).all()
    return [
        AdminPhoto(
            **photo_views.photo_out(r, admin.id).model_dump(),
            place_id=r.place_id,
            place_name=r.place_name,
            report_count=r.report_count,
            is_hidden=r.is_hidden,
        )
        for r in rows
    ]


@router.post(
    "/admin/photos/{photo_id}/{action}",
    response_model=Message,
    responses={404: {"model": Message}},
    operation_id="moderatePhoto",
)
async def moderate_photo(photo_id: int, action: str, db: DB, _: AdminUser) -> Message:
    """`hide` keeps it out of sight; `keep` shows it again and clears its reports."""
    if action not in ("hide", "keep"):
        raise HTTPException(404, "Unknown action.")
    photo = (await db.execute(select(Photo).where(Photo.id == photo_id))).scalar_one_or_none()
    if photo is None:
        raise HTTPException(404, "Photo not found.")
    if action == "hide":
        photo.is_hidden = True
    else:
        photo.is_hidden = False
        photo.report_count = 0
        await db.execute(text("DELETE FROM photo_reports WHERE photo_id = :p"), {"p": photo_id})
    await db.commit()
    return Message(detail="Hidden." if action == "hide" else "Shown again.")


async def delete_ranking_photo_files(db, ranking_id: int) -> list[str]:  # type: ignore[no-untyped-def]
    """Keys of a ranking's photos, read before the ranking is deleted (rows cascade; files
    must be removed by the caller after commit)."""
    rows = await db.execute(select(Photo.key).where(Photo.ranking_id == ranking_id))
    return [k for (k,) in rows]
