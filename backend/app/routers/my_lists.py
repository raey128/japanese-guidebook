"""Shared lists, owner side (decided 2026-11-27): make a list, add many places at once, remove
many, reorder, turn voting on or off, share. Plus the link preview chat apps read."""

import html
from typing import Any

from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import HTMLResponse
from sqlalchemy import text

from app import voting
from app.config import get_settings
from app.deps import DB, CurrentUser
from app.list_views import list_items
from app.place_views import load_reference, place_summaries
from app.schemas.common import Message
from app.schemas.voting import (
    AddItemsRequest,
    AddItemsResult,
    CreateListRequest,
    ItemIdsRequest,
    MyListDetail,
    MyListSummary,
    UpdateListRequest,
)

router = APIRouter(tags=["lists"])
# Served without the /api prefix: the share link itself (/share/l/<token>).
share_router = APIRouter(tags=["lists"])

ERRORS: dict[int | str, dict[str, Any]] = {404: {"model": Message}, 422: {"model": Message}}
MAX_ITEMS = 100
LIST_COLS = (
    "l.id, l.token, l.title, l.city_id, l.is_open, l.is_public, l.updated_at, o.username AS owner"
)


def share_url(token: str) -> str:
    return f"{get_settings().site_url.rstrip('/')}/share/l/{token}"


async def _own(db, list_id: int, user) -> Any:  # type: ignore[no-untyped-def]
    row = (
        await db.execute(
            text(
                f"SELECT {LIST_COLS} FROM vote_lists l JOIN users o ON o.id = l.owner_id "
                "WHERE l.id = :i AND l.owner_id = :u"
            ),
            {"i": list_id, "u": user.id},
        )
    ).first()
    if row is None:
        raise HTTPException(404, "List not found.")
    return row


async def _touch(db, list_id: int) -> None:  # type: ignore[no-untyped-def]
    await db.execute(text("UPDATE vote_lists SET updated_at = now() WHERE id = :i"), {"i": list_id})


async def _summaries(db, rows, ref) -> list[MyListSummary]:  # type: ignore[no-untyped-def]
    ids = [r.id for r in rows]
    if not ids:
        return []
    stats = {
        r.list_id: r
        for r in await db.execute(
            text(
                """
                SELECT l.id AS list_id,
                       (SELECT count(*) FROM vote_items i WHERE i.list_id = l.id) AS places,
                       (SELECT count(*) FROM voters vr WHERE vr.list_id = l.id
                          AND EXISTS (SELECT 1 FROM votes v WHERE v.voter_id = vr.id)) AS voters,
                       (SELECT i.place_id FROM vote_items i WHERE i.list_id = l.id
                          ORDER BY i.position, i.id LIMIT 1) AS cover
                FROM vote_lists l WHERE l.id = ANY(:ids)
                """
            ),
            {"ids": ids},
        )
    }
    covers = await place_summaries(db, [s.cover for s in stats.values() if s.cover], ref)
    return [
        MyListSummary(
            id=r.id,
            token=r.token,
            title=r.title,
            city=ref.cities[r.city_id],
            is_open=r.is_open,
            is_public=r.is_public,
            owner=r.owner,
            place_count=stats[r.id].places,
            voter_count=stats[r.id].voters,
            updated_at=r.updated_at.isoformat(),
            share_url=share_url(r.token),
            cover=covers.get(stats[r.id].cover) if stats[r.id].cover else None,
        )
        for r in rows
    ]


async def _detail(db, list_id: int, user) -> MyListDetail:  # type: ignore[no-untyped-def]
    row = await _own(db, list_id, user)
    ref = await load_reference(db)
    (summary,) = await _summaries(db, [row], ref)
    items = await list_items(db, row.id, ref, with_names=True)
    return MyListDetail(**summary.model_dump(), items=items)


@router.get("/me/lists", response_model=list[MyListSummary], operation_id="listMyLists")
async def my_lists(db: DB, user: CurrentUser) -> list[MyListSummary]:
    rows = (
        await db.execute(
            text(
                f"SELECT {LIST_COLS} FROM vote_lists l JOIN users o ON o.id = l.owner_id "
                "WHERE l.owner_id = :u ORDER BY l.updated_at DESC, l.id DESC"
            ),
            {"u": user.id},
        )
    ).all()
    return await _summaries(db, rows, await load_reference(db))


