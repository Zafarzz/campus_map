# PROJECT_UNDERSTANDING

> Written in Phase 0, per `backend/docs/MASTER_PROMPT.md` §0.1 step 3.
> Baseline: branch `feat/backend`, cut from `main` at commit `c87f949` ("Merge pull request #4 from Zafarzz/feature/detailed-c-block").
> This file records what I understood from the repository **before** designing anything. It is evidence of reading, not a design document.
> Nothing outside `backend/` was modified to produce it.

---

## 1. Files read, in the order required by §0.1 step 2

| # | File | Lines | Language | Read |
|---|---|---|---|---|
| 1 | `AGENTS.md` | 81 | Russian | in full |
| 2 | `README.md` | 34 | English | in full |
| 3 | `docs/ARCHITECTURE.md` | 252 | Russian | in full |
| 4 | `docs/GEOMETRY_SPEC.md` | 381 | Russian | in full |
| 5 | `docs/IMPLEMENTATION_PLAN.md` | 322 | Russian | in full |
| 6 | `docs/DECISIONS.md` | 253 | Russian | in full |
| 7 | `docs/PDF_INVENTORY.md` | 84 | Russian | in full |
| 8 | `docs/import-reports/bld-h-f1.md` | 37 | Russian | in full |
| 9 | `docs/import-reports/bld-h-f2.md` | 28 | Russian | in full |
| 10 | `docs/import-reports/bld-g-f1.md` | 24 | Russian | in full |
| 11 | `docs/import-reports/bld-c-f1.md` | 27 | Russian | in full |
| 12 | `docs/import-reports/bld-b-f1.md` | 21 | Russian | in full |
| 13 | `docs/import-reports/bld-d-f2.md` | 19 | Russian | in full |
| 14 | `tools/README.md` | 5 | Russian | in full |

There is **no index or overview file** inside `docs/`; `AGENTS.md` §3 serves that role and was used as the reading order.
There is **no second `AGENTS.md` or any `CLAUDE.md`** anywhere in the repository (checked recursively, excluding `node_modules/`).

Convention files skimmed read-only for conventions (§0.1 step 2, last bullet): `package.json`, `tsconfig.json`, `vite.config.ts`, `.gitignore`. There is **no** `.env.example`, no Dockerfile, no `docker-compose.yml`, no `.github/` and no CI configuration of any kind in the repository.

Front-end source read read-only (detail in [FRONTEND_CONTRACT.md](FRONTEND_CONTRACT.md)): all of `src/domain/`, `src/data/`, `src/services/`, `src/state/`, `src/hooks/`, `src/config/`, plus `src/App.tsx`, the UI panels, `src/components/3d/Campus.tsx`, and the `src/editor/` domain, storage and types.

---

## 2. What the product is, in my own words

An interactive **3D map of the Ajou University in Tashkent (AUT) campus**, built as a browser app (Vite + React 19 + TypeScript + Three.js via `@react-three/fiber`). `AGENTS.md` §1 states its purpose as *visual navigation across buildings and floors, finding rooms, and showing room occupancy from the timetable in real time*.

Who it is for: students and visitors navigating campus, and (implicitly, via the 2D editor and the `import-reports` workflow) the staff and agents who author campus geometry.

The current state, as `AGENTS.md` §1 puts it: complete exterior 3D geometry of the blocks, roads and surroundings; **approximate procedural interiors**; and official PDF architectural plans available as the source for exact interiors. Room occupancy is driven by a **deterministic fake schedule**, not a real one (`src/data/demo-schedule.ts`, header comment: *"DEMO SCHEDULE — fully invented, deterministic per date. Replace with a real schedule source (e.g. EduPage) via `services/schedule`."*).

That last comment is the clearest statement in the repository that a real data source is expected to arrive behind `src/services/`, which is exactly the seam this backend should fill.

### 2.1 The project's own staged roadmap (not the backend's)

`AGENTS.md` §1 "Утверждённая последовательность этапов проекта" and [ADR-004](../../docs/DECISIONS.md) fix a **non-negotiable order** for the front-end work:

