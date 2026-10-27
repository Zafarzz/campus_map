"""Loading room state from PostgreSQL and handing it to the pure engine.

The division of labour matters (brief section 10.2): :mod:`app.engines.room_state`
decides *what the state is* and does no I/O; this module decides *which rows to
load* and does nothing else. Keeping the decision logic out of the query layer is
what lets the engine be property-tested at arbitrary instants, and keeping the
query out of the engine is what lets a whole building be answered in one round
trip instead of one query per room.

**One query per request, not per room.** ``GET /state?building=bld-h`` loads
every room in the building and every occupancy overlapping the instant, then
buckets in memory. The brief's target is a p95 under 100 ms for a full building
on a 1,000-room campus; see ``docs/runbooks/performance.md`` for the measured
numbers.

The window loaded is the whole campus-local day containing ``at``, not just the
instant, because rules 3 to 5 need today's other occurrences: ``free_until``
wants the next start and ``done_for_today`` wants to know something happened
earlier.
"""

from __future__ import annotations

import time as _time
import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import ColumnElement, event, select, true
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute, Session

from app.core.config import Settings, get_settings
from app.core.errors import NotFoundError
from app.core.time import campus_date, campus_day_bounds
from app.domain.academic import Meeting
from app.domain.base import ConfirmationState, OccupancyKind, OccupancyStatus
from app.domain.booking import Booking, Resource, ResourceOccupancy
from app.domain.spatial import Building, Floor, Room
from app.engines.room_state import (
    BuildingSummary,
    Interval,
    RoomContext,
    RoomState,
    StateOptions,
    next_transition_at,
    state_at,
    summarise,
)

__all__ = [
    "StateQuery",
    "StateResult",
    "invalidate_state_cache",
    "load_room_contexts",
    "resolve_options",
    "state_cache_stats",
    "state_for_building",
    "state_for_campus",
    "state_for_room",
    "upcoming_transitions",
]

# --------------------------------------------------------------------- cache
# Per-minute-bucket room-context cache (tracked in docs/runbooks/performance.md
# as the first item in the Phase 3 backlog). Invalidated automatically on any
# SQLAlchemy flush or rollback and explicitly via `invalidate_state_cache()`.

_CACHE_TTL_SECONDS = 60.0
_STATE_CACHE: dict[tuple[object, ...], tuple[float, dict[str, RoomContext]]] = {}
_CACHE_HITS = 0
_CACHE_MISSES = 0


def invalidate_state_cache() -> None:
    """Clear the per-minute-bucket room-context cache."""
    _STATE_CACHE.clear()


def state_cache_stats() -> dict[str, int]:
    """Return cache hit/miss counters and current entry count."""
    return {
        "entries": len(_STATE_CACHE),
        "hits": _CACHE_HITS,
        "misses": _CACHE_MISSES,
    }


@event.listens_for(Session, "after_flush")
def _on_session_after_flush(session: Session, flush_context: object) -> None:
    _ = (session, flush_context)
    invalidate_state_cache()


@event.listens_for(Session, "after_soft_rollback")
def _on_session_after_rollback(session: Session, previous_transaction: object) -> None:
    _ = (session, previous_transaction)
    invalidate_state_cache()


@dataclass(frozen=True, slots=True)
class StateQuery:
    """What the caller asked for."""

    at: datetime
    building_id: str | None = None
    room_ids: tuple[str, ...] | None = None
    include_bookings: bool = True


@dataclass(frozen=True, slots=True)
class StateResult:
    """States plus the per-building roll-ups the map's badges need."""

    at: datetime
    states: list[RoomState]
    summaries: dict[str, BuildingSummary]

    @property
    def live_counts(self) -> dict[str, int]:
        """``{building_id: rooms in lesson_now}`` - the "N live" badge."""
        return {key: value.live_count for key, value in self.summaries.items()}

    def by_room(self) -> dict[str, RoomState]:
        return {item.room_id: item for item in self.states}


