# FRONTEND_CONTRACT

> Written in Phase 0, per `backend/docs/MASTER_PROMPT.md` §0.1 step 4.
> **The front end was read only.** No file under `src/`, `public/`, `tools/`, `dist/` or any root config was created, edited, formatted, linted, built or installed. No package manager was run.
> Baseline: branch `feat/backend` from `main` @ `c87f949`.
> Purpose: record the exact data shapes, identifiers and time semantics the front end consumes today, so the backend can serve them with the smallest possible later change to the front end (§0.1 step 5).

---

## 1. Framework and build setup

| Concern | Value | Source |
|---|---|---|
| Bundler / dev server | Vite `^8.3.3`, `@vitejs/plugin-react` `^6.1.2`, `@vitejs/plugin-basic-ssl` `^2.3.0` | `package.json` |
| Dev server options | `host: true` (all interfaces), `https: true` (self-signed via basic-ssl) | `vite.config.ts` |
| UI | React `^19.3.0` + `react-dom` | `package.json` |
| 3D | `three` `^0.186.1`, `@react-three/fiber` `^9.8.1`, `@react-three/drei` `^10.7.9` | `package.json` |
| Dev panel | `leva` `^0.10.1` (visual tuning, dev-only) | `package.json`, `src/App.tsx` |
| Language | TypeScript `^7.0.2`, `strict: true`, `noEmit`, `moduleResolution: "bundler"`, `resolveJsonModule: true`, `target: ES2022` | `tsconfig.json` |
| Tests | `vitest` `^5.0.3`, 12 files in `src/__tests__/` | `package.json` |
| Scripts | `dev`, `build` (= `tsc --noEmit && vite build`), `preview`, `typecheck`, `test` | `package.json` |
| Lint | **none configured** (no eslint dependency) | `package.json` |
| Entry chain | `index.html` → `src/main.tsx` → `src/App.tsx` → `MapProvider` → `AppLayout` (`CampusMap` + side panel) | `src/App.tsx` |
| Routing | Hash/path check only: `#/editor` or `/editor` renders `EditorPage`, otherwise the map. No router library, no deep links into buildings/rooms. | `src/App.tsx:15-23` |

### 1.1 Constraints this places on the backend

- **CORS and HTTPS.** The dev server runs on **HTTPS with a self-signed certificate** and binds to all interfaces. A backend served over plain HTTP would be blocked as mixed content when the page is loaded over HTTPS. The backend therefore needs (a) configurable CORS allowed origins, and (b) a local HTTPS or same-origin-proxy story. Recommended: expose the API over HTTP for local work and let Vite proxy it under the same origin via `server.proxy` — **but that is a `vite.config.ts` change, which is a front-end edit and so a proposal for you, not something I will do.** Until then, HTTPS on the backend (dev certificate) or `https`-terminated reverse proxy is the backend-side option.
- `resolveJsonModule: true` means a future `CampusDocument` can be imported statically with no loader. Relevant to ADR-013's "no backend needed for geometry".
- `node_modules/` and `dist/` are **tracked in git** (8,112 and 5 files). Running `npm install`, `npm run build` or anything that writes there would modify tracked paths outside `backend/`, which master prompt §0.2 forbids. **I will not run any package manager or build in this repository.**

---

## 2. How the front end gets its data today

Everything is a **static TypeScript module**. There is **no `fetch`, no `XMLHttpRequest`, no WebSocket and no API base URL anywhere in `src/`** — verified by search. The only persistence is browser-local (IndexedDB + `localStorage`) for the 2D editor's draft.

```
MapProvider (mount)
  ├─ loadCampus()            services/campus/campusService.ts
  │     ├─ loadDraft()       editor/storage/storageService.ts  (IndexedDB → localStorage → memory)
  │     │     └─ if a draft exists and has ≤1 building with shortName 'C':
  │     │           editorDocToCampusAndGeom(draft) → Campus + geometry overrides
  │     └─ else: demoCampus  data/demo-campus.ts
  │                 ├─ campus-structure.ts   knownBuildings (8) + campusInfo
  │                 └─ floor-plans/index.ts  confirmedFloorPlans (11 floors, CAD-derived)
  ├─ createCampusIndex(campus)        domain/campus/campusIndex.ts
  ├─ geometryProvider.build(campus)   services/geometry/index.ts  (ONE provider seam)
  │     └─ screenshotGeometryProvider: px → metres, procedural rooms,
  │        overridden per-room by accurateRoomOverrides (from floor-plans)
  └─ loadLessonsForDate(campus, dateKey)   services/schedule/scheduleService.ts
        └─ createDemoSchedule(campus, date, mapConfig.schedule.slots)   data/demo-schedule.ts
```

