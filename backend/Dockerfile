# Build context: repository root (needs data/ for seeding).
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 UV_LINK_MODE=copy UV_PROJECT_ENVIRONMENT=/opt/venv PATH="/opt/venv/bin:$PATH"
COPY --from=ghcr.io/astral-sh/uv:0.5 /uv /usr/local/bin/uv

# supercronic runs the scheduled dump in the cron container.
ARG SUPERCRONIC_VERSION=v0.2.33
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && ARCH="$(dpkg --print-architecture)" \
    && curl -fsSL -o /usr/local/bin/supercronic \
       "https://github.com/aptible/supercronic/releases/download/${SUPERCRONIC_VERSION}/supercronic-linux-${ARCH}" \
    && chmod +x /usr/local/bin/supercronic \
    && apt-get purge -y curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend
COPY backend/pyproject.toml backend/uv.lock* ./
RUN uv sync --no-install-project --all-groups
COPY backend/ ./
RUN uv sync --all-groups
COPY data/ /app/data/

EXPOSE 8000
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
