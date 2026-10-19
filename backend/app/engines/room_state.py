"""Room state engine: what is the state of this room at instant ``at``?

One engine answers for Live and for Simulate, because they are the same
question. "Live" is ``at = now()``; the front end's Simulate slider just passes a
different ``at``. There is no second code path, which is the only way the two can
be guaranteed to agree (brief section 10.2).

**Nothing in this module does I/O.** :func:`state_at` takes a room, an instant
and a pre-loaded :class:`RoomContext`, and returns a :class:`RoomState`. The
caller (``app.services.state_service``) runs one query for a whole building and
hands the rows over. That split is what makes a 1,000-room campus answerable in
one round trip, and what lets every rule below be tested at an arbitrary instant
with no database at all.

The five states are the front end's, and the extra information the brief asks for
travels in **separate fields** (``kind``, ``out_of_service``, ``confirmation``,
``free_until``, ``current``, ``next``, ``provenance``, ``confidence``) so the
map's colour scheme needs no change.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from app.core.time import campus_date, campus_day_bounds
from app.domain.base import (
    ConfirmationState,
    OccupancyKind,
    Provenance,
    RoomStateKind,
)

__all__ = [
    "DEFAULT_STARTS_SOON_MINUTES",
    "BuildingSummary",
    "Interval",
    "RoomContext",
    "RoomState",
    "StateOptions",
    "next_transition_at",
    "state_at",
    "summarise",
]

#: The brief's clean-API default (section 10.2 rule 3). The compatibility layer
#: overrides it with 60 to match the front end's ``upcomingWindowMinutes``.
DEFAULT_STARTS_SOON_MINUTES = 15


@dataclass(frozen=True, slots=True)
class Interval:
    """Something occupying a room for a half-open period ``[starts_at, ends_at)``.

    Half-open throughout, matching the ``tstzrange`` the booking constraint uses:
    a lesson ending at 10:30 and a booking starting at 10:30 do not collide, and
    at exactly 10:30 the room is not in the lesson any more.

    One type covers lessons, bookings, events and maintenance because the
    precedence rules treat them alike; ``kind`` is what differs, and it is
    reported rather than branched on.
    """

    starts_at: datetime
    ends_at: datetime
    kind: OccupancyKind = OccupancyKind.lesson
    cancelled: bool = False
    #: Stable identifier of the source row, for the API and for ``cause_ref``.
    ref: str | None = None
    subject: str | None = None
    teacher_label: str | None = None
    group_label: str | None = None
    #: Whether a human has confirmed this is really happening. ``not_required``
    #: for bookings that do not use check-in.
    confirmation: ConfirmationState = ConfirmationState.not_required
    expected_headcount: int | None = None

    def __post_init__(self) -> None:
        if self.starts_at.tzinfo is None or self.ends_at.tzinfo is None:
            raise ValueError("Interval instants must be timezone-aware")
        if self.ends_at <= self.starts_at:
            raise ValueError(f"interval must be non-empty, got {self.starts_at} to {self.ends_at}")

    def contains(self, at: datetime) -> bool:
        return self.starts_at <= at < self.ends_at

    @property
    def duration(self) -> timedelta:
        return self.ends_at - self.starts_at


@dataclass(frozen=True, slots=True)
class StateOptions:
    """Tunables, passed in rather than read from global config.

    The engine must be callable with ``starts_soon_minutes=15`` for the clean API
    and ``60`` for the compatibility layer in the same process, so the window
    cannot live in a module constant.
    """

    starts_soon_minutes: int = DEFAULT_STARTS_SOON_MINUTES
    timezone: ZoneInfo = field(default_factory=lambda: ZoneInfo("UTC"))

    def __post_init__(self) -> None:
        if self.starts_soon_minutes < 0:
            raise ValueError(f"starts_soon_minutes must not be negative, got {self.starts_soon_minutes}")

    @property
    def starts_soon(self) -> timedelta:
        return timedelta(minutes=self.starts_soon_minutes)


@dataclass(frozen=True, slots=True)
class RoomContext:
    """Everything the engine needs to know about one room, pre-loaded.

    ``intervals`` need not be sorted and may extend beyond the day being asked
    about; the engine selects what it needs. Keeping the contract loose here is
    what lets the bulk loader issue one query for a whole building and bucket the
    rows by room without a second pass.
    """

    room_id: str
    capacity: int | None = None
    #: Set by a blocking maintenance ticket. An **overlay**, not a state: the
    #: room keeps whatever state its schedule gives it and also reports that it
    #: is unusable (brief section 10.2 rule 6).
    out_of_service: bool = False
    intervals: tuple[Interval, ...] = ()
    building_id: str | None = None


@dataclass(frozen=True, slots=True)
class RoomState:
    """The answer. One state, plus the context that explains it."""

    room_id: str
    at: datetime
    state: RoomStateKind
    kind: OccupancyKind | None = None
    out_of_service: bool = False
    confirmation: ConfirmationState = ConfirmationState.not_required
    #: When the room stops being free. ``None`` means "free with nothing known
    #: to follow", which is different from a zero-length window.
    free_until: datetime | None = None
    current: Interval | None = None
    next: Interval | None = None
    provenance: Provenance = Provenance.scheduled
    confidence: float = 1.0
    building_id: str | None = None

    @property
    def is_live(self) -> bool:
        """Counts towards a building's "N live" badge."""
        return self.state is RoomStateKind.lesson_now

    @property
    def is_bookable_now(self) -> bool:
        """Free *and* usable. Free-room search filters on this, not on state."""
        return self.state is RoomStateKind.free and not self.out_of_service


