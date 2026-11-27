"""FastAPI app. All routes live under /api; the OpenAPI schema feeds the generated TS client."""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import get_settings
from app.logs import RequestLogMiddleware, configure_logging
from app.routers import (
    auth,
    bookmarks,
    discover,
    events,
    geography,
    health,
    lists,
    map,
    moderation,
    my_lists,
    photos,
    place_detail,
    places,
    profiles,
    rankings,
    review,
    search,
    voting,
)

ROUTERS = [
    health,
    auth,
    geography,
    # `places` (POST /places, /places/duplicates, ...) before `place_detail` (/places/{id}).
    places,
    place_detail,
    rankings,
    lists,
    search,
    map,
    bookmarks,
    profiles,
    moderation,
    discover,
    review,
    events,
    voting,
    photos,
    my_lists,
]


@asynccontextmanager
async def lifespan(_: FastAPI):  # type: ignore[no-untyped-def]
    yield
    from app.db import get_engine

    await get_engine().dispose()


def create_app() -> FastAPI:
    configure_logging(get_settings().log_level)
    app = FastAPI(title="Japanese Guidebook API", version="0.1.0", lifespan=lifespan)
    app.add_middleware(RequestLogMiddleware)
    for module in ROUTERS:
        app.include_router(module.router, prefix="/api")
    # The share link itself (/share/l/<token>): a preview for chat apps, then the app.
    app.include_router(my_lists.share_router)
    return app


app = create_app()