Then `computeRoomStates(index.rooms.keys(), lessons, now, {upcomingWindowMinutes})` (`domain/schedule/roomStatus.ts`) produces the per-room state map that drives every colour, badge and panel.

**The three seams a backend can occupy, in increasing order of intrusiveness:**

| Seam | File | What it returns today | Backend swap difficulty |
|---|---|---|---|
| **S1 — schedule** | `services/schedule/scheduleService.ts` → `loadLessonsForDate(campus, date): Promise<Lesson[]>` | generated demo lessons | **Lowest.** Already `async`, already documented in-file as *"Replace the body with a real API call later"*. One function body. **This is the primary integration target.** |
| **S2 — campus** | `services/campus/campusService.ts` → `loadCampus(): Promise<Campus>` | `demoCampus` or editor draft | **Low.** Already `async`. Returns the whole campus tree. |
| **S3 — room state** | `domain/schedule/roomStatus.ts` → `computeRoomStates(...)` (pure, synchronous, called in a `useMemo`) | computed in the browser | **Highest.** Making state server-side means `MapProvider` must await it, which changes a synchronous `useMemo` into async state. Not worth it initially — see §7. |

### 2.1 Geometry is **not** a backend concern

`services/geometry/index.ts` is documented as *"The ONE place that decides where geometry comes from"*, and [ADR-003](../../docs/DECISIONS.md) freezes `CampusGeometryProvider` as the render contract. Geometry comes from pixel rectangles in `src/data/reference-footprints.ts` plus `mapConfig.reference` (703×1024 px at 0.3 m/px), and is Stage A/B work. **The backend should not serve geometry in the near term** (see `PROJECT_UNDERSTANDING.md` C-1): it serves *business* data keyed by the same IDs, exactly as `src/domain/campus/types.ts` says at the top — *"nothing in this file knows about 3D geometry… positions/sizes live in `domain/geometry` and are produced by a geometry provider, keyed by these IDs."*

---

## 3. Exact data shapes consumed

Verbatim from the source (comments trimmed). **These are the shapes the compatibility layer must emit.**

### 3.1 Campus tree — `src/domain/campus/types.ts`

```ts
type DataProvenance = 'confirmed' | 'demo';
type RoomKind = 'classroom' | 'lab' | 'office' | 'hall' | 'other';

type Room = {
  id: string;
  number: string;
  name?: string;
  kind: RoomKind;
  capacity?: number;
  provenance: DataProvenance;
};

type Floor = {
  id: string;
  level: number;          // 1 = ground floor; basements may be 0 / negative
  name: string;           // currently always `Floor ${level}`
  rooms: Room[];
};

type Building = {
  id: string;
  name: string;
  shortName: string;
  description?: string;
  floors: Floor[];
  provenance: DataProvenance;
  appearancePreset?: string;
  appearance?: any;       // Partial<BuildingAppearance>
};

type Campus = { id: string; name: string; buildings: Building[] };
```

Notes for the backend schema:
- `capacity` is **optional** in the type but is always populated in practice (`?? 30` fallback in `demo-campus.ts:37`).
- `Floor.name` is a display string, not an identifier.
- `appearance`/`appearancePreset` are Stage-C visual config; they are `undefined` in all current data (`demoCampus` never sets them) and should be **passed through unchanged** if the backend ever serves buildings — never invented.
- There is **no** `shortName` uniqueness guarantee: historically `'C'` was shared by three buildings, and `campusService.ts:27` still contains a defensive guard counting buildings with `shortName === 'C'` and rejecting a draft with more than one.

### 3.2 Schedule — `src/domain/schedule/types.ts`

