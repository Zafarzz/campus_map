# ADR-0010: The timetable source is the university's public EduPage (aSc) export

- **Status**: `accepted` (source confirmed) / Phase 2 for the importer
- **Date**: 2026-10-17
- **Affects**: `app/domain/academic.py`, `scripts/fetch_edupage_timetable.py`,
  `app/adapters/imports/` (Phase 2)
- **Related**: brief section 10.1; `docs/privacy/timetable.md`

## Context

The brief's default assumption was a CSV template (section 24 Q1). The owner instead
supplied <https://aut.edupage.org/timetable/>, stating it holds the real data.

Investigated on 2026-10-17. It is an **EduPage** instance (`ASC.edupage="aut"`)
publishing an **aSc Timetables** export. The timetable viewer is a React
component that loads data from two unauthenticated JSON endpoints:

```
POST /timetable/server/ttviewer.js?__func=getTTViewerData
     {"__args":[null,2026],"__gsh":"00000000"}      -> list of published timetables

POST /timetable/server/regulartt.js?__func=regularttGetData
     {"__args":[null,"154"],"__gsh":"00000000"}     -> the full timetable (~429 KB)
```

The current published timetable is **`tt_num` 154, "26-27.Fall V5"**, valid from
2026-08-01. Four older ones are marked hidden.

What the payload actually contains (`r.dbiAccessorRes.tables`):

| table | rows | meaning |
|---|---|---|
| `periods` | 7 | 08:30–09:45, 10:00–11:15, 11:30–12:45, 13:30–14:45, 15:00–16:15, 16:30–17:45, 18:00–19:15 |
| `days` | 5 | Monday–Friday |
| `terms` | 1 | "Term 1" |
| `classrooms` | 56 | `A-101` … `F-DS_101_2`, with capacity in the name |
| `classes` | 82 | cohorts, e.g. `A24A` |
| `subjects` | 145 | |
| `teachers` | 75 | **real names** |
| `lessons` | 356 | subject × teacher(s) × class(es), with a weekly count |
| `cards` | 666 | placements: `lessonid` + `period` + a 5-bit weekday mask + `classroomids` |

## Decision

1. **EduPage is the primary timetable source.** The CSV/XLSX/ICS importers the
   brief describes remain, as the fallback for data EduPage does not carry.
2. **Mapping onto the domain** (already modelled in `app/domain/academic.py`):
   - aSc `lesson` → :class:`Section` + :class:`MeetingRule`;
   - aSc `card` → the rule's placement: `period` gives the local start time and
     duration, the `days` bitmask (`"10000"` = Monday) gives `BYDAY`, so the rule
     is `FREQ=WEEKLY;BYDAY=MO` with a timezone-aware `DTSTART`;
   - `classroomids` → `MeetingRule.room_id`, resolved through the room mapping
     below;
   - `classes` → `Section.cohort`;
   - `terms`/`periods` → :class:`Term` and the real lesson slots.
3. **Room codes need a mapping step, and it will not be clean.** Spot-checked
   against the seeded rooms:
   - `A-101…A-210`, `B-101…B-206`, `D-101…D-206` line up with the CAD-derived
     rooms directly;
   - `F-201`/`F-202` are the two amphitheatres — they match;
   - `E-DS_101_1…4` and `F-DS_101_1…2` are **subdivisions** of the single large
     studios `E-101` and `101-F`, which the floor plans model as one room each;
   - `CONFERENCE HALL-C` and `SPORT HALL-C` correspond to `room-c-conf` and a
     sports hall that is **not** in `knownBuildings` at all;
   - the timetable has no rooms for the North Building or the Dormitory.
   So the import will produce genuine "unknown room" entries. Per the brief these
   go in the validation report for a human — they are **not** to be auto-created,
   and `MeetingRule.source_room_code` exists to preserve the original code either way.
4. **Capacities are embedded in names** (`"PCLAB 102-A (48)"`, `"BIG 101-D (72)"`)
   and sometimes disagree with the CAD-derived capacity (`A-102`: 48 here, 36 from
   the plan). The plan wins for geometry; the discrepancy becomes `needs_review`
   rather than a silent overwrite (`GEOMETRY_SPEC.md` section 5.4).
5. **Snapshots are fetched on demand and never committed.**
   `scripts/fetch_edupage_timetable.py` writes to `backend/data/snapshots/`, which
   is gitignored, because the payload contains 75 teachers' real names. See
   point 7 and `docs/privacy/timetable.md`.
6. **Imports stay dry-run-first**, batched and reversible, exactly as the brief
   requires: nothing is written until a human confirms the validation report.
7. **Teacher names are public but still personal data.** They are published on
   that page by the university, so collecting them is proportionate for showing
   "who teaches here". But: analytics must never group by teacher name
   (brief section 21.2), the no-show view is by course or department only, and
   `Section.teacher_ref` holds a pseudonymous handle with the display name living
   on an `AppUser` row only when that teacher actually has an account.
8. **`__gsh=00000000` is what the page itself sends.** No credential is involved
   and no login is performed. If EduPage later requires one, the importer must
   stop and ask rather than attempt to work around it.

## Alternatives rejected

- **Scrape the rendered HTML.** Rejected: the viewer renders client-side, so there
  is no server-rendered table to scrape, and the JSON is both complete and stable.
- **Ask for a CSV export instead.** Rejected as the primary path: the JSON is
  richer (it has the period grid, cohorts and the teacher/room assignment) and
  needs no human in the loop to refresh.
- **Treat EduPage as the live source on every request.** Rejected: it is a
  third-party service with no SLA to us. Import into our own tables on a
  schedule, which is also what makes the time machine and history possible.
- **Commit a snapshot as a test fixture.** Rejected on privacy grounds. Phase 2
  will add a small **anonymised** fixture (synthetic teacher names) for tests.

## Consequences

- Phase 2's importer has a known, inspected shape to target rather than a
  hypothetical CSV.
- `mapConfig.schedule.slots` in the front end (six 80-minute slots from 09:00) is
  **not** the real grid (seven 75-minute slots from 08:30). The front end's own
  comment already calls it a TODO. Correcting it is a front-end change and
  therefore a proposal for the owner; the backend will serve the real slots.
- The room-mapping table is a Phase 2 deliverable and will need the owner's input
  for the studio subdivisions and the sports hall.
