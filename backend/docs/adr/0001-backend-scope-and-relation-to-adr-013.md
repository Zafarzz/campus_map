# ADR-0001: Backend scope, and how it relates to ADR-013 ("no separate backend")

- **Status**: `accepted` — the repository owner approved this on 2026-10-17, and
  additionally asked that the front end read its data from the database
  ("the data in the front should come from the database"), which this ADR's
  point 3 anticipated as optional. The seam switch itself remains a front-end
  edit requiring per-change approval; see `../PROPOSED_ROOT_CHANGES.md` P-1.
- **Date**: 2026-10-17
- **Affects**: everything in `backend/`; nothing outside it
- **Related**: `docs/DECISIONS.md` ADR-013, ADR-003, ADR-004, ADR-008; `docs/GEOMETRY_SPEC.md` §4.1;
  `docs/ARCHITECTURE.md` §1; `backend/docs/PROJECT_UNDERSTANDING.md` §6 C-1 and C-2

## Context

The repository's own decision log contains:

> **ADR-013: Файловое хранилище документов в репозитории без отдельного бэкенда** — status `proposed`.
> *"Для работы карты не требуется динамическая база данных. Стек Vite + статический хостинг прост и надёжен."*
> *"Хранить JSON-документы прямо в git-репозитории."*

`docs/GEOMETRY_SPEC.md` §4.1 repeats it — *"Отдельный бэкенд не нужен (ADR-013)"* — and
`docs/ARCHITECTURE.md` §1 records as fact: *"Бэкенд | отсутствует; все данные — статические TS-модули."*

The owner has now asked for a Python/FastAPI/PostgreSQL backend covering timetables, room state,
evidence, bookings, crowds, tickets, energy, safety, routing, events, AI and analytics
(`backend/docs/MASTER_PROMPT.md`). Taken at face value, ADR-013 reads as a prohibition on exactly that.
`AGENTS.md` §4 rule 7 forbids me from silently picking an interpretation, so this ADR states one openly.

Three facts shape the reading:

1. **ADR-013's subject is geometry authoring.** Its context is where `CampusDocument` JSON lives and how
   the Stage-B editor persists edits; its consequence is *"Нет внешних зависимостей от серверов БД; полная
   прозрачность версий через git."* It concludes that **the map's geometry** needs no server. It says
   nothing about timetable imports, bookings, attendance, crowd reports, tickets, alerts or analytics —
   none of which can be served from static files committed to a git repository.
2. **ADR-013 is `proposed`, not `accepted`.** `AGENTS.md` §4 rule 6 protects only `accepted` decisions
   from change without a new ADR. ADR-013 has not been confirmed by a human.
3. **Precedence.** `MASTER_PROMPT.md` §0.5 ranks `docs/` above the master prompt, but ranks
   *"My latest message to you"* first. The owner's instruction is to build the backend.

## Decision

1. **Geometry authoring stays exactly as ADR-013 describes it.** `CampusDocument` / `EditorDocument`
   JSON remains file-based in the repository, versioned by git. The backend does **not** become the
   source of truth for walls, footprints, the datum or the render contract. ADR-003's
   `CampusGeometryProvider` boundary is untouched.
2. **The backend owns *operational* data only** — the things that change through the day and cannot live
   in a committed file: timetable imports and materialised meetings, room state over time, evidence
   signals, bookings, attendance, tickets, crowd reports, notifications, events, metrics and history.
3. **The front end keeps working with no backend running.** Today it reads static TS modules; after this
   backend exists it still does, until someone deliberately changes one of the seams documented in
   `FRONTEND_CONTRACT.md` §2 (`loadLessonsForDate`, `loadCampus`). The backend is additive.
4. **Scope narrowing is recorded here, not by editing ADR-013.** `docs/DECISIONS.md` is not modified.
   If the owner wants ADR-013 formally amended or superseded, that is a root change and will be written
   as a proposal in `backend/docs/PROPOSED_ROOT_CHANGES.md` for approval.
5. **The backend is outside the ADR-004 A→B→C gate.** It neither produces nor consumes Stage A/B/C
   artefacts and touches no file in that pipeline, so the gate does not block it. (Noted as open
   question Q-B1; the owner's answer settles it.)
6. **No duplicate subsystems** (`AGENTS.md` §4 rule 4). Where the repository already models something —
   IDs and `legacyIds` (ADR-008), provenance/`needsReview` (`GEOMETRY_SPEC.md` §2), two-level validation
   (ADR-011), connectors as non-buildings (ADR-020) — the backend reuses that vocabulary rather than
   inventing a parallel one. In particular, if `CampusDocument` v1 ever materialises, the routing graph
   of `MASTER_PROMPT.md` §17 should be **derived from it** (see planned ADR-0014).

## Alternatives rejected

- **Treat ADR-013 as a veto and refuse the work.** Rejected: it is `proposed`, its scope is geometry
  authoring, and the owner's instruction outranks it (§0.5 item 1). Refusing would also leave every
  requested feature unbuildable, since none of them can be served from static files.
- **Declare ADR-013 superseded and edit `docs/DECISIONS.md`.** Rejected: that file is outside `backend/`,
  and §0.2 rule 3 forbids modifying it without explicit approval. It is also unnecessary — the two
  decisions do not actually collide once scope is stated.
- **Make the backend the source of truth for geometry too.** Rejected: it would break ADR-003's render
  contract boundary, duplicate the Stage-A/B pipeline, and remove the git-transparency ADR-013 values.
- **Put the backend outside this repository.** Rejected: the owner asked for `backend/` next to the front
  end, and co-location keeps the ID contract and the seed source in one place. The folder is
  self-contained and can be deleted without affecting anything else (§0.3).

## Consequences

- Two storage models coexist by design: files-in-git for geometry, PostgreSQL for operational data.
  Documentation must keep saying which is which, or a future agent will try to unify them.
- The front end gains an optional data source, not a dependency. "Works with the backend down" is a
  property worth keeping and testing.
- If the owner rejects this ADR, Phase 1 stops and the brief needs rescoping — which is why it is
  `proposed` and raised in the Phase 0 report rather than assumed.