@router.post(
    "/me/lists",
    response_model=MyListDetail,
    status_code=201,
    responses=ERRORS,
    operation_id="createList",
)
async def create_list(body: CreateListRequest, db: DB, user: CurrentUser) -> MyListDetail:
    """A new list for one city. With `prefill`, it starts with the places you loved there
    (rated 8 or more), best first."""
    ref = await load_reference(db)
    city = next((c for c in ref.cities.values() if c.slug == body.city_slug), None)
    if city is None:
        raise HTTPException(422, "Unknown city.")
    picks: list[tuple[int, int | None, str | None]] = []
    if body.prefill:
        picks = [
            (r.place_id, None, None)
            for r in await db.execute(
                text(
                    """
                    SELECT r.place_id FROM rankings r JOIN places p ON p.id = r.place_id
                    WHERE r.user_id = :u AND p.city_id = :c AND r.rating >= 8
                      AND NOT p.is_hidden AND p.merged_into_id IS NULL
                    ORDER BY r.personal_score DESC, r.id LIMIT :n
                    """
                ),
                {"u": user.id, "c": city.id, "n": MAX_ITEMS},
            )
        ]
    await voting.create_list(
        db,
        title=body.title,
        organizer_name=user.username,
        city_id=city.id,
        items=picks,
        group_size=None,
        owner_id=user.id,
    )
    list_id = (
        await db.execute(text("SELECT max(id) FROM vote_lists WHERE owner_id = :u"), {"u": user.id})
    ).scalar_one()
    await db.commit()
    return await _detail(db, list_id, user)


@router.get("/community-lists", response_model=list[MyListSummary], operation_id="communityLists")
async def community_lists(db: DB, city: str | None = None, limit: int = 30) -> list[MyListSummary]:
    """Lists other people made and chose to show (decided 2026-11-27), newest first; only ones
    with at least one place, from accounts that aren't private or banned."""
    rows = (
        await db.execute(
            text(
                f"""
                SELECT {LIST_COLS} FROM vote_lists l
                JOIN users o ON o.id = l.owner_id
                JOIN cities c ON c.id = l.city_id
                WHERE l.is_public AND NOT o.is_private
                  AND (CAST(:city AS text) IS NULL OR c.slug = :city)
                  AND EXISTS (SELECT 1 FROM vote_items i WHERE i.list_id = l.id)
                ORDER BY l.updated_at DESC, l.id DESC LIMIT :n
                """
            ),
            {"city": city, "n": max(1, min(limit, 60))},
        )
    ).all()
    return await _summaries(db, rows, await load_reference(db))


@router.get(
    "/me/lists/{list_id}", response_model=MyListDetail, responses=ERRORS, operation_id="getMyList"
)
async def get_my_list(list_id: int, db: DB, user: CurrentUser) -> MyListDetail:
    return await _detail(db, list_id, user)


@router.patch(
    "/me/lists/{list_id}", response_model=MyListDetail, responses=ERRORS, operation_id="updateList"
)
async def update_list(
    list_id: int, body: UpdateListRequest, db: DB, user: CurrentUser
) -> MyListDetail:
    """Rename, or turn "Let friends vote" on or off (nothing is lost either way)."""
    await _own(db, list_id, user)
    if body.title is not None:
        title = " ".join(body.title.split())
        if not title:
            raise HTTPException(422, "Give the list a name.")
        await db.execute(
            text("UPDATE vote_lists SET title = :t WHERE id = :i"), {"t": title, "i": list_id}
        )
    if body.is_public is not None:
        await db.execute(
            text("UPDATE vote_lists SET is_public = :o WHERE id = :i"),
            {"o": body.is_public, "i": list_id},
        )
    if body.is_open is not None:
        await db.execute(
            text("UPDATE vote_lists SET is_open = :o WHERE id = :i"),
            {"o": body.is_open, "i": list_id},
        )
    await _touch(db, list_id)
    await db.commit()
    return await _detail(db, list_id, user)


@router.post(
    "/me/lists/{list_id}/items",
    response_model=AddItemsResult,
    responses=ERRORS,
    operation_id="addListItems",
)
async def add_items(
    list_id: int, body: AddItemsRequest, db: DB, user: CurrentUser
) -> AddItemsResult:
    """Add many places at once, at the end, in the order given. A list is one city: places
    elsewhere are skipped, and so are ones already on it."""
    lst = await _own(db, list_id, user)
    existing = {
        r.place_id
        for r in await db.execute(
            text("SELECT place_id FROM vote_items WHERE list_id = :l"), {"l": list_id}
        )
    }
    places = {
        r.id: r.city_id
        for r in await db.execute(
            text(
                "SELECT id, city_id FROM places WHERE id = ANY(:ids) "
                "AND NOT is_hidden AND merged_into_id IS NULL"
            ),
            {"ids": body.place_ids},
        )
    }
    pos = (
        await db.execute(
            text("SELECT COALESCE(max(position), 0) FROM vote_items WHERE list_id = :l"),
            {"l": list_id},
        )
    ).scalar_one()
    added = already = other = 0
    for pid in dict.fromkeys(body.place_ids):
        if pid in existing:
            already += 1
            continue
        if places.get(pid) != lst.city_id:
            other += 1
            continue
        if len(existing) >= MAX_ITEMS:
            raise HTTPException(422, f"A list can have up to {MAX_ITEMS} places.")
        pos += 1
        await db.execute(
            text("INSERT INTO vote_items (list_id, place_id, position) VALUES (:l, :p, :pos)"),
            {"l": list_id, "p": pid, "pos": pos},
        )
        existing.add(pid)
        added += 1
    await _touch(db, list_id)
    await db.commit()
    return AddItemsResult(added=added, already=already, other_city=other)