1. **Stage A — exact floor plans**: move wall/room/corridor/door geometry from PDF into one data format, keeping timetable links and 3D display.
2. **Stage B — 2D Edit Mode**: a separate top-down vector editing mode, synchronised with 3D instantly.
3. **Stage C — visual improvement**: photorealistic facades and roofs, natural lighting, shadows, deterministic greenery.

`AGENTS.md` §1 marks this with `[!IMPORTANT]`: *"Запрещено переходить к Этапу B до приёмки Этапа A. Запрещено переходить к Этапу C до приёмки Этапа B."* ("Moving to Stage B before Stage A is accepted is forbidden; to Stage C before Stage B is accepted is forbidden.")

**My reading:** this ordering governs the *front-end geometry pipeline*. It says nothing about a backend, and the backend neither produces nor consumes Stage A/B/C geometry artefacts. I treat the backend as an **orthogonal workstream** that touches no file in that pipeline. This is listed as open question **Q-B1** in §7 because it is my interpretation, not something the docs state.

---

## 3. Architecture and implementation guidance given in the repo's docs

### 3.1 Hard architectural rules I must respect

| Rule | Source | What it means for the backend |
|---|---|---|
| Units are **metres**; axes `X`=east, `Y`=up, `Z`=south (north = `-Z`); `Vec2 = [x, z]` | [ADR-001](../../docs/DECISIONS.md) `accepted`; `GEOMETRY_SPEC.md` §1.1 | If the backend ever stores or returns coordinates, it uses exactly this frame. No alternative axis system. |
| **Campus datum frozen numerically**: world origin = centre of `public/reference/campus.jpg` (703×1024 px) at 0.3 m/px | [ADR-002](../../docs/DECISIONS.md) `accepted`; `GEOMETRY_SPEC.md` §3.2 | Any geometry the backend serves is in this frame. Geodetic (WGS84) linkage, if ever added, is an **offset in metadata**, never a shift of the scene origin. |
| `CampusGeometry` / `CampusGeometryProvider` is the **stable render contract** | [ADR-003](../../docs/DECISIONS.md) `accepted`; `src/domain/geometry/types.ts` | A backend-fed geometry source must appear to the front end as *another provider*, not as a change to the renderer. |
| Stage order A → B → C | [ADR-004](../../docs/DECISIONS.md) `accepted` | See §2.1 and Q-B1. |
| Building visual styles live in **data, not `switch(building.id)`** | [ADR-015](../../docs/DECISIONS.md) `accepted` | If the backend ever serves building metadata, it carries `appearance`/`appearancePreset` as data. |
| **No external CDNs**; all 3D assets local | [ADR-018](../../docs/DECISIONS.md) `accepted` | The backend must not introduce a client-side CDN dependency either. Self-hosted assets only. |
| Inter-building passages are a **separate entity**, not buildings | [ADR-020](../../docs/DECISIONS.md) `accepted` | `connector` is its own concept in my domain model: no floors, no rooms, not searchable, not selectable. |
| Stable IDs, with a `legacyIds` alias table | [ADR-008](../../docs/DECISIONS.md) `proposed`; `AGENTS.md` §5; `GEOMETRY_SPEC.md` §5.3 | The backend's room/building IDs must be the front end's IDs, and must carry legacy aliases so the timetable keeps resolving. |
| Two-level validation (`error` blocks, `warning` reports) | [ADR-011](../../docs/DECISIONS.md) `proposed`; `GEOMETRY_SPEC.md` §7 | The backend's own import validation should mirror this shape (`{errors, warnings}`), which happens to match the master prompt's dry-run import report (§10.1). |
| Nothing invented: anything not in a source is marked `provenance: 'demo'` or `needsReview` | `GEOMETRY_SPEC.md` §2 principle 6 | Aligns exactly with the master prompt §3.5 (`is_demo`, provenance, confidence). The project already has this instinct; I extend the same vocabulary. |

