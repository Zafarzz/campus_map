"""Migrations must work in both directions.

The brief requires every migration to have a working downgrade and to be tested
up and down (section 0.4 rule 4). This is the test that makes that real - and it
is what caught two genuine defects in the initial migration: autogenerate
emitting `DROP TABLE alembic_version`, and native enum types surviving a
downgrade so that a re-upgrade failed with "type already exists".
"""

from __future__ import annotations

import asyncio

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

import app.domain  # noqa: F401  - side-effect import: registers every model on Base.metadata
from app.core.config import Settings
from tests.conftest import _maintenance_url, _run_alembic

pytestmark = pytest.mark.db

EXPECTED_TABLE_COUNT = 55


async def _alembic(url: str, schema: str, *args: str) -> None:
    """Run Alembic off the event loop.

    ``alembic/env.py`` calls ``asyncio.run()``, which raises if there is already
    a running loop - and with a session-scoped test loop there always is.
    """
    await asyncio.to_thread(_run_alembic, *args, url=url, schema=schema)


@pytest.fixture
async def throwaway_database(settings: Settings):  # type: ignore[no-untyped-def]
    """A second database, so the round trip cannot disturb the suite's own."""
    server_url, base_name = _maintenance_url(settings.database_url)
    name = f"{base_name}_migrations"
    url = f"{server_url.rsplit('/', 1)[0]}/{name}"

    admin = create_async_engine(server_url, isolation_level="AUTOCOMMIT")
    try:
        async with admin.connect() as conn:
            await conn.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
            await conn.execute(text(f'CREATE DATABASE "{name}"'))
    finally:
        await admin.dispose()

    yield url

    admin = create_async_engine(server_url, isolation_level="AUTOCOMMIT")
    try:
        async with admin.connect() as conn:
            await conn.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
    finally:
        await admin.dispose()


async def _count(url: str, sql: str, **params: object) -> int:
    engine = create_async_engine(url)
    try:
        async with engine.connect() as conn:
            return int(await conn.scalar(text(sql), params) or 0)
    finally:
        await engine.dispose()


async def test_upgrade_then_downgrade_then_upgrade(throwaway_database: str, settings: Settings) -> None:
    schema = settings.database_schema
    table_sql = "SELECT count(*) FROM information_schema.tables WHERE table_schema = :schema"
    enum_sql = (
        "SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace "
        "WHERE n.nspname = :schema AND t.typtype = 'e'"
    )
    sequence_sql = (
        "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace "
        "WHERE n.nspname = :schema AND c.relkind = 'S'"
    )

    # --- up
    await _alembic(throwaway_database, schema, "upgrade", "head")
    assert await _count(throwaway_database, table_sql, schema=schema) == EXPECTED_TABLE_COUNT
    assert await _count(throwaway_database, enum_sql, schema=schema) > 0
    assert await _count(throwaway_database, sequence_sql, schema=schema) == 1
    assert (
        await _count(throwaway_database, "SELECT count(*) FROM pg_extension WHERE extname = 'btree_gist'")
        == 1
    )
    assert await _count(throwaway_database, "SELECT count(*) FROM pg_constraint WHERE contype = 'x'") == 1

    # --- down: only alembic_version may remain, and no orphaned types
    await _alembic(throwaway_database, schema, "downgrade", "base")
    assert await _count(throwaway_database, table_sql, schema=schema) == 1
    assert await _count(throwaway_database, enum_sql, schema=schema) == 0, (
        "native enum types survived the downgrade; a re-upgrade would fail with 'type already exists'"
    )
    assert await _count(throwaway_database, sequence_sql, schema=schema) == 0

    # --- up again: proves the cycle is repeatable
    await _alembic(throwaway_database, schema, "upgrade", "head")
    assert await _count(throwaway_database, table_sql, schema=schema) == EXPECTED_TABLE_COUNT


async def test_the_version_table_survives_an_upgrade(throwaway_database: str, settings: Settings) -> None:
    """Regression: autogenerate once emitted `DROP TABLE alembic_version`.

    The result was an upgrade that created all 34 tables and then failed on its
    own bookkeeping. `include_object` in alembic/env.py now excludes it.
    """
    await _alembic(throwaway_database, settings.database_schema, "upgrade", "head")
    stamped = await _count(
        throwaway_database,
        f'SELECT count(*) FROM "{settings.database_schema}".alembic_version',
    )
    assert stamped == 1


async def test_models_and_migration_agree(throwaway_database: str, settings: Settings) -> None:
    """Autogenerate against a migrated database must find nothing to do.

    If this fails, a model changed without a migration - which the brief
    forbids (migrations are the only way the schema changes).
    """
    from alembic.autogenerate import compare_metadata
    from alembic.migration import MigrationContext

    from app.core.db import Base

    await _alembic(throwaway_database, settings.database_schema, "upgrade", "head")

    engine = create_async_engine(throwaway_database)
    try:
        async with engine.connect() as conn:
            await conn.execute(text(f'SET search_path TO "{settings.database_schema}", public'))

            def _compare(sync_conn):  # type: ignore[no-untyped-def]
                context = MigrationContext.configure(
                    sync_conn,
                    opts={
                        "include_object": _include,
                        "version_table_schema": settings.database_schema,
                        "compare_type": True,
                    },
                )
                return compare_metadata(context, Base.metadata)

            diff = await conn.run_sync(_compare)
    finally:
        await engine.dispose()

    assert diff == [], f"models have drifted from the migration: {diff}"


def _include(obj: object, name: str | None, type_: str, reflected: bool, compare_to: object) -> bool:
    return not (type_ == "table" and name == "alembic_version")
