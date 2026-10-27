# ADR-0002: Python 3.13, with Docker as the canonical runtime

- **Status**: `accepted` — implemented in Phase 1
- **Date**: 2026-10-17
- **Affects**: `Dockerfile`, `docker-compose.yml`, `Makefile`, CI

## Context

The brief requires Python 3.12 or newer (section 3.2). The development machine has
only **3.14.2** and **3.11** installed. 3.11 is below the floor. 3.14 satisfies it,
but later phases depend on libraries whose wheel availability lags a new
interpreter by months — OR-Tools CP-SAT for the exam seat planner and the
timetable optimiser (Phases 4 and 5), and optionally LightGBM for forecasting
(Phase 8). Discovering in Phase 5 that the solver cannot be installed would be an
expensive surprise.

Installing 3.13 on the host was attempted and failed: `winget` could not reach its
sources (`0x8a15000f`), and repairing them requires administrator rights, which is
a system change outside the scope of this work.

Docker 29.1.3 is installed and working, and the brief already requires Docker
Compose for PostgreSQL (section 0.4 rule 2) — so a container was in the loop regardless.

## Decision

1. **The container is the runtime of record.** `Dockerfile` pins
   `python:3.13-slim` (3.13.16 at the time of writing). `make up`, `make test`,
   `make migrate` and `make seed` all execute there, so "works on my machine" and
   "works in CI" are the same machine.
2. **`backend/.venv` is an editor convenience, not the contract.** It exists so
   that type checking, autocompletion and quick unit runs work in an IDE. It
   currently runs 3.14.2. The `*-local` Make targets use it and are explicitly
   labelled as the convenience path.
3. **`requires-python = ">=3.12"`** in `pyproject.toml` — the floor, not the pin.
4. **Phase 4 precondition**: before adding OR-Tools, confirm a 3.13 wheel exists
   for the container's platform and record the version in that phase's ADR.

## Alternatives rejected

- **Host 3.14 as the only runtime.** Rejected: no containerised reproducibility,
  and it defers the solver wheel question to the phase that can least afford it.
- **Elevate and fix winget to install 3.13 on the host.** Rejected: modifying
  system package sources is beyond the mandate, and it does not make the build
  reproducible for anyone else.
- **Pin 3.12 for maximum library coverage.** Rejected: 3.13 is current, supported,
  and already has the coverage the brief's stack needs; 3.12 buys nothing here.
- **Drop OR-Tools from the plan to keep 3.14.** Rejected: the brief names CP-SAT
  for seating and timetabling. Changing that is the owner's call, not a side
  effect of an interpreter choice.

## Consequences

- Two interpreters coexist (3.13 in the container, 3.14 in the venv). A pure-Python
  dependency behaving differently between them is possible but unlikely; anything
  that matters is run in the container.
- If the local venv ever fails to install a pinned dependency, that is a signal
  about 3.14, not about the project. Use the container.
- A future host install of 3.13 would let `make install-local` match exactly.
  Worth doing, not required.
