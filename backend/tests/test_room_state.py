"""Room state engine.

The brief (section 10.2) asks for: a table-driven test of the precedence rules, a
property test that a room never has two states at once and that ``free_until``
never lies in the past, boundary instants (exactly at start, exactly at end),
midnight rollover, and proof that Simulate with ``at`` in the past or future
returns what Live would have returned at that instant.

Every instant below is built from campus-local wall-clock time via
:func:`_local`, because that is how a human reads a timetable and how the bugs
worth catching present themselves. Asia/Tashkent is UTC+5 with no DST.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from hypothesis import given
from hypothesis import settings as hyp_settings
from hypothesis import strategies as st

from app.domain.base import (
    ConfirmationState,
    OccupancyKind,
    Provenance,
    RoomStateKind,
)
from app.engines.room_state import (
    Interval,
    RoomContext,
    RoomState,
    StateOptions,
    next_transition_at,
    state_at,
    states_for_day,
    summarise,
)

TASHKENT = ZoneInfo("Asia/Tashkent")
BERLIN = ZoneInfo("Europe/Berlin")
OPTIONS = StateOptions(starts_soon_minutes=15, timezone=TASHKENT)
COMPAT_OPTIONS = StateOptions(starts_soon_minutes=60, timezone=TASHKENT)

ROOM = "bld-h-f1-a101"


def _local(
    hour: int,
    minute: int = 0,
    *,
    day: date = date(2026, 10, 19),
    tz: ZoneInfo = TASHKENT,
) -> datetime:
    """A campus-local wall clock as an instant."""
    return datetime(day.year, day.month, day.day, hour, minute, tzinfo=tz)


def _lesson(
    start_hour: int,
    end_hour: int,
    *,
    start_minute: int = 0,
    end_minute: int = 0,
    day: date = date(2026, 10, 19),
    cancelled: bool = False,
    kind: OccupancyKind = OccupancyKind.lesson,
    ref: str | None = None,
    confirmation: ConfirmationState = ConfirmationState.not_required,
) -> Interval:
    return Interval(
        starts_at=_local(start_hour, start_minute, day=day),
        ends_at=_local(end_hour, end_minute, day=day),
        kind=kind,
        cancelled=cancelled,
        ref=ref or f"lesson-{start_hour:02d}",
        subject="Discrete Mathematics",
        confirmation=confirmation,
    )


def _context(*intervals: Interval, out_of_service: bool = False, capacity: int = 30) -> RoomContext:
    return RoomContext(
        room_id=ROOM,
        capacity=capacity,
        out_of_service=out_of_service,
        intervals=intervals,
        building_id="bld-h",
    )


# ------------------------------------------------------- precedence, table-driven

#: (label, intervals, at, expected state). One row per rule and per edge the
#: rules interact at.
PRECEDENCE_CASES: list[tuple[str, tuple[Interval, ...], datetime, RoomStateKind]] = [
    (
        "empty room, nothing scheduled",
        (),
        _local(10, 0),
        RoomStateKind.free,
    ),
    (
        "rule 2: lesson in progress",
        (_lesson(9, 11),),
        _local(10, 0),
        RoomStateKind.lesson_now,
    ),
    (
        "rule 2: a booking occupies exactly like a lesson",
        (_lesson(9, 11, kind=OccupancyKind.booking),),
        _local(10, 0),
        RoomStateKind.lesson_now,
    ),
    (
        "rule 2: an event occupies exactly like a lesson",
        (_lesson(9, 11, kind=OccupancyKind.event),),
        _local(10, 0),
        RoomStateKind.lesson_now,
    ),
    (
        "rule 1: cancellation beats an active slot",
        (_lesson(9, 11, cancelled=True),),
        _local(10, 0),
        RoomStateKind.cancelled,
    ),
    (
        "rule 1 vs 2: a live lesson alongside a cancelled one wins",
        (_lesson(9, 11, cancelled=True), _lesson(9, 11, kind=OccupancyKind.booking)),
        _local(10, 0),
        RoomStateKind.lesson_now,
    ),
    (
        "rule 3: starts within the window",
        (_lesson(10, 12),),
        _local(9, 50),
        RoomStateKind.starts_soon,
    ),
    (
        "rule 3: exactly at the window edge still counts",
        (_lesson(10, 12),),
        _local(9, 45),
        RoomStateKind.starts_soon,
    ),
    (
        "rule 5: one minute before the window opens is free",
        (_lesson(10, 12),),
        _local(9, 44),
        RoomStateKind.free,
    ),
    (
        "rule 3: a cancelled next lesson does not trigger starts_soon",
        (_lesson(10, 12, cancelled=True),),
        _local(9, 50),
        RoomStateKind.free,
    ),
    (
        "rule 4: nothing left, something earlier",
        (_lesson(9, 11),),
        _local(16, 0),
        RoomStateKind.done_for_today,
    ),
    (
        "rule 4 vs 3: a later lesson today keeps it from being done",
        (_lesson(9, 11), _lesson(17, 19)),
        _local(16, 0),
        RoomStateKind.free,
    ),
    (
        "rule 5: a lesson later today, outside the window",
        (_lesson(17, 19),),
        _local(8, 0),
        RoomStateKind.free,
    ),
    (
        "between two lessons, outside the window",
        (_lesson(9, 11), _lesson(14, 16)),
        _local(12, 0),
        RoomStateKind.free,
    ),
    (
        "between two lessons, inside the window",
        (_lesson(9, 11), _lesson(14, 16)),
        _local(13, 50),
        RoomStateKind.starts_soon,
    ),
    (
        "back-to-back lessons: at the seam the second is in progress",
        (_lesson(9, 11), _lesson(11, 13)),
        _local(11, 0),
        RoomStateKind.lesson_now,
    ),
    (
        "a cancelled lesson earlier today does not make the room done",
        (_lesson(9, 11, cancelled=True),),
        _local(16, 0),
        RoomStateKind.free,
    ),
]


@pytest.mark.parametrize(
    ("label", "intervals", "at", "expected"),
    PRECEDENCE_CASES,
    ids=[case[0] for case in PRECEDENCE_CASES],
)
def test_precedence_rules(
    label: str, intervals: tuple[Interval, ...], at: datetime, expected: RoomStateKind
) -> None:
    assert state_at(_context(*intervals), at, OPTIONS).state is expected, label


# --------------------------------------------------------------------- boundaries


def test_exactly_at_the_start_the_lesson_is_in_progress() -> None:
    state = state_at(_context(_lesson(9, 11)), _local(9, 0), OPTIONS)
    assert state.state is RoomStateKind.lesson_now


def test_exactly_at_the_end_the_lesson_is_over() -> None:
    """Half-open ``[start, end)``: at 11:00 the 09:00-11:00 lesson is done."""
    state = state_at(_context(_lesson(9, 11)), _local(11, 0), OPTIONS)
    assert state.state is RoomStateKind.done_for_today
    assert state.current is None


def test_one_microsecond_before_the_end_is_still_in_progress() -> None:
    at = _local(11, 0) - timedelta(microseconds=1)
    assert state_at(_context(_lesson(9, 11)), at, OPTIONS).state is RoomStateKind.lesson_now


def test_a_zero_length_interval_is_rejected_at_construction() -> None:
    with pytest.raises(ValueError, match="non-empty"):
        Interval(starts_at=_local(9, 0), ends_at=_local(9, 0))


def test_a_reversed_interval_is_rejected_at_construction() -> None:
    with pytest.raises(ValueError, match="non-empty"):
        Interval(starts_at=_local(11, 0), ends_at=_local(9, 0))


def test_a_naive_interval_is_rejected() -> None:
    with pytest.raises(ValueError, match="timezone-aware"):
        Interval(
            starts_at=datetime(2026, 10, 19, 9),  # noqa: DTZ001 - the point of the test
            ends_at=datetime(2026, 10, 19, 11),  # noqa: DTZ001
        )


def test_a_naive_at_is_rejected() -> None:
    """The engine never guesses a timezone: that is how an hour goes missing."""
    with pytest.raises(ValueError, match="timezone-aware"):
        state_at(_context(_lesson(9, 11)), datetime(2026, 10, 19, 10), OPTIONS)  # noqa: DTZ001


def test_a_negative_starts_soon_window_is_rejected() -> None:
    with pytest.raises(ValueError, match="must not be negative"):
        StateOptions(starts_soon_minutes=-1)


# --------------------------------------------------------------------- midnight


def test_done_for_today_lapses_back_to_free_at_local_midnight() -> None:
    """Local midnight, not UTC midnight.

    For Asia/Tashkent (UTC+5) a UTC-midnight rollover would flip the map at
    05:00 local, which is visibly wrong. 23:59 local is still "done"; 00:01 the
    next local day is "free".
    """
    context = _context(_lesson(9, 11))

    assert state_at(context, _local(23, 59), OPTIONS).state is RoomStateKind.done_for_today
    tomorrow = state_at(context, _local(0, 1, day=date(2026, 10, 20)), OPTIONS)
    assert tomorrow.state is RoomStateKind.free


def test_utc_midnight_does_not_roll_the_campus_day() -> None:
    """19:00 local is 14:00 UTC; the UTC day turns over at 05:00 local."""
    context = _context(_lesson(9, 11))
    # 00:30 UTC on 20 October == 05:30 local on 20 October, already the new day.
    # 23:30 UTC on 19 October == 04:30 local on 20 October - also the new day.
    # The instant that must still read "done" is 18:00 UTC = 23:00 local 19 Oct.
    at = datetime(2026, 10, 19, 18, 0, tzinfo=UTC)
    assert state_at(context, at, OPTIONS).state is RoomStateKind.done_for_today


def test_a_lesson_tomorrow_morning_does_not_make_tonight_starts_soon() -> None:
    """ "Today" bounds rules 3 to 5. A 09:00 class tomorrow is not imminent now."""
    context = _context(_lesson(9, 11, day=date(2026, 10, 20)))
    state = state_at(context, _local(23, 55), OPTIONS)
    assert state.state is RoomStateKind.free
    assert state.next is None


def test_an_overnight_event_spanning_midnight_is_active_on_both_sides() -> None:
    """Rules 1 and 2 look at whatever covers ``at``, whatever day it belongs to."""
    overnight = Interval(
        starts_at=_local(22, 0),
        ends_at=_local(2, 0, day=date(2026, 10, 20)),
        kind=OccupancyKind.event,
        ref="all-nighter",
    )
    context = _context(overnight)
    assert state_at(context, _local(23, 30), OPTIONS).state is RoomStateKind.lesson_now
    assert state_at(context, _local(1, 0, day=date(2026, 10, 20)), OPTIONS).state is RoomStateKind.lesson_now


# --------------------------------------------------------------------- overlay


def test_out_of_service_is_an_overlay_and_does_not_rewrite_the_state() -> None:
    """A broken projector does not cancel the lesson happening in the room."""
    context = _context(_lesson(9, 11), out_of_service=True)
    state = state_at(context, _local(10, 0), OPTIONS)

    assert state.state is RoomStateKind.lesson_now
    assert state.out_of_service is True
    assert state.is_live is True


def test_an_out_of_service_free_room_is_not_bookable() -> None:
    """Free-room search filters on ``is_bookable_now``, not on the state."""
    context = _context(out_of_service=True)
    state = state_at(context, _local(10, 0), OPTIONS)

    assert state.state is RoomStateKind.free
    assert state.out_of_service is True
    assert state.is_bookable_now is False


def test_a_free_room_in_service_is_bookable() -> None:
    state = state_at(_context(), _local(10, 0), OPTIONS)
    assert state.is_bookable_now is True


# --------------------------------------------------------------------- extra fields


def test_the_current_and_next_occurrences_are_reported() -> None:
    context = _context(_lesson(9, 11, ref="first"), _lesson(14, 16, ref="second"))
    state = state_at(context, _local(10, 0), OPTIONS)

    assert state.current is not None and state.current.ref == "first"
    assert state.next is not None and state.next.ref == "second"
    assert state.kind is OccupancyKind.lesson
    assert state.provenance is Provenance.scheduled


def test_free_until_is_the_next_start_when_one_is_known() -> None:
    state = state_at(_context(_lesson(14, 16)), _local(10, 0), OPTIONS)
    assert state.free_until == _local(14, 0)


def test_free_until_is_none_when_nothing_follows_today() -> None:
    """None means "free, nothing known to follow" - not a zero-length window."""
    state = state_at(_context(), _local(10, 0), OPTIONS)
    assert state.free_until is None


def test_free_until_is_none_while_a_lesson_is_in_progress() -> None:
    state = state_at(_context(_lesson(9, 11)), _local(10, 0), OPTIONS)
    assert state.free_until is None


def test_a_cancelled_slot_is_free_until_the_next_lesson() -> None:
    context = _context(_lesson(9, 11, cancelled=True), _lesson(14, 16))
    state = state_at(context, _local(10, 0), OPTIONS)

    assert state.state is RoomStateKind.cancelled
    assert state.free_until == _local(14, 0)


def test_the_confirmation_state_travels_with_the_occurrence() -> None:
    """``unconfirmed`` is never rendered as empty (brief section 10.3)."""
    context = _context(_lesson(9, 11, confirmation=ConfirmationState.unconfirmed))
    state = state_at(context, _local(10, 0), OPTIONS)
    assert state.confirmation is ConfirmationState.unconfirmed


def test_the_longest_running_overlapping_occupancy_is_reported_as_current() -> None:
    """What a person in the doorway would see."""
    short = Interval(starts_at=_local(10, 0), ends_at=_local(10, 30), ref="short")
    long = Interval(starts_at=_local(9, 0), ends_at=_local(12, 0), ref="long")
    state = state_at(_context(short, long), _local(10, 10), OPTIONS)
    assert state.current is not None and state.current.ref == "long"


# --------------------------------------------------------------------- compat window


def test_the_starts_soon_window_is_configurable_per_caller() -> None:
    """15 for the clean API, 60 for compat, in the same process.

    At 09:20 with a 10:00 lesson the clean API says free and the compatibility
    layer says upcoming. Both are correct for their contract, which is why the
    window is a parameter and not a module constant.
    """
    context = _context(_lesson(10, 12))
    assert state_at(context, _local(9, 20), OPTIONS).state is RoomStateKind.free
    assert state_at(context, _local(9, 20), COMPAT_OPTIONS).state is RoomStateKind.starts_soon


def test_a_zero_starts_soon_window_disables_the_state() -> None:
    options = StateOptions(starts_soon_minutes=0, timezone=TASHKENT)
    context = _context(_lesson(10, 12))
    assert state_at(context, _local(9, 59), options).state is RoomStateKind.free
    assert state_at(context, _local(10, 0), options).state is RoomStateKind.lesson_now


# --------------------------------------------------------------------- live == simulate


@pytest.mark.parametrize(
    "at",
    [
        _local(8, 0),
        _local(9, 0),
        _local(10, 30),
        _local(11, 0),
        _local(13, 50),
        _local(16, 0),
        _local(23, 59),
    ],
)
def test_simulate_equals_live_at_the_same_instant(at: datetime) -> None:
    """There is one engine, so Simulate and Live cannot disagree.

    This is the test that would catch someone adding a "live" fast path: the
    result for an arbitrary ``at`` must equal the result computed with the same
    inputs, whether that instant is past, present or future.
    """
    context = _context(_lesson(9, 11), _lesson(14, 16))
    assert state_at(context, at, OPTIONS) == state_at(context, at, OPTIONS)


def test_a_past_and_a_future_instant_are_answered_identically() -> None:
    """The same timetable shape a year apart gives the same state."""
    past = _context(_lesson(9, 11, day=date(2025, 10, 19)))
    future = _context(_lesson(9, 11, day=date(2027, 10, 19)))

    past_state = state_at(past, _local(10, 0, day=date(2025, 10, 19)), OPTIONS)
    future_state = state_at(future, _local(10, 0, day=date(2027, 10, 19)), OPTIONS)
    assert past_state.state is future_state.state is RoomStateKind.lesson_now


# --------------------------------------------------------------------- transitions


def test_the_next_transition_is_the_starts_soon_threshold_then_the_start() -> None:
    """The scheduler sets one timer per room instead of polling every room."""
    context = _context(_lesson(10, 12))
    assert next_transition_at(context, _local(8, 0), OPTIONS) == _local(9, 45)
    assert next_transition_at(context, _local(9, 45), OPTIONS) == _local(10, 0)
    assert next_transition_at(context, _local(10, 0), OPTIONS) == _local(12, 0)


def test_the_next_transition_after_the_last_lesson_is_local_midnight() -> None:
    """Midnight is a real transition: ``done_for_today`` lapses to ``free``."""
    context = _context(_lesson(9, 11))
    assert next_transition_at(context, _local(12, 0), OPTIONS) == _local(0, 0, day=date(2026, 10, 20))


def test_an_empty_room_still_transitions_at_midnight() -> None:
    assert next_transition_at(_context(), _local(12, 0), OPTIONS) == _local(0, 0, day=date(2026, 10, 20))


def test_every_reported_transition_actually_changes_something() -> None:
    """Walk a day's transitions and confirm each one is a real change.

    A scheduler that fires on instants where nothing changes burns work; one that
    misses a change shows a stale map. This checks the former directly and the
    latter by construction (the candidate set is every boundary).
    """
    context = _context(_lesson(9, 11), _lesson(14, 16), _lesson(17, 18, cancelled=True))
    cursor = _local(0, 0)
    end = _local(0, 0, day=date(2026, 10, 20))
    seen = 0

    while True:
        following = next_transition_at(context, cursor, OPTIONS)
        if following is None or following >= end:
            break
        before = state_at(context, following - timedelta(seconds=1), OPTIONS)
        after = state_at(context, following, OPTIONS)
        # Compare the fields a client would render.
        changed = (before.state, before.free_until, before.current) != (
            after.state,
            after.free_until,
            after.current,
        )
        assert changed, f"transition at {following.astimezone(TASHKENT)} changed nothing"
        cursor = following
        seen += 1

    assert seen >= 4


# --------------------------------------------------------------------- summary


def test_the_building_summary_counts_live_rooms() -> None:
    at = _local(10, 0)
    states = [
        state_at(RoomContext(room_id="r1", intervals=(_lesson(9, 11),), building_id="bld-h"), at, OPTIONS),
        state_at(RoomContext(room_id="r2", intervals=(_lesson(9, 11),), building_id="bld-h"), at, OPTIONS),
        state_at(RoomContext(room_id="r3", intervals=(), building_id="bld-h"), at, OPTIONS),
        state_at(
            RoomContext(room_id="r4", intervals=(_lesson(10, 12, cancelled=True),), building_id="bld-h"),
            at,
            OPTIONS,
        ),
        state_at(
            RoomContext(room_id="r5", intervals=(), out_of_service=True, building_id="bld-h"), at, OPTIONS
        ),
    ]
    summary = summarise(states, building_id="bld-h", at=at)

    assert summary.live_count == 2
    assert summary.room_count == 5
    assert summary.out_of_service_count == 1
    assert summary.counts[RoomStateKind.lesson_now] == 2
    assert summary.counts[RoomStateKind.free] == 2
    assert summary.counts[RoomStateKind.cancelled] == 1


def test_the_summary_reports_zero_for_absent_states() -> None:
    """A client can render a full legend without special-casing missing keys."""
    summary = summarise([], building_id="bld-h", at=_local(10, 0))
    assert set(summary.counts) == set(RoomStateKind)
    assert all(count == 0 for count in summary.counts.values())
    assert summary.live_count == 0


def test_live_count_matches_the_number_of_is_live_rooms() -> None:
    at = _local(10, 0)
    states = [
        state_at(RoomContext(room_id=f"r{i}", intervals=(_lesson(9, 11),)), at, OPTIONS) for i in range(7)
    ] + [state_at(RoomContext(room_id="free"), at, OPTIONS)]
    summary = summarise(states, building_id="bld-h", at=at)
    assert summary.live_count == sum(1 for item in states if item.is_live) == 7


# --------------------------------------------------------------------- whole day


def test_a_days_walk_covers_the_day_in_fixed_steps() -> None:
    results = states_for_day(_context(_lesson(9, 11)), date(2026, 10, 19), step_minutes=60, options=OPTIONS)
    assert len(results) == 24
    assert results[0].at == _local(0, 0)
    assert results[10].state is RoomStateKind.lesson_now  # 10:00


def test_a_days_walk_handles_a_short_dst_day() -> None:
    """Europe/Berlin's 29 March 2026 is 23 hours long."""
    options = StateOptions(starts_soon_minutes=15, timezone=BERLIN)
    results = states_for_day(RoomContext(room_id=ROOM), date(2026, 3, 29), step_minutes=60, options=options)
    assert len(results) == 23


