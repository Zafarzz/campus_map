# PROPOSED_ROOT_CHANGES

Changes **outside** `backend/` that would help, written as proposals for the repository owner to
approve or decline (`MASTER_PROMPT.md` §0.2 rule 3). **Nothing in this file has been applied.**
No file outside `backend/` has been created, edited or deleted — `backend/scripts/check_repo_safety.py`
proves it.

Status key: `awaiting-decision` | `approved` | `declined` | `applied`.

---

## P-1 — Vite dev proxy so the front end can reach the API over the same origin

- **Status**: `awaiting-decision`
- **File**: `vite.config.ts` (front end)
- **Why**: the dev server runs HTTPS with a self-signed certificate and `host: true`
  (`vite.config.ts`). A backend on plain `http://localhost:8000` would be blocked as mixed content
  once a seam is switched to `fetch`. A dev proxy makes the API same-origin, which also sidesteps CORS.
- **Proposed patch** (illustrative, not applied):

```ts
  server: {
    host: true,
    https: true,
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true, secure: false },
    },
  },
```

- **Alternative that needs no front-end change**: terminate HTTPS on the backend in development with a
  local certificate, and configure CORS to allow the Vite origin. Slightly more backend setup, zero
  front-end edits. **This is the default I will implement unless P-1 is approved.**
- **Risk if declined**: none for Phase 1 — nothing in the front end calls the API yet.

## P-2 — Refresh `docs/ARCHITECTURE.md`, which is stale in six places

- **Status**: `awaiting-decision`
- **File**: `docs/ARCHITECTURE.md`
- **Why**: `AGENTS.md` §4 rule 2 tells agents to reuse this audit rather than re-auditing. The audit is
  dated 2026-10-14 against commit `01c4265` of `feature/detailed-c-block`; `main` is now `c87f949`.
  Divergences are listed in `PROJECT_UNDERSTANDING.md` §6 C-3: 12 test files exist (TD-13 claims none),
  `knownBuildings` has 8 entries not 10, `.gitignore` now exists but `node_modules/`+`dist/` are still
  tracked (TD-14), the root `scripts` stub file is gone (TD-15), and the module tree omits `src/editor/`,
  `src/data/floor-plans/`, `src/domain/appearance/`, `src/components/3d/facades|fountain|tuning/`.
- **Proposal**: a front-end/documentation agent refreshes it. I can draft the replacement text on request,
  but editing it is outside my scope. **This is really a front-end task, not a backend one.**
- **Risk if declined**: future agents act on stale facts. No impact on the backend, which does not rely
  on the stale items.

## P-3 — Untrack `node_modules/` and `dist/` (TD-14, only half fixed)

- **Status**: `awaiting-decision`
- **Files**: git index only (`git rm -r --cached node_modules dist`), no working-tree deletion
- **Why**: `.gitignore` already lists both, but 8,112 + 5 files remain tracked, so (a) every `npm install`
  produces a huge diff, (b) agents cannot run `npm test` / `npm run typecheck` without dirtying tracked
  paths, which `AGENTS.md` §6 nonetheless requires before finishing a task (open question Q-B2).
- **Caution**: this rewrites the index for ~8,000 paths and will show as a very large commit. It also
  means a fresh clone needs `npm install` before `npm run dev` works. **It is the owner's call, not mine**,
  and I will not run it even if approved in passing — I would want an explicit "yes, run it".
- **Risk if declined**: backend commits simply never run npm, and the safety guard enforces that. Fully
  workable; this proposal is about the front end's own ergonomics.

## P-4 — Fix the duplicate `legacyId` in `src/data/floor-plans/index.ts`

- **Status**: `awaiting-decision`
- **File**: `src/data/floor-plans/index.ts` (lines 81 and 86)
- **Why**: `bld-h-f2-r7` is declared as the `legacyId` of **both** `bld-h-f2-a207` and `bld-h-f2-a208`.
  ADR-008's alias table is meant to keep old references resolvable; a duplicated alias makes one of them
  unresolvable, and any naive `legacyId → id` map silently drops a room.
- **Proposal**: the owner or a Stage-A agent decides which room genuinely inherits `-r7` and corrects the
  other. The backend will meanwhile store aliases many-to-many and raise an explicit error on an
  ambiguous lookup rather than guessing (planned ADR-0008).
- **Risk if declined**: the backend behaves correctly but one legacy reference stays unresolvable. Low
  impact today, because nothing external uses legacy IDs yet.

## P-5 — A CI workflow for the backend

- **Status**: `not proposed` (blocked by precondition)
- **Why not**: `MASTER_PROMPT.md` §0.3 allows one file outside `backend/` — a CI workflow — **and only if
  the repository already uses that CI system**. There is no `.github/`, no CI configuration of any kind,
  and no evidence of any CI provider in this repository. So the precondition fails and I am not proposing
  one. Backend checks run from `backend/Makefile` locally. If you later add GitHub Actions to the project,
  I will propose `.github/workflows/backend-ci.yml` with a `backend/**` path filter.
