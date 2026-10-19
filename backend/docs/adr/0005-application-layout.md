# ADR-0005: Modular monolith layout

- **Status**: `accepted` — implemented in Phase 1
- **Date**: 2026-10-17
- **Affects**: `app/`
- **Related**: brief sections 6.1, 6.2

## Decision

One deployable FastAPI app, a package per concern, adapted from the brief's
section 6.1 after discovery:

```
app/
  core/        config, db, security, logging, metrics, errors, i18n, time
  domain/      SQLAlchemy models, one module per bounded context
  services/    all reads and writes; the only place that queries
  api/v1/      routers (clean + compat), schemas/ per family
  adapters/    optional outside-world integrations (frontend/, imports/, llm/)
  jobs/        scheduled work (Phase 2+)
  engines/     shared engines from brief section 6.2 (Phase 2+)
```

Rules that matter:

1. **`services/` owns the queries.** Routers translate HTTP to a service call and
   back. This is what lets the compat layer be a projection rather than a second
   implementation (ADR-0006), and it is what the LLM assistant's tools will call
   in Phase 8 — never raw SQL (brief section 20.2).
2. **`domain/` imports nothing from `api/` or `services/`.** Dependencies point
   inwards, mirroring the front end's own `domain/` discipline
   (`docs/ARCHITECTURE.md` section 2.1).
3. **`adapters/` is optional by construction.** Nothing in `core`, `domain` or
   `services` may require an adapter to function; the brief forbids import
   interfaces being load-bearing (section 3.1).
4. **Two schema families under `api/schemas/`**, `campus` (clean) and `compat`
   (frozen), never merged.
5. **`engines/` is empty until Phase 2.** Creating the directories now would be
   speculative; the brief's shared engines arrive with the layer that needs them,
   and `services/` is where they will live behind an interface.

## Alternatives rejected

- **Microservices**: the brief specifies a modular monolith; there is one
  deployment target and one team.
- **Layer-per-feature (`layers/crowds/`, `layers/safety/`, ...) from day one**, as
  section 6.1 sketches. Deferred rather than rejected: Phase 1 has no layer
  content, and empty packages invite inconsistent placement later. They will be
  created as each layer lands, inside `app/layers/`.
- **Repository classes per entity**: an extra indirection over SQLAlchemy, which
  is already a data-access layer. Service functions taking an `AsyncSession` are
  enough and are trivially testable against a real database.
