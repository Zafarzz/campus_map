# Runbooks

Operational procedures. Short, and written for someone who did not build this.

## Local stack will not start

```bash
cd backend
docker compose ps          # is db healthy?
docker compose logs db --tail 50
```

**"Error: in 18+, these Docker images are configured to store database data in a
format compatible with pg_ctlcluster"** — the volume is mounted at
`/var/lib/postgresql/data`. PostgreSQL 18 needs it at `/var/lib/postgresql`.
Already fixed in `docker-compose.yml`; if you see it, something reverted that line.

**Docker engine not reachable** (`open //./pipe/dockerDesktopLinuxEngine`) — Docker
Desktop is not running. Start it and wait for the engine; it can take a minute.

## `relation "campus" does not exist` or `permission denied for schema campus`

The application role lost its grants. This happens whenever the schema is dropped
and recreated, because `ALTER DEFAULT PRIVILEGES` is recorded against the schema's
OID and disappears with it. Nothing warns you at the time.

```bash
make grants
```

`make migrate` does this automatically; a manual `DROP SCHEMA` does not.

## Applying a schema change

```bash
make revision m="add tickets"   # autogenerate
# READ the generated file. Autogenerate gets the common cases right and the
# interesting ones wrong - it does not know about extensions, standalone
# sequences, or exclusion constraints.
make migrate
make test                        # proves up/down still works
```

If the migration touches an enum type, make sure `downgrade()` drops it:
PostgreSQL does not drop a type with its table, and a leftover type makes the
next upgrade fail with "type already exists".

## Rolling back a migration

```bash
make downgrade        # one step
make backup           # before anything irreversible
```

Then fix the migration and re-apply. Do **not** edit an applied migration in
place unless you are certain no other database has it.

## Backup and restore

```bash
python scripts/db_backup.py --keep 10
python scripts/db_restore.py --file backups/campus-<stamp>.dump
python scripts/db_restore.py --self-test     # verify the whole cycle works
```

Run the self-test after any change to the schema or the scripts. A backup nobody
has restored is a hope, not a backup.

## The front end's campus data changed

`make test` fails with `front-end campus data has drifted`. This is intentional:
the seeded identifiers are the API contract.

1. Look at what changed in `src/data/campus-structure.ts`, `floor-plans/index.ts`
   or `demo-campus.ts`.
2. Decide whether the backend should follow. If room ids changed, anything holding
   an old id (a booking, a ticket) needs a migration or an alias.
3. `make extract && make seed`.
4. Commit the updated `data/frontend_campus_inventory.json` with the reason.

## Refreshing the timetable snapshot

```bash
python scripts/fetch_edupage_timetable.py --list      # what is published
python scripts/fetch_edupage_timetable.py             # fetch the current one
python scripts/fetch_edupage_timetable.py --rooms     # room codes only, no personal data
```

Snapshots go to `data/snapshots/` and are **never committed** — the payload
contains teachers' real names. See `../privacy/timetable.md`.

## Resetting the local database completely

```bash
make nuke     # stops the stack AND deletes the volume
make up && make migrate && make seed
```

Local development only. `scripts/db_backup.py` and `db_restore.py` both refuse to
run when `APP_ENV` is staging or production.

## Proving nothing outside `backend/` changed

```bash
make safety
```

Exit 0 = clean. Exit 1 = something outside `backend/` was touched; revert it.
Exit 2 = the check could not run, which is **not** a pass — fix that first.

## Tests are slow

~5 minutes, because they create and migrate real PostgreSQL databases. There is
no SQLite shortcut by design: the exclusion constraint, `tstzrange` and native
enums do not exist there, so a fast test would prove nothing.

To iterate quickly:

```bash
pytest -m "not db"                  # the ~47 pure-logic tests, ~9 seconds
pytest tests/test_api.py -q         # one file
```
