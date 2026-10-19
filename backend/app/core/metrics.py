"""Prometheus metrics.

Exposed at ``/metrics``. Request latency is labelled by route *template*
(``/api/v1/buildings/{building_id}``), never by the concrete path, so a campus
with 1,000 rooms does not produce 1,000 label values.
"""

from __future__ import annotations

import time
from typing import Any

from prometheus_client import (
    CONTENT_TYPE_LATEST,
    CollectorRegistry,
    Counter,
    Gauge,
    Histogram,
    generate_latest,
)
from starlette.types import ASGIApp, Message, Receive, Scope, Send

#: Private registry rather than the global default, so tests can build a fresh
#: app without "duplicate metric" errors.
REGISTRY = CollectorRegistry()

REQUESTS = Counter(
    "campus_http_requests_total",
    "HTTP requests handled.",
    labelnames=("method", "route", "status"),
    registry=REGISTRY,
)

LATENCY = Histogram(
    "campus_http_request_duration_seconds",
    "HTTP request latency.",
    labelnames=("method", "route"),
    # Tuned for the brief's target: a full-building state query under 100 ms.
    buckets=(0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0),
    registry=REGISTRY,
)

BUILD_INFO = Gauge(
    "campus_build_info",
    "Build and environment information.",
    labelnames=("version", "environment"),
    registry=REGISTRY,
)

DB_UP = Gauge(
    "campus_database_up",
    "1 when the last readiness probe reached PostgreSQL, 0 otherwise.",
    registry=REGISTRY,
)

SEEDED_ROOMS = Gauge(
    "campus_seeded_rooms",
    "Rooms currently present in the database, split by demo flag.",
    labelnames=("is_demo",),
    registry=REGISTRY,
)


def render_latest() -> tuple[bytes, str]:
    return generate_latest(REGISTRY), CONTENT_TYPE_LATEST


class MetricsMiddleware:
    """Record count and latency per request.

    Raw ASGI so that the route template is read from ``scope`` after routing,
    and so WebSocket connections pass through untouched.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        method = scope.get("method", "GET")
        started = time.perf_counter()
        status_holder: dict[str, Any] = {"code": 500}

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                status_holder["code"] = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            route = _route_template(scope)
            elapsed = time.perf_counter() - started
            LATENCY.labels(method=method, route=route).observe(elapsed)
            REQUESTS.labels(method=method, route=route, status=str(status_holder["code"])).inc()

    @staticmethod
    def _unused() -> None:  # pragma: no cover - keeps linters from folding the class
        return None


def _route_template(scope: Scope) -> str:
    """Low-cardinality label for the matched route."""
    route = scope.get("route")
    path_format = getattr(route, "path_format", None) or getattr(route, "path", None)
    if isinstance(path_format, str):
        return path_format
    # Unmatched request: bucket all of them together rather than echoing the
    # caller-controlled path, which would let anyone inflate the metric space.
    return "<unmatched>"
