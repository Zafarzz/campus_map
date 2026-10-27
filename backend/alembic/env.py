"""Alembic environment.

Points at the **owner/migration** role, not the application role: the app has no
DDL rights by design (least privilege, brief section 0.4 rule 5).

Everything happens inside the project schema, and ``version_table_schema`` keeps
Alembic's own bookkeeping table there too, so a database can host the project
schema without polluting ``public``.
"""

from __future__ import annotations

import asyncio
import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import event, pool, text
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.core.config import get_settings

# Importing the domain package registers every model on Base.metadata.
from app.core.db import Base
from app.domain import *  # noqa: F403  (side-effect import: model registration)

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

settings = get_settings()
target_metadata = Base.metadata

#: ``alembic -x url=...`` wins, then the configured migration URL. The test
#: harness uses -x to point at its throwaway database.
_cli_args = context.get_x_argument(as_dictionary=True)
DB_URL = _cli_args.get("url") or settings.migration_url
SCHEMA = _cli_args.get("schema") or settings.database_schema


#: Tables that exist in the database but must never appear in a migration.
#: ``alembic_version`` is Alembic's own bookkeeping and is not part of
#: ``Base.metadata``, so without this autogenerate helpfully offers to drop it -
#: which produces a migration that deletes the row it is about to write and
#: fails with ``relation "campus.alembic_version" does not exist`` only after
#: every other table has been created. Learned the hard way; see the note in
#: the initial migration.
EXCLUDED_TABLES = frozenset({"alembic_version"})


def include_object(obj: object, name: str | None, type_: str, reflected: bool, compare_to: object) -> bool:
    """Keep autogenerate focused on our own tables in our own schema."""
    if type_ == "table":
        if name in EXCLUDED_TABLES:
            return False
        schema = getattr(obj, "schema", None)
        if schema not in (None, SCHEMA):
            return False
    return True


def _configure(connection: Connection | None = None, url: str | None = None) -> None:
    context.configure(
        connection=connection,
        url=url,
        target_metadata=target_metadata,
        # Detect column type and server-default changes, not just added/dropped
        # columns, so a migration cannot silently diverge from the models.
        compare_type=True,
        compare_server_default=True,
        include_object=include_object,
        include_schemas=False,
        version_table="alembic_version",
        version_table_schema=SCHEMA,
        # Rendering as batch is pointless on PostgreSQL and makes diffs noisy.
        render_as_batch=False,
        dialect_opts={"paramstyle": "named"},
    )


def run_migrations_offline() -> None:
    """Emit SQL to stdout without connecting (``alembic upgrade head --sql``)."""
    _configure(url=DB_URL)
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    """Run the migrations. Alembic owns the transaction; we only configure it.

    Note what is *not* here: no ``CREATE SCHEMA`` and no ``SET search_path``.
    Both used to live in this function followed by an explicit ``commit()``, and
    that broke the very first migration - committing mid-connection left Alembic
    creating its ``alembic_version`` table in a scope that the subsequent
    ``begin_transaction()`` did not see, so the final version INSERT failed with
    ``relation "campus.alembic_version" does not exist`` after all 34 tables had
    been created.

    The schema is now created on a separate connection before this runs, and
    ``search_path`` is set by a ``connect`` event on the engine, which is also
    how ``app/core/db.py`` does it.
    """
    _configure(connection=connection)
    with context.begin_transaction():
        context.run_migrations()


def _set_search_path(dbapi_connection: object, _record: object) -> None:
    cursor = dbapi_connection.cursor()  # type: ignore[attr-defined]
    try:
        cursor.execute(f'SET search_path TO "{SCHEMA}", public')
    finally:
        cursor.close()


async def run_migrations_online() -> None:
    section = config.get_section(config.config_ini_section, {})
    section["sqlalchemy.url"] = DB_URL
    # ALEMBIC_ECHO=1 prints every statement. Useful when a migration fails in a
    # way the traceback does not explain.
    if os.environ.get("ALEMBIC_ECHO"):
        section["sqlalchemy.echo"] = "true"
    engine = async_engine_from_config(section, prefix="sqlalchemy.", poolclass=pool.NullPool)

    # A brand-new database has no project schema, and Alembic's version table
    # lives inside it, so the schema has to exist first. Done on its own
    # connection and committed before the migration connection is opened.
    async with engine.begin() as setup:
        await setup.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{SCHEMA}"'))

    event.listen(engine.sync_engine, "connect", _set_search_path)

    async with engine.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