@router.post(
    "/me/lists/{list_id}/items/remove",
    response_model=MyListDetail,
    responses=ERRORS,
    operation_id="removeListItems",
)
async def remove_items(
    list_id: int, body: ItemIdsRequest, db: DB, user: CurrentUser
) -> MyListDetail:
    """Remove many places at once (their votes go with them)."""
    await _own(db, list_id, user)
    await db.execute(
        text("DELETE FROM vote_items WHERE list_id = :l AND id = ANY(:ids)"),
        {"l": list_id, "ids": body.item_ids},
    )
    await _renumber(db, list_id, None)
    await _touch(db, list_id)
    await db.commit()
    return await _detail(db, list_id, user)


async def _renumber(db, list_id: int, order: list[int] | None) -> None:  # type: ignore[no-untyped-def]
    current = [
        r.id
        for r in await db.execute(
            text("SELECT id FROM vote_items WHERE list_id = :l ORDER BY position, id"),
            {"l": list_id},
        )
    ]
    if order is not None:
        if sorted(order) != sorted(current):
            raise HTTPException(422, "Send every place on the list, in the new order.")
        current = order
    for pos, item_id in enumerate(current, start=1):
        await db.execute(
            text("UPDATE vote_items SET position = :p WHERE id = :i"), {"p": pos, "i": item_id}
        )


@router.put(
    "/me/lists/{list_id}/order",
    response_model=MyListDetail,
    responses=ERRORS,
    operation_id="reorderList",
)
async def reorder(list_id: int, body: ItemIdsRequest, db: DB, user: CurrentUser) -> MyListDetail:
    """The whole list in its new order (after dragging, or Move up / Move down)."""
    await _own(db, list_id, user)
    await _renumber(db, list_id, body.item_ids)
    await _touch(db, list_id)
    await db.commit()
    return await _detail(db, list_id, user)


@router.delete("/me/lists/{list_id}", status_code=204, responses=ERRORS, operation_id="deleteList")
async def delete_list(list_id: int, db: DB, user: CurrentUser) -> Response:
    await _own(db, list_id, user)
    await db.execute(text("DELETE FROM vote_lists WHERE id = :i"), {"i": list_id})
    await db.commit()
    return Response(status_code=204)


# ---- The link people share -------------------------------------------------------------------


@share_router.get("/share/l/{token}", response_class=HTMLResponse, include_in_schema=False)
async def share_page(token: str, db: DB) -> HTMLResponse:
    """What chat apps read for the link preview (title, who made it, how many places, a
    picture), then a redirect into the app's list page for people."""
    try:
        lst = await voting.get_list(db, token)
    except voting.NotFound:
        return HTMLResponse("<!doctype html><title>Link not found</title>", status_code=404)
    ref = await load_reference(db)
    items = await list_items(db, lst.id, ref)
    city = ref.cities[lst.city_id].name
    n = len(items)
    title = html.escape(lst.title)
    desc = html.escape(
        f"{n} {'place' if n == 1 else 'places'} in {city}, picked by {lst.organizer_name}."
        + (" Tap yes, maybe or no." if lst.is_open else "")
    )
    image = next((i.place.image.url for i in items if i.place.image), None)
    site = get_settings().site_url.rstrip("/")
    if image and image.startswith("/"):
        image = site + image
    app_url = f"/l/{html.escape(token)}"
    img_tag = f'<meta property="og:image" content="{html.escape(image)}">' if image else ""
    page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta property="og:type" content="website">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{html.escape(share_url(token))}">
{img_tag}
<meta name="twitter:card" content="{"summary_large_image" if image else "summary"}">
<meta http-equiv="refresh" content="0; url={app_url}">
</head><body><p><a href="{app_url}">{title}</a></p>
<script>location.replace({app_url!r});</script></body></html>"""
    return HTMLResponse(page, headers={"Cache-Control": "no-cache"})