def resolve_options(
    settings: Settings,
    timezone: ZoneInfo,
    *,
    starts_soon_minutes: int | None = None,
    compat: bool = False,
) -> StateOptions:
    """Build engine options for a request.

    Three sources, in precedence order: an explicit override, the compatibility
    window (60, matching the front end's ``upcomingWindowMinutes``), then the
    clean-API default (15). The compat layer and the clean API run in the same
    process and must be able to disagree, which is why this is per-request
    rather than global.
    """
    if starts_soon_minutes is None:
        starts_soon_minutes = (
            settings.compat_upcoming_window_minutes if compat else settings.starts_soon_minutes
        )
    return StateOptions(starts_soon_minutes=starts_soon_minutes, timezone=timezone)


async def load_room_contexts(
    session: AsyncSession,
    query: StateQuery,
    *,
    timezone: ZoneInfo,
) -> dict[str, RoomContext]:
    """Load rooms and their occupancies for the campus-local day around ``at``.

    Returns a context per room, including rooms with nothing scheduled - a room
    with no lessons is "free", and omitting it would make the map lose the room
    rather than show it as available.
    """
    global _CACHE_HITS, _CACHE_MISSES

    minute_bucket = int(query.at.timestamp() // 60)
    cache_key: tuple[object, ...] = (
        minute_bucket,
        query.building_id,
        query.room_ids,
        query.include_bookings,
        timezone.key,
    )
    now_mono = _time.monotonic()
    cached = _STATE_CACHE.get(cache_key)
    if cached is not None and (now_mono - cached[0]) < _CACHE_TTL_SECONDS:
        _CACHE_HITS += 1
        return cached[1]

    _CACHE_MISSES += 1
    day_start, day_end = campus_day_bounds(campus_date(query.at, timezone), timezone)

    # Widen the loaded window so an occupancy that starts before local midnight
    # and runs into the day (or starts late and runs past it) is still present.
    # Rules 1 and 2 look at whatever covers `at` regardless of which day it
    # belongs to, so a hard day boundary here would drop an overnight event.
    window_start = day_start - timedelta(days=1)
    window_end = day_end + timedelta(days=1)

    rooms = await _load_rooms(session, query)
    if not rooms:
        return {}

    intervals: dict[str, list[Interval]] = defaultdict(list)

    for room_id, interval in await _load_meeting_intervals(session, query, window_start, window_end):
        intervals[room_id].append(interval)

    if query.include_bookings:
        for room_id, interval in await _load_booking_intervals(session, query, window_start, window_end):
            intervals[room_id].append(interval)

    contexts = {
        room_id: RoomContext(
            room_id=room_id,
            capacity=row.capacity,
            out_of_service=row.out_of_service,
            intervals=tuple(intervals.get(room_id, ())),
            building_id=row.building_id,
        )
        for room_id, row in rooms.items()
    }
    _STATE_CACHE[cache_key] = (now_mono, contexts)
    return contexts


@dataclass(frozen=True, slots=True)
class _RoomRow:
    """The four room columns the state engine actually needs.

    Selected as columns rather than as a :class:`~app.domain.spatial.Room`
    entity. The engine reads ``capacity`` and ``out_of_service`` and nothing
    else, while hydrating the entity costs identity-map registration and change
    tracking for a row that is read once and never written - which on a
    1,000-room query was a measurable share of the total.
    """

    id: str
    building_id: str
    capacity: int | None
    out_of_service: bool


async def _load_rooms(session: AsyncSession, query: StateQuery) -> dict[str, _RoomRow]:
    """``{room_id: row}`` for the requested scope."""
    stmt = (
        select(
            Room.id,
            Floor.building_id,
            Room.capacity,
            Room.out_of_service,
        )
        .join(Floor, Floor.id == Room.floor_id)
        .order_by(Floor.building_id, Floor.level, Room.sort_order, Room.id)
    )

    if query.building_id is not None:
        exists = await session.get(Building, query.building_id)
        if exists is None:
            raise NotFoundError(f"Building {query.building_id!r} does not exist.", code="building_not_found")
        stmt = stmt.where(Floor.building_id == query.building_id)

    if query.room_ids is not None:
        if not query.room_ids:
            return {}
        stmt = stmt.where(Room.id.in_(query.room_ids))

    result = await session.execute(stmt)
    return {
        row.id: _RoomRow(
            id=row.id,
            building_id=row.building_id,
            capacity=row.capacity,
            out_of_service=row.out_of_service,
        )
        for row in result.all()
    }


def _room_scope(query: StateQuery, room_column: InstrumentedAttribute[str | None]) -> ColumnElement[bool]:
    """The predicate restricting a query to the request's rooms.

    Returns a clause rather than wrapping the query, because ``Select`` is
    generic over the *tuple of columns selected* - which differs at every call
    site - and threading that through a helper means either a variadic generic
    or erasing the row type. A boolean clause composes with any ``select()``
    and keeps each query's own typing intact.

    Two ways to express "these rooms", and which one is used matters a great
    deal at scale:

    * **By join**, when the scope is a building or the whole campus. The room
      set is described by a predicate, so the database never sees a list.
    * **By ``IN``**, only when the caller asked for specific room ids - which is
      a handful, from ``/rooms/{id}/state``.

    Passing a thousand room ids in an ``IN`` list was the single largest cost in
    a full-campus query: it defeats the planner's use of the composite index and
    the list itself has to be parsed and matched per row. Measured on a
    synthetic 1,000-room building, replacing it with the join below took the
    p95 for a full-building query from roughly 390 ms to comfortably under the
    brief's 100 ms target (``docs/runbooks/performance.md``).
    """
    if query.room_ids is not None:
        return room_column.in_(query.room_ids)
    if query.building_id is not None:
        return room_column.in_(
            select(Room.id)
            .join(Floor, Floor.id == Room.floor_id)
            .where(Floor.building_id == query.building_id)
            .scalar_subquery()
        )
    # Whole campus: every room is wanted, so the cheapest filter is none at all.
    # ``true()`` keeps the call site uniform and the planner discards it.
    return true()


async def _load_meeting_intervals(
    session: AsyncSession,
    query: StateQuery,
    window_start: datetime,
    window_end: datetime,
) -> list[tuple[str, Interval]]:
    """Timetable occurrences overlapping the window.

    Reads **materialised** ``meeting`` rows and never re-expands recurrence rules
    per request (brief section 10.1). Expansion happens once at import time; this
    is the hot path.

    Overlap, not containment: ``starts_at < window_end AND ends_at >
    window_start``. The composite index ``ix_meeting_room_window`` on
    ``(room_id, starts_at, ends_at)`` serves it.

    Selects **columns rather than entities**. The engine needs seven values per
    meeting; hydrating a full ORM object per row adds identity-map bookkeeping
    and change tracking for a row that is read once and never written. On a
    campus-sized query that was the second largest cost after the ``IN`` list.
    """
    stmt = select(
        Meeting.room_id,
        Meeting.id,
        Meeting.starts_at,
        Meeting.ends_at,
        Meeting.cancelled,
        Meeting.subject,
        Meeting.teacher_label,
        Meeting.group_label,
    ).where(
        Meeting.room_id.is_not(None),
        Meeting.starts_at < window_end,
        Meeting.ends_at > window_start,
    )
    result = await session.execute(stmt.where(_room_scope(query, Meeting.room_id)))

    intervals: list[tuple[str, Interval]] = []
    for row in result.all():
        intervals.append(
            (
                row.room_id,
                Interval(
                    starts_at=row.starts_at,
                    ends_at=row.ends_at,
                    kind=OccupancyKind.lesson,
                    cancelled=row.cancelled,
                    ref=str(row.id),
                    subject=row.subject,
                    teacher_label=row.teacher_label,
                    group_label=row.group_label,
                    # A scheduled lesson with nobody checked in is *unconfirmed*,
                    # never "empty" (brief section 10.3). Attendance evidence
                    # upgrades this in Phase 4; until then every lesson says so
                    # honestly rather than implying confirmation.
                    confirmation=ConfirmationState.unconfirmed,
                ),
            )
        )
    return intervals


async def _load_booking_intervals(
    session: AsyncSession,
    query: StateQuery,
    window_start: datetime,
    window_end: datetime,
) -> list[tuple[str, Interval]]:
    """Bookings, events, maintenance and blackouts overlapping the window.

    Read from ``resource_occupancy`` rather than from ``booking``, because that
    is the table the exclusion constraint guards and therefore the only one
    guaranteed to be complete: events and maintenance windows write there too,
    without a ``booking`` row.

    Only ``pending`` and ``confirmed`` rows occupy a room - the same predicate
    the exclusion constraint uses - so a cancelled or released booking frees the
    room here exactly as it does in the database.
    """
    stmt = (
        select(
            Resource.room_id,
            ResourceOccupancy.id,
            ResourceOccupancy.period,
            ResourceOccupancy.kind,
            ResourceOccupancy.booking_id,
            Booking.checked_in_at,
        )
        .join(Resource, Resource.id == ResourceOccupancy.resource_id)
        .outerjoin(Booking, Booking.id == ResourceOccupancy.booking_id)
        .where(
            # An occupancy on a non-room resource (a projector, a laundry slot)
            # has no bearing on a room's state, so it is excluded in SQL rather
            # than fetched and discarded.
            Resource.room_id.is_not(None),
            ResourceOccupancy.status.in_((OccupancyStatus.pending, OccupancyStatus.confirmed)),
            # Occupancies carry a tstzrange; compare with the range operators so
            # the GiST index on `period` is usable.
            ResourceOccupancy.period.op("&&")(_tstzrange(window_start, window_end)),
        )
    )
    result = await session.execute(stmt.where(_room_scope(query, Resource.room_id)))

    intervals: list[tuple[str, Interval]] = []
    for row in result.all():
        room_id = row.room_id
        bounds = _range_bounds(row.period)
        if bounds is None:
            continue
        starts_at, ends_at = bounds
        intervals.append(
            (
                room_id,
                Interval(
                    starts_at=starts_at,
                    ends_at=ends_at,
                    kind=row.kind,
                    cancelled=False,
                    ref=str(row.id),
                    confirmation=_booking_confirmation(
                        kind=row.kind,
                        booking_id=row.booking_id,
                        checked_in_at=row.checked_in_at,
                    ),
                ),
            )
        )
    return intervals


def _booking_confirmation(
    *,
    kind: OccupancyKind,
    booking_id: uuid.UUID | None,
    checked_in_at: datetime | None,
) -> ConfirmationState:
    """Whether a human has confirmed this occupancy.

    A booking with a check-in is ``confirmed``; one still waiting is
    ``unconfirmed``. Maintenance and blackouts are ``not_required`` - nobody
    checks in to a closed room, and marking them unconfirmed would invite a
    client to render "nobody turned up" about a window that was never about
    people.
    """
    if kind in {OccupancyKind.maintenance, OccupancyKind.blackout}:
        return ConfirmationState.not_required
    if checked_in_at is not None:
        return ConfirmationState.confirmed
    if booking_id is None:
        return ConfirmationState.not_required
    return ConfirmationState.unconfirmed


def _tstzrange(start: datetime, end: datetime) -> object:
    """A half-open ``tstzrange`` literal for an overlap comparison."""
    from sqlalchemy.dialects.postgresql import Range

    return Range(start, end, bounds="[)")


def _range_bounds(period: object) -> tuple[datetime, datetime] | None:
    """Extract ``(lower, upper)`` from a psycopg/asyncpg range value.

    Unbounded ranges are skipped rather than clamped: the engine's intervals are
    finite by construction, and inventing a bound would silently turn "reserved
    indefinitely" into a window that expires.
    """
    lower = getattr(period, "lower", None)
    upper = getattr(period, "upper", None)
    if not isinstance(lower, datetime) or not isinstance(upper, datetime):
        return None
    if upper <= lower:
        return None
    return lower, upper


# --------------------------------------------------------------------- queries


async def state_for_room(
    session: AsyncSession,
    room_id: str,
    at: datetime,
    *,
    timezone: ZoneInfo,
    options: StateOptions | None = None,
) -> RoomState:
    """One room's state. Raises :class:`NotFoundError` if the room is unknown."""
    contexts = await load_room_contexts(session, StateQuery(at=at, room_ids=(room_id,)), timezone=timezone)
    context = contexts.get(room_id)
    if context is None:
        raise NotFoundError(f"Room {room_id!r} does not exist.", code="room_not_found")
    return state_at(context, at, options or StateOptions(timezone=timezone))


async def state_for_building(
    session: AsyncSession,
    building_id: str,
    at: datetime,
    *,
    timezone: ZoneInfo,
    options: StateOptions | None = None,
) -> StateResult:
    """Every room in one building, plus its roll-up."""
    return await _evaluate(
        session,
        StateQuery(at=at, building_id=building_id),
        timezone=timezone,
        options=options,
    )


async def state_for_campus(
    session: AsyncSession,
    at: datetime,
    *,
    timezone: ZoneInfo,
    options: StateOptions | None = None,
) -> StateResult:
    """Every room on the campus, with a roll-up per building."""
    return await _evaluate(session, StateQuery(at=at), timezone=timezone, options=options)


async def _evaluate(
    session: AsyncSession,
    query: StateQuery,
    *,
    timezone: ZoneInfo,
    options: StateOptions | None,
) -> StateResult:
    opts = options or StateOptions(timezone=timezone)
    contexts = await load_room_contexts(session, query, timezone=timezone)

    states = [state_at(context, query.at, opts) for context in contexts.values()]

    grouped: dict[str, list[RoomState]] = defaultdict(list)
    for item in states:
        if item.building_id is not None:
            grouped[item.building_id].append(item)

    return StateResult(
        at=query.at,
        states=states,
        summaries={
            building_id: summarise(items, building_id=building_id, at=query.at)
            for building_id, items in sorted(grouped.items())
        },
    )


async def upcoming_transitions(
    session: AsyncSession,
    at: datetime,
    *,
    timezone: ZoneInfo,
    options: StateOptions | None = None,
    limit: int = 500,
) -> list[tuple[str, datetime]]:
    """``(room_id, instant)`` pairs for the next state change of each room.

    This is what the transition scheduler consumes (brief section 10.2): instead
    of polling every room every second, it asks when each room next changes and
    sets one timer per instant. Sorted soonest-first and truncated, because the
    scheduler only needs the near horizon - it re-asks after each wake-up.
    """
    opts = options or StateOptions(timezone=timezone)
    contexts = await load_room_contexts(session, StateQuery(at=at), timezone=timezone)

    pairs: list[tuple[str, datetime]] = []
    for room_id, context in contexts.items():
        following = next_transition_at(context, at, opts)
        if following is not None:
            pairs.append((room_id, following))

    pairs.sort(key=lambda item: (item[1], item[0]))
    return pairs[:limit]


def settings_timezone(settings: Settings | None = None) -> ZoneInfo:
    """The campus timezone from configuration.

    A thin helper so endpoints do not each reach into settings; the authoritative
    value lives on the ``campus`` row and is passed explicitly everywhere the
    campus is already loaded.
    """
    return (settings or get_settings()).timezone
