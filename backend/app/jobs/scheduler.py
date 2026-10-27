"""APScheduler wiring.

Two kinds of scheduled work, deliberately kept apart:

* The **transition scheduler** (:mod:`app.jobs.transitions`) runs its own
  single timer, because its interval is data-dependent - it sleeps until the
  next lesson boundary, whenever that is. Expressing that as a cron entry would
  mean polling, which is the thing it exists to avoid.
* Everything else is a **fixed interval** and goes through APScheduler: the
  auto-release sweeper, snapshotting, heartbeats.

``AsyncIOScheduler`` runs inside the API's event loop with no broker. See
:mod:`app.jobs` for why that is preferred over ARQ here, and what the trade is.

Jobs are registered with ``coalesce=True`` and ``max_instances=1``: if the loop
is busy and a job's time passes twice, it runs once. A snapshot job that piled
up would otherwise produce a burst of snapshots the moment the loop freed up.
"""

from __future__ import annotations

import contextlib
from typing import Any

from app.core.config import Settings, get_settings
from app.core.logging import get_logger
from app.jobs.maintenance import (
    SNAPSHOT_INTERVAL_MINUTES,
    broadcast_heartbeat,
    release_unclaimed_bookings,
    run_studentlife_housekeeping,
    snapshot_campus_state,
    snapshot_place_busyness,
)
from app.jobs.transitions import TransitionRunner

log = get_logger(__name__)

__all__ = ["JobScheduler", "get_scheduler", "reset_scheduler"]

#: How often to sweep for unclaimed bookings. Finer than the grace period so a
#: released slot becomes bookable promptly rather than up to a grace period late.
RELEASE_SWEEP_SECONDS = 60

#: Heartbeat cadence. Slightly under the socket's own interval so a client that
#: measures silence sees the server's beat first.
HEARTBEAT_SECONDS = 20


class JobScheduler:
    """Owns the APScheduler instance and the transition runner."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._scheduler: Any | None = None
        self._transitions = TransitionRunner(settings=self._settings)

    @property
    def transitions(self) -> TransitionRunner:
        """The transition runner, so request handlers can ``poke()`` it."""
        return self._transitions

    async def start(self) -> None:
        from apscheduler.schedulers.asyncio import AsyncIOScheduler

        if self._scheduler is not None:
            return

        scheduler = AsyncIOScheduler(timezone="UTC")

        scheduler.add_job(
            _guard(release_unclaimed_bookings, "release_unclaimed_bookings"),
            "interval",
            seconds=RELEASE_SWEEP_SECONDS,
            id="release_unclaimed_bookings",
            coalesce=True,
            max_instances=1,
            replace_existing=True,
        )
        scheduler.add_job(
            _guard(snapshot_campus_state, "snapshot_campus_state"),
            "interval",
            minutes=SNAPSHOT_INTERVAL_MINUTES,
            id="snapshot_campus_state",
            coalesce=True,
            max_instances=1,
            replace_existing=True,
        )
        scheduler.add_job(
            _guard(broadcast_heartbeat, "broadcast_heartbeat"),
            "interval",
            seconds=HEARTBEAT_SECONDS,
            id="broadcast_heartbeat",
            coalesce=True,
            max_instances=1,
            replace_existing=True,
        )
        scheduler.add_job(
            _guard(snapshot_place_busyness, "snapshot_place_busyness"),
            "interval",
            minutes=SNAPSHOT_INTERVAL_MINUTES,
            id="snapshot_place_busyness",
            coalesce=True,
            max_instances=1,
            replace_existing=True,
        )
        scheduler.add_job(
            _guard(run_studentlife_housekeeping, "run_studentlife_housekeeping"),
            "interval",
            minutes=15,
            id="run_studentlife_housekeeping",
            coalesce=True,
            max_instances=1,
            replace_existing=True,
        )

        scheduler.start()
        self._scheduler = scheduler
        await self._transitions.start()

        log.info(
            "jobs_started",
            jobs=[job.id for job in scheduler.get_jobs()],
            snapshot_minutes=SNAPSHOT_INTERVAL_MINUTES,
        )

    async def stop(self) -> None:
        await self._transitions.stop()
        if self._scheduler is not None:
            with contextlib.suppress(Exception):
                self._scheduler.shutdown(wait=False)
            self._scheduler = None
            log.info("jobs_stopped")

    def job_ids(self) -> list[str]:
        if self._scheduler is None:
            return []
        return [job.id for job in self._scheduler.get_jobs()]


def _guard(job: Any, name: str) -> Any:
    """Wrap a job so a failure is logged instead of killing its schedule.

    APScheduler removes a job that keeps raising, which would silently stop
    auto-release or snapshotting with nothing visible in the API. Swallowing and
    logging keeps the schedule alive for the next tick.
    """

    async def _run() -> None:
        try:
            await job()
        except Exception as exc:
            log.warning("job_failed", job=name, error=str(exc))

    _run.__name__ = f"guarded_{name}"
    return _run


_scheduler: JobScheduler | None = None


def get_scheduler(settings: Settings | None = None) -> JobScheduler:
    global _scheduler
    if _scheduler is None:
        _scheduler = JobScheduler(settings=settings)
    return _scheduler


async def reset_scheduler() -> None:
    """Stop and discard the process-wide scheduler. For tests and shutdown."""
    global _scheduler
    if _scheduler is not None:
        await _scheduler.stop()
        _scheduler = None
