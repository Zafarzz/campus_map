# ADR-0004: SQLAlchemy 2.1 async + asyncpg + Alembic

- **Status**: `accepted` — implemented in Phase 1
- **Date**: 2026-10-17
- **Affects**: `app/core/db.py`, `app/domain/`, `alembic/`
- **Related**: ADR-0003

## Context

The brief specifies SQLAlchemy 2.x async with Alembic (section 5) and asks that
library versions be verified and pinned rather than assumed (section 4.6).

## Decision

1. **Versions verified against PyPI on 2026-10-17 and pinned exactly**:
   SQLAlchemy 2.1.5, Alembic 1.20.0, asyncpg 0.32.0, FastAPI 0.143.3,
   Pydantic 2.14.1, pydantic-settings 2.16.0, greenlet 3.5.6.
2. **asyncpg, not psycopg3.** asyncpg is the faster native protocol
   implementation and is what the brief's `postgresql+asyncpg` examples assume.
   The cost is noted under Consequences.
3. **A constraint naming convention on `Base.metadata`.** Without it,
   autogenerate emits unnamed constraints that a downgrade cannot drop — and the
   brief requires every migration to work in both directions.
4. **Native PostgreSQL enums, one shared `Enum` instance per type**, defined once
   in `app/domain/base.py` and imported. Two separate `Enum()` objects with the
   same name make the migration try to `CREATE TYPE` twice.
   `values_callable` is set everywhere so the *values* are stored, not the Python
   member names — otherwise a later rename would silently diverge from the API.
5. **Enum type names must not collide with table names.** The `user_role` table
   owns an implicit composite type of the same name, so the role enum is called
   `app_role`. This failed loudly the first time and is now commented at the
   definition.
6. **The initial migration drops its enum types and sequence on downgrade.**
   PostgreSQL does not drop a type with the table that uses it, so without this
   the down/up cycle fails the second time with "type already exists".
   `btree_gist` is deliberately *not* dropped: extensions are database-wide and
   another schema may depend on one.
7. **`include_object` excludes `alembic_version`.** This is the subtle one.
   Alembic's own bookkeeping table is not part of `Base.metadata`, so
   autogenerate helpfully offers to drop it. The generated migration then deleted
   the table Alembic was about to write to, and the upgrade failed with
   `relation "campus.alembic_version" does not exist` **after** all 34 tables had
   been created successfully — an error that points nowhere near its cause.
8. **`alembic/env.py` does not manage transactions.** The schema is created on a
   separate connection beforehand and `search_path` is set by a `connect` event.
   An earlier version ran `CREATE SCHEMA` plus an explicit `commit()` on the
   migration connection, which left Alembic's version-table creation in a scope
   the subsequent `begin_transaction()` could not see.
9. **Time-ordered UUID primary keys** for non-spatial tables
   (`app/domain/base.py::new_uuid`), composing the UUIDv7 layout by hand because
   `uuid.uuid7` arrives in 3.14 and the runtime is 3.13. Ordered keys keep
   inserts at the right-hand edge of the index, which matters for the append-only
   evidence and state-history tables. Spatial tables keep text ids — see ADR-0008.

## Alternatives rejected

- **psycopg3** (`postgresql+psycopg`): a fine driver, and it would avoid the
  prepared-statement wrinkles below. asyncpg was chosen for throughput and
  because the brief's URLs assume it. Switching is a URL change plus a test run.
- **`Base.metadata.create_all()` for the initial schema**: faster to write, but
  it produces no reviewable DDL and no downgrade, both of which the brief requires.
- **Non-native enums (VARCHAR + CHECK)**: easier to migrate, but loses database-level
  validation and readable `\d` output. Revisit if enum churn becomes painful —
  adding a value to a native enum is cheap, removing one is not.
- **Letting Alembic own schema creation**: it cannot, because its version table
  lives inside the schema it would have to create first.

## Consequences

- asyncpg uses server-side prepared statements, so DDL executed inside a
  long-lived connection can interact badly with cached statement metadata. The
  engine sets `jit: off` and migrations run on short-lived `NullPool` engines.
- `alembic/env.py` calls `asyncio.run()`, so it cannot be invoked from inside a
  running event loop. The test harness wraps it in `asyncio.to_thread`.
- Every schema change is a migration, tested up and down by
  `tests/test_migrations.py`, which also asserts that autogenerate finds **no**
  difference between the models and the migrated database.
