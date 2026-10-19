# Changelog

Backend only. Nothing outside `backend/` has been modified.

## [0.1.0] — 2026-10-17 — Phase 1: Foundation

First working backend. The front end's campus data now comes from PostgreSQL.

### Added

**Workspace**
- `pyproject.toml` with dependencies verified against PyPI on 2026-10-17 and
  pinned exactly; ruff + mypy (strict) + pytest configuration.
- `docker-compose.yml`: PostgreSQL 18 with a named volume, healthcheck and the
  port bound to localhost only; an `api` service that mounts `../src` **read-only**.
- `Dockerfile` (Python 3.13, non-root), `Makefile`, `.env.example`, `.gitignore`.

**Core**
- Settings that refuse to start unsafely: `CAMPUS_TZ` and `JWT_SECRET` are
  required with no defaults, PostgreSQL-only URLs are enforced, and staging or
  production reject debug mode, local accounts, placeholder secrets and empty CORS.
- Async SQLAlchemy 2.1 + asyncpg, `search_path` and `TIME ZONE 'UTC'` per
  connection, constraint naming convention for reversible migrations.
- structlog with a request id bound to every line and returned in `x-request-id`.
- Prometheus metrics labelled by route template, `/healthz`, `/readyz`, `/metrics`.
- One error envelope for every failure, with the request id in the body.
- i18n catalogues (English default, Russian) with `Accept-Language` negotiation.
- Time helpers: UTC in the database, campus-local in the API, DST-correct day
  boundaries, and the front end's offset-naive format for the compat layer.
- Role-based auth: 8 roles, PBKDF2 passwords, JWT with no identifying claims.

**Domain**
- 34 tables across spatial, academic time, people, booking, evidence, state
  history and platform concerns.
- `resource_occupancy` with a `tstzrange` GiST exclusion constraint, so
  overlapping bookings are impossible even under concurrency, and a lesson and a
  booking cannot collide.
- `room_alias` as a many-to-many table, because the front end's legacy ids are
  not unique.
- Append-only `room_state_event` with a shared sequence for WebSocket catch-up.
- One Alembic migration, tested up, down and up again.

**Front-end integration**
- A tolerant JS-literal parser and an extractor that re-derives the front end's
  room inventory by reproducing all five branches of `demo-campus.ts`, read-only.
- Committed inventory snapshot plus a drift test.
- Idempotent seeder: **8 buildings, 24 floors, 101 rooms (18 demo), 62 aliases,
  2 connectors**, with the front end's exact identifiers.
- `GET /api/v1/compat/campus/bare` returns the front end's exact `Campus` object.

**Scripts**
- `check_repo_safety.py` — proves nothing outside `backend/` changed.
- `extract_frontend_campus.py`, `seed_demo_campus.py`, `grant_app_privileges.py`,
  `db_backup.py`, `db_restore.py` (with `--self-test`),
  `fetch_edupage_timetable.py`.

**Tests** — 126, against a real throwaway `*_test` database.

**Docs** — `PROJECT_UNDERSTANDING.md`, `FRONTEND_CONTRACT.md`,
`PROPOSED_ROOT_CHANGES.md`, 9 ADRs, privacy notes, runbooks.

### Discovered

- The real timetable source is the university's public EduPage/aSc export:
  7 lesson slots (08:30–19:15, 75 minutes), Mon–Fri, 56 rooms, 666 weekly
  placements. The front end's `mapConfig.schedule.slots` (six 80-minute slots
  from 09:00) is not the real grid. See ADR-0010.
- `bld-h-f2-r7` is the `legacyId` of **two** rooms in the front-end data, so
  resolving it returns HTTP 409 rather than guessing.
- `docs/ARCHITECTURE.md` is stale in six specific ways (recorded in
  `PROJECT_UNDERSTANDING.md` §6 C-3); proposal P-2 offers to refresh it.

### Fixed during development

- PostgreSQL 18 requires the data volume at `/var/lib/postgresql`, not `/data`.
- Autogenerate emitted `DROP TABLE alembic_version` inside `upgrade()`, which
  deleted the bookkeeping Alembic was about to write; `include_object` now
  excludes it.
- Native enum types survived a downgrade, so the next upgrade failed with "type
  already exists"; the migration's epilogue drops them.
- The `user_role` table's implicit composite type collided with a `user_role`
  enum; the enum is now `app_role`.
- `ALTER DEFAULT PRIVILEGES` is tied to the schema OID and vanishes when the
  schema is recreated, leaving a misleading `relation "campus" does not exist`;
  grants are now an explicit idempotent step run by `make migrate`.
- `create_app(settings)` did not override `Depends(get_settings)`, so an app
  built with explicit settings read a different object in its endpoints.
- A `UniqueConstraint` duplicating a composite primary key made the models look
  permanently drifted from the migration.

### Known limits

- `/compat/lessons`, `/compat/room-states` and `/compat/live-counts` return
  **501**: they need the timetable importer and the room-state engine (Phase 2).
- The front end still reads its static modules. Switching a seam is a front-end
  edit and needs the owner's approval; see `docs/PROPOSED_ROOT_CHANGES.md` P-1.
- No CI workflow: the repository uses no CI system, so the brief's precondition
  for adding one outside `backend/` is not met.
- `app/engines/` and `app/layers/` do not exist yet, by choice — they arrive with
  the layers that need them.
- Compat timestamps remain offset-naive, which is correct only while the viewer's
  browser is in campus time. That is a property of the front end today, not
  something the backend can fix from its side.
