# Campus Digital Twin — backend

Backend for the **Ajou University in Tashkent** 3D campus map. Serves the map's
data from PostgreSQL instead of the static TypeScript modules it ships with, and
is the foundation for the feature layers in `docs/MASTER_PROMPT.md`.

Self-contained: everything lives in `backend/` and can be reviewed, run, or
deleted without affecting the rest of the repository. **The front end is
read-only from here** — see `CLAUDE.md`.

## Quick start

```bash
cd backend
cp .env.example .env     # then set POSTGRES_*_PASSWORD and JWT_SECRET
make up                  # PostgreSQL 18 + the API
make migrate             # create the schema and grant the app role
make seed                # load the campus from the front end's data
```

Then:

| | |
|---|---|
| API docs | <http://127.0.0.1:8000/docs> |
| Liveness | <http://127.0.0.1:8000/healthz> |
| Readiness | <http://127.0.0.1:8000/readyz> |
| Metrics | <http://127.0.0.1:8000/metrics> |

`make help` lists every target.

## What works today (Phase 1)

- PostgreSQL 18 in Docker, 34 tables, one Alembic migration tested up **and** down.
- The campus seeded from the front end's own data: **8 buildings, 24 floors,
  101 rooms, 62 legacy aliases, 2 connectors** — with the front end's exact
  identifiers.
- `GET /api/v1/compat/campus/bare` returns the front end's exact `Campus` object,
  so `loadCampus()` becomes a one-line `fetch`.
- Clean API for campus, buildings, floors, rooms, with legacy-id resolution.
- Config that refuses to start unsafely, structured logging with request ids,
  Prometheus metrics, i18n catalogues (en + ru), role-based auth skeleton.
- 126 tests against a real throwaway PostgreSQL database.

Not yet built (Phase 2, and they say so with HTTP 501 rather than returning an
empty list): `/compat/lessons`, `/compat/room-states`, `/compat/live-counts`.
They need the timetable importer and the room-state engine.

## Connecting the front end

The front end currently reads static modules and makes no HTTP calls. One seam
is ready:

```ts
// src/services/campus/campusService.ts
export async function loadCampus(): Promise<Campus> {
  const res = await fetch('/api/v1/compat/campus/bare');
  return res.json();
}
```

**This is a front-end edit and needs the owner's approval** (brief section 0.2).
Two things to settle first, both written up in `docs/PROPOSED_ROOT_CHANGES.md`:

- **P-1**: the Vite dev server runs HTTPS, so a plain-HTTP API is mixed content.
  Either add a dev proxy to `vite.config.ts` (one-line change) or terminate TLS
  on the backend.
- **R7**: `loadCampus()` currently prefers a saved 2D-editor draft over
  `demoCampus`. Whoever switches the seam decides the precedence.

Full detail, including the other three seams: `docs/FRONTEND_CONTRACT.md` section 7.

## Layout

```
app/
  core/        config, db, security, logging, metrics, errors, i18n, time
  domain/      SQLAlchemy models (spatial, academic, booking, evidence, history, …)
  services/    all reads and writes
  api/v1/      routers: clean API + the compatibility layer
  adapters/    frontend/ (read-only extractor), imports/ (Phase 2)
alembic/       migrations
scripts/       safety guard, extractor, seeder, grants, backup/restore, EduPage fetch
tests/         126 tests, real PostgreSQL
docs/          MASTER_PROMPT, PROJECT_UNDERSTANDING, FRONTEND_CONTRACT, adr/, privacy/, runbooks/
```

## Common tasks

```bash
make test        # pytest against a throwaway *_test database
make lint        # ruff
make typecheck   # mypy
make safety      # prove nothing outside backend/ changed
make check       # all of the above

make extract     # re-read the front end's campus data into data/frontend_campus_inventory.json
make seed        # (re)load it; idempotent
make grants      # re-grant the app role after any schema recreation
make backup      # pg_dump to backups/
make psql        # a shell on the dev database
```

### After changing a model

```bash
make revision m="add tickets"   # autogenerate
# review the generated SQL, then:
make migrate
```

Every migration needs a working downgrade, and `tests/test_migrations.py` proves
up → down → up still works and that the models match the migration exactly.

### After the front end's campus data changes

`make test` fails with a drift error. That is deliberate: the seeded identifiers
are the API contract, so a human decides whether the backend follows.

```bash
make extract && make seed
```

## Things that will bite you

- **`bld-a` is not Block A.** Block A is `bld-h`, B is `bld-g`, D is `bld-c`,
  E is `bld-b`, F is `bld-d`, C is `bld-i`. Source: `docs/PDF_INVENTORY.md` §3.
- **Never run `npm install` or any front-end build.** `node_modules/` (8,112
  files) and `dist/` are tracked in git, so it would dirty paths outside
  `backend/`. `make safety` enforces this.
- **`CAMPUS_TZ` is required with no default** (`Asia/Tashkent`). The app refuses
  to start without it.
- **The front end's "starts soon" window is 60 minutes**, the brief's clean-API
  default is 15. Both are intentional; compat uses 60 so the map's colours do not
  change.
- **After any `DROP SCHEMA`, run `make grants`.** Default privileges are tied to
  the schema's OID and vanish with it — silently, until the next request fails.
- **`make test` takes ~5 minutes** because it creates and migrates real databases.

## Documentation

| | |
|---|---|
| The brief | `docs/MASTER_PROMPT.md` |
| What the repo told us | `docs/PROJECT_UNDERSTANDING.md` |
| The front end's data contract | `docs/FRONTEND_CONTRACT.md` |
| Decisions and their rejected alternatives | `docs/adr/` |
| Data purpose and retention | `docs/privacy/` |
| Operational procedures | `docs/runbooks/` |
| Changes outside `backend/` awaiting approval | `docs/PROPOSED_ROOT_CHANGES.md` |