```ts
type Lesson = {
  id: string;
  roomId: string;         // references Room.id ONLY — never coordinates
  subject: string;
  teacher?: string;
  group?: string;
  startsAt: string;       // ISO-8601 date-time
  endsAt: string;         // ISO-8601 date-time
  cancelled?: boolean;
};

type RoomStatus = 'AVAILABLE' | 'CURRENT' | 'UPCOMING' | 'FINISHED' | 'CANCELLED';

type RoomScheduleState = {
  status: RoomStatus;
  current?: Lesson;       // in progress now (may be cancelled)
  next?: Lesson;          // next non-cancelled lesson not yet started
  lessons: Lesson[];      // all of the room's lessons that day, sorted by start
};
```

**Critical detail — `startsAt`/`endsAt` carry no timezone.** `demo-schedule.ts:51` emits `` `${date}T${start}:00` `` (e.g. `2026-10-17T09:00:00`) with the explicit comment *"Local time (no timezone suffix) — parsed as campus-local time."* `new Date('2026-10-17T09:00:00')` is parsed by the browser as **the browser's local time**, so today the app silently assumes the viewer's clock is campus time. See §5 and §7.3.

### 3.3 Search — `src/services/search/searchService.ts`

```ts
type SearchResult = {
  key: string;            // `room-${id}` | `lesson-${id}`
  roomId: string;
  kind: 'room' | 'lesson';
  title: string;          // `Room A-102 · Classroom` | lesson subject
  subtitle: string;       // `Block A · Floor 1` | `A-102 · Dr. Kim · CSE-21`
  lesson?: Lesson;
};
```

Matching is a substring test on `norm()` = lowercase + NFKD + whitespace-collapsed, over `room.number + room.name` for rooms and `subject + teacher + group` for lessons; exact room-number matches are sorted first; limit 25. **This is the behaviour `GET /rooms/search` must not regress.** The front end runs search locally over the already-loaded campus and lessons, so it needs no API for search initially.

### 3.4 Render contract (read-only reference) — `src/domain/geometry/types.ts`

`Vec2 = [x, z]`, `Vec3 = [x, y, z]`, metres, `X`=east/`Y`=up/`Z`=south. `GeometryPrecision = 'approximate' | 'surveyed'`. `Footprint` = rect (centre/size/rotation?/cornerRadius?) or polygon. `RoomGeometry` = box (position/size/rotation?/precision) or polygon (points/elevation/height/precision). `FloorGeometry = {floorId, elevation, height}`. `BuildingGeometry = {buildingId, parts[], height, floors{}, center, radius, precision}`. `ContextFeature = {id, kind, footprint, height?, label?}` with kind `track|pitch|court|lawn|road|structure`. `ConnectorGeometry = {id, kind:'enclosed-corridor', buildingIds:[a,b], footprint, elevation, height, precision}`. `CampusGeometry = {buildings, rooms, context, connectors, bounds}`.

**The backend does not produce these.** Recorded so that a future geometry-serving decision has the exact target.

### 3.5 Editor document (browser-local today) — `src/editor/domain/types.ts`

`EditorDocument {schemaVersion: 1, campusId, name, lastModified, buildings: EditorBuilding[]}`, where `EditorBuilding` has a world-space `footprint: Rect2D` and floors of `EditorRoom {id, number, name?, kind, capacity?, localCenter, size, rotation?, provenance}`. Versions are `CampusVersion {id, name, timestamp, type: 'initial'|'manual'|'auto', reason, document}` stored in IndexedDB (`campus_map_editor_db_v3`) with a `localStorage` fallback (`campus_map_draft_v3`, `campus_map_versions_v3`) and an in-memory last resort.

**This is a different schema from `GEOMETRY_SPEC.md` §4.2's `CampusDocument` v1** — flatter, no walls/openings/spaces, no `transform`/`yaw`, no calibration, no sources. It is a *de facto* format introduced by the editor code, not the one the spec prescribes. I record it without judging it; it is front-end territory. If you ever want editor drafts shared between devices, that is a natural later backend feature — out of scope now.

### 3.6 Configuration the backend must mirror — `src/config/mapConfig.ts`

