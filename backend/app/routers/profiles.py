"""Public profiles (R8) and the privacy toggle."""

from fastapi import APIRouter, HTTPException
from sqlalchemy import text

from app import identity, place_views
from app.deps import DB, CurrentUser, OptionalUser
from app.schemas.common import UserOut
from app.schemas.profiles import ProfileItem, ProfileList, ProfileOut, UpdateMeRequest

router = APIRouter(tags=["profiles"])

BUCKET_ORDER = "CASE r.bucket WHEN 'liked' THEN 0 WHEN 'fine' THEN 1 ELSE 2 END"


@router.get("/users/{username}", response_model=ProfileOut, operation_id="getProfile")
async def get_profile(username: str, db: DB, viewer: OptionalUser) -> ProfileOut:
    user = await identity.find_user(db, username)
    is_self = viewer is not None and user is not None and viewer.id == user.id
    if user is None or user.is_system or (user.is_private and not is_self):
        raise HTTPException(404, "No such user.")

    rows = (
        await db.execute(
            text(
                f"""
                SELECT r.place_id, r.city_id, r.subcategory_id, r.bucket, r.position,
                       r.personal_score
                FROM rankings r JOIN places p ON p.id = r.place_id
                WHERE r.user_id = :u AND NOT p.is_hidden AND p.merged_into_id IS NULL
                ORDER BY r.city_id, r.subcategory_id, {BUCKET_ORDER}, r.position
                """
            ),
            {"u": user.id},
        )
    ).all()
    ref = await place_views.load_reference(db)
    summaries = await place_views.place_summaries(db, [r.place_id for r in rows], ref)

    grouped: dict[tuple[int, int], list[ProfileItem]] = {}
    for r in rows:
        summary = summaries.get(r.place_id)
        if summary is None:
            continue
        grouped.setdefault((r.city_id, r.subcategory_id), []).append(
            ProfileItem(
                place=summary,
                bucket=r.bucket,
                position=r.position,
                personal_score=round(r.personal_score, 2),
            )
        )
    lists = []
    for (city_id, sub_id), items in grouped.items():
        sub = ref.subcategories[sub_id]
        lists.append(
            ProfileList(
                city=ref.cities[city_id],
                subcategory=sub,
                top_category=sub.top_category,  # type: ignore[arg-type]
                items=items,
            )
        )
    lists.sort(key=lambda lst: (lst.city.name, lst.subcategory.name))
    return ProfileOut(
        username=user.username,
        created_at=user.created_at.isoformat(),
        is_self=is_self,
        lists=lists,
    )


@router.patch("/me", response_model=UserOut, operation_id="updateMe")
async def update_me(body: UpdateMeRequest, db: DB, user: CurrentUser) -> UserOut:
    user.is_private = body.is_private
    await db.flush()
    out = UserOut.model_validate(user)
    await db.commit()
    return out
