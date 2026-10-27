# ADR-0011: APScheduler for scheduled work, with the transition scheduler on its own timer

- **Status:** accepted
- **Date:** 2026-10-19
- **Phase:** 2 (Layer 0)
- **Supersedes / superseded by:** —

## Context

`MASTER_PROMPT.md` §5 lists "APScheduler or ARQ (decide in an ADR)" for scheduled
work, escalations and nightly aggregation. Layer 0 needs four recurring jobs:

1. The **transition scheduler** (§10.2) — re-evaluate rooms and publish
   `state_changed` when a lesson boundary passes.
2. The **auto-release sweeper** (§10.4) — free bookings nobody checked in to.
3. **Periodic snapshots** (§10.6) — bound how much history a replay must fold.
4. **Heartbeats** (§8) — keep WebSocket clients able to detect a dead socket.

## Decision

**APScheduler 3.11.3 (`AsyncIOScheduler`) for the fixed-interval jobs, and a
purpose-built single timer for the transition scheduler.**

The split is the substantive part of this decision. The three fixed-interval
jobs are a natural fit for a cron-style scheduler. The transition scheduler is
not: its interval is *data-dependent*, because it sleeps until the next lesson
boundary — whenever that happens to be. Expressing it as a cron entry would mean
picking a polling interval, which is exactly what §10.2 rules out ("instead of
polling every room every second"). So it owns an `asyncio.Event` and a
`wait_for`, and anything that changes a room (`poke()`) collapses the wait.

## Why not ARQ

ARQ **requires Redis**. Redis is optional in this deployment: §5 asks for "Redis
(with an in-process fallback for local development)", and the realtime layer
honours that (ADR-0012). A job runner that cannot start without Redis would make
the local stack strictly harder to run than the application it schedules —
`docker compose up` would need a broker to fire a sweeper that only touches
PostgreSQL.

ARQ's advantages — durable queues, retries, work distributed across machines —
are real but solve problems Layer 0 does not have. These jobs are periodic, not
queued; they are idempotent, so a missed tick is corrected by the next one; and
none of them is long-running enough to want a separate worker fleet.

If a later layer introduces genuinely queued work — sending a few thousand push
notifications, running a CP-SAT timetable optimisation for minutes — that is the
point to revisit this. The two can coexist: APScheduler for periodic triggers,
ARQ for queued jobs.

## Consequences

**The honest cost: jobs run once per worker.** `AsyncIOScheduler` lives in the
API process, so a two-worker deployment fires each tick twice. Every job is
therefore written to be idempotent:

- `snapshot_campus_state` checks for a recent snapshot and declines to write a
  second one.
- `release_expired` only releases bookings past their grace deadline, which a
  second run finds already released.
- `record_transitions` compares against the last recorded event per room and
  writes only differences, so a duplicate pass writes nothing.

`docs/runbooks/` documents running the scheduler on a single designated instance
when that matters more than the redundancy.

**A failing job must not disappear.** APScheduler removes a job that keeps
raising, which would silently stop auto-release with nothing visible in the API.
Every job is wrapped by `_guard()`, which logs and swallows, so the schedule
survives to the next tick.

**`coalesce=True`, `max_instances=1`.** If the loop is busy and a job's time
passes twice, it runs once. A snapshot job that piled up would otherwise produce
a burst of snapshots the moment the loop freed up.

## Verification

Versions checked against PyPI on 2026-10-19: APScheduler 3.11.3 is the current
stable release (4.x is still pre-release). Pinned in `pyproject.toml`.

Covered by `tests/test_history.py`:
`test_the_scheduler_settles_due_rooms_and_records_them`,
`test_a_second_scheduler_pass_records_nothing_new`,
`test_a_snapshot_job_does_not_duplicate_a_recent_snapshot`,
`test_the_scheduler_delay_is_clamped`.
