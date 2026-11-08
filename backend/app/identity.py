"""Identity: username rules, create-or-resume, sessions, resolving the current user.

Real auth (S13) will plug in later as another way to call `create_session`.
"""

import hashlib
import re
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import Session, User

USERNAME_RE = re.compile(r"^[a-z0-9_]{3,20}$")
RESERVED_USERNAMES = frozenset(
    {
        "guidebook",
        "admin",
        "administrator",
        "root",
        "system",
        "moderator",
        "mod",
        "support",
        "staff",
        "api",
        "anonymous",
        "null",
        "undefined",
        "me",
        "settings",
        "help",
    }
)


class UsernameError(ValueError):
    """A username that can't be used; the message is shown inline to the user."""


def normalize_username(raw: str) -> str:
    return raw.strip().lower()


def validate_username(username: str) -> None:
    if not 3 <= len(username) <= 20:
        raise UsernameError("Usernames must be 3–20 characters long.")
    if not USERNAME_RE.match(username):
        raise UsernameError("Use only lowercase letters, digits and underscores.")
    if username in RESERVED_USERNAMES:
        raise UsernameError("That username is reserved. Please pick another.")


async def find_user(db: AsyncSession, username: str) -> User | None:
    result = await db.execute(select(User).where(func.lower(User.username) == username.lower()))
    return result.scalar_one_or_none()


async def create_user(db: AsyncSession, username: str) -> User:
    validate_username(username)
    if await find_user(db, username) is not None:
        raise UsernameError("That username is taken.")
    user = User(username=username)
    db.add(user)
    await db.flush()
    return user


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def create_session(db: AsyncSession, user: User) -> tuple[str, datetime]:
    """Returns (raw cookie token, expiry). Only the token's hash is stored."""
    if user.is_system:
        raise UsernameError("That username is reserved. Please pick another.")
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(UTC) + timedelta(days=get_settings().session_days)
    db.add(Session(token_hash=_hash_token(token), user_id=user.id, expires_at=expires_at))
    await db.flush()
    return token, expires_at


async def delete_session(db: AsyncSession, token: str) -> None:
    await db.execute(delete(Session).where(Session.token_hash == _hash_token(token)))


async def resolve_user(db: AsyncSession, token: str | None) -> User | None:
    if not token:
        return None
    result = await db.execute(
        select(User)
        .join(Session, Session.user_id == User.id)
        .where(
            Session.token_hash == _hash_token(token),
            Session.expires_at > func.now(),
            User.is_system.is_(False),
        )
    )
    return result.scalar_one_or_none()


async def set_admin(db: AsyncSession, username: str, is_admin: bool = True) -> User:
    user = await find_user(db, normalize_username(username))
    if user is None or user.is_system:
        raise LookupError(f"No user named {username!r}")
    user.is_admin = is_admin
    await db.flush()
    return user