@dataclass(frozen=True, slots=True)
class BuildingSummary:
    """Per-building roll-up for the map's side panel and "N live" badge."""

    building_id: str
    at: datetime
    live_count: int
    counts: dict[RoomStateKind, int]
    out_of_service_count: int
    room_count: int


def state_at(
    context: RoomContext,
    at: datetime,
    options: StateOptions | None = None,
) -> RoomState:
    """The state of one room at one instant. Pure and deterministic.

    Precedence, exactly as the brief specifies it (section 10.2):

    1. A cancellation covering ``at`` gives ``cancelled``.
    2. An active lesson, booking or event gives ``lesson_now``.
    3. A next occurrence within ``starts_soon_minutes`` gives ``starts_soon``.
    4. Nothing left today but something earlier today gives ``done_for_today``.
    5. Otherwise ``free``.
    6. A blocking maintenance ticket sets ``out_of_service`` as an overlay on top
       of whichever of the above applies.

    "Today" means the **campus-local** day containing ``at``, so a room whose
    last lesson ended at 18:00 reads ``done_for_today`` all evening and flips
    back to ``free`` at local midnight - not at midnight UTC, which for
    Asia/Tashkent would be 05:00 and visibly wrong on the map.
    """
    if at.tzinfo is None:
        raise ValueError("'at' must be timezone-aware; the engine never guesses a timezone")
    opts = options or StateOptions()

    today = campus_date(at, opts.timezone)
    day_start, day_end = campus_day_bounds(today, opts.timezone)

    # Rule 1 and 2 look at whatever covers `at`, regardless of which day it
    # belongs to - an overnight event spanning midnight is still active.
    covering = [item for item in context.intervals if item.contains(at)]
    active = [item for item in covering if not item.cancelled]
    cancelled_now = [item for item in covering if item.cancelled]

    # Rules 3 to 5 are about *today*: an occurrence tomorrow morning must not
    # make a room read "starts soon" tonight.
    todays = [
        item
        for item in context.intervals
        if not item.cancelled and day_start <= item.starts_at < day_end
    ]
    upcoming_today = sorted(
        (item for item in todays if item.starts_at > at),
        key=lambda item: (item.starts_at, item.ends_at),
    )
    earlier_today = [item for item in todays if item.ends_at <= at]

    next_interval = upcoming_today[0] if upcoming_today else None

    base = _without_overlay(
        context=context,
        at=at,
        opts=opts,
        active=active,
        cancelled_now=cancelled_now,
        next_interval=next_interval,
        had_earlier_today=bool(earlier_today),
    )

    if context.out_of_service:
        # The overlay never rewrites the state. A room with a lesson in progress
        # and a broken projector is still "lesson now" to the timetable and
        # "unusable" to facilities, and collapsing those two facts into one would
        # lose information the map needs.
        base = replace(base, out_of_service=True)
    return base