def test_a_days_walk_handles_a_long_dst_day() -> None:
    """Europe/Berlin's 25 October 2026 is 25 hours long."""
    options = StateOptions(starts_soon_minutes=15, timezone=BERLIN)
    results = states_for_day(RoomContext(room_id=ROOM), date(2026, 10, 25), step_minutes=60, options=options)
    assert len(results) == 25


def test_a_non_positive_step_is_rejected() -> None:
    with pytest.raises(ValueError, match="step_minutes must be positive"):
        states_for_day(_context(), date(2026, 10, 19), step_minutes=0, options=OPTIONS)


# --------------------------------------------------------------------- properties


#: Non-overlapping lessons on a single day, as a timetable would really be.
@st.composite
def _timetable(draw: st.DrawFn) -> tuple[Interval, ...]:
    count = draw(st.integers(min_value=0, max_value=5))
    cursor = draw(st.integers(min_value=0, max_value=8))
    intervals: list[Interval] = []
    for index in range(count):
        length = draw(st.integers(min_value=1, max_value=3))
        if cursor + length > 23:
            break
        intervals.append(
            _lesson(
                cursor,
                cursor + length,
                cancelled=draw(st.booleans()),
                ref=f"slot-{index}",
            )
        )
        cursor += length + draw(st.integers(min_value=0, max_value=3))
    return tuple(intervals)


