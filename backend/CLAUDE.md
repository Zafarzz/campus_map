# backend/CLAUDE.md — rules for agents working on the Campus Digital Twin backend

The repository's own rules keep applying. They are imported here so they cannot silently drop out
when a session starts inside `backend/`:

@../AGENTS.md

Full brief: `backend/docs/MASTER_PROMPT.md` (plain path on purpose — it is long; do not `@`-import it).
Read also `backend/docs/PROJECT_UNDERSTANDING.md` and `backend/docs/FRONTEND_CONTRACT.md` before designing.

> Verified 2026-10-17 against https://code.claude.com/docs/en/memory: with a root `AGENTS.md` and **no**
> root `CLAUDE.md`, a session started at the repository root loads `AGENTS.md`, and this file loads on
> demand while working in `backend/`. A session started **inside** `backend/` would load this
> `CLAUDE.md` *instead of* `AGENTS.md` — the `@../AGENTS.md` import above is what prevents that loss.
> `@path` imports are expanded at launch, relative to this file.

## Hard rules (never break these)

1. **The front end is read-only.** Never create, edit, rename, move, delete, reformat or regenerate any
   file under `src/`, `public/`, `tools/`, `dist/`, `index.html`, or any root config. Reading is fine.
2. **Write only inside `backend/`.** No exceptions without the owner's explicit approval. A change that
   would help outside `backend/` goes into `backend/docs/PROPOSED_ROOT_CHANGES.md` as a proposal.
3. **Never run a package manager or a front-end build.** `node_modules/` (8,112 files) and `dist/` are
   **tracked in git**, so `npm install` / `npm run build` would dirty tracked paths outside `backend/`.
   This means `AGENTS.md` §6's `npm test` / `npm run typecheck` are not runnable here; prove safety with
   the guard below instead.
4. **No destructive git.** Never `git reset --hard`, `git clean`, `git restore`, `git checkout -- <path>`
   on files you did not change, `git stash` the owner's changes, `rm -rf`, force-push, or rewrite history.
   Do not push or open PRs unless asked.
5. **Stage explicitly**: `git add backend/`. Never `git add -A` or `git add .`. Check `git status` and
   `git diff --stat` before every commit. Never commit to `main`; work on `feat/backend`.
6. **Run the safety guard before every commit and at the end of every phase:**

```bash
python backend/scripts/check_repo_safety.py
```

   Exit 0 = nothing outside `backend/` changed. Exit 1 = violations (revert them). Exit 2 = the check
   could not run (fix that first; a guard that cannot run is not a pass). Baseline is recorded in
   `backend/scripts/repo_safety_baseline.json`; `allowed_outside_backend` stays empty unless the owner
   approves a path in writing.
7. **Software only.** No hardware, sensors, cameras, CV, Wi-Fi/Bluetooth tracking, or building-management
   control. Optional CSV/API *imports* of data the university already has are allowed, off by default.
8. **Honesty in outputs.** Every computed value carries `source`/provenance (`scheduled`, `confirmed`,
   `reported`, `estimated`) and a confidence. Demo rows are `is_demo = true` and never mixed with real
   data in reports. Never present an estimate as a measurement.
9. **Privacy by design.** Minimum collection, pseudonymous IDs, never track individuals' locations,
   aggregates only with small-cell suppression (default 10, configurable). Sensitive features are opt-in.
10. **Secrets** live in `.env` (never tracked). Only `backend/.env.example` is committed.

## Project facts that are easy to get wrong

- **`bld-a` is not Block A.** Block A is `bld-h`, B is `bld-g`, D is `bld-c`, E is `bld-b`, F is `bld-d`,
  C is `bld-i`, Dorm is `bld-j`, North Building is `bld-a`. Source: `docs/PDF_INVENTORY.md` §3.
  Never derive the block letter from the ID.
- **Room states** in the front end are `AVAILABLE | CURRENT | UPCOMING | FINISHED | CANCELLED`
  (not the brief's `free | lesson_now | …`). Compat endpoints use the front end's spelling.
- **`upcomingWindowMinutes` is 60** in the front end, 15 in the brief. Configurable; compat defaults to 60.
- **Timestamps in front-end data are offset-naive campus-local.** The campus timezone is a **required**
  setting with **no default**. Do not hard-code one.
- **IDs are the contract.** Seeded building/floor/room IDs must equal the front end's. Legacy aliases are
  many-to-many and `bld-h-f2-r7` is ambiguous — resolve ambiguity to an error, never a guess.
- Geometry conventions (if ever touched): metres, `X`=east, `Y`=up, `Z`=south, `Vec2 = [x, z]`, datum
  frozen per ADR-002. Never invent an alternative frame (ADR-001, `docs/GEOMETRY_SPEC.md` §1.1).

## Database rules

- **PostgreSQL only, 16+, including for tests.** No SQLite, no in-memory substitute: the design relies on
  `tstzrange`, `btree_gist` exclusion constraints, partial indexes and `SELECT … FOR UPDATE`.
- Local DB runs from `backend/docker-compose.yml` (named volume, healthcheck, port bound to localhost).
  Connection comes from `DATABASE_URL`; never hard-code credentials.
- Separate databases for dev, test and production. Tests create and drop their own `*_test` database and
  never touch dev data. **Never connect to a database other than this project's own.**
- **Migrations (Alembic) are the only way the schema changes.** Every migration has a working downgrade or
  a written reason why not, and is tested up and down. Extensions are created inside migrations.
- Least privilege: separate owner (migrations) and application roles; dedicated schema `campus`.
- **Destructive SQL only against local dev/test.** Never against anything configured as staging/production.

## How to run (filled in as Phase 1 lands)

```bash
# from backend/
docker compose up -d db          # PostgreSQL
make dev                         # uvicorn with reload
make test                        # pytest against a real throwaway *_test database
make lint                        # ruff + type checker
python scripts/check_repo_safety.py
```

## Working style

- One phase at a time (`MASTER_PROMPT.md` §22). Finish, run the full suite, then **stop and report**:
  what was built, how to run it, a demo script, known limits, proposed next phase.
- Test-first for the logic that matters: state engine, booking conflicts, import parsing, estimator,
  routing, seat planner, evacuation, metrics. Property tests where a rule must always hold.
- Record every significant choice in `backend/docs/adr/NNN-title.md` with the rejected alternatives.
- **Verify, do not assume**: check a library's current stable version and docs before using it, pin it,
  and write down what you found.
- Report conflicts between the docs and the brief instead of silently choosing (`AGENTS.md` §4 rule 7).
- Ask only when blocked, and batch the questions into one message.
