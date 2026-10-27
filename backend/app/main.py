"""FastAPI application factory.

A modular monolith (brief section 6.1): one deployable app, a package per bounded
context. Middleware order below is deliberate and reads outermost-first:

1. ``RequestContextMiddleware`` - assigns the request ID, so everything inside
   it (including errors) can log and return that ID.
2. ``MetricsMiddleware`` - times the request after routing, so the metric label
   is the route template rather than the concrete path.
3. ``CORSMiddleware`` - innermost, so a rejected pre-flight still gets an ID and
   is still counted.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api.v1.health import router as health_router
from app.api.v1.router import api_router
from app.api.v1.stream import ws_router
from app.core.config import AppEnv, Settings, get_settings
from app.core.db import dispose_database, get_database
from app.core.errors import register_exception_handlers
from app.core.i18n import SUPPORTED_LOCALES
from app.core.logging import RequestContextMiddleware, configure_logging, get_logger
from app.core.metrics import BUILD_INFO, DB_UP, MetricsMiddleware
from app.jobs.scheduler import JobScheduler, get_scheduler, reset_scheduler
from app.realtime.broker import reset_broker
from app.realtime.hub import get_hub, reset_hub

log = get_logger(__name__)

DESCRIPTION = """
Backend for the **Ajou University in Tashkent** 3D campus map.

Every computed value carries its **provenance** (`scheduled`, `confirmed`, `reported`,
`estimated`, `forecast`) and a **confidence**. There are no sensors on this campus and
none are planned, so the system never claims to *measure* occupancy - it combines the
timetable, human confirmations, crowd reports and history, and says which it used.
An estimate is never presented as a measurement.

### Two API families

* **`/api/v1/...`** - the clean API. snake_case, evolves freely.
* **`/api/v1/compat/...`** - the compatibility layer. Returns the 3D front end's exact
  TypeScript shapes so the map can switch from its static demo data to this database
  with a one-function change per seam. These shapes are a contract: fields are never
  renamed and optional fields are omitted rather than sent as `null`.

Data marked `is_demo` is generated placeholder data and is never mixed with real data
in reports.
"""


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings: Settings = app.state.settings
    database = get_database()

    BUILD_INFO.labels(version=__version__, environment=settings.app_env.value).set(1)

    reachable = await database.ping()
    DB_UP.set(1 if reachable else 0)
    if reachable:
        log.info(
            "startup",
            version=__version__,
            environment=settings.app_env.value,
            campus_tz=settings.campus_tz,
            schema=settings.database_schema,
            postgres=await database.server_version(),
            locales=list(SUPPORTED_LOCALES),
        )
    else:
        # Starting anyway is the right call: /readyz reports 503 and the
        # orchestrator keeps the instance out of rotation until the database is
        # back. Exiting would turn a transient database blip into a crash loop.
        log.warning(
            "startup_without_database",
            hint="PostgreSQL is unreachable; /readyz will return 503 until it is back.",
        )

    # Real-time delivery and the job runner are started only when the database
    # is reachable: both of them query it on their first pass, and starting a
    # scheduler that can only fail would fill the log with noise while /readyz
    # already reports the real problem.
    hub = get_hub()
    scheduler: JobScheduler | None = None
    if reachable and settings.app_env is not AppEnv.test:
        await hub.start()
        scheduler = get_scheduler(settings)
        await scheduler.start()
    elif settings.app_env is AppEnv.test:
        # Tests drive the jobs directly. A live scheduler would race the
        # per-test truncation and make failures depend on timing.
        log.info("jobs_disabled_in_tests")

    try:
        yield
    finally:
        if scheduler is not None:
            await reset_scheduler()
        await reset_hub()
        await reset_broker()
        await dispose_database()
        log.info("shutdown")


def create_app(settings: Settings | None = None) -> FastAPI:
    cfg = settings or get_settings()
    configure_logging(level=cfg.log_level, json_output=cfg.log_json)

    docs_enabled = cfg.app_env is not AppEnv.production

    app = FastAPI(
        title=cfg.app_name,
        version=__version__,
        description=DESCRIPTION,
        # No custom response class: this FastAPI serialises straight to JSON
        # bytes through Pydantic when a response model is set, which is faster
        # than routing through ORJSONResponse and avoids its deprecation.
        lifespan=lifespan,
        docs_url="/docs" if docs_enabled else None,
        redoc_url="/redoc" if docs_enabled else None,
        openapi_url="/openapi.json" if docs_enabled else None,
        openapi_tags=[
            {"name": "health", "description": "Liveness, readiness and metrics."},
            {"name": "campus", "description": "Buildings, floors and rooms."},
            {
                "name": "compat",
                "description": (
                    "The 3D front end's exact data shapes. Changing a field here breaks the map."
                ),
            },
            {"name": "auth", "description": "Tokens and the current principal."},
        ],
        contact={"name": "Campus Digital Twin backend", "url": "https://aut.uz"},
    )
    app.state.settings = cfg

    # Make the settings passed in here authoritative for this app instance.
    # Without this, `Depends(get_settings)` resolves the cached process-wide
    # singleton, so an app built with explicit settings would use them for the
    # database while endpoints silently read a different object - which is how
    # a test app ended up refusing a token for the wrong reason.
    app.dependency_overrides[get_settings] = lambda: cfg

    app.add_middleware(RequestContextMiddleware)
    app.add_middleware(MetricsMiddleware)
    if cfg.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            # Explicit origins only. The Vite dev server runs on HTTPS with
            # host:true, so the origin must be listed, not wildcarded - a
            # wildcard cannot be combined with credentials anyway.
            allow_origins=cfg.cors_origins,
            allow_credentials=True,
            allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
            allow_headers=["authorization", "content-type", "accept-language", "x-request-id"],
            expose_headers=["x-request-id", "x-campus-source", "x-campus-is-demo"],
            max_age=600,
        )

    register_exception_handlers(app)

    app.include_router(health_router)
    app.include_router(api_router, prefix=cfg.api_prefix)
    # At the root, not under the API prefix: the brief specifies the path as
    # `WS /ws/v1/stream` (section 8), and it carries its own version segment.
    app.include_router(ws_router)

    @app.get("/", include_in_schema=False)
    async def root() -> dict[str, Any]:
        return {
            "name": cfg.app_name,
            "version": __version__,
            "docs": "/docs" if docs_enabled else None,
            "api": cfg.api_prefix,
            "health": "/healthz",
        }

    return app


app = create_app()
