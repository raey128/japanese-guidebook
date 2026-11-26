"""Round 1 vote page API (V1). Public: the long random token in the link is the only key.
Every tap is saved straight away; nothing needs an account."""

from collections import defaultdict
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException
from sqlalchemy import text

from app import voting
from app.deps import DB
from app.place_views import load_reference, place_summaries
from app.schemas.common import Message
from app.schemas.voting import (
    MeOut,
    NameRequest,
    Progress,
    Tally,
    VoteItemOut,
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
async def get_vote_list(token: str, db: DB, voter: UUID | None = None) -> VoteListOut:
    """The vote page. `voter` is this browser's random id: its own choices come back. Once
    voting is closed every place also carries its tally (read-only results)."""
    try:
        lst = await voting.get_list(db, token)
    except voting.NotFound as e:
        raise _http(e) from e
    items = (
        await db.execute(
            text(
                "SELECT id, place_id, curator_count, evidence_updated FROM vote_items "
                "WHERE list_id = :l ORDER BY position, id"
            ),
            {"l": lst.id},
        )
    ).all()
    ref = await load_reference(db)
    summaries = await place_summaries(db, [i.place_id for i in items], ref)

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

    tallies: dict[int, Tally] = {}
    if not lst.is_open:
        counts: dict[int, dict[str, int]] = defaultdict(lambda: {"yes": 0, "maybe": 0, "no": 0})
        names: dict[int, dict[str, list[str]]] = defaultdict(
            lambda: {"yes": [], "maybe": [], "no": []}
        )
        for r in await db.execute(
            text(
                """
                SELECT v.item_id, v.choice, vr.name FROM votes v
                JOIN voters vr ON vr.id = v.voter_id
                WHERE vr.list_id = :l ORDER BY vr.name NULLS LAST, vr.id
                """
            ),
            {"l": lst.id},
        ):
            counts[r.item_id][r.choice] += 1
            if r.name:
                names[r.item_id][r.choice].append(r.name)
        for i in items:
            c, n = counts[i.id], names[i.id]
            tallies[i.id] = Tally(
                yes=c["yes"],
                maybe=c["maybe"],
                no=c["no"],
                yes_names=n["yes"],
                maybe_names=n["maybe"],
                no_names=n["no"],
            )

    return VoteListOut(
        title=lst.title,
        organizer_name=lst.organizer_name,
        city=ref.cities[lst.city_id],
        is_open=lst.is_open,
        group_size=lst.group_size,
        item_count=len(items),
        voter_count=await voting.voter_count(db, lst.id),
        items=[
            VoteItemOut(
                item_id=i.id,
                place=summaries[i.place_id],
                curator_count=i.curator_count,
                evidence_updated=i.evidence_updated.isoformat() if i.evidence_updated else None,
                my_choice=mine.get(i.id),  # type: ignore[arg-type]
                tally=tallies.get(i.id),
            )
            for i in items
            if i.place_id in summaries
        ],
        me=me,
    )


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
