# ADR-0003: PostgreSQL 18, the `campus` schema, two roles, and explicit grants

- **Status**: `accepted` — implemented in Phase 1
- **Date**: 2026-10-17
- **Affects**: `docker-compose.yml`, `docker/initdb/`, `scripts/grant_app_privileges.py`,
  `alembic/`, `app/core/db.py`
- **Related**: brief section 0.4; ADR-0004

## Context

The brief requires PostgreSQL only — including for tests — because the design
depends on features that have no equivalent elsewhere: `tstzrange`, `btree_gist`
exclusion constraints, partial indexes, row-level locks. It asks for a currently
supported version (16 or newer), separate databases for development and tests,
least-privilege roles, and a dedicated schema.

## Decision

1. **PostgreSQL 18** (`postgres:18-alpine`, 18.6 verified on Docker Hub
   2026-10-17). Current major, comfortably inside the brief's floor.
2. **Volume mounted at `/var/lib/postgresql`, not `/var/lib/postgresql/data`.**
   The 18+ images store data in a major-version subdirectory so `pg_upgrade
   --link` works across the mount boundary. Mounting the old path makes the
   container refuse to start with a long explanatory error — which it did, once.
3. **One dedicated schema, `campus`.** Models carry no explicit schema; it is
   selected per connection through `search_path`, set by a `connect` event
   listener in both `app/core/db.py` and `alembic/env.py`. One model definition
   therefore serves development, the test database, and any future layout.
4. **Two roles** (least privilege):
   - `campus_owner` — owns objects, runs migrations. The container superuser.
   - `campus_app` — the application. SELECT/INSERT/UPDATE/DELETE on tables,
     USAGE on sequences, **no DDL rights**.
5. **Grants are an explicit, idempotent step**, `scripts/grant_app_privileges.py`,
   run by `make migrate` after every upgrade — *not* only an initdb side effect.
   This is the non-obvious part, and it was learned the hard way: `ALTER DEFAULT
   PRIVILEGES ... IN SCHEMA campus` is recorded against the schema's **OID**, so
   dropping and recreating the schema (routine while developing a migration)
   silently discards it along with the schema `USAGE` grant. Nothing fails at that
   moment. The next request fails with `permission denied for schema campus` or,
   worse, `relation "campus" does not exist` — which reads like a missing
   migration and sends you looking in the wrong place entirely.
6. **Extensions are created inside migrations**, not in initdb, so a database
   built from migrations alone is identical to a freshly initialised container.
   Currently just `btree_gist`.
7. **Tests own their database.** `Settings.test_database_url()` derives a name by
   appending `_test`, the suite refuses to run if the result does not end in
   `_test`, and it creates and drops that database itself.
8. **Local port 5433**, bound to `127.0.0.1` only, so it cannot collide with a
   PostgreSQL already installed on the host and is not reachable from the network.
9. **PostGIS is not used.** The brief leaves it optional and says a plain
   node-and-edge graph is enough to start (section 5). Nothing in Phases 1–2 needs
   geometry in the database, and ADR-003 in `docs/DECISIONS.md` keeps geometry in
   the front end's render contract. Revisit if the routing graph ever needs real
   spatial indexing.

## Alternatives rejected

- **PostgreSQL 16** (the brief's floor): supported, but there is no reason to
  start three majors behind.
- **Objects in `public`**: makes it impossible to host this project alongside
  anything else in one database, and makes a clean teardown harder.
- **One role for everything**: the application would be able to drop its own
  tables. The brief explicitly asks for least privilege.
- **`ALTER DEFAULT PRIVILEGES` only, at initdb time**: this is what was tried
  first. See point 5 — it fails silently and the resulting error is misleading.

## Consequences

- Any schema recreation must be followed by `make grants`. `make migrate` does it
  automatically; a manual `DROP SCHEMA` does not.
- Tests need a reachable PostgreSQL. There is no offline test mode, by design.
- Upgrading the major version later means a `pg_upgrade` or dump/restore, which
  the volume layout in point 2 is what makes feasible.
