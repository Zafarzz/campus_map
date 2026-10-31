# Changelog

Backend only. Nothing outside `backend/` has been modified.

## [0.4.0] — 2026-10-31 — Phase 4: Academic Operations, Facilities & Scenario Engine

`MASTER_PROMPT.md` §6.2, §13, and §14 in full. Layer 3 Academic Operations (lab & equipment
booking prerequisites, OR-Tools CP-SAT exam seat planner, rotating HMAC-SHA256 QR attendance,
and accessibility-aware CB-CTT timetable optimiser on the copy-on-write Scenario Engine) and
Layer 4 Facilities (ticket SLA breach escalation & operational metrics, deterministic 0..100
room health score, OR-Tools Routing smart cleaning planner with time windows, and QR-labelled
asset registry with loans and preventive maintenance).

### Added

**Layer 3: Academic Operations (§13) & Scenario Engine (§6.2)**
- `services/booking_service.py` & `services/academic_service.py` (§13.1): Automatic loading
  of non-expired `UserCapability` prerequisites during booking validation, booking approval
  and rejection (`approve_booking`, `reject_booking`), resource maintenance `Blackout`
  creation, usage logs, and RFC 5545 iCalendar (`calendar.ics`) export.
- `engines/exam_seating.py` (§13.2): Two-stage capacity-aware room split + OR-Tools CP-SAT
  (`ortools.sat.python.cp_model`) seat assignment with configurable spacing, orthogonal/diagonal
  same-course separation, accessible & front-row accommodations, deterministic seed, locked
  seats re-planning, constructive consecutive-divide heuristic fallback, actionable
  infeasibility diagnosis, and CSV, printable ReportLab PDF, and privacy-gated student slips.
- `engines/attendance.py` (§13.3): Rotating HMAC-SHA256 QR token derivation and verification
  (accepting current + previous window for clock skew; rejecting expired and future tokens),
  enrolment verification (`EnrollmentRef` or `guest`), single-scan uniqueness, late threshold,
  soft device binding (`UserDevice` -> `pending_review`), optional Haversine geofence weak
  signal, live `Signal(checkin)` + `OccupancyEstimate` emission, `state_service` lesson
  confirmation upgrade (`ConfirmationState.confirmed`), and Beta-Binomial `AttendanceRate`
  posterior update on session close.
- `engines/timetable_optimiser.py` (§6.2, §13.4): Curriculum-Based Course Timetabling (CB-CTT)
  via OR-Tools CP-SAT with integer weights, `model.add_hint` warm-starting, `requires_step_free`
  accessibility hard constraint, incremental mode, before/after metrics, and copy-on-write
  `Scenario` & `ScenarioChange` persistence without mutating live `Meeting` or `MeetingRule` rows.

**Layer 4: Facilities (§14)**
- `engines/tickets.py` & `services/ticket_service.py` (§14.1): Automatic staff assignment rules
  by category and building scope, `escalate_overdue_tickets` SLA breach priority promotion, and
  `compute_ticket_metrics` (`time_to_triage`, `time_to_resolve`, `sla_breaches`, `reopen_rate`).
- `engines/facilities.py` & `services/facilities_service.py` (§14.2–§14.4):
  - Deterministic Room Health Score (`0..100`) with full component breakdown, provenance,
    confidence, building roll-ups, and optional environmental CSV import hook.
  - Smart Cleaning Planner computing room `dirt_score` and post-usage time windows, solving
    routes per cleaner via OR-Tools Routing Solver (`ortools.constraint_solver.pywrapcp`) with
    a `Time` dimension and nearest-neighbour fallback, persisting `CleaningTask` rows, and
    exporting CSV and printable PDF route sheets.
  - Asset Registry (`Asset`, `AssetLoan`) with printable QR code label PDF sheets (`segno` +
    `reportlab`), checkout/return with due dates, usage hours logging, condition tracking,
    overdue loan alerts, and preventive maintenance reminders.

**Database & API**
- Alembic migration `4a1c8f92e104`: Added 8 new tables (`user_capability`, `user_device`,
  `exam_plan`, `scenario`, `scenario_change`, `asset`, `asset_loan`, `cleaning_task`) and 4
  PostgreSQL enum types (`scenario_status`, `asset_condition`, `asset_status`,
  `cleaning_task_status`). Total table count: 55.
- Mounted routers in `app/api/v1/router.py`: `academic`, `facilities`.

## [0.3.0] — 2026-10-21 — Phase 3: Crowds, Student Life & Shared Platform Services

`MASTER_PROMPT.md` §6.2, §11, and §12 in full. Shared notifications and ticket engine,
file storage with EXIF stripping and PII masking, Layer 1 Crowds & Busyness, Layer 2
Student Life services, and per-minute-bucket state caching.

All tests pass across Phase 1, Phase 2, and Phase 3 suites. ruff and mypy clean.
`scripts/check_repo_safety.py` passes — nothing outside `backend/` changed.

### Added

