# ADR-0008: The front end's identifiers are the contract; aliases are many-to-many

- **Status**: `accepted` — implemented in Phase 1
- **Date**: 2026-10-17
- **Affects**: `app/domain/spatial.py`, `app/services/campus_service.py`,
  `app/services/seed_service.py`
- **Related**: `docs/DECISIONS.md` ADR-008; `docs/GEOMETRY_SPEC.md` sections 1.6, 5;
  `backend/docs/FRONTEND_CONTRACT.md` section 4

## Context

The map's rooms are `bld-h-f1-a102`, its floors `bld-h-f1`, its buildings `bld-h`.
The timetable references rooms only by id. If the database minted its own ids, the
front end could never read from it without a rename — so the ids are the contract,
not an implementation detail.

Three complications in the real data:

1. **Two id generations coexist.** `src/data/floor-plans/index.ts` uses the stable
   `${floorId}-${slug(number)}` form that repository ADR-008 prescribes, with the
   old id kept in `legacyId`. But `src/data/demo-campus.ts` branches 3–5 still mint
   **index-based** ids (`bld-a-f1-r1`) that shift if an array is reordered —
   `GEOMETRY_SPEC.md` section 1.6 marks that format unstable. 36 of the 101 seeded
   rooms come from those branches.
2. **Legacy ids are not unique.** `bld-h-f2-r7` is declared as the `legacyId` of
   **both** `bld-h-f2-a207` and `bld-h-f2-a208` (`floor-plans/index.ts` lines 81
   and 86). This is real committed data, not a hypothetical.
3. **The letter in a building id is not the block letter.** `bld-a` is the North
   Building; Block A is `bld-h`.

## Decision

1. **Spatial primary keys are text, seeded from the front end**, not generated.
   `campus.id`, `building.id`, `floor.id`, `room.id` are exactly the front end's.
2. **`room_alias` is a composite-key, many-to-many table** keyed on
   `(alias, room_id)`. A `UNIQUE` constraint on `alias` alone would **reject the
   real seed data**, so there is none.
3. **Resolution order: a current id always wins.** `get_room()` looks up the
   primary key first, so an alias can never shadow a live room.
4. **An ambiguous alias is an error, never a guess.** It raises
   `AmbiguousAliasError` → HTTP **409** with both candidates listed. Returning
   either `A-207` or `A-208` would be silently wrong half the time, and the caller
   has no way to detect it. A loud 409 is strictly better than a quiet 50% error
   rate.
5. **The block letter is stored in `short_name`, never derived from the id.**
   Asserted by `tests/test_frontend_extract.py` against the mapping in
   `docs/PDF_INVENTORY.md` section 3.
6. **`sort_order` preserves array position** for buildings and rooms, because the
   front end renders lists in array order and the compat response must match.
7. **Index-based ids are recorded, not blessed.** The extractor warns for every
   floor whose ids come from branches 3–5 (13 warnings today), and the seed report
   repeats them, so their fragility stays visible.

## Alternatives rejected

- **Surrogate UUID keys with the front-end id as a secondary column.** More
  conventional, and genuinely better for a greenfield schema. Rejected because
  every join, every API path and every compat response would need a translation
  step whose only job is to undo the surrogate — complexity with no payoff while
  one campus and one client exist.
- **`UNIQUE(alias)` plus picking a winner** (lowest id, or the newest room).
  Rejected: it silently loses a room and manufactures a wrong answer.
- **Refusing to seed until the duplicate is fixed.** Rejected: the fix belongs to
  the front end, and blocking the whole backend on someone else's one-line data
  error would be disproportionate. It is raised as proposal **P-4** in
  `PROPOSED_ROOT_CHANGES.md` instead.
- **Normalising room numbers** (`A-102` → `a102`). Rejected:
  `GEOMETRY_SPEC.md` section 5.4 requires the number exactly as the source prints it,
  and a mismatch between plan and timetable must become `needs_review` for a human,
  not be silently reconciled.

## Consequences

- If the front end reorders an array in `demo-campus.ts`, some room ids change.
  The drift test fails, the owner decides, then `make extract && make seed`
  follows. That is the intended workflow, not an accident.
- Once the front end finishes migrating to stable ids everywhere, the warnings
  disappear on their own and no backend change is needed.
- Text primary keys are slightly larger than UUIDs in indexes. At 101 rooms this
  is irrelevant; at 1,000 it remains irrelevant.
