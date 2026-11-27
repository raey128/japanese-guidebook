"""Round 1 vote page API (V1). Public: the long random token in the link is the only key.
Every tap is saved straight away; nothing needs an account."""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException
from sqlalchemy import text

from app import voting
from app.deps import DB, CurrentUser, OptionalUser
from app.list_views import list_items
from app.place_views import load_reference
from app.schemas.common import Message
from app.schemas.voting import (
    MeOut,
    NameRequest,
    Progress,
    SaveAllResult,
    VoteListOut,
    VoteRequest,
    VoterRequest,
    VoteSaved,
)

router = APIRouter(tags=["voting"])

ERRORS: dict[int | str, dict[str, Any]] = {
    404: {"model": Message},
    409: {"model": Message},
    429: {"model": Message},
}


def _http(e: Exception) -> HTTPException:
    if isinstance(e, voting.NotFound):
        return HTTPException(404, str(e))
    if isinstance(e, voting.Closed):
        return HTTPException(409, str(e))
    if isinstance(e, voting.RateLimited):
        return HTTPException(429, str(e))
    raise e


@router.get("/v/{token}", response_model=VoteListOut, responses=ERRORS, operation_id="getVoteList")
async def get_vote_list(
    token: str, db: DB, viewer: OptionalUser, voter: UUID | None = None
) -> VoteListOut:
    """The list page. `voter` is this browser's random id: its own choices come back. Every
    place carries live yes/maybe/no counts; voters' names only for the list's owner."""
    try:
        lst = await voting.get_list(db, token)
    except voting.NotFound as e:
        raise _http(e) from e
    ref = await load_reference(db)
    is_owner = viewer is not None and lst.owner_id == viewer.id

    me: MeOut | None = None
    mine: dict[int, str] = {}
    vid = await voting.voter_id(db, lst, voter, create=False) if voter else None
    if vid is not None:
        row = (
            await db.execute(text("SELECT name, done_at FROM voters WHERE id = :v"), {"v": vid})
        ).one()
        mine = {
            r.item_id: r.choice
            for r in await db.execute(
                text("SELECT item_id, choice FROM votes WHERE voter_id = :v"), {"v": vid}
            )
        }
        me = MeOut(name=row.name, done=row.done_at is not None, voted_count=len(mine))

    items = await list_items(db, lst.id, ref, my_choices=mine, with_names=is_owner)
    return VoteListOut(
        title=lst.title,
        organizer_name=lst.organizer_name,
        is_owner=is_owner,
        city=ref.cities[lst.city_id],
        is_open=lst.is_open,
        group_size=lst.group_size,
        item_count=len(items),
        voter_count=await voting.voter_count(db, lst.id),
        items=items,
        me=me,
    )


@router.post(
    "/v/{token}/save",
    response_model=SaveAllResult,
    responses=ERRORS,
    operation_id="saveListPlaces",
)
async def save_list_places(token: str, db: DB, user: CurrentUser) -> SaveAllResult:
    """ "Save these places" (decided 2026-11-27): every place on the list that you haven't
    rated or saved goes on your Want to go."""
    try:
        lst = await voting.get_list(db, token)
    except voting.NotFound as e:
        raise _http(e) from e
    rows = (
        await db.execute(
            text(
                """
                INSERT INTO bookmarks (user_id, place_id)
                SELECT :u, i.place_id FROM vote_items i
                JOIN places p ON p.id = i.place_id
                WHERE i.list_id = :l AND NOT p.is_hidden AND p.merged_into_id IS NULL
                  AND NOT EXISTS (SELECT 1 FROM rankings r
                                  WHERE r.user_id = :u AND r.place_id = i.place_id)
                ON CONFLICT DO NOTHING
                RETURNING place_id
                """
            ),
            {"u": user.id, "l": lst.id},
        )
    ).all()
    total = (
        await db.execute(text("SELECT count(*) FROM vote_items WHERE list_id = :l"), {"l": lst.id})
    ).scalar_one()
    await db.commit()
    return SaveAllResult(saved=len(rows), already=total - len(rows))


@router.put("/v/{token}/vote", response_model=VoteSaved, responses=ERRORS, operation_id="castVote")
async def cast_vote(token: str, body: VoteRequest, db: DB) -> VoteSaved:
    """One tap: yes, maybe or no for one place. Tapping again changes it (last tap wins)."""
    try:
        count = await voting.save_vote(db, token, body.voter, body.item_id, body.choice)
    except (voting.NotFound, voting.Closed, voting.RateLimited) as e:
        raise _http(e) from e
    await db.commit()
    return VoteSaved(choice=body.choice, voted_count=count)


@router.put(
    "/v/{token}/name", response_model=Message, responses=ERRORS, operation_id="setVoterName"
)
async def set_voter_name(token: str, body: NameRequest, db: DB) -> Message:
    """Optional name, "so Maya knows it's you". Empty clears it."""
    try:
        await voting.set_name(db, token, body.voter, body.name)
    except (voting.NotFound, voting.Closed, voting.RateLimited) as e:
        raise _http(e) from e
    await db.commit()
    return Message(detail="Saved.")


@router.post("/v/{token}/done", response_model=Progress, responses=ERRORS, operation_id="voterDone")
async def voter_done(token: str, body: VoterRequest, db: DB) -> Progress:
    """The voter tapped Done. Returns progress for "Thanks. 3 of 4 have voted." """
    try:
        await voting.mark_done(db, token, body.voter)
        lst = await voting.get_list(db, token)
    except voting.NotFound as e:
        raise _http(e) from e
    await db.commit()
    return Progress(voter_count=await voting.voter_count(db, lst.id), group_size=lst.group_size)
