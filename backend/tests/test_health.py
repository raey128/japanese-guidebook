import json
import logging

import pytest


async def test_health_reports_ok(client):
    r = await client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "database": "ok"}
    assert r.headers["x-request-id"]


async def test_request_id_is_echoed(client):
    r = await client.get("/api/health", headers={"x-request-id": "abc123"})
    assert r.headers["x-request-id"] == "abc123"


async def test_requests_are_logged_as_json(client, caplog):
    from app.logs import JsonFormatter

    with caplog.at_level(logging.INFO, logger="guidebook"):
        await client.get("/api/health", headers={"x-request-id": "req-1"})
    record = next(r for r in caplog.records if getattr(r, "request_id", None) == "req-1")
    line = json.loads(JsonFormatter().format(record))
    assert line["route"] == "/api/health"
    assert line["status"] == 200
    assert line["method"] == "GET"
    assert isinstance(line["latency_ms"], float)


def test_error_logs_include_stack_trace():
    from app.logs import JsonFormatter

    try:
        raise RuntimeError("boom")
    except RuntimeError:
        record = logging.getLogger("guidebook").makeRecord(
            "guidebook", logging.ERROR, __file__, 1, "request failed", (), exc_info=True
        )
        import sys

        record.exc_info = sys.exc_info()
    line = json.loads(JsonFormatter().format(record))
    assert "RuntimeError: boom" in line["stack_trace"]


@pytest.mark.parametrize("path", ["/openapi.json"])
async def test_openapi_schema_is_served(client, path):
    r = await client.get(path)
    assert r.status_code == 200
    assert "/api/health" in r.json()["paths"]
