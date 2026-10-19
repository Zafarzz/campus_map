# ADR-0006: The compatibility layer is a contract, not a convenience

- **Status**: `accepted` — `/compat/campus` implemented in Phase 1
- **Date**: 2026-10-17
- **Affects**: `app/api/v1/compat.py`, `app/api/schemas/compat.py`,
  `app/services/compat_service.py`
- **Related**: brief sections 0.1 step 5 and 8; `backend/docs/FRONTEND_CONTRACT.md`

## Context

The owner's first requirement for this backend is that *the front end's data
comes from the database*. The front end currently reads static TypeScript modules
and makes **no HTTP calls at all** — there is no existing wire format to match,
only the in-memory shapes in `src/domain/campus/types.ts` and
`src/domain/schedule/types.ts`.

The brief's clean API (section 8) deliberately differs from those shapes:
snake_case, its own state names, provenance and confidence on everything. Making
the front end adopt that would mean editing it, which the brief forbids without
approval.

## Decision

Two API families, permanently distinct.

| | `/api/v1/...` | `/api/v1/compat/...` |
|---|---|---|
| Audience | new clients, dashboards, the assistant | the existing 3D map |
| Naming | snake_case | the front end's camelCase |
| States | `free`, `lesson_now`, ... | `AVAILABLE`, `CURRENT`, ... |
| Timestamps | offset-aware instants | offset-naive campus-local |
| Evolution | free | frozen by the front end's types |

Rules for anything under `/compat`:

1. **No renamed fields, no reordered enums, no new required fields.** A compat
   response must satisfy the front end's current TypeScript interfaces unchanged.
2. **Unset optional fields are omitted, never `null`.** The front end declares
   `name?: string`. A literal `null` would type-check and then render as the text
   "null" in the room card. Enforced by `response_model_exclude_none=True` and
   asserted in `tests/test_api.py`.
3. **Provenance rides alongside, never inside.** The brief requires provenance and
   confidence on every computed value; putting them into a field the map reads
   would change its shape. They go in a sibling `meta` object, or — where the body
   shape is fixed — in the `x-campus-source` and `x-campus-is-demo` headers. This
   is the same additive principle ADR-007 in `docs/DECISIONS.md` applies to the
   render model.
4. **One shape per endpoint.** `/compat/campus` returns `{campus, meta}`;
   `/compat/campus/bare` returns the bare `Campus`. Originally this was one route
   with `?bare=true`, which cannot be described by a single `response_model` — so
   FastAPI could not validate it. An unvalidated response is the last thing a
   compatibility contract should have.
5. **Compat is a projection, never a second implementation.** It calls the same
   service functions as the clean API and reshapes the result
   (`app/services/compat_service.py` has no queries of its own). `AGENTS.md`
   rule 4 forbids duplicate subsystems, and two code paths would drift.
6. **Not-yet-built endpoints return 501 with the phase named** — never an empty
   list. "No data" and "not built yet" must not look the same to a client.
7. **Identifiers are the front end's identifiers** — see ADR-0008.

## The seams, and how the front end switches

From `FRONTEND_CONTRACT.md` section 2, in increasing order of intrusiveness:

| Seam | Front-end function | Replaced by | Status |
|---|---|---|---|
| S2 | `loadCampus()` | `GET /compat/campus/bare` | **ready** |
| S1 | `loadLessonsForDate()` | `GET /compat/lessons?date=` | Phase 2 |
| S3 | `computeRoomStates()` | `GET /compat/room-states?at=` | Phase 2 |
| — | `liveCountByBuilding` memo | `GET /compat/live-counts?at=` | Phase 2 |

Each is a single `async` function body. **Switching one is a front-end edit and
therefore needs the owner's approval**; the backend's job is to make the diff as
small as possible, not to apply it.

## Alternatives rejected

- **Only the clean API, and change the front end.** Rejected: the brief makes the
  front end read-only and asks explicitly for a compatibility layer.
- **Only the compat API.** Rejected: it would freeze the backend's vocabulary to a
  prototype's, and the brief's later layers need provenance and confidence on
  values the front end has no field for.
- **GraphQL or a generic query endpoint.** Rejected: more surface, no benefit for
  a known, small set of shapes, and harder to pin with contract tests.
- **Version compat separately (`/compat/v1`).** Rejected for now: `/api/v1`
  already versions it. If the front end's types ever change incompatibly, that is
  the moment to introduce `/compat/v2` rather than mutate v1.

## Consequences

- The compat schemas must be updated in lockstep if the front end's types change.
  The drift test in `tests/test_frontend_extract.py` catches data changes; a
  *type* change is caught by the shape assertions in `tests/test_api.py`.
- Two names exist for the same concept (`AVAILABLE` / `free`). Documented in both
  schema modules so nobody "tidies" them into one.
