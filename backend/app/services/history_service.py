"""History: append-only capture, snapshots, and replay.

The brief's reason for building this now rather than later (section 10.6):
**history cannot be created after the fact.** If a transition is not recorded as
it happens, no amount of later work recovers it, so capture starts in Layer 0
even though the forecasting that consumes it is Layer 10.

Two timestamps, and they are not the same thing:

* ``effective_at`` - when the state became true.
* ``recorded_at`` - when the system learned it.

That pair is what lets replay answer both "what was true then?" and "what did we
believe then?". A teacher who confirms at 10:30 that a 09:00 lesson happened
creates a row with ``effective_at`` 09:00 and ``recorded_at`` 10:30; a replay of
the morning as-known-at-09:15 must not see it.

``sequence`` is a database sequence shared by every room, so a reconnecting
WebSocket client asks "everything after N" **once** rather than once per room.
A timestamp could not serve: two events in the same microsecond must still have
a strict order.

Rows are never updated or deleted outside the documented retention policy.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ValidationError
from app.core.logging import get_logger
from app.core.time import now as utc_now
from app.domain.base import ConfirmationState, RoomStateKind
from app.domain.history import RoomStateEvent, StateSnapshot
from app.engines.room_state import RoomState, StateOptions
from app.services import state_service

log = get_logger(__name__)

__all__ = [
    "MAX_REPLAY_STEPS",
    "ReplayFrame",
    "record_transitions",
    "replay",
    "take_snapshot",
]

#: Ceiling on frames one replay request may produce. A year at one-minute steps
#: is half a million frames; refusing is better than streaming it.
MAX_REPLAY_STEPS = 2_000


async def record_transitions(
    session: AsyncSession,
    states: list[RoomState] | tuple[RoomState, ...],
    *,
    cause_ref: str | None = None,
    recorded_at: datetime | None = None,
) -> list[str]:
    """Append a state event for each room whose state actually changed.

    Compares against the latest recorded event per room and writes **only
    differences**. Writing a row every time the engine is asked would turn an
    append-only history into a log of queries, and replay would then be
    dominated by rows that say nothing happened.

    Returns the **room ids** it wrote an event for, not just a count: the
    transition scheduler publishes a ``state_changed`` per recorded change, and
    it has no other way to tell which rooms those were. Recovering them by
    inspecting the session afterwards does not work - this function flushes, so
    the new rows are already persistent by the time it returns.
    """
    if not states:
        return []

    instant = recorded_at or utc_now()
    latest = await _latest_states(session, [item.room_id for item in states])

    written: list[str] = []
    for current in states:
        previous = latest.get(current.room_id)
        if previous is not None and not _differs(previous, current):
            continue

        session.add(
            RoomStateEvent(
                room_id=current.room_id,
                state=current.state,
                previous_state=previous.state if previous else None,
                kind=current.kind.value if current.kind else None,
                confirmation=current.confirmation,
                provenance=current.provenance,
                out_of_service=current.out_of_service,
                # When it became true, not when we noticed.
                effective_at=current.at,
                recorded_at=instant,
                cause_ref=cause_ref,
                details=_details(current),
            )
        )
        written.append(current.room_id)

    if written:
        await session.flush()
        log.info("state_events_recorded", count=len(written), cause=cause_ref or "")
    return written


@dataclass(frozen=True, slots=True)
class _RecordedState:
    """The last known recorded state of a room."""

    state: RoomStateKind
    confirmation: ConfirmationState
    out_of_service: bool
    kind: str | None


async def _latest_states(session: AsyncSession, room_ids: list[str]) -> dict[str, _RecordedState]:
    """The most recent event per room, by ``sequence``.

    Uses a window function so it is one query rather than one per room: on a
    1,000-room campus the per-room version would dominate the cost of recording.
    """
    if not room_ids:
        return {}

    ranked = (
        select(
            RoomStateEvent.room_id,
            RoomStateEvent.state,
            RoomStateEvent.confirmation,
            RoomStateEvent.out_of_service,
            RoomStateEvent.kind,
            func.row_number()
            .over(
                partition_by=RoomStateEvent.room_id,
                order_by=RoomStateEvent.sequence.desc(),
            )
            .label("rank"),
        )
        .where(RoomStateEvent.room_id.in_(room_ids))
        .subquery()
    )

    result = await session.execute(select(ranked).where(ranked.c.rank == 1))
    return {
        row.room_id: _RecordedState(
            state=row.state,
            confirmation=row.confirmation,
            out_of_service=row.out_of_service,
            kind=row.kind,
        )
        for row in result.all()
    }


def _differs(previous: _RecordedState, current: RoomState) -> bool:
    """Whether a room's recorded state is stale.

    Compares only the fields a client renders. ``free_until`` is deliberately
    excluded: it changes whenever the next lesson is re-read, which would make
    every evaluation look like a transition.
    """
    return (
        previous.state is not current.state
        or previous.confirmation is not current.confirmation
        or previous.out_of_service != current.out_of_service
        or previous.kind != (current.kind.value if current.kind else None)
    )


def _details(state: RoomState) -> dict[str, object] | None:
    """The occupancy behind a state, for explaining it later."""
    if state.current is None:
        return None
    return {
        "ref": state.current.ref,
        "subject": state.current.subject,
        "starts_at": state.current.starts_at.isoformat(),
        "ends_at": state.current.ends_at.isoformat(),
    }


async def take_snapshot(
    session: AsyncSession,
    *,
    at: datetime,
    timezone: ZoneInfo,
    scope_type: str = "campus",
    scope_id: str | None = None,
    options: StateOptions | None = None,
) -> StateSnapshot:
    """Record a full-campus state snapshot.

    Replaying a day from events alone means folding every transition since the
    beginning of time. A periodic snapshot bounds that work: replay starts from
    the most recent snapshot at or before the window and applies only the events
    after it.
    """
    result = await state_service.state_for_campus(session, at, timezone=timezone, options=options)

    snapshot = StateSnapshot(
        scope_type=scope_type,
        scope_id=scope_id or "ajou-tashkent",
        at=at,
        states={
            item.room_id: {
                "state": item.state.value,
                "kind": item.kind.value if item.kind else None,
                "confirmation": item.confirmation.value,
                "provenance": item.provenance.value,
                "out_of_service": item.out_of_service,
            }
            for item in result.states
        },
        live_counts=dict(result.live_counts),
    )
    session.add(snapshot)
    await session.flush()

    log.info("snapshot_taken", at=at.isoformat(), rooms=len(result.states))
    return snapshot


@dataclass
class ReplayFrame:
    """One instant of the replay."""

    at: datetime
    states: dict[str, str]
    live_counts: dict[str, int] = field(default_factory=dict)
    #: True when this frame came from recorded history rather than from
    #: re-evaluating the timetable. The distinction is the honesty requirement:
    #: a reconstructed frame is what the engine *would* have said, which is not
    #: the same as what it did say.
    from_history: bool = True

    def as_dict(self) -> dict[str, object]:
        return {
            "at": self.at.isoformat(),
            "states": self.states,
            "live_counts": self.live_counts,
            "source": "recorded" if self.from_history else "reconstructed",
        }


async def replay(
    session: AsyncSession,
    *,
    start: datetime,
    end: datetime,
    step: timedelta,
    timezone: ZoneInfo,
    as_known_at: datetime | None = None,
    options: StateOptions | None = None,
) -> list[ReplayFrame]:
    """Replay recorded states between two instants.

    ``as_known_at`` is the time-machine's second axis: with it set, only events
    **recorded** at or before that instant are considered, so the replay shows
    what the system believed at the time rather than what later turned out to be
    true. Without it, the best current knowledge is used.

    When no history covers the window - the normal case for a freshly seeded
    database - the frames are **reconstructed** by re-evaluating the timetable,
    and each one says so via ``from_history=False``. Reconstruction is a
    legitimate answer to "what was the state?" but it is not a recording, and
    conflating the two would let a gap in capture masquerade as evidence.
    """
    if start.tzinfo is None or end.tzinfo is None:
        raise ValidationError("replay bounds must be timezone-aware instants", code="naive_replay_window")
    if end <= start:
        raise ValidationError(
            f"replay window must be non-empty, got {start.isoformat()} to {end.isoformat()}",
            code="empty_replay_window",
        )
    if step <= timedelta(0):
        raise ValidationError("replay step must be positive", code="invalid_replay_step")

    frames_wanted = int((end - start) / step) + 1
    if frames_wanted > MAX_REPLAY_STEPS:
        raise ValidationError(
            f"that window and step would produce {frames_wanted} frames, over the "
            f"{MAX_REPLAY_STEPS} limit. Use a coarser step or a shorter window.",
            code="replay_too_large",
            details={"frames": frames_wanted, "limit": MAX_REPLAY_STEPS},
        )

    events = await _load_events(session, start=start, end=end, as_known_at=as_known_at)
    baseline = await _load_baseline(session, before=start, as_known_at=as_known_at)

    if not events and not baseline:
        return await _reconstruct(
            session, start=start, end=end, step=step, timezone=timezone, options=options
        )

    frames: list[ReplayFrame] = []
    current: dict[str, str] = dict(baseline)
    cursor = start
    index = 0

    while cursor <= end:
        # Fold in every event effective at or before this frame.
        while index < len(events) and events[index].effective_at <= cursor:
            event = events[index]
            current[event.room_id] = event.state.value
            index += 1

        frames.append(ReplayFrame(at=cursor, states=dict(current), from_history=True))
        cursor += step

    return frames


async def _load_events(
    session: AsyncSession,
    *,
    start: datetime,
    end: datetime,
    as_known_at: datetime | None,
) -> list[RoomStateEvent]:
    """Events effective within the window, in effective order."""
    stmt = (
        select(RoomStateEvent)
        .where(RoomStateEvent.effective_at >= start, RoomStateEvent.effective_at <= end)
        .order_by(RoomStateEvent.effective_at, RoomStateEvent.sequence)
    )
    if as_known_at is not None:
        stmt = stmt.where(RoomStateEvent.recorded_at <= as_known_at)

    result = await session.execute(stmt)
    return list(result.scalars().all())


async def _load_baseline(
    session: AsyncSession,
    *,
    before: datetime,
    as_known_at: datetime | None,
) -> dict[str, str]:
    """Each room's state as of just before the window opens.

    Without this the first frames would show only the rooms that happen to
    change inside the window, and a room that has been in a lesson since before
    it started would appear to be missing.
    """
    ranked_order = RoomStateEvent.sequence.desc()
    stmt = select(
        RoomStateEvent.room_id,
        RoomStateEvent.state,
        func.row_number().over(partition_by=RoomStateEvent.room_id, order_by=ranked_order).label("rank"),
    ).where(RoomStateEvent.effective_at < before)
    if as_known_at is not None:
        stmt = stmt.where(RoomStateEvent.recorded_at <= as_known_at)

    ranked = stmt.subquery()
    result = await session.execute(select(ranked).where(ranked.c.rank == 1))
    return {row.room_id: row.state.value for row in result.all()}


async def _reconstruct(
    session: AsyncSession,
    *,
    start: datetime,
    end: datetime,
    step: timedelta,
    timezone: ZoneInfo,
    options: StateOptions | None,
) -> list[ReplayFrame]:
    """Re-evaluate the timetable when there is no recorded history.

    Honest about what it is: every frame is flagged ``from_history=False``. The
    engine is deterministic, so this is exactly what it *would* have said at
    each instant - but it cannot account for anything that was not in the
    timetable, which is precisely what recorded history exists to capture.
    """
    frames: list[ReplayFrame] = []
    cursor = start
    while cursor <= end:
        result = await state_service.state_for_campus(session, cursor, timezone=timezone, options=options)
        frames.append(
            ReplayFrame(
                at=cursor,
                states={item.room_id: item.state.value for item in result.states},
                live_counts=dict(result.live_counts),
                from_history=False,
            )
        )
        cursor += step
    return frames


async def events_since(
    session: AsyncSession,
    *,
    last_event_id: int,
    limit: int = 500,
) -> list[RoomStateEvent]:
    """Events after a sequence number, for a reconnecting client to catch up.

    This is what makes ``last_event_id`` on the WebSocket work (brief
    section 10.5): one query across every room, ordered by the shared sequence.
    """
    result = await session.execute(
        select(RoomStateEvent)
        .where(RoomStateEvent.sequence > last_event_id)
        .order_by(RoomStateEvent.sequence)
        .limit(limit)
    )
    return list(result.scalars().all())


async def latest_sequence(session: AsyncSession) -> int:
    """The highest event sequence, or 0 when there is no history yet."""
    value = await session.scalar(select(func.max(RoomStateEvent.sequence)))
    return int(value or 0)
