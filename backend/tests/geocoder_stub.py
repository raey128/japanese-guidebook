"""A stub Nominatim-style reverse geocoder: a real HTTP server on a random local port."""

import json
import threading
import time
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import parse_qs, urlparse


@dataclass
class StubCall:
    path: str
    params: dict[str, str]
    headers: dict[str, str]
    at: float


@dataclass
class GeocoderStub:
    """Default reply: 200 with a `display_name`. Change `status`, `body` or `delay_s` per test."""

    status: int = 200
    body: dict[str, Any] = field(
        default_factory=lambda: {"display_name": "1-2-3 Asakusa, Taito, Tokyo, Japan"}
    )
    delay_s: float = 0.0
    calls: list[StubCall] = field(default_factory=list)

    def __enter__(self) -> "GeocoderStub":
        stub = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self) -> None:  # noqa: N802
                parsed = urlparse(self.path)
                stub.calls.append(
                    StubCall(
                        path=parsed.path,
                        params={k: v[0] for k, v in parse_qs(parsed.query).items()},
                        headers={k.lower(): v for k, v in self.headers.items()},
                        at=time.monotonic(),
                    )
                )
                if stub.delay_s:
                    time.sleep(stub.delay_s)
                payload = json.dumps(stub.body).encode()
                self.send_response(stub.status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)

            def log_message(self, *args: Any) -> None:
                pass

        self._server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()
        return self

    def __exit__(self, *exc: Any) -> None:
        self._server.shutdown()
        self._server.server_close()

    @property
    def url(self) -> str:
        host, port = self._server.server_address[:2]
        return f"http://{host}:{port}/reverse"