**Shared platform engines & services (§6.2)**
- `engines/notifications.py` & `services/notification_service.py`: Multilingual template
  catalogue (`en`, `ru`, `uz`) with fallback, multi-channel dispatch (`in_app`,
  `web_push` VAPID, `telegram`, `email`, `sms`), user acknowledgment, and audited
  broadcasts with target role filters.
- `engines/tickets.py` & `services/ticket_service.py`: Legal state machine
  (`new` -> `triaged` -> `assigned` -> `in_progress` -> `resolved` -> `closed`,
  `reopened`), priority SLA deadline timers, 24h duplicate merge with upvotes,
  satisfaction ratings (1..5), and room blocking integration (`blocks_use=True`
  setting `Room.out_of_service=True`).
- `adapters/storage.py`: `StorageAdapter` interface with `LocalDiskStorageAdapter` and
  `S3CompatibleStorageAdapter`. Automated Pillow EXIF metadata stripping (purging GPS
  and camera data) and PII masking for identity cards, passports, and payment cards.

**Layer 1: Crowds & Busyness (§11)**
- `engines/crowds.py` & `services/crowd_service.py`: Place busyness estimation fusing
  timetable proxies and fresh crowd reports, hour-of-week median/p80 profile with
  honest data gate, class-change corridor/entrance flows with trip conservation and
  differential privacy small-cell suppression (< 10), timetable walking-time check
  with 3D building centroid Euclidean distances and floor penalties, and M/M/c
  Erlang C queue waiting-time estimation for canteens.

**Layer 2: Student Life (§12)**
- `engines/studentlife.py` & `services/studentlife_service.py`:
  - Opt-in study-group matcher computing free windows without leaking timetable
    intervals, using `scipy.optimize.linear_sum_assignment` and greedy expansion,
    proposing free rooms and booking upon unanimous acceptance.
  - Lost and found service with EXIF stripping, sensitive ID masking, hybrid
    TF-IDF + RapidFuzz matching, and verification question/answer claim flow.
  - Dorm services reusing ticket and booking engines, crowd-reported machine status
    with exponential decay (`provenance=reported`), and multilingual notice board.
  - Teacher finder with teacher-controlled visibility modes (default `off`), current
    status only (no historical trails), and office-hours appointment booking.

**Performance & Caching (§10.2)**
- `services/state_service.py`: Per-minute-bucket room context cache with hit/miss
  monitoring (`state_cache_stats()`), explicit invalidation, and automated
  invalidation on SQLAlchemy session `after_flush` and `after_soft_rollback`.

**Database & API**
- Alembic migration `0ce72ccaa26e`: Added 10 new tables (`place`, `ticket`,
  `ticket_event`, `notification`, `push_subscription`, `study_group_request`,
  `study_group_session`, `study_group_member`, `lost_found_item`, `lost_found_claim`,
  `dorm_notice`, `teacher_profile`, `enrollment_ref`), 9 PostgreSQL enum types,
  indexes, and foreign key cascades. Total table count: 47.
- Mounted routers in `app/api/v1/router.py`: `busyness`, `tickets`, `notifications`,
  `studentlife`.

## [0.2.0] — 2026-10-19 — Phase 2: Layer 0 core

`MASTER_PROMPT.md` §10 in full. The map's room states, the timetable importer,
conflict-proof bookings, the occupancy estimator, append-only history and
real-time delivery.

638 tests pass (was 126). ruff and mypy (strict) clean.
`scripts/check_repo_safety.py` passes — nothing outside `backend/` changed.

### Added

**Shared engines** — pure, no I/O, so each is testable at an arbitrary instant.

- `engines/recurrence.py` (§10.1): expands `RRULE` **in the event's own
  timezone** and converts to UTC, so a weekly 09:00 lecture stays at 09:00 local
  across a daylight-saving change. `EXDATE`s match the occurrence's *original*
  start; a date-only `EXDATE` excludes the whole local day. Overrides (cancel,
  move, room change) keyed by original start. A cancelled occurrence stays in the
  series flagged, because the map paints it purple and a vanished lesson would
  render as Free — a different claim about the world.
- `engines/room_state.py` (§10.2): `state_at(room, at, context)` with the six
  precedence rules. `out_of_service` is an **overlay**, never a state: a room can
  be in a lesson *and* unusable. `next_transition_at()` replaces polling with one
  timer per room.
- `engines/evidence.py` (§10.3): precision-weighted fusion with exponential
  decay, and a Beta-Binomial posterior per section/weekday/hour so the attendance
  rate is **learned, never hard-coded**. With no evidence it reports zero
  *confidence* and says the absence is of information, not of people.
- `engines/booking.py` (§10.4): policy parsing, window arithmetic, free-room
  ranking with a reason on every result, and alternative slots for a 409.
- `engines/timetable/` (§10.1): one canonical row, a column-mapping step so a
  differently shaped export loads without a code change, CSV/XLSX/ICS parsers,
  and a validation report in which **nothing is silently dropped**.

**Services and jobs**