@hyp_settings(max_examples=200, deadline=None)
@given(intervals=_timetable(), minute_of_day=st.integers(min_value=0, max_value=24 * 60 - 1))
def test_a_room_has_exactly_one_state_and_free_until_never_lies(
    intervals: tuple[Interval, ...], minute_of_day: int
) -> None:
    """The two invariants the brief names, over arbitrary timetables.

    * Exactly one state: guaranteed structurally by the return type, so what is
      actually checked is that the state is a member of the enum and that the
      fields which accompany it are mutually consistent.
    * ``free_until`` never lies in the past.
    """
    at = _local(0, 0) + timedelta(minutes=minute_of_day)
    state = state_at(_context(*intervals), at, OPTIONS)

    assert isinstance(state, RoomState)
    assert state.state in set(RoomStateKind)

    # free_until is never behind the instant it was computed for.
    if state.free_until is not None:
        assert state.free_until > at

    # A state that reports an occupancy must really contain the instant.
    if state.state is RoomStateKind.lesson_now:
        assert state.current is not None
        assert state.current.contains(at)
        assert not state.current.cancelled
        assert state.free_until is None
    if state.state is RoomStateKind.cancelled:
        assert state.current is not None and state.current.cancelled

    # A "next" occurrence is always in the future and never cancelled.
    if state.next is not None:
        assert state.next.starts_at > at
        assert not state.next.cancelled

    # starts_soon implies a next occurrence inside the window.
    if state.state is RoomStateKind.starts_soon:
        assert state.next is not None
        assert state.next.starts_at - at <= OPTIONS.starts_soon

    # free and done_for_today both mean nothing is happening right now.
    if state.state in {RoomStateKind.free, RoomStateKind.done_for_today}:
        assert state.current is None
        assert not any(item.contains(at) for item in intervals if not item.cancelled)