| Key | Value | Backend meaning |
|---|---|---|
| `schedule.upcomingWindowMinutes` | **60** | The front end's "starts soon" window. **The master prompt §10.2 default is 15 minutes.** A mismatch would change colours on screen. The backend must make this configurable and **default to 60** for compat responses. |
| `schedule.slots` | `09:00–10:20, 10:30–11:50, 12:00–13:20, 14:00–15:20, 15:30–16:50, 17:00–18:20` | Six 80-minute slots with 10-minute gaps (40 min at lunch). Marked *"TODO: Replace with the university's real lesson slots."* Seed data should reuse them. |
| `schedule.simulatedRange` | `[480, 1140]` = 08:00–19:00 | Range of the Simulate slider. `GET /state?at=` must work for any instant, but the slider only reaches these. |
| `schedule.defaultSimulatedMinutes` | **645** = 10:45 | Matches the master prompt §2.1 screenshot clock. |
| `schedule.liveTickMs` | **30 000** | Live mode re-renders every 30 s. Sets the useful floor for cache TTLs and the polling fallback. |
| `building.floorHeight` / `slabThickness` | 3.6 / 0.25 m | Geometry only. |
| `roomLayout.roomHeight` | 2.6 m | Geometry only. |
| `reference.imageSizePx` / `metersPerPixel` | `[703, 1024]` / 0.3 | The datum (ADR-002). `metersPerPixel` is marked *"TODO: Calibrate"* (Q4). |
| `colors.status` | green/red/amber/grey/purple per §4 | Front-end-owned. The backend must never send colours. |

---

## 4. Identifiers and naming

### 4.1 ID formats actually in use

| Entity | Format | Example | Stable? |
|---|---|---|---|
| Campus | literal | `ajou-tashkent` | yes |
| Building | `bld-<letter>` | `bld-h` | yes (literals in `campus-structure.ts`) |
| Floor | `${buildingId}-f${level}` | `bld-h-f1` | yes, while `level` is unchanged |
| Room (confirmed plan) | `${floorId}-${slug(number)}` | `bld-h-f1-a102` | **yes** — matches [ADR-008](../../docs/DECISIONS.md) / `GEOMETRY_SPEC.md` §5.2 |
| Room (special) | literal | `room-c-conf`, `room-canteen` | yes |
| Room (no confirmed plan) | `${buildingId}-f${level}-r${i+1}` | `bld-a-f1-r1` | **no** — index-based, shifts if the array changes (`GEOMETRY_SPEC.md` §1.6) |
| Lesson (demo) | `demo-${roomId}-${date}-${slotIndex}` | `demo-bld-h-f1-a102-2026-10-17-0` | deterministic per date |
| Connector | `conn-${a}-${b}` | `conn-bld-g-bld-i` | yes |
| Context feature | literal | `track`, `pitch`, `kpp-e`, `lawn-sq` | yes |

**`legacyId`** on confirmed plan rooms maps the old index-based ID to the new stable one (e.g. `bld-h-f1-a102` ← `bld-h-f1-r1`).
⚠ **Legacy IDs are not unique**: `bld-h-f2-r7` appears as the `legacyId` of both `bld-h-f2-a207` (`floor-plans/index.ts:81`) and `bld-h-f2-a208` (line 86). The backend stores aliases many-to-many and must **fail loudly** on an ambiguous lookup rather than pick one.

### 4.2 The building ID ↔ block letter trap

**`bld-a` is not Block A.** Per `docs/PDF_INVENTORY.md` §3 (which resolved question Q3):

| `id` | `shortName` | `name` | `floorCount` | Block per PDF |
|---|---|---|---|---|
| `bld-a` | `N` | North Building | 4 | North Building |
| `bld-b` | `E` | Block E | 4 | Building **E** |
| `bld-c` | `D` | Block D | 2 | Building **D** |
| `bld-d` | `F` | Block F | 2 | Building **F** |
| `bld-g` | `B` | Block B | 4 | Building **B** |
| `bld-h` | `A` | Block A | 2 | Building **A** |
| `bld-i` | `C` | Block C | 2 | Building **C** (conference hall + canteen) |
| `bld-j` | `Dorm` | Dormitory | 4 | Dormitory |

`bld-e` and `bld-f` exist in `reference-footprints.ts` (sports hall, red buildings) but are **absent from `knownBuildings`**, so they have geometry and no business data: they render nothing and appear in no list. The backend seeds the 8 above, and must not invent `bld-e`/`bld-f`. (Open question Q-B3.)

