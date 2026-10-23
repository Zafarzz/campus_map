"""The transition scheduler: react to state changes instead of polling for them.

The brief's instruction (section 10.2): *compute each room's next transition
time and schedule a job for it, instead of polling every room every second.*

The loop:

1. Ask the state engine when each room next changes
   (:func:`app.services.state_service.upcoming_transitions`).
2. Sleep until the **soonest** of those instants.
3. Re-evaluate only the rooms that were due, record any genuine change in the
   append-only history, and publish ``state_changed`` to the affected topics.
4. Go to 1.

One timer, not one per room. On a 1,000-room campus the rooms share a few dozen
distinct transition instants - lesson boundaries are aligned by the timetable -
so a single wake-up usually settles many rooms at once.

The correctness condition is the property
``test_the_state_is_stable_until_the_next_transition`` pins down in
``tests/test_room_state.py``: nothing changes strictly between now and the next
reported transition. If that held only approximately, the map would go stale
between wake-ups.
"""

from __future__ import annotations

import asyncio
import contextlib
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from app.core.config import Settings, get_settings
from app.core.db import Database, get_database
from app.core.logging import get_logger
from app.core.time import now as utc_now
from app.engines.room_state import RoomState
from app.realtime.hub import Hub, get_hub
from app.services import campus_service, history_service, state_service

log = get_logger(__name__)

__all__ = ["TransitionRunner", "settle_due_rooms"]

#: Never sleep longer than this, even when the next transition is far away.
#: Bounds how stale the scheduler's picture can get if the timetable changes
#: underneath it without anything calling :meth:`TransitionRunner.poke`.
MAX_SLEEP = timedelta(minutes=5)

#: Nor shorter than this, so a cluster of near-simultaneous transitions settles
#: in one pass rather than waking the loop a dozen times in a second.
MIN_SLEEP = timedelta(seconds=1)

#: Slack added after a transition instant before re-evaluating. Without it the
#: evaluation can land a few microseconds *before* the boundary - clocks and
#: event-loop scheduling are not exact - and read the pre-transition state,
#: which would then not be re-checked until the next wake-up.
SETTLE_SLACK = timedelta(milliseconds=250)


@dataclass
class SettleResult:
    """What one settling pass did."""

    evaluated: int = 0
    recorded: int = 0
    published: int = 0
    next_transition: datetime | None = None


async def settle_due_rooms(
    database: Database,
    hub: Hub,
    settings: Settings,
    *,
    at: datetime | None = None,
    horizon: timedelta = timedelta(0),
) -> SettleResult:
    """Re-evaluate the campus, record genuine changes, and publish them.

    **Every room is evaluated on each wake-up, not only the ones whose
    transition is due.** That sounds like the polling the brief rules out, but
    it is not: polling means waking *on a clock*, and this wakes on the next
    transition instant. Evaluating the whole campus once awake costs one query
    and some in-memory work, and it fixes two things that a due-only pass got
    wrong:

    * **The first pass recorded nothing.** With no history yet, every room's
      state is news - but at, say, 00:30 no transition has passed, so a due-only
      pass found nothing to do and left the history empty until the next lesson
      boundary. ``/stream/changes`` then had nothing to return and a replay had
      no baseline.
    * **Anything that changed a room without moving its next transition** - a
      booking, an override, a maintenance ticket - was missed until that room's
      next boundary.

    De-duplication is what makes this safe to do repeatedly:
    :func:`app.services.history_service.record_transitions` compares against the
    last recorded event per room and writes only differences, so a pass where
    nothing changed writes nothing and publishes nothing.

    ``horizon`` only affects *when to wake next*: with zero, the next wake-up is
    the soonest future transition. A caller can push it out to skip transitions
    it has already accounted for.

    Opens its own session rather than taking one: this runs from a timer, not a
    request, and must not hold a request's transaction open.
    """
    instant = at or utc_now()
    result = SettleResult()

    async with database.sessionmaker() as session:
        campus = await campus_service.get_default_campus(session)
        timezone = ZoneInfo(campus.timezone)
        options = state_service.resolve_options(settings, timezone)

        pairs = await state_service.upcoming_transitions(
            session, instant, timezone=timezone, options=options, limit=5000
        )
        cutoff = instant + horizon
        result.next_transition = next((when for _, when in pairs if when > cutoff), None)

        evaluated = await state_service.state_for_campus(session, instant, timezone=timezone, options=options)
        states = evaluated.states
        result.evaluated = len(states)
        if not states:
            return result

        # Only genuine changes are written; the history service compares against
        # the last recorded event per room and returns the rooms it recorded.
        recorded_rooms = await history_service.record_transitions(
            session, states, cause_ref="transition_scheduler"
        )
        result.recorded = len(recorded_rooms)
        if not recorded_rooms:
            return result

        by_room = {state.room_id: state for state in states}
        changed = [by_room[room_id] for room_id in recorded_rooms]
        await session.commit()

    # Published after the commit, so a client that reacts by calling /state
    # cannot read a value older than the event that told it to look.
    result.published = await _publish_changes(hub, changed)
    return result


async def _publish_changes(hub: Hub, states: Sequence[RoomState]) -> int:
    """Publish ``state_changed`` for each room whose state was just recorded."""
    published = 0
    for state in states:
        await hub.publish_state_changed(
            room_id=state.room_id,
            building_id=state.building_id,
            state=state.state.value,
            confirmation=state.confirmation.value,
            out_of_service=state.out_of_service,
            source=state.provenance.value,
        )
        published += 1
    return published


class TransitionRunner:
    """Owns the single timer.

    Started from the app lifespan. ``poke()`` collapses the wait when something
    changes the timetable - a booking, an override, a check-in, a ticket - so
    the affected rooms are re-evaluated immediately rather than at the next
    scheduled wake-up.
    """

    def __init__(
        self,
        database: Database | None = None,
        hub: Hub | None = None,
        settings: Settings | None = None,
    ) -> None:
        self._database = database or get_database()
        self._hub = hub or get_hub()
        self._settings = settings or get_settings()
        self._wake = asyncio.Event()
        self._task: asyncio.Task[None] | None = None
        self._stopping = False

    async def start(self) -> None:
        if self._task is not None:
            return
        self._stopping = False
        self._task = asyncio.create_task(self._run_forever())
        log.info("transition_scheduler_started")

    async def stop(self) -> None:
        self._stopping = True
        self._wake.set()
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None
            log.info("transition_scheduler_stopped")

    def poke(self) -> None:
        """Wake the loop now.

        Called when a booking, override, check-in or ticket changes something,
        so the room's new state reaches the map without waiting for its next
        scheduled transition.
        """
        self._wake.set()

    async def _run_forever(self) -> None:
        while not self._stopping:
            try:
                result = await settle_due_rooms(self._database, self._hub, self._settings)
                delay = self._delay_until(result.next_transition)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                # A failed pass must not kill the scheduler: the next one may
                # well succeed, and a dead scheduler shows a frozen map with no
                # error anywhere a user can see.
                log.warning("transition_pass_failed", error=str(exc))
                delay = MAX_SLEEP

            self._wake.clear()
            # A timeout is the normal path: it means the sleep ran its course
            # rather than being cut short by a poke().
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(self._wake.wait(), timeout=delay.total_seconds())

    @staticmethod
    def _delay_until(target: datetime | None) -> timedelta:
        """How long to sleep, clamped to the documented bounds."""
        if target is None:
            return MAX_SLEEP
        remaining = (target - utc_now()) + SETTLE_SLACK
        return max(MIN_SLEEP, min(remaining, MAX_SLEEP))
