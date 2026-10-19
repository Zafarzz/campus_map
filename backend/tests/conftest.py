"""Test fixtures.

Tests run against a **real PostgreSQL** (brief section 0.4 rule 1). There is no
SQLite fallback, because the things most worth testing here - the booking
exclusion constraint, ``tstzrange``, native enums, partial indexes - do not
exist outside PostgreSQL, and a test that passes on SQLite would be proving
nothing about production.

The database is created and dropped by the suite itself and its name always ends
in ``_test``, derived from the configured URL, so a misconfigured environment
cannot point the tests at development data.
"""

from __future__ import annotations

import argparse
import asyncio
import re
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
import pytest_asyncio
from alembic import command
from alembic.config import Config as AlembicConfig
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.core.config import BACKEND_DIR, AppEnv, Settings, get_settings
from app.core.db import Database, init_database
from app.main import create_app

pytest_plugins = ("pytest_asyncio",)


def _maintenance_url(url: str) -> tuple[str, str]:
    """Split a URL into (server URL pointing at ``postgres``, database name)."""
    head, _, tail = url.rpartition("/")
    name = tail.split("?", 1)[0]
    return f"{head}/postgres", name


@pytest.fixture(scope="session")
def settings() -> Settings:
    """Settings pinned to the test database.

    ``app_env`` is forced to ``test`` so any code that branches on the
    environment behaves as it would in CI rather than as in development.
    """
    get_settings.cache_clear()
    base = get_settings()
    test_url = base.test_database_url()

    if not re.search(r"_test(\?|$)", test_url):
        pytest.exit(
            f"refusing to run: the derived test database URL does not end in _test ({test_url}). "
            "Tests must never touch development data.",
            returncode=2,
        )

    return base.model_copy(
        update={
            "app_env": AppEnv.test,
            "database_url": test_url,
            "database_migration_url": test_url,
            "database_test_url": test_url,
        }
    )


@pytest.fixture(scope="session")
def anyio_backend() -> str:
    return "asyncio"


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def migrated_database(settings: Settings) -> AsyncIterator[str]:
    """Create the test database, migrate it, yield its URL, then drop it.

    Dropping at the end keeps runs independent; a leftover database from a
    crashed run is handled by the drop-then-create at the start.
    """
    server_url, db_name = _maintenance_url(settings.database_url)

    # CREATE/DROP DATABASE cannot run inside a transaction block.
    admin = create_async_engine(server_url, isolation_level="AUTOCOMMIT")
    try:
        async with admin.connect() as conn:
            await conn.execute(text(f'DROP DATABASE IF EXISTS "{db_name}" WITH (FORCE)'))
            await conn.execute(text(f'CREATE DATABASE "{db_name}"'))
    finally:
        await admin.dispose()

    # In a thread: alembic/env.py calls asyncio.run(), which cannot be called
    # from inside an already-running event loop.
    await asyncio.to_thread(
        _run_alembic, "upgrade", "head", url=settings.database_url, schema=settings.database_schema
    )

    yield settings.database_url

    admin = create_async_engine(server_url, isolation_level="AUTOCOMMIT")
    try:
        async with admin.connect() as conn:
            await conn.execute(text(f'DROP DATABASE IF EXISTS "{db_name}" WITH (FORCE)'))
    finally:
        await admin.dispose()


def _run_alembic(*args: str, url: str, schema: str) -> None:
    """Run an Alembic command in-process against an explicit URL.

    ``-x url=...`` is how ``alembic/env.py`` accepts an override, and setting
    ``cmd_opts`` is how to pass it without a subprocess.
    """
    cfg = AlembicConfig(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    cfg.cmd_opts = argparse.Namespace(x=[f"url={url}", f"schema={schema}"])  # type: ignore[assignment]
    getattr(command, args[0])(cfg, *args[1:])


@pytest_asyncio.fixture(loop_scope="session")
async def database(migrated_database: str, settings: Settings) -> AsyncIterator[Database]:
    db = init_database(migrated_database, settings)
    yield db
    await db.dispose()


async def _truncate_all(database: Database) -> None:
    """Empty every project table.

    Needed because a few fixtures (``seeded_client``) must *commit* so that the
    app's own sessions can see the data. Without a reset between tests, whether
    a test passes would depend on the order it ran in - and that kind of flake
    is worse than no test at all.
    """
    from app.core.db import Base

    tables = ", ".join(f'"{table.name}"' for table in Base.metadata.sorted_tables)
    async with database.engine.begin() as conn:
        await conn.execute(text(f"TRUNCATE TABLE {tables} RESTART IDENTITY CASCADE"))


@pytest_asyncio.fixture(loop_scope="session")
async def clean_database(database: Database) -> Database:
    """A migrated, empty database."""
    await _truncate_all(database)
    return database


@pytest_asyncio.fixture(loop_scope="session")
async def session(clean_database: Database) -> AsyncIterator[AsyncSession]:
    """A session whose work is rolled back afterwards.

    Each test gets a clean database without paying for a migration per test:
    the outer transaction is never committed, so nothing persists.
    """
    async with clean_database.engine.connect() as connection:
        transaction = await connection.begin()
        maker = clean_database.sessionmaker
        async with maker(bind=connection, join_transaction_mode="create_savepoint") as session:
            yield session
        await transaction.rollback()


@pytest_asyncio.fixture(loop_scope="session")
async def seeded_session(session: AsyncSession) -> AsyncSession:
    """A session with the campus loaded, inside the rolled-back transaction."""
    from app.adapters.frontend.campus_extract import extract_inventory
    from app.services.seed_service import seed_campus

    inventory = extract_inventory(get_settings().frontend_src_path)
    await seed_campus(session, inventory, timezone="Asia/Tashkent", random_seed=1)
    await session.flush()
    return session


@pytest_asyncio.fixture(loop_scope="session")
async def client(database: Database, settings: Settings) -> AsyncIterator[AsyncClient]:
    """HTTP client against the real app, talking to the test database.

    Uses ASGITransport rather than a live server: same routing, middleware and
    error handling, no port to bind.
    """
    app = create_app(settings)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as http:
        yield http


@pytest_asyncio.fixture(loop_scope="session")
async def seeded_client(client: AsyncClient, clean_database: Database) -> AsyncIterator[AsyncClient]:
    """Client whose database actually contains the campus.

    This one has to **commit**: the app opens its own sessions, so data held in
    an uncommitted transaction would be invisible to the endpoint under test.
    ``clean_database`` truncates first and the next test's reset clears up.
    """
    from app.adapters.frontend.campus_extract import extract_inventory
    from app.services.seed_service import seed_campus

    inventory = extract_inventory(get_settings().frontend_src_path)
    async with clean_database.sessionmaker() as session:
        await seed_campus(session, inventory, timezone="Asia/Tashkent", random_seed=1)
        await session.commit()
    yield client


@pytest.fixture(scope="session")
def frontend_src() -> Path:
    path = get_settings().frontend_src_path
    if not path.is_dir():
        pytest.skip(f"front-end sources not available at {path}")
    return path


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    """Mark everything that uses a database fixture, so ``-m 'not db'`` works."""
    db_fixtures = {
        "database",
        "clean_database",
        "session",
        "seeded_session",
        "client",
        "seeded_client",
        "migrated_database",
        "throwaway_database",
    }
    for item in items:
        if db_fixtures & set(getattr(item, "fixturenames", ())):
            item.add_marker(pytest.mark.db)
