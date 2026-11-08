# Root task runner. Backend commands run with uv locally by default; set DOCKER=1 to run them
# inside the compose `api` container instead (e.g. `make seed-places DOCKER=1`).
.PHONY: help up down migrate seed-locations seed-places make-admin dump test test-backend \
        test-frontend e2e lint lint-backend lint-frontend typecheck gen-client synthetic perf

ifeq ($(DOCKER),1)
BACKEND := docker compose exec -T api
else
BACKEND := cd backend && uv run
endif
FRONTEND := cd frontend && pnpm

help:
	@grep -E '^[a-z-]+:' Makefile | cut -d: -f1 | sort | uniq

up:
	docker compose up --build -d

down:
	docker compose down

migrate:
	$(BACKEND) alembic upgrade head

seed-locations:
	$(BACKEND) python -m app.cli seed-locations

seed-places:
	$(BACKEND) python -m app.cli seed-places

make-admin:
	@test -n "$(USERNAME)" || (echo "usage: make make-admin USERNAME=<name>" && exit 1)
	$(BACKEND) python -m app.cli make-admin $(USERNAME)

dump:
	$(BACKEND) python -m app.cli dump

test: test-backend test-frontend

test-backend:
	$(BACKEND) pytest --cov=app --cov-report=term-missing

test-frontend:
	$(FRONTEND) test

e2e:
	$(FRONTEND) e2e

lint: lint-backend lint-frontend

lint-backend:
	$(BACKEND) ruff check .
	$(BACKEND) ruff format --check .

lint-frontend:
	$(FRONTEND) lint
	$(FRONTEND) typecheck

typecheck:
	$(BACKEND) mypy app
	$(FRONTEND) typecheck

# Regenerate the frontend's TypeScript API client from the backend's OpenAPI schema.
gen-client:
	cd backend && uv run python -c "import json; from app.main import app; print(json.dumps(app.openapi()))" > ../frontend/openapi.json
	$(FRONTEND) gen:api

# Performance tooling (ticket 12); not part of the per-PR suite.
synthetic:
	$(BACKEND) python -m app.cli synthetic --count 50000

perf:
	k6 run perf/k6.js
