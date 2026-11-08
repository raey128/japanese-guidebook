"""Shared FastAPI dependencies: DB session, current user, auth guards."""

from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app import identity
from app.config import Settings, get_settings
from app.db import get_session
from app.models import User

DB = Annotated[AsyncSession, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


async def current_user_optional(request: Request, db: DB) -> User | None:
    token = request.cookies.get(get_settings().session_cookie_name)
    return await identity.resolve_user(db, token)


async def current_user(user: Annotated[User | None, Depends(current_user_optional)]) -> User:
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in to do that.")
    return user


async def admin_user(user: Annotated[User, Depends(current_user)]) -> User:
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admins only.")
    return user


OptionalUser = Annotated[User | None, Depends(current_user_optional)]
CurrentUser = Annotated[User, Depends(current_user)]
AdminUser = Annotated[User, Depends(admin_user)]
