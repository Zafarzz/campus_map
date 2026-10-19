# ADR-0007: Seed by re-deriving the front end's room inventory, read-only

- **Status**: `accepted` — implemented in Phase 1
- **Date**: 2026-10-17
- **Affects**: `app/adapters/frontend/`, `scripts/extract_frontend_campus.py`,
  `scripts/seed_demo_campus.py`, `app/services/seed_service.py`,
  `data/frontend_campus_inventory.json`
- **Related**: brief section 9 ("Demo data"); ADR-0008

## Context

The brief says to seed from the front end's existing demo data with a script that
only **reads** the front-end files, keeping identifiers stable, and to fall back to
a synthetic campus if that cannot be done safely.

The difficulty: the front end's room list is not a data file. `src/data/demo-campus.ts`
computes it, resolving each `(building, level)` pair through **five branches in
order**:

1. an official CAD floor plan from `floor-plans/index.ts` (11 floors);
2. explicitly named special rooms, ground floor only (`bld-i`);
3. replicate the level-2 plan onto levels above 2 (`bld-g` f3/f4);
4. room numbers known from the schedule, filtered by level (`bld-b` f2/f3);
5. two generated placeholders (`bld-a`, `bld-j`, `bld-i` f2).

Branches 3–5 mint index-based ids. Reproducing the ids therefore means
reproducing the branch logic exactly — there is no shortcut.

## Decision

1. **A tolerant literal parser, not regex and not Node.**
   `app/adapters/frontend/js_literal.py` is a small recursive-descent parser for
   the literal subset the data files use: object and array literals, all three
   quote styles with escapes, numbers, booleans, `null`/`undefined`, unquoted
   keys, trailing commas, both comment styles.
   - *Not regex*: the data is four levels deep and contains strings with commas
     and comments between entries. A regex would work until the front end is
     reformatted and then fail **silently**, which is the worst outcome for a
     seeder whose entire job is identifier fidelity.
   - *Not Node*: evaluating the front end's code means running its toolchain, and
     `node_modules/` is tracked in git — a package-manager invocation would dirty
     paths outside `backend/`, which the brief forbids.
2. **The parser refuses to evaluate expressions.** `capacity: DEFAULT * 2` raises
   `JsLiteralError` rather than guessing. A wrong capacity in the database is
   worse than a failed seed.
3. **`campus_extract.py` re-implements the five branches**, branch for branch,
   with the branch number recorded on each room for the seed report.
4. **The result is hashed and committed** to
   `data/frontend_campus_inventory.json`, and `tests/test_frontend_extract.py`
   fails if a fresh extraction disagrees. A front-end change is then a visible,
   deliberate event: review, `make extract`, `make seed`.
5. **The seeder is idempotent**, and that is the normal way to pick up a
   front-end change — not a one-shot bootstrap. Re-running updates in place,
   inserts what is new, and deletes rooms the front end dropped (reporting each,
   per `GEOMETRY_SPEC.md` section 5.3).
6. **`is_demo` mirrors the front end's `provenance`.** 18 of 101 rooms are
   generated placeholders and are flagged; the other 83 come from the CAD
   drawings in `Campus map (3).pdf` and are **not** flagged. The brief says to
   mark demo data, not to mislabel real data — and the front end renders its
   "Demo room" tag from exactly this distinction. A building is `is_demo` only
   when *all* of its rooms are (`bld-a`, `bld-j`).
7. **Read-only, structurally.** Every file is opened with `read_text`; there is no
   write path in the adapter. In the container, `../src` is mounted read-only, so
   the process is physically unable to modify the front end.
8. **The synthetic fallback is documented but unused.** Parsing works against the
   real files, and the fallback would cost identifier stability — the one thing
   the seeder exists to preserve. It stays the contingency plan if the front end
   ever moves to computed values the parser must refuse.

## Alternatives rejected

- **Hand-transcribe the inventory into JSON once.** Rejected: it would drift the
  first time the front end changed, with nothing to detect it.
- **Have the front end export its data.** Rejected: that is a front-end change,
  and a good one to propose later — but not something to do unilaterally.
- **A full TypeScript parser dependency.** Rejected: a large dependency to read
  four object literals. The subset parser is ~250 lines and fails loudly.
- **Seeding a synthetic campus from the start.** Rejected: the ids are the whole
  point (ADR-0008).

## Consequences

- The parser is coupled to the *style* of the front end's data files, not just
  their content. If someone introduces a computed value, the seed fails with a
  clear error and a human decides — the intended behaviour.
- The committed snapshot means the seeder can run without the front end present
  (`--from-snapshot`), which is what makes a container build or a CI job possible.
- 13 warnings are emitted on every extraction, for the floors whose ids are
  index-based. They are correct and should stay until the front end finishes its
  own migration to stable ids.
