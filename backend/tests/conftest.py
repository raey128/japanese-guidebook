"""Test harness.

* Tests run against a real PostGIS (TEST_DATABASE_URL, default: the compose `guidebook_test` DB).
  The schema is rebuilt once per run with Alembic and the curated geography is loaded once.
* Every test runs inside one outer transaction that is rolled back afterwards; app code that
  calls `commit()` only releases a SAVEPOINT.
* The only fake is the reverse geocoder: `geocoder_stub` is a real HTTP server whose URL is
  written into the `geocoder_url` setting. The public Nominatim API is never called.
"""

import asyncio
import os
import subprocess
import sys
from collections.abc import AsyncIterator, Callable, Iterator
from pathlib import Path

import pytest

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+asyncpg://guidebook:guidebook@localhost:5432/guidebook_test"
)
os.environ["GUIDEBOOK_DATABASE_URL"] = TEST_DATABASE_URL
os.environ.setdefault("GUIDEBOOK_LOG_LEVEL", "WARNING")
# Never reach the public geocoder, even if a test forgets the stub.
os.environ["GUIDEBOOK_GEOCODER_URL"] = "http://127.0.0.1:9/unreachable"
os.environ["GUIDEBOOK_GEOCODER_SEARCH_URL"] = "http://127.0.0.1:9/unreachable"
os.environ["GUIDEBOOK_PLACE_LOOKUP_URL"] = "http://127.0.0.1:9/unreachable"

import httpx  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine  # noqa: E402

from app import geocoding  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.db import get_session  # noqa: E402
from app.main import app  # noqa: E402
from tests.geocoder_stub import GeocoderStub  # noqa: E402

BACKEND_DIR = Path(__file__).resolve().parents[1]


def _migrate() -> None:
    async def reset() -> None:
        engine = create_async_engine(TEST_DATABASE_URL)
        async with engine.begin() as conn:
            await conn.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
            await conn.execute(text("CREATE SCHEMA public"))
        await engine.dispose()

    asyncio.run(reset())
    subprocess.run(
        [sys.executable, "-m", "alembic", "-x", f"url={TEST_DATABASE_URL}", "upgrade", "head"],
        cwd=BACKEND_DIR,
        check=True,
    )


@pytest.fixture(scope="session")
def _schema() -> None:
    _migrate()


@pytest.fixture(scope="session")
async def engine(_schema: None) -> AsyncIterator:
    from app.seeding import seed_locations

    eng = create_async_engine(TEST_DATABASE_URL)
    # Curated geography is shared, committed reference data for every test.
    async with AsyncSession(eng) as session:
        await seed_locations(session)
        await session.commit()
    yield eng
    await eng.dispose()


@pytest.fixture
async def db(engine) -> AsyncIterator[AsyncSession]:  # type: ignore[no-untyped-def]
    async with engine.connect() as conn:
        outer = await conn.begin()
        session = AsyncSession(
            bind=conn, join_transaction_mode="create_savepoint", expire_on_commit=False
        )
        try:
            yield session
        finally:
            await session.close()
            await outer.rollback()


@pytest.fixture
async def client_factory(db: AsyncSession) -> AsyncIterator[Callable[[], httpx.AsyncClient]]:
    """Make independent API clients (each with its own cookie jar) sharing the test DB."""

    async def override() -> AsyncIterator[AsyncSession]:
        yield db

    app.dependency_overrides[get_session] = override
    clients: list[httpx.AsyncClient] = []

    def make() -> httpx.AsyncClient:
        c = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test", follow_redirects=False
        )
        clients.append(c)
        return c

    yield make
    for c in clients:
        await c.aclose()
    app.dependency_overrides.pop(get_session, None)


@pytest.fixture
def client(client_factory: Callable[[], httpx.AsyncClient]) -> httpx.AsyncClient:
    return client_factory()


@pytest.fixture
def geocoder_stub() -> Iterator[GeocoderStub]:
    settings = get_settings()
    previous = settings.geocoder_url, settings.geocoder_search_url, settings.place_lookup_url
    geocoding._lookup_cache.clear()
    geocoding._area_cache.clear()
    with GeocoderStub() as stub:
        settings.geocoder_url = stub.url
        settings.geocoder_search_url = stub.url.replace("/reverse", "/search")
        settings.place_lookup_url = stub.url.replace("/reverse", "/lookup")
        try:
            yield stub
        finally:
            (
                settings.geocoder_url,
                settings.geocoder_search_url,
                settings.place_lookup_url,
            ) = previous
            geocoding._lookup_cache.clear()