### 3.2 The golden rules for agents (`AGENTS.md` §4)

Ten rules. The ones that bind this work most:

- Rule 2: **do not re-audit the repository** if `docs/ARCHITECTURE.md` already records it — use the existing conclusions. (I did reuse them; where the code has since diverged from the audit, I record it in §6 rather than silently redoing the audit.)
- Rule 4: **do not create alternative architectures, data formats or duplicate subsystems.**
- Rule 7: **report conflicts between docs and code as an open question instead of choosing an interpretation myself.** This is the single most important rule for Phase 0 and is why §6 exists.
- Rule 8: **change only files belonging to the assigned task**; no drive-by refactors or reformatting.
- Rule 9: preserve existing comments, TODOs and architectural notes.
- Rule 10: **every step ends with a report**: files changed, test results, limits found, recommended next step.

`AGENTS.md` §6 "Правила проверки и тестирования" requires, before finishing any task: `npm run typecheck`, `npm test`, a clean git status, and data validation if geometry files changed. **For backend-only work the first two are front-end commands.** Running them is read-only with respect to the working tree, but `npm test`/`tsc` require `node_modules`, which is **tracked in git** (8,112 files) — so `npm install` would dirty tracked paths outside `backend/` and is therefore forbidden by master prompt §0.2.1/§0.2.7. See Q-B2.

### 3.3 The target architecture the docs describe

`docs/ARCHITECTURE.md` §7 sketches the post-A/B/C architecture: a versioned **`CampusDocument` v1** (JSON, one file per building) as the single source of geometry and room metadata; a `DocumentStore` publishing a revision number; `MapProvider` recomputing `Campus`, `CampusIndex` and `CampusGeometry` memoised on that revision; a Stage-B editor mutating the document only through commands; and a `DocumentGeometryProvider` turning the document into the unchanged render contract.

`GEOMETRY_SPEC.md` §4.2 gives the full schema (`CampusDocument`, `BuildingDoc`, `FloorDoc`, `WallDoc`, `OpeningDoc`, `SpaceDoc`, `VerticalDoc`, `SourceDoc`, `CalibrationDoc`). §9.1 gives the v0→v1 migration with a bit-exact correctness criterion.

**Why this matters to the backend:** `SpaceDoc`/`FloorDoc`/`WallDoc`/`OpeningDoc`/`VerticalDoc` is a near-complete description of what the master prompt §17 calls the **routing graph** (doors as shared nodes, stairs/lifts as vertical connectors). If the project ever produces these documents, the backend's routing graph should be *derived from them*, not hand-authored in parallel — otherwise I would be creating the duplicate subsystem `AGENTS.md` rule 4 forbids. I will record this as a backend ADR.

---

## 4. Vocabulary (as the repository uses it)

### 4.1 Spatial