Room numbers use the **block letter**, not the ID: `A-102` lives in `bld-h`, `D-101` in `bld-c`, `E-101` in `bld-b`.

### 4.3 Room inventory the seeder must reproduce

`demo-campus.ts:25-86` resolves each `(building, level)` through five branches, in order. The seeder must apply the same precedence to produce byte-identical IDs:

1. **Confirmed CAD plan** (`confirmedFloorPlans`) → its rooms verbatim, `capacity ?? 30`, `provenance ?? 'confirmed'`. Covers 11 floors: `bld-h` f1 (9 rooms) and f2 (11); `bld-g` f1 and f2; `bld-c` f1 (7) and f2; `bld-b` f1 (6) and **f4**; `bld-d` f1 and f2; `bld-i` f1 (2: `room-c-conf`, `room-canteen`).
2. **`specialRooms`** on level 1 → only `bld-i`, now shadowed by branch 1.
3. **Replicate the level-2 plan** onto levels > 2 when a level-2 plan exists → applies to `bld-g` f3/f4. Numbers are rewritten `/^[A-Z]-2/` → `${shortName}-${level}`, and **IDs fall back to the unstable `-r${i+1}` form**.
4. **Known schedule rooms** filtered by `number.includes('-${level}0' | '-${level}1')` → applies to `bld-b` f2 (`E-202…E-206`) and f3 (`E-301`, `E-306`). Unstable IDs.
5. **Two demo placeholders** `${shortName}${level}${nn}` → `bld-a` (all 4 floors), `bld-j` (all 4), `bld-i` f2. `provenance: 'demo'`.

Branches 3–5 are generated data: `is_demo` where branch 5 applies, and in all three cases the IDs are order-dependent and must be captured exactly as generated, not re-derived.

**Seeding approach (Phase 1).** Per master prompt §9, the seeder **reads** the front-end data files and never writes to them. Because branches 1–5 are TypeScript logic rather than a declarative file, I will write a **read-only Python parser** in `backend/scripts/` that extracts the literals from `campus-structure.ts` and `floor-plans/index.ts` and re-implements the five branches with a test asserting the resulting inventory against a committed snapshot. If parsing proves brittle, the documented fallback is the synthetic campus in §9 of the brief — but that would lose ID stability, so the parser is strongly preferred. Either way the exact inventory ships as a fixture, and a drift test flags any later front-end change.

---

## 5. Live and Simulate time

`src/hooks/useNow.ts`:

```ts
type TimeMode = { mode: 'live' } | { mode: 'simulated'; minutes: number };
```

- **`initialTimeMode()`** — if the real clock is inside `simulatedRange` (08:00–19:00) start in `live`; otherwise start in `simulated` at `defaultSimulatedMinutes` (10:45). Rationale in-code: *"Live clock outside class hours shows an empty campus."*
- **live** — `setInterval(..., liveTickMs = 30 000)` sets `now` to a fresh `new Date()`.
- **simulated** — takes today's date and overrides H/M from `minutes`, zeroing seconds/ms. So Simulate is always **today at time X**, never another date. The slider is `min=480 max=1140 step=5`.
- `toLocalDateKey(now)` → `YYYY-MM-DD` from **browser-local** `getFullYear/Month/Date`, and that key selects the day's lessons.
- `roomStates` is memoised on `now.getTime()`, so every tick recomputes all room states in the browser.

**Mapping to the backend's `at` parameter.** The master prompt §8 models Simulate as `GET /state?at=<ISO>`. The front end's `now` is a `Date`; serialising it as an **offset-aware ISO instant** is the correct `at`. But because demo lessons are offset-naive, the current app compares naive local strings against a local `Date` — consistent only while the browser's zone equals the campus zone.

The backend's rule (master prompt §9 Time): **UTC in the database, campus timezone in the API.** Concretely:
- `GET /api/v1/compat/...` endpoints accept `at` as an ISO instant **or** as a local `date` + `minutes` pair matching the slider, and return `startsAt`/`endsAt` **in the same offset-naive campus-local form the front end already parses**, so nothing breaks.
- The clean `/api/v1/...` endpoints use offset-aware instants everywhere.
- `TZ` for the campus is a **required** setting with **no default** (the brief forbids assuming one). `Asia/Tashkent` (UTC+5, no DST) is the obvious candidate given the campus, but I will not hard-code it without your confirmation — and the code must not assume "no DST" either, per §9.

