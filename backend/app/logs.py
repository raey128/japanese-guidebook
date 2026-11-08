"""JSON logging and per-request access logs (N5.5).

Every request logs one JSON line with request_id, method, route, status and latency_ms.
Unhandled errors log with a stack trace. No user-identifying data is logged.
"""

import json
import logging
import sys
import time
import traceback
import uuid
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("guidebook")
_RESERVED = set(vars(logging.makeLogRecord({})))


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": datetime.fromtimestamp(record.created, UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        for key, value in vars(record).items():
            if key not in _RESERVED and key not in payload:
                payload[key] = value
        if record.exc_info:
            payload["stack_trace"] = "".join(traceback.format_exception(*record.exc_info))
        return json.dumps(payload, default=str, ensure_ascii=False)


def configure_logging(level: str = "INFO") -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)
    # Uvicorn's own access log is replaced by RequestLogMiddleware.
    logging.getLogger("uvicorn.access").disabled = True


def _route_template(request: Request) -> str:
    route = request.scope.get("route")
    return getattr(route, "path", None) or request.url.path


class RequestLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
        request.state.request_id = request_id
        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            logger.exception(
                "request failed",
                extra={
                    "request_id": request_id,
                    "method": request.method,
                    "route": _route_template(request),
                    "status": 500,
                    "latency_ms": round((time.perf_counter() - start) * 1000, 2),
                },
            )
            response = Response(
                content=json.dumps({"detail": "Internal server error", "request_id": request_id}),
                status_code=500,
                media_type="application/json",
            )
        else:
            logger.info(
                "request",
                extra={
                    "request_id": request_id,
                    "method": request.method,
                    "route": _route_template(request),
                    "status": response.status_code,
                    "latency_ms": round((time.perf_counter() - start) * 1000, 2),
                },
            )
        response.headers["x-request-id"] = request_id
        return response
