# 01: Walking skeleton

**What to build:** A developer clones the repo, runs one command, and gets the whole stack running: frontend, API, Postgres/PostGIS and an (idle) cron container. The home page shows the API's health status fetched through the TypeScript client generated from the API's OpenAPI schema. Every later ticket lands on top of this green baseline: the test harness, CI and logging are all in place. Stack per SPEC.md "Architecture & stack" (uv + FastAPI + SQLAlchemy 2.0 async + GeoAlchemy2 + Alembic; pnpm + React + Vite + React Router v7 SPA + TanStack Query + Tailwind).

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `docker compose up` from a clean clone starts frontend, API, PostGIS (UTF-8, non-C locale, `postgis` and `pg_trgm` extensions enabled) and a cron container (supercronic, no jobs yet)
- [ ] Root Makefile has working `test` and `lint` targets (placeholders allowed for later targets)
- [ ] Alembic is set up with an initial migration; the API runs migrations on start (or via a Make target documented in the README)
- [ ] The frontend home page shows the API health result via the generated TS client; regenerating the client is one command
- [ ] The API logs JSON per request with request ID, route, status and latency; errors include stack traces (N5.5)
- [ ] pytest harness: tests run against a real PostGIS, each wrapped in a transaction rolled back afterwards; a stub reverse-geocoder HTTP server fixture exists, and the geocoder URL is a config value
- [ ] A Playwright smoke test loads the home page and sees the health status
- [ ] GitHub Actions runs lint, pytest, Vitest and Playwright on every PR (PostGIS as a service container)
- [ ] README covers setup and the Make targets