---

## 6. API calls the front end already expects

**None.** There is no HTTP client, no base URL, no WebSocket and no environment variable read anywhere in `src/`. There is no `.env`, no `.env.example`, and no `import.meta.env` usage for an API host.

Consequences:
1. There is **no existing contract to match on the wire** — only the in-memory shapes above. The compatibility layer is therefore defined by §3, not by any request/response the app already makes.
2. Nothing breaks when the backend appears: the front end simply continues using static data until someone changes a seam (S1/S2).
3. The backend must publish OpenAPI and a worked example per compat endpoint so that the eventual front-end change is a few lines inside one `async` function.

---

## 7. Proposed integration shape

### 7.1 Compatibility endpoints (shapes from §3, verbatim)

| Endpoint | Returns | Replaces |
|---|---|---|
| `GET /api/v1/compat/campus` | `Campus` — the full tree, `Building[] → Floor[] → Room[]`, exactly §3.1, including `provenance` and omitting `appearance` when unset | `loadCampus()` (S2) |
| `GET /api/v1/compat/lessons?date=YYYY-MM-DD` | `Lesson[]` for the whole campus on that local date, `startsAt`/`endsAt` offset-naive campus-local, exactly §3.2 | `loadLessonsForDate()` (S1) |
| `GET /api/v1/compat/room-states?at=<ISO>` | `Record<roomId, RoomScheduleState>` with `status` in `SCREAMING_CASE`, `upcomingWindowMinutes` defaulting to **60** | `computeRoomStates()` (S3), optional |
| `GET /api/v1/compat/live-counts?at=<ISO>` | `Record<buildingId, number>` — rooms in `CURRENT` per building, for the "N live" badge | the `useMemo` in `Campus.tsx:12-20` |

Design rules for the compat layer:
- **No extra required fields, no renamed fields, no reordered enums.** A compat response must satisfy the current TypeScript types with no change to them.
- Provenance/confidence (required by the brief §3.5 on the clean API) ride in **sibling** fields that the front end ignores, or in response headers — never by altering a field the front end reads. This mirrors `GEOMETRY_SPEC.md` ADR-007's "additive extension" principle.
- Every compat endpoint has a clean-API twin; compat is a thin projection over the same service functions, never a parallel implementation (`AGENTS.md` rule 4).

### 7.2 Identifier stability guarantees

The backend's `building.id`, `floor.id` and `room.id` are **the front end's IDs**, seeded from its data (§4.3). Legacy aliases are stored and resolvable, with ambiguity an error. The IDs are the contract; everything else can evolve.

### 7.3 Known risks to flag before Phase 1

| # | Risk | Mitigation |
|---|---|---|
| R1 | `upcomingWindowMinutes` differs (front end 60, brief 15) | configurable; compat defaults to 60; clean API defaults to 15; both documented and tested |
| R2 | Offset-naive timestamps everywhere in the front end | compat emits the same naive campus-local form; clean API emits instants; DST transitions tested regardless |
| R3 | Vite dev server is HTTPS; a plain-HTTP API is mixed content | dev certificate on the backend, or a `vite.config.ts` proxy — the latter is a **proposal for you**, not an edit I will make |
| R4 | Unstable `-r${i+1}` IDs for branches 3–5 rooms | capture the generated inventory as a committed fixture + a drift test; recommend the front end finish migrating to ADR-008 IDs |
| R5 | Duplicate `legacyId` (`bld-h-f2-r7`) | many-to-many alias table; ambiguous resolution is an error, reported in the seed report |
| R6 | `node_modules`/`dist` tracked, so no npm commands | never run a package manager; `check_repo_safety.py` enforces it |
| R7 | The editor stores drafts only in the browser; `loadCampus()` silently prefers a draft over `demoCampus` | the backend-fed path must not fight the draft. If a user has an editor draft, `loadCampus()` returns it today. Whoever changes seam S2 must decide the precedence — a **front-end decision**, documented here so it is not a surprise. |
