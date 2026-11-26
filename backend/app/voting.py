"""Round 1 group vote links (V1): a list of places shared by one link; anyone with the link
votes yes / maybe / no, no account. Voters are a random id kept in their browser plus an
optional name; another device is another voter.
"""

import secrets
import time
from collections import defaultdict, deque
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings

TOKEN_BYTES = 24  # 32 URL-safe characters


def new_token() -> str:
    return secrets.token_urlsafe(TOKEN_BYTES)


@dataclass(frozen=True)
class VoteList:
    id: int
    token: str
    title: str
    organizer_name: str
    city_id: int
    group_size: int | None
    is_open: bool


class NotFound(LookupError):
    pass


class Closed(Exception):
    pass


class RateLimited(Exception):
    pass


async def get_list(db: AsyncSession, token: str) -> VoteList:
    row = (
        await db.execute(
            text(
                "SELECT id, token, title, organizer_name, city_id, group_size, is_open "
                "FROM vote_lists WHERE token = :t"
            ),
            {"t": token},
        )
    ).first()
    if row is None:
        raise NotFound("This link doesn't work. Ask the organizer for a new one.")
    return VoteList(**row._mapping)


async def voter_id(db: AsyncSession, lst: VoteList, key: UUID, *, create: bool) -> int | None:
    if create:
        return (
            await db.execute(
                text(
                    """
                    INSERT INTO voters (list_id, voter_key) VALUES (:l, :k)
                    ON CONFLICT (list_id, voter_key) DO UPDATE SET voter_key = EXCLUDED.voter_key
                    RETURNING id
                    """
                ),
                {"l": lst.id, "k": key},
            )
        ).scalar_one()
    return (
        await db.execute(
            text("SELECT id FROM voters WHERE list_id = :l AND voter_key = :k"),
            {"l": lst.id, "k": key},
        )
    ).scalar_one_or_none()


# ---- Rate limit (V1.4): sliding one-minute windows, per link and per voter, in-process. ----

_windows: dict[tuple[str, str], deque[float]] = defaultdict(deque)


def check_rate(token: str, key: UUID) -> None:
    s = get_settings()
    now = time.monotonic()
    for bucket, limit in (
        (("list", token), s.vote_writes_per_list_per_minute),
        (("voter", f"{token}:{key}"), s.vote_writes_per_voter_per_minute),
    ):
        w = _windows[bucket]
        while w and now - w[0] > 60:
            w.popleft()
        if len(w) >= limit:
            raise RateLimited("Lots of taps at once. Wait a moment and try again.")
    for bucket in (("list", token), ("voter", f"{token}:{key}")):
        _windows[bucket].append(now)


def reset_rate_limits() -> None:  # tests
    _windows.clear()


async def save_vote(db: AsyncSession, token: str, key: UUID, item_id: int, choice: str) -> int:
    """Record one tap (last tap wins). Returns how many places this voter has voted on."""
    lst = await get_list(db, token)
    if not lst.is_open:
        raise Closed("Voting has closed.")
    found = (
        await db.execute(
            text("SELECT 1 FROM vote_items WHERE id = :i AND list_id = :l"),
            {"i": item_id, "l": lst.id},
        )
    ).first()
    if found is None:
        raise NotFound("That place isn't on this list.")
    check_rate(token, key)
    vid = await voter_id(db, lst, key, create=True)
    await db.execute(
        text(
            """
            INSERT INTO votes (voter_id, item_id, choice) VALUES (:v, :i, :c)
            ON CONFLICT (voter_id, item_id)
            DO UPDATE SET choice = EXCLUDED.choice, updated_at = now()
            """
        ),
        {"v": vid, "i": item_id, "c": choice},
    )
    return (
        await db.execute(text("SELECT count(*) FROM votes WHERE voter_id = :v"), {"v": vid})
    ).scalar_one()


async def set_name(db: AsyncSession, token: str, key: UUID, name: str | None) -> None:
    lst = await get_list(db, token)
    if not lst.is_open:
        raise Closed("Voting has closed.")
    check_rate(token, key)
    vid = await voter_id(db, lst, key, create=True)
    await db.execute(text("UPDATE voters SET name = :n WHERE id = :v"), {"n": name, "v": vid})


async def mark_done(db: AsyncSession, token: str, key: UUID) -> None:
    lst = await get_list(db, token)
    vid = await voter_id(db, lst, key, create=True)
    await db.execute(
        text("UPDATE voters SET done_at = COALESCE(done_at, now()) WHERE id = :v"), {"v": vid}
    )


async def voter_count(db: AsyncSession, list_id: int) -> int:
    """People who have voted on at least one place."""
    return (
        await db.execute(
            text(
                "SELECT count(*) FROM voters vr WHERE vr.list_id = :l "
                "AND EXISTS (SELECT 1 FROM votes v WHERE v.voter_id = vr.id)"
            ),
            {"l": list_id},
        )
    ).scalar_one()


async def create_list(
    db: AsyncSession,
    *,
    title: str,
    organizer_name: str,
    city_id: int,
    items: Sequence[tuple[int, int | None, str | None]],  # (place_id, curators, ISO date)
    group_size: int | None = 4,
    token: str | None = None,
) -> tuple[str, str]:
    """Insert a list and its places in order. Returns (vote token, edit token)."""
    token = token or new_token()
    edit = new_token()
    list_id = (
        await db.execute(
            text(
                """
                INSERT INTO vote_lists (token, edit_token, title, organizer_name, city_id,
                                        group_size)
                VALUES (:t, :e, :title, :o, :c, :g) RETURNING id
                """
            ),
            {
                "t": token,
                "e": edit,
                "title": title,
                "o": organizer_name,
                "c": city_id,
                "g": group_size,
            },
        )
    ).scalar_one()
    for pos, (place_id, curators, updated) in enumerate(items, start=1):
        await db.execute(
            text(
                """
                INSERT INTO vote_items (list_id, place_id, position, curator_count,
                                        evidence_updated)
                VALUES (:l, :p, :pos, :cc, :d)
                """
            ),
            {
                "l": list_id,
                "p": place_id,
                "pos": pos,
                "cc": curators,
                "d": date.fromisoformat(updated) if updated else None,
            },
        )
    return token, edit