| Term | Meaning in this repo | Defined in |
|---|---|---|
| **campus** | one campus, id `ajou-tashkent`, name "Ajou University in Tashkent" | `src/data/campus-structure.ts` |
| **building / block / корпус** | a top-level structure, id `bld-<letter>`. "Block" is the user-facing word ("Block A"), `корпус` the Russian equivalent | `campus-structure.ts`, `PDF_INVENTORY.md` §3 |
| **floor / этаж** | id `${buildingId}-f${level}`, `level: 1` = ground floor, basements would be `0`/negative | `src/domain/campus/types.ts`, `GEOMETRY_SPEC.md` §5.2 |
| **room / помещение / аудитория** | id per §5.2, has `number` (as printed in the source, e.g. `A-102`), optional `name`, `kind`, `capacity`, `provenance` | `src/domain/campus/types.ts` |
| **`RoomKind`** | exactly `classroom | lab | office | hall | other` | `src/domain/campus/types.ts` |
| **space (`SpaceKind`)** | the Stage-A superset of "room": `room | corridor | hall | lobby | stair | elevator | wc | technical | storage | shaft | other`. Only spaces with a `room` block become domain rooms; corridors/stairs/WCs are **not** searchable and have no timetable | `GEOMETRY_SPEC.md` §4.2, §5.4 |
| **footprint** | `{type:'rect', center, size, rotation?}` or `{type:'polygon', points}` in metres | `src/domain/geometry/types.ts` |
| **part** | one rectangle/polygon of a multi-part building (`bld-a` is a U-shape of 3 parts) | `reference-footprints.ts` |
| **connector** | enclosed ground-level passage between two buildings; `kind: 'enclosed-corridor'`; **not a building** | [ADR-020](../../docs/DECISIONS.md) |
| **context feature** | non-interactive surroundings: `track | pitch | court | lawn | road | structure` | `src/domain/geometry/types.ts` |
| **vertical** | stair / elevator / ramp / escalator linking floors of one building | `GEOMETRY_SPEC.md` §4.2 `VerticalDoc` |
| **КПП** | gate / security checkpoint (context `structure`; `kpp-n`, `kpp-w`, `kpp-sw`, `kpp-e`) | `reference-footprints.ts`, [ADR-022](../../docs/DECISIONS.md) |
| **datum** | the frozen world origin | [ADR-002](../../docs/DECISIONS.md) |
| **yaw** | rotation in radians about `+Y`, three.js `rotation.y` convention; positive = counter-clockwise on a north-up map | `GEOMETRY_SPEC.md` §3.3 |
| **precision** | render contract: `approximate | surveyed`. Document model adds `plan`: *approximate* = traced from satellite or procedural, *plan* = from an official drawing, *surveyed* = measured on site | `src/domain/geometry/types.ts`; `GEOMETRY_SPEC.md` §4.2 |
| **provenance** | `confirmed` (official source) or `demo` (prototype placeholder, must be replaced) | `src/domain/campus/types.ts` |

### 4.2 Time and state

The front end's room states are **not** the five names used in the master prompt §10.2. The repository's own union is (`src/domain/schedule/types.ts`):

| Repo `RoomStatus` | UI label (`mapConfig.statusLabels`) | Colour | Master prompt §10.2 name |
|---|---|---|---|
| `AVAILABLE` | "Free" | `#3fae7a` green | `free` |
| `CURRENT` | "Lesson now" | `#e5534b` red | `lesson_now` |
| `UPCOMING` | "Starts soon" | `#f0a431` amber | `starts_soon` |
| `FINISHED` | "Done for today" | `#8b93a7` grey | `done_for_today` |
| `CANCELLED` | "Cancelled" | `#9b6cf0` purple | `cancelled` |

The **UI labels and colours match the master prompt §2.1 exactly**; only the enum spellings differ. The compatibility layer must return the repo's `SCREAMING_CASE` names; the clean API may use the prompt's `snake_case`.

Other time vocabulary: **`Lesson`** (not "meeting") with `roomId`, `subject`, `teacher?`, `group?`, `startsAt`/`endsAt` as ISO strings, `cancelled?`. **`RoomScheduleState`** = `{status, current?, next?, lessons[]}`. **Live / Simulate** = `TimeMode = {mode:'live'} | {mode:'simulated', minutes}` where `minutes` is minutes since local midnight. **"N live"** badge = count of rooms in `CURRENT` per building.

### 4.3 Process vocabulary

