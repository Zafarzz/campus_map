"""Liveness, readiness and metrics.

The distinction matters for deployment: ``/healthz`` says "the process is up",
``/readyz`` says "it can actually serve traffic". A load balancer that uses
liveness for routing will send requests to an instance whose database is gone.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Response, status

from app import __version__
from app.core.config import Settings, get_settings
from app.core.db import Database, get_database
from app.core.metrics import DB_UP, render_latest
from app.core.time import now

router = APIRouter(tags=["health"])


def _db() -> Database:
    return get_database()


@router.get(
    "/healthz",
    summary="Liveness probe",
    description="Returns 200 whenever the process is running. Does not touch the database.",
)
async def healthz(settings: Annotated[Settings, Depends(get_settings)]) -> dict[str, Any]:
    return {
        "status": "ok",
        "version": __version__,
        "environment": settings.app_env.value,
        "time": now().isoformat(),
    }


@router.get(
    "/readyz",
    summary="Readiness probe",
    description=(
        "Returns 200 only when PostgreSQL is reachable. Returns 503 otherwise, so an "
        "instance that cannot serve data is taken out of rotation instead of returning errors."
    ),
    responses={503: {"description": "A dependency is unavailable."}},
)
async def readyz(
    response: Response,
    database: Annotated[Database, Depends(_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, Any]:
    db_ok = await database.ping()
    DB_UP.set(1 if db_ok else 0)

    checks: dict[str, Any] = {"database": "ok" if db_ok else "unavailable"}
    if db_ok:
        checks["database_version"] = await database.server_version()

    if not db_ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return {
        "status": "ready" if db_ok else "not_ready",
        "version": __version__,
        "environment": settings.app_env.value,
        "campus_timezone": settings.campus_tz,
        "checks": checks,
        "time": now().isoformat(),
    }


@router.get(
    "/metrics",
    summary="Prometheus metrics",
    include_in_schema=False,
)
async def metrics() -> Response:
    payload, content_type = render_latest()
    return Response(content=payload, media_type=content_type)
