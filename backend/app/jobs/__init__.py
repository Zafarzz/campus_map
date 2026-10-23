"""Scheduled and background work.

The pieces:

* :mod:`.transitions` - the transition scheduler. Computes each room's next
  state change and sets **one timer for the next one**, instead of polling every
  room every second (brief section 10.2).
* :mod:`.maintenance` - the auto-release sweeper and periodic snapshotting.
* :mod:`.scheduler` - the APScheduler wiring.

Why APScheduler rather than ARQ (recorded in
``docs/adr/0011-job-runner-apscheduler.md``): ARQ requires Redis, and Redis is
*optional* in this deployment - the brief asks for an in-process fallback for
local development. A job runner that cannot start without Redis would make the
local stack harder to run than the thing it schedules. APScheduler's
``AsyncIOScheduler`` runs in the API process with no broker at all.

The trade is honest: in-process scheduling means jobs run once **per worker**,
so a two-worker deployment would take the same snapshot twice. The jobs here are
idempotent where that matters, and the runbook documents running the scheduler
on a single designated instance.
"""

from app.jobs.scheduler import JobScheduler, get_scheduler

__all__ = ["JobScheduler", "get_scheduler"]