- **ADR** — numbered decision record in `docs/DECISIONS.md` with status `accepted` / `proposed` / `superseded`.
- **import report** — one Markdown file per imported floor in `docs/import-reports/<floorId>.md` (`AGENTS.md` §5, `GEOMETRY_SPEC.md` §8.3).
- **Human Checkpoint** — a mandatory human acceptance gate (#1 after the pilot floor, #2 after bulk import, #3 after the editor).
- **TD-n** — technical-debt item in `docs/ARCHITECTURE.md` §6.
- **Q-n** — blocking open question in `docs/IMPLEMENTATION_PLAN.md`.
- **needsReview** — a string field marking data a human must check.

---

## 5. Decisions already made (so I do not re-decide them)

**`accepted` ADRs** — 001 (units/axes), 002 (datum), 003 (render contract), 004 (stage order), 015 (appearance in data), 018 (no CDNs), 020 (connectors), 021 (CAD-accurate facades for Blocks B and C), 022 (main entrance/КПП ensemble), 023 (grand fountain), 024 ("I ♥ AJOU" art object), 025 (gold AUT emblem), 026 (fountain water animation), 027 (palm promenade).

ADRs 021–027 are purely visual/geometric and have **no backend implication** beyond "do not touch those files".

**`proposed` ADRs** — 005 (`CampusDocument` JSON), 006 (building local frames + yaw), 007 (additive render model for floor plans), 008 (stable IDs + `legacyIds`), 009 (shell vs interior), 010 (no implicit interior scaling), 011 (two-level validation), 012 (**no CV/ML PDF recognition** in Stage A), 013 (**file storage in the repo, no separate backend**), 014 (command pattern + `DocumentStore`), 016 (mandatory pilot floor), 017 (SVG for 2D edit mode), 019 (`tools/` instead of `scripts/`).

**Resolved open questions** (`IMPLEMENTATION_PLAN.md`): **Q1** (PDFs — `Campus map (3).pdf` at root, 6 slides, audited into `docs/PDF_INVENTORY.md`; raster CAD exports, not vector) and **Q3** (building ID ↔ block mapping, table below).

**Still-open questions that matter to the backend**: **Q2** (which footprint layout is authoritative — satellite vs master-plan), **Q4** (no calibrated `metersPerPixel`; 0.3 is an estimate from the sports pitch), **Q5** (real floor heights; 3.6 m is assumed for every floor of every building), **Q6** (basements/mezzanines unverified).

### 5.1 The authoritative building ↔ block mapping (`PDF_INVENTORY.md` §3, Q3 resolved)

| PDF label | Code ID | Name | Floors (PDF) | Real dimensions (PDF) |
|---|---|---|---|---|
| Building A | `bld-h` | Block A (Main Building) | 2 | 66.0 × 18.0 m |
| Building B | `bld-g` | Block B | 4 | 60.0 × 15.0 m |
| Building D | `bld-c` | Block D | 2 | 78.0 × 18.0 m |
| Building E | `bld-b` | Block E | 4 | 60.0 × 18.0 m |
| Building F | `bld-d` | Block F | 2 | 60.0 × 21.0 m |
| Building C (Sport Hall) | `bld-e` | Block C (Sports Complex) | 2 | — |
| Building C (Conference) | `bld-f` | Block C (Conference Hall) | 2 | — |
| Building C (Canteen) | `bld-i` | Block C (Canteen) | 2 | — |
| Dormitory | `bld-j` | Dormitory | 4 | — |
| North Building | `bld-a` | North Building | 4 | — |

**The letter on screen is not the letter in the ID.** `bld-a` is *not* Block A; Block A is `bld-h`. Every backend seeder, fixture, test and document must use the table above, and the backend must never re-derive this mapping from the ID string.

---

## 6. Contradictions and gaps found

Reported here rather than resolved, per `AGENTS.md` §4 rule 7. Each has a proposed resolution and a precedence justification (master prompt §0.5).

### C-1 — ADR-013 says "no separate backend"; this project is a backend

> `docs/DECISIONS.md`, **ADR-013: Файловое хранилище документов в репозитории без отдельного бэкенда** — status **`proposed`**: *"Для работы карты не требуется динамическая база данных… Хранить JSON-документы прямо в git-репозитории."* ("The map needs no dynamic database… store JSON documents directly in the git repository.") Echoed by `GEOMETRY_SPEC.md` §4.1: *"Отдельный бэкенд не нужен (ADR-013)"*, and recorded as fact in `ARCHITECTURE.md` §1: *"Бэкенд | отсутствует; все данные — статические TS-модули."*

**This is the single most important conflict in Phase 0.**

Why I believe it is reconcilable rather than a veto:

1. **Scope.** ADR-013's context is explicitly the *authoring* of geometry documents — where `CampusDocument` JSON lives and how the Stage-B editor saves it. It concludes that **geometry authoring** needs no server. It makes no claim about timetables, bookings, attendance, tickets, crowd reports, alerts or analytics, none of which can be served from static files in a git repository.
2. **Status.** It is `proposed`, not `accepted`. `AGENTS.md` §4 rule 6 protects only `accepted` decisions from silent change, and ADR-013 has not been confirmed by a human.
3. **Precedence.** Master prompt §0.5 ranks `docs/` above the master prompt — but item 1 is *"My latest message to you"*, and the user's instruction is to build this backend. §0.5's own exception also applies in spirit: where the docs would block the task given to me, I follow the instruction and tell you.

**Proposed resolution, for your approval:** keep ADR-013 intact and untouched for geometry authoring; record a **new backend ADR (`backend/docs/adr/0001`)** that narrows its scope explicitly — *geometry documents stay files in git; live operational data lives in PostgreSQL behind the backend* — and keep the front end able to run with zero backend (static files) as it does today. I will **not** edit `docs/DECISIONS.md`; if you want ADR-013 formally amended, that is a proposed root change (`PROPOSED_ROOT_CHANGES.md`) for you to approve.

### C-2 — ADR-004's stage gate vs. starting backend work now

ADR-004 (`accepted`) forbids starting Stage B before Stage A is accepted, and Stage C before Stage B. Stage A is **not** formally accepted: `IMPLEMENTATION_PLAN.md` task A6 requires Human Checkpoint #1, and Q2 (authoritative footprint layout) is still listed as blocking A4/A6.

Yet the working tree contains substantial **Stage B** code (`src/editor/`, 7 components + command history + IndexedDB storage + validator) and **Stage C** code (ADRs 021–027, facades, fountain, entrance ensemble). So the repository has, in practice, already moved past the gate.

**Proposed resolution:** the backend is outside A/B/C and does not consume or produce their artefacts, so ADR-004 does not gate it. I will not touch anything in the A/B/C pipeline. Flagged as **Q-B1** because this is my interpretation. (Note: the Stage-B/C work already present is not mine and I make no judgement about it.)

### C-3 — `docs/ARCHITECTURE.md` is stale in six specific ways

The audit is dated 2026-10-14 on commit `01c4265` of branch `feature/detailed-c-block`; the current `main` is `c87f949`. `AGENTS.md` §4 rule 2 tells me to reuse its conclusions, so the divergences matter:

| ARCHITECTURE.md claim | Current reality |
|---|---|
| §1 *"vitest `^5.0.3` — **тестовых файлов нет**, `npm test` завершается с кодом 1"* | `src/__tests__/` contains **12** test files. (TD-13 is stale.) |
| §2 *"`campus-structure.ts` … (10 зданий bld-a…bld-j)"* | `knownBuildings` has **8** entries. `bld-e` and `bld-f` have footprints in `reference-footprints.ts` but are **not** in `knownBuildings`, so they render as nothing and appear nowhere in the UI. |
| TD-14 *"`node_modules/` и `dist/` закоммичены, `.gitignore` нет"* | `.gitignore` **exists** and lists `node_modules/` and `dist/`, but both are **still tracked** (8,112 + 5 files). Adding the file did not untrack them. |
| TD-15 *"Неотслеживаемый пустой файл `scripts` в корне"* | The file is **gone**; `tools/` exists with a README. ADR-019's stated reason no longer holds, though its decision stands. |
| §2 module tree | Does not mention `src/editor/`, `src/data/floor-plans/`, `src/domain/appearance/`, `src/components/3d/facades/`, `src/components/3d/fountain/`, `src/components/3d/tuning/` — all of which exist. |
| §1 *"Линтер не настроен"* | Still true: no eslint in `package.json`, but `MapProvider.tsx:83` carries an `eslint-disable` comment. |

**Proposed resolution:** none required of me — I simply do not rely on the stale items. I am **not** editing `docs/ARCHITECTURE.md`. If you want it refreshed, that is a front-end/doc task for a Stage agent, and I can draft it into `PROPOSED_ROOT_CHANGES.md` on request.

### C-4 — `README.md` describes a branch that does not exist

`README.md` §"🔀 Branches & Campus Layout Context" describes `experiment/detailed-buildings` with C Block merged into one 4-storey building. `ARCHITECTURE.md` TD-16 already records that this branch exists neither locally nor on `origin`. The README also states *"C Block is not a single building. It is a cluster of three structures (Indoor Courts, Conference Hall, Canteen)"* — but `knownBuildings` now has a **single** `bld-i` described as *"Block C (Conference hall, canteen, classrooms)"*, while `PDF_INVENTORY.md` §3 still lists three separate C entries (`bld-e`, `bld-f`, `bld-i`). **Resolution: I take `campus-structure.ts` as the truth for what the running app contains, and `PDF_INVENTORY.md` for naming.** Q-B3.

### C-5 — `bld-i`'s identity is described three different ways

- `PDF_INVENTORY.md` §3: `bld-i` = **"Block C (Canteen)"**.
- [ADR-020](../../docs/DECISIONS.md): *"Главный холл / конгресс-холл размещен внутри северной части корпуса C (`bld-i`)"* — the **main/congress hall** is inside `bld-i`'s north part, where both connectors converge.
- `campus-structure.ts`: `bld-i` = "Block C", *"Conference hall, canteen, classrooms"*; and `src/data/floor-plans/index.ts` gives it **both**: `room-c-conf` ("Conference Hall & Main Lobby", north) and `room-canteen` ("Canteen & Dining Hall", south).

These are reconcilable — one building holding both functions — but the documents disagree on the label. **Resolution: `bld-i` is one building containing both a conference hall and a canteen.** No backend decision depends on the label.

### C-6 — Two room-ID generations coexist, and one collides

`GEOMETRY_SPEC.md` §1.6 marks `${buildingId}-f${level}-r${i+1}` as **unstable** ("зависит от порядка в массиве") and ADR-008 + §5.2 prescribe `${floorId}-${slug(number)}`. Both are live right now: `src/data/floor-plans/index.ts` uses the stable form (`bld-h-f1-a102`) with the old ID in `legacyId`, exactly as ADR-008 wants — but `src/data/demo-campus.ts` branches 3–5 still mint index-based IDs for every floor without a confirmed plan.

Worse, the `legacyId` values are **not unique**: in `floor-plans/index.ts`, `bld-h-f2-r7` is claimed by both `bld-h-f2-a207` (line 81) and `bld-h-f2-a208` (line 86). A naive `legacyId → id` alias map would silently drop one of them.

**Resolution:** the backend stores the canonical ID as primary and legacy aliases in a **many-to-many** alias table, resolves ambiguous aliases to an explicit error rather than a guess, and reports every duplicate in the seed report. Flagged for your attention; the fix belongs to the front end, not to me.

### C-7 — The master prompt's §2.1 description of the front end is partly wrong

§2.1 (itself written from a screenshot and labelled as possibly wrong) lists buildings *"Dorm (4F), A (4F), B (4F), C (2F, several structures), D (4F), E (4F), F (2F), N (4F)"*. The repository says: Dorm 4, **A 2**, B 4, C 2, **D 2**, E 4, **F 2**, N 4. The authoritative floor counts are in `campus-structure.ts` and `PDF_INVENTORY.md`. Also, the prompt says *"floor counts are not yet confirmed"*, while the live UI text (`MapControls.tsx:65`) says *"floor counts **are** confirmed"*. I use the repository.

### C-8 — Gaps: things the master prompt needs that the repo has none of

| Needed by | Missing in repo |
|---|---|
| §9 Security, §24 Q3 | Any authentication, user, role or session concept. No OIDC issuer, no email domain, no user data of any kind. |
| §9 Time, §10.1 | Any **timezone** declaration. `demo-schedule.ts` writes naive local ISO strings (`2026-10-17T09:00:00`, no offset) and `useNow`/`toLocalDateKey` use the **browser's** local time. The campus IANA zone (`Asia/Tashkent`) is nowhere stated in the repository. Master prompt §24 Q1 says the timezone is *"a required setting with no assumed default"*. **This blocks nothing in Phase 1 if I make it a required config value with no default — which is what I will do.** |
| §9 i18n | No message catalogues. UI strings are hard-coded English; the docs, code comments and some UI buttons are Russian. Both languages are in active use. |
| §10.1 | No real timetable, no term dates, no holidays, no course/section/enrolment data, no teacher identities (the demo uses invented names). Lesson slots in `mapConfig.schedule.slots` are marked *"TODO: Replace with the university's real lesson slots."* |
| §10.4, §12, §14 | No booking, ticket, attendance, crowd-report or notification concept anywhere. |
| §17 | No routing graph, no path-finding. `ARCHITECTURE.md` §5: *"Маршрутизации и поиска пути нет, графа проходов нет."* Also no deep links / URL state. |
| §0.4, §5 | No Python, no PostgreSQL, no Docker, no `.env.example`, no CI. The backend brings all of these, inside `backend/`. |
| §9 Privacy | No privacy or retention documentation, and no personal data to protect yet. |

### C-9 — `AGENTS.md` §6 asks for front-end commands I may not be able to run

Discussed in §3.2 above. `npm run typecheck` and `npm test` would need `node_modules`, which is tracked. I will not run `npm install`. See **Q-B2**.

---

## 7. My open questions (backend-specific)

These are additional to the master prompt §24 list and are raised in the Phase 0 report:

- **Q-B1** — Do you agree the backend sits outside the ADR-004 A→B→C gate?
- **Q-B2** — `AGENTS.md` §6 requires `npm test` / `npm run typecheck` before finishing a task. `node_modules` is tracked in git, so `npm install` would modify tracked paths outside `backend/`. May I treat these two checks as not applicable to backend-only commits (I will instead prove, with `check_repo_safety.py`, that no front-end file changed)?
- **Q-B3** — Is C Block one building (`bld-i`, as the running app has it) or three (`bld-e`/`bld-f`/`bld-i`, as `PDF_INVENTORY.md` has it)? The backend seeds whatever `campus-structure.ts` contains; I need to know whether `bld-e`/`bld-f` are coming back.
- **Q-B4** — Q2 in `IMPLEMENTATION_PLAN.md` (authoritative footprint layout) is still open. The backend does not need coordinates in Phase 1, but any later routing graph does. May I defer it?
- **Q-B5** — If the Stage-A `CampusDocument` v1 ever materialises, should the backend's routing graph be **generated from it** (my recommendation, per `AGENTS.md` rule 4) rather than authored separately?

---

## 8. What the documents tell me to do, and to avoid

**Do:** read `AGENTS.md` and the stage document first; reuse `ARCHITECTURE.md`'s audit; follow `GEOMETRY_SPEC.md` for units/coordinates/IDs; record decisions as ADRs; report conflicts instead of choosing; change only files for the assigned task; keep IDs stable with `legacyIds`; mark unconfirmed data `demo` / `needsReview`; write an import report per floor; end every step with a report (files changed, tests, limits, next step); keep assets local; keep deterministic behaviour (fixed seeds, no `Math.random` in providers).

**Avoid:** inventing coordinate systems or data formats; duplicating subsystems; changing public module interfaces without updating the docs; changing `accepted` ADRs silently; drive-by refactors; deleting existing TODOs and architectural comments; automatic CV/ML recognition of PDFs (ADR-012); external CDNs (ADR-018); non-uniform scaling of interior geometry (ADR-010); hard-coding 3D coordinates in UI components (`README.md`); relying on hover as the only way to reveal information (`README.md`).

**And from the master prompt, the rules that override everything:** the front end is read-only; write only inside `backend/`; PostgreSQL only, including for tests; software only (no sensors); label provenance and confidence on every computed value; privacy by design.
