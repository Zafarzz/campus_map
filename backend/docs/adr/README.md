# Backend ADR index

Decision records for the backend only. They never modify the repository's own
`docs/DECISIONS.md` (ADR-001 … ADR-027), which stays the authority for the front end,
geometry and the A/B/C stages. Where a backend decision interacts with one of those,
the ADR says so explicitly and quotes it.

Statuses follow the repository's convention (`docs/DECISIONS.md` header):
`accepted` (confirmed by implementation or by the owner), `proposed` (awaiting the
owner's confirmation), `superseded` (replaced, with a link to the replacement).

## Written

| ID | Title | Status | Date |
|---|---|---|---|
| [0001](0001-backend-scope-and-relation-to-adr-013.md) | Backend scope, and how it relates to ADR-013 ("no separate backend") | `accepted` (owner approved 2026-10-17) | 2026-10-17 |
| [0002](0002-runtime-python-313-in-docker.md) | Python 3.13, with Docker as the canonical runtime | `accepted` | 2026-10-17 |
| [0003](0003-postgresql-version-schema-and-roles.md) | PostgreSQL 18, the `campus` schema, two roles, explicit grants | `accepted` | 2026-10-17 |
| [0004](0004-async-stack-and-migrations.md) | SQLAlchemy 2.1 async + asyncpg + Alembic | `accepted` | 2026-10-17 |
| [0005](0005-application-layout.md) | Modular monolith layout | `accepted` | 2026-10-17 |
| [0006](0006-compatibility-layer.md) | The compatibility layer is a contract, not a convenience | `accepted` | 2026-10-17 |
| [0007](0007-seeding-from-the-front-end.md) | Seed by re-deriving the front end's room inventory, read-only | `accepted` | 2026-10-17 |
| [0008](0008-identifiers-and-legacy-aliases.md) | The front end's identifiers are the contract; aliases are many-to-many | `accepted` | 2026-10-17 |
| [0009](0009-time-and-timezone.md) | UTC in the database, campus timezone in the API, no assumed default | `accepted` | 2026-10-17 |
| [0010](0010-timetable-source-edupage.md) | The timetable source is the university's public EduPage (aSc) export | `accepted` | 2026-10-17 |

## Planned

| ID | Title | Decides | Phase |
|---|---|---|---|
| 0011 | Background job runner | APScheduler vs ARQ (the brief leaves it open), and what the transition scheduler in section 10.2 actually needs. | 2 |
| 0012 | Room-state engine design | The pure `state_at(room, at, context)` function, the bulk query, the per-minute cache and the transition scheduler. | 2 |
| 0013 | Real-time transport | WebSocket envelope, topics, `last_event_id` catch-up, Redis pub/sub fan-out across workers, REST polling fallback. | 2 |
| 0014 | EduPage room mapping | How the 56 published room codes map onto the 101 seeded rooms, including the studio subdivisions (`E-DS_101_1…4`) and the sports hall that is absent from `knownBuildings`. Needs the owner's input. | 2 |
| 0015 | Auth: OIDC provider and session flow | Authlib with a configurable issuer, the email-domain rule, and retiring local accounts. | 3+ |
| 0016 | Routing-graph source of truth | Whether the brief's section 17 graph is **generated from** a future `CampusDocument` v1 (`GEOMETRY_SPEC.md` section 4.2 already models walls, openings, spaces and verticals) rather than authored separately — `AGENTS.md` rule 4 forbids duplicate subsystems. | 5 |
| 0017 | PreToolUse hook proposal | A hook blocking file-edit tools outside `backend/`, its real limits (it cannot catch every shell command), verified against the current Claude Code hook syntax. **Proposed, never silently installed.** | any |

Numbers are reserved here and assigned on writing. The list grows as later phases
make real choices (optimisation solvers, LLM adapter, forecasting registry).