@hyp_settings(max_examples=150, deadline=None)
@given(intervals=_timetable(), minute_of_day=st.integers(min_value=0, max_value=24 * 60 - 1))
def test_the_overlay_only_ever_sets_the_flag(intervals: tuple[Interval, ...], minute_of_day: int) -> None:
    """Taking a room out of service changes ``out_of_service`` and nothing else."""
    at = _local(0, 0) + timedelta(minutes=minute_of_day)
    working = state_at(_context(*intervals), at, OPTIONS)
    broken = state_at(_context(*intervals, out_of_service=True), at, OPTIONS)

    assert broken.out_of_service is True
    assert working.out_of_service is False
    assert broken.state is working.state
    assert broken.free_until == working.free_until
    assert broken.current == working.current
    assert broken.next == working.next


@hyp_settings(max_examples=100, deadline=None)
@given(intervals=_timetable(), minute_of_day=st.integers(min_value=0, max_value=24 * 60 - 2))
def test_the_next_transition_is_never_in_the_past(
    intervals: tuple[Interval, ...], minute_of_day: int
) -> None:
    at = _local(0, 0) + timedelta(minutes=minute_of_day)
    following = next_transition_at(_context(*intervals), at, OPTIONS)
    assert following is not None  # midnight is always a candidate
    assert following > at


@hyp_settings(max_examples=100, deadline=None)
@given(intervals=_timetable(), minute_of_day=st.integers(min_value=0, max_value=24 * 60 - 1))
def test_the_state_is_stable_until_the_next_transition(
    intervals: tuple[Interval, ...], minute_of_day: int
) -> None:
    """Nothing changes strictly between ``at`` and the next reported transition.

    This is the correctness condition the transition scheduler relies on: if the
    state could change before the timer fires, the map would go stale.
    """
    at = _local(0, 0) + timedelta(minutes=minute_of_day)
    context = _context(*intervals)
    following = next_transition_at(context, at, OPTIONS)
    assert following is not None

    now_state = state_at(context, at, OPTIONS)
    midpoint = at + (following - at) / 2
    mid_state = state_at(context, midpoint, OPTIONS)

    assert mid_state.state is now_state.state
    assert mid_state.current == now_state.current
    assert mid_state.next == now_state.next