def _without_overlay(
    *,
    context: RoomContext,
    at: datetime,
    opts: StateOptions,
    active: list[Interval],
    cancelled_now: list[Interval],
    next_interval: Interval | None,
    had_earlier_today: bool,
) -> RoomState:
    """Rules 1 to 5, before the out-of-service overlay is applied.

    Each branch builds a :class:`RoomState` with explicit keywords. A shared
    ``**kwargs`` dict would be shorter but erases the field types, so a wrong
    value would only be caught at runtime - and this function is the one place
    where a wrong field silently mispaints the map.
    """
    room_id = context.room_id
    building_id = context.building_id

    # Rule 1: a cancellation covering `at`. Checked before an active occurrence
    # so that a cancelled lesson does not read as in progress.
    if cancelled_now and not active:
        first = min(cancelled_now, key=lambda item: item.starts_at)
        return RoomState(
            room_id=room_id,
            at=at,
            state=RoomStateKind.cancelled,
            kind=first.kind,
            confirmation=first.confirmation,
            current=first,
            next=next_interval,
            # A cancelled slot is genuinely free until the next thing starts.
            free_until=next_interval.starts_at if next_interval else None,
            provenance=Provenance.scheduled,
            building_id=building_id,
        )

    # Rule 2: something is happening now. The longest-running wins when several
    # overlap, since that is the occupancy a person in the doorway would see.
    if active:
        current = max(active, key=lambda item: (item.ends_at, item.duration))
        return RoomState(
            room_id=room_id,
            at=at,
            state=RoomStateKind.lesson_now,
            kind=current.kind,
            confirmation=current.confirmation,
            current=current,
            next=next_interval,
            free_until=None,
            provenance=Provenance.scheduled,
            building_id=building_id,
        )

    # Rule 3: something starts within the window.
    if next_interval is not None and next_interval.starts_at - at <= opts.starts_soon:
        return RoomState(
            room_id=room_id,
            at=at,
            state=RoomStateKind.starts_soon,
            kind=next_interval.kind,
            confirmation=next_interval.confirmation,
            next=next_interval,
            free_until=next_interval.starts_at,
            provenance=Provenance.scheduled,
            building_id=building_id,
        )

    # Rule 4: done for today.
    if next_interval is None and had_earlier_today:
        return RoomState(
            room_id=room_id,
            at=at,
            state=RoomStateKind.done_for_today,
            next=None,
            free_until=None,
            provenance=Provenance.scheduled,
            building_id=building_id,
        )

    # Rule 5: free. ``free_until`` is the next start when one is known, and None
    # when nothing else is scheduled today - never a stale instant in the past,
    # which the property test in tests/test_room_state.py pins down.
    return RoomState(
        room_id=room_id,
        at=at,
        state=RoomStateKind.free,
        next=next_interval,
        free_until=next_interval.starts_at if next_interval else None,
        provenance=Provenance.scheduled,
        building_id=building_id,
    )


def next_transition_at(
    context: RoomContext,
    at: datetime,
    options: StateOptions | None = None,
) -> datetime | None:
    """The next instant this room's state could change, or ``None`` if never.

    This is what replaces polling (brief section 10.2, "transition scheduler").
    Rather than re-evaluating every room every second, the scheduler asks each
    room when it will next change and sets one timer for that instant.

    The candidates are every interval boundary after ``at``, every
    ``starts_soon`` threshold, and the next local midnight - midnight matters
    because that is when ``done_for_today`` lapses back to ``free``, and nothing
    else on the timetable marks it.
    """
    if at.tzinfo is None:
        raise ValueError("'at' must be timezone-aware")
    opts = options or StateOptions()

    candidates: set[datetime] = set()
    for item in context.intervals:
        if item.starts_at > at:
            # Both boundaries of a cancelled occurrence are still transitions:
            # the room moves free -> cancelled -> free around it (rule 1).
            candidates.add(item.starts_at)
            # The ``starts_soon`` threshold, however, only exists for an
            # occurrence that will actually happen. Scheduling a wake-up for a
            # cancelled lesson's threshold fires a timer that changes nothing,
            # which is exactly the polling waste this function exists to avoid.
            if not item.cancelled:
                threshold = item.starts_at - opts.starts_soon
                if threshold > at:
                    candidates.add(threshold)
        if item.ends_at > at:
            candidates.add(item.ends_at)

    today = campus_date(at, opts.timezone)
    _, day_end = campus_day_bounds(today, opts.timezone)
    if day_end > at:
        candidates.add(day_end)

    future = sorted(value for value in candidates if value > at)
    return future[0] if future else None


def summarise(
    states: list[RoomState] | tuple[RoomState, ...],
    *,
    building_id: str,
    at: datetime,
) -> BuildingSummary:
    """Roll up one building's room states.

    ``live_count`` is the number of rooms in ``lesson_now``, which is exactly
    what the map's "N live" badge shows. Every state gets a key even when its
    count is zero, so a client can render a full legend without special-casing
    absent keys.
    """
    counts = dict.fromkeys(RoomStateKind, 0)
    out_of_service = 0
    for item in states:
        counts[item.state] += 1
        if item.out_of_service:
            out_of_service += 1

    return BuildingSummary(
        building_id=building_id,
        at=at,
        live_count=counts[RoomStateKind.lesson_now],
        counts=counts,
        out_of_service_count=out_of_service,
        room_count=len(states),
    )


def states_for_day(
    context: RoomContext,
    day: date,
    *,
    step_minutes: int,
    options: StateOptions | None = None,
) -> list[RoomState]:
    """Evaluate one room across a whole campus-local day at fixed steps.

    Used by the replay endpoint's reconstruction path and by the performance
    harness. Walks the day in instants rather than wall-clock arithmetic, so a
    23- or 25-hour DST day yields the right number of steps.
    """
    if step_minutes <= 0:
        raise ValueError(f"step_minutes must be positive, got {step_minutes}")
    opts = options or StateOptions()
    start, end = campus_day_bounds(day, opts.timezone)

    results: list[RoomState] = []
    cursor = start
    step = timedelta(minutes=step_minutes)
    while cursor < end:
        results.append(state_at(context, cursor, opts))
        cursor += step
    return results
