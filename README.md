# Japanese Guidebook

Community rankings of places to eat, see and stay in Japan. Travellers put each place they
visited in a bucket (Liked / Fine / Disliked) and answer a few "Which was better?" questions;
personal Lists combine into fair Bayesian public scores, ranked lists, a map and search. All
content is open data (CC BY-SA 4.0). See [`SPEC.md`](SPEC.md) and [`REQUIREMENTS.md`](REQUIREMENTS.md).

> **MVP: local only.** Sign-in is username-only with no password (R1). Don't deploy publicly
> until real authentication (S13) ships.

## Layout

| Path | What |
|------|------|
| `backend/` | FastAPI app (uv): SQLAlchemy 2.0 async + GeoAlchemy2 + Alembic, pytest suite |
| `frontend/` | React + Vite SPA (pnpm): React Router v7, TanStack Query, Tailwind, MapLibre, Playwright |
| `data/` | Curated subcategories, cities, locations and seed places (CSV) |
| `infra/` | DB init script and the cron container's crontab |
| `perf/` | k6 load test (ticket 12) |
| `.github/workflows/ci.yml` | lint, pytest, Vitest and Playwright on every PR |

## Quick start (Docker)

```sh
docker compose up --build        # db (PostGIS), api :8000, web :5173, cron
make seed-locations DOCKER=1     # subcategories, cities, locations
make seed-places DOCKER=1        # 225 seed places owned by the `guidebook` system user
open http://localhost:5173
```

The API runs `alembic upgrade head` on start. The database is created UTF-8 with the
`en_US.UTF-8` locale so `pg_trgm` works on Japanese names; a `guidebook_test` database is
created alongside it for the test suite.

## Local development (without the app containers)

Requires [uv](https://docs.astral.sh/uv/), Node 22 + pnpm, and the compose `db` service:

```sh
docker compose up -d db
cd backend && uv sync && uv run alembic upgrade head && cd ..
make seed-locations seed-places
cd backend && uv run uvicorn app.main:app --reload    # API on :8000
cd frontend && pnpm install && pnpm dev               # SPA on :5173 (proxies /api)
```

## Make targets

Backend targets run through `uv` locally; add `DOCKER=1` to run them in the `api` container.

| Target | Does |
|--------|------|
| `make up` / `make down` | Start / stop the compose stack |
| `make migrate` | Apply Alembic migrations |
| `make seed-locations` | Upsert subcategories, cities and locations from `data/` (by slug; any bad row fails the run) |
| `make seed-places` | Load `data/seed_places.csv` (idempotent by name + 50 m; unknown subcategory/location fails the run) |
| `make make-admin USERNAME=…` | Grant the admin flag |
| `make dump` | Write the open-data dump to `dumps/YYYY-MM-DD/` (same entrypoint as the weekly cron job) |
| `make test` | pytest (with coverage) + Vitest |
| `make e2e` | Playwright (needs the API on :8000; starts Vite if not running) |
| `make lint` / `make typecheck` | ruff, ESLint, mypy, tsc |
| `make gen-client` | Regenerate `frontend/src/api/schema.ts` from the API's OpenAPI schema |
| `make synthetic` / `make perf` | Load 50,000 synthetic places / run the k6 load test |

## Tests

* **Backend** (`backend/tests`): pytest against a real PostGIS (`TEST_DATABASE_URL`, default
  `postgresql+asyncpg://guidebook:guidebook@localhost:5432/guidebook_test`). The schema is
  rebuilt once per run, and every test runs in a transaction rolled back afterwards. The reverse
  geocoder is replaced by a local stub HTTP server; tests never call public Nominatim.
* **Frontend**: Vitest unit tests (`pnpm test`) and Playwright e2e (`pnpm e2e`) on Chromium,
  Firefox and WebKit (iPhone).

## Configuration

Backend settings are environment variables prefixed `GUIDEBOOK_` (see
`backend/app/config.py`), e.g. `GUIDEBOOK_DATABASE_URL`, `GUIDEBOOK_GEOCODER_URL`,
`GUIDEBOOK_COVERAGE_RADIUS_KM`, `GUIDEBOOK_PRIOR_WEIGHT`, `GUIDEBOOK_CLUSTER_MAX_ZOOM`.
Frontend: `VITE_TILE_STYLE_URL` (map style, default OpenFreeMap) and `VITE_API_PROXY`.

## Licence & attribution

User content is CC BY-SA 4.0. Map tiles and addresses © OpenStreetMap contributors (ODbL).
