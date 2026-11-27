"""Building a shared list's places for the public page and the owner's editor."""

from collections import defaultdict

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.place_views import Reference, place_summaries
from app.schemas.voting import Tally, VoteItemOut


async def list_items(
    db: AsyncSession,
    list_id: int,
    ref: Reference,
    *,
    my_choices: dict[int, str] | None = None,
    with_names: bool = False,
) -> list[VoteItemOut]:
    """Places in order, each with live yes/maybe/no counts; voters' names only `with_names`
    (the owner)."""
    items = (
        await db.execute(
            text(
                "SELECT id, place_id, position, curator_count, evidence_updated FROM vote_items "
                "WHERE list_id = :l ORDER BY position, id"
            ),
            {"l": list_id},
        )
    ).all()
    summaries = await place_summaries(db, [i.place_id for i in items], ref)
    counts: dict[int, dict[str, int]] = defaultdict(lambda: {"yes": 0, "maybe": 0, "no": 0})
    names: dict[int, dict[str, list[str]]] = defaultdict(lambda: {"yes": [], "maybe": [], "no": []})
    for r in await db.execute(
        text(
            """
            SELECT v.item_id, v.choice, vr.name FROM votes v
            JOIN voters vr ON vr.id = v.voter_id
            WHERE vr.list_id = :l ORDER BY vr.name NULLS LAST, vr.id
            """
        ),
        {"l": list_id},
    ):
        counts[r.item_id][r.choice] += 1
        if with_names and r.name:
            names[r.item_id][r.choice].append(r.name)
    mine = my_choices or {}
    out = []
    for i in items:
        if i.place_id not in summaries:
            continue
        c, n = counts[i.id], names[i.id]
        out.append(
            VoteItemOut(
                item_id=i.id,
                position=i.position,
                place=summaries[i.place_id],
                curator_count=i.curator_count,
                evidence_updated=i.evidence_updated.isoformat() if i.evidence_updated else None,
                my_choice=mine.get(i.id),  # type: ignore[arg-type]
                tally=Tally(
                    yes=c["yes"],
                    maybe=c["maybe"],
                    no=c["no"],
                    yes_names=n["yes"],
                    maybe_names=n["maybe"],
                    no_names=n["no"],
                ),
            )
        )
    return out