- `state_service`: one query per request, then the pure engine. Live and
  Simulate share the single code path, so they cannot disagree.
- `booking_service`: the database is the referee. The application check exists
  for a friendly error; the exclusion constraint is the guarantee.
- `import_service`: dry run → apply → roll back, by batch id.
- `history_service` (§10.6): append-only capture that records only genuine
  changes, periodic snapshots, and replay with `as_known_at`.
- `jobs/`: the transition scheduler on its own data-dependent timer, plus
  auto-release, snapshotting and heartbeats on APScheduler (ADR-0011).
- `realtime/`: WebSocket hub, Redis pub/sub broker with an in-process fallback
  that is honest about reaching only one worker (ADR-0012).

**API**

- `GET /state`, `/state/transitions`, `/rooms/{id}/state`, `/rooms/search`,
  `/replay`, `/stream/changes`; `POST /schedule/import` (dry run by default),
  `/schedule/import/{id}/rollback`; `/bookings` with check-in and cancel;
  `WS /ws/v1/stream`.
- `/compat/lessons`, `/compat/room-states`, `/compat/live-counts` are
  **implemented** — they returned 501 in Phase 1 — in the front end's exact
  shapes: offset-naive campus-local timestamps, SCREAMING_CASE statuses, and a
  60-minute upcoming window.

**Demo data**

- `adapters/frontend/demo_schedule.py` ports the front end's FNV-1a generator
  exactly, verified against the real JavaScript under Node. The seeded timetable
  therefore matches what the map shows today, which makes switching the compat
  seam provably a no-op for the user.

### Fixed

- **`core/db.py`: `search_path` was lost on rollback.** It was applied with a
  connect-time `SET`, and `SET` is transactional in PostgreSQL — so any
  `ROLLBACK` reverted it and the connection went back to the pool unable to find
  its own tables, reporting `relation "resource" does not exist` for a table
  that plainly exists. Now passed as an asyncpg `server_settings` connection
  parameter. It only surfaced under the booking engine's concurrency test,
  because nothing before it rolled back.
- **Savepoints must contain only the insert that can conflict.** A flush that
  raises poisons the whole SQLAlchemy session, not just the savepoint. Both the
  booking engine and the importer had a pending insert outside the savepoint, so
  a handled conflict became a `PendingRollbackError` 500 instead of a 409 or a
  skipped row.
- **`config.py`: a blank env var with a trailing comment took the comment as its
  value.** `python-dotenv` strips an inline `#` comment only when the value
  before it is non-empty, so `REDIS_URL=   # blank = …` yielded the comment and
  crashed startup. Comments moved onto their own lines, plus a validator that
  treats a comment-only value as blank and checks the Redis URL scheme.
- **`docker-compose.yml`: `FRONTEND_SRC_DIR` was never set.** The api service
  mounted the front end at `/srv/frontend-src` but `.env`'s host-side `../src`
  was used instead, so the extractor and 32 seeding tests could not find it.
- **The transition scheduler recorded nothing on its first pass.** With no
  history yet it settled only rooms whose transition had already passed, so at
  00:30 it found nothing to do and left `/stream/changes` empty until the next
  lesson boundary. It now evaluates the campus on each wake-up and relies on
  de-duplication, which also catches changes that do not move a room's next
  transition (a booking, an override, a ticket).
- **Reversed times are no longer read as crossing midnight.** A `15:00–14:00`
  typo became a 23-hour lesson that sailed past the non-positive-duration check
  and held a room all day.
- **Import diffs are exact.** Reconstructing a row's identity from a stored rule
  is lossy — the date window ends up inside `DTSTART`/`UNTIL` with weekday
  anchoring applied — so every re-import of an unchanged file reported "replace
  everything". The identity is now stored on `meeting_rule.source_identity`
  (migration `849d42a79241`).

### Changed

- `state_service` loaders scope by predicate rather than by a thousand-element
  `IN` list, and select columns rather than hydrating ORM entities. Took the
  graded p95 from 388 ms to 31 ms; see `docs/runbooks/performance.md`.

### Measured

- Full-building query on a 1,000-room campus: **p95 30.6 ms** against the
  brief's 100 ms target (§10.2).
- Whole-campus query at 1,100 rooms: p95 289 ms. **Over** what an interactive
  map wants, and not yet cached — §10.2's per-minute-bucket cache is deferred to
  Phase 3 with its reasoning recorded.

### Known limits

- No attendance evidence yet (Layer 3), so every scheduled lesson reports
  `confirmation: unconfirmed` and the estimator runs on the schedule prior alone.
  Honest, but thin.
- `GET /rooms/search` accepts `near` and does nothing with it: walking distance
  needs the routing graph (Phase 5). The response says so rather than
  substituting straight-line metres that would look like a real distance.
- The demo timetable has no enrolled counts, so `schedule_prior` returns "no
  prior" rather than a fabricated headcount.
- WebSocket load testing with a few thousand clients (§10.5) has not been run.

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
