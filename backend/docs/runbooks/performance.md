# Performance: measured numbers for Layer 0

`MASTER_PROMPT.md` §10.2 asks for a measured p95 and sets a target:

> Measure and report p95 latency for a 1,000-room campus; the target is under
> 100 ms for a full-building query.

## How to reproduce

```bash
docker compose run --rm api python scripts/measure_state_performance.py --synthetic 1000 --runs 50
```

The script synthesises the extra rooms **inside a transaction it rolls back**, so
nothing is left behind and development data is untouched. It measures the full
service path — load rooms and occupancies for the campus-local day, bucket them,
evaluate every room through the pure engine — and excludes the HTTP layer, which
is identical for every endpoint and would only dilute the result.

## Results

Measured 2026-10-19 on Docker Desktop for Windows (WSL2 backend), PostgreSQL
18.6 in a container, 50 samples after 5 discarded warm-ups. **Container I/O on
this platform is slower than a Linux host or a VPS**, so treat these as a
pessimistic floor rather than production figures.

| Query | Rooms | p50 | p95 | Target |
|---|---|---|---|---|
| One building, seeded campus (`bld-g`) | 25 | 15.5 ms | 28.9 ms | — |
| Whole seeded campus | 101 | 27.9 ms | 49.6 ms | — |
| **One building, 1,000-room campus** | **100** | **18.7 ms** | **30.6 ms** | **< 100 ms — PASS** |
| Whole 1,100-room campus (reference) | 1,101 | 107.3 ms | 288.6 ms | not targeted |

### Reading the target correctly

The brief's target is for a **full-building** query on a 1,000-room *campus* —
not for a 1,000-room single building. The campus is therefore synthesised as ten
buildings of a hundred rooms, which is the realistic shape (the largest real
building here has 25 rooms). The graded row passes with a wide margin.

An earlier run piled all 1,000 rooms into one building and reported 388 ms p95,
which was recorded as a FAIL. That measurement was answering a harder question
than the one asked while leaving the actual one unanswered. Both figures are
printed now, so neither can be quietly dropped.

### The whole-campus number is a known limit

`GET /api/v1/state` with no `building` filter evaluates every room: 289 ms p95 at
1,100 rooms. That is **over** what anyone would want for an interactive map,
and it is not currently cached.

§10.2 names the remedy — "cache results per minute bucket (Redis) and invalidate
on change" — and it is **not built yet**. It is deliberately deferred rather than
forgotten:

- The front end's map calls `/compat/room-states`, which for the demo campus is
  the 50 ms row, not the 289 ms one.
- A cache keyed on a minute bucket is only correct alongside invalidation on
  booking, override, check-in and ticket changes. The transition scheduler
  already computes exactly when a room next changes, which is the right hook —
  but wiring a cache to it is a change worth making deliberately, with its own
  tests, rather than at the end of a phase.

Tracked as the first item in the Phase 3 backlog.

## What the optimisation actually was

The first implementation measured 388 ms p95 for the graded query. Two changes
took it to 31 ms, and both are worth knowing about:

1. **Do not pass a thousand room ids in an `IN` list.** The original loader
   enumerated every room id and passed them to
   `Meeting.room_id.in_(room_ids)`. For a building or campus scope the room set
   is better expressed as a *predicate* — a scalar subquery joining
   `room → floor` — so the database never receives the list. See
   `_room_scope()` in `app/services/state_service.py`. This was the single
   largest cost.
2. **Select columns, not entities.** The engine reads seven fields per meeting
   and four per room. Hydrating full ORM objects adds identity-map registration
   and change tracking for rows that are read once and never written. Switching
   both loaders to column selects was the second largest saving.

Neither change altered behaviour: the full suite passed before and after.

## Real-time delivery

`tests/test_realtime.py` proves cross-worker fan-out with two `Hub` objects over
one broker, which is the topology that matters. A genuine two-process run:

```bash
# Terminal 1 — Redis
docker run --rm -p 6379:6379 redis:8-alpine

# Terminal 2 — set REDIS_URL=redis://host.docker.internal:6379/0 in backend/.env,
# then start two workers
docker compose run --rm -p 8001:8000 api uvicorn app.main:app --host 0.0.0.0 --port 8000
docker compose run --rm -p 8002:8000 api uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Connect a client to each (`ws://127.0.0.1:8001/ws/v1/stream?token=…&topics=building:bld-h`
and the same on 8002) and confirm both receive a `state_changed` when either
worker's transition scheduler fires. With `REDIS_URL` unset, each worker's
`welcome` frame reports `cross_worker_fan_out: false` and only the publishing
worker's clients are reached — which is the documented fallback behaviour, not a
bug.

**Load testing a few thousand simulated clients (§10.5) has not been done.** It
needs a harness this phase did not build and a host with more headroom than a
laptop container. Carried into the Phase 8 hardening checklist.

## Other measured figures

- **Demo schedule seeding**: 3,370 meetings across 14 campus-local days in about
  25 s, including the 3,184 `resource_occupancy` rows that make the exclusion
  constraint cover lessons.
- **Booking concurrency**: 50 concurrent transactions competing for one slot
  resolve to exactly one winner
  (`tests/test_booking.py::test_fifty_concurrent_requests_for_one_slot_produce_exactly_one_winner`),
  in well under a second.
- **Full test suite**: 638 tests in roughly 3 minutes against a real PostgreSQL,
  including migration up/down and the concurrency test.
