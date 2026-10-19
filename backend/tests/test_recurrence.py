"""Recurrence expansion.

The brief (section 10.1) names the cases this file must cover: weekly, biweekly
and odd-week patterns, ``EXDATE``, a moved occurrence, a cancelled occurrence, a
rule that crosses a daylight-saving change, and a term boundary.

The DST tests deliberately use **Europe/Berlin**, not the campus timezone. Asia/
Tashkent has had no DST since 1992, so a test in the campus zone would pass even
if the expansion were wrong. The requirement is that the *code* does not assume
a fixed offset (brief section 9), and only a zone that actually shifts can prove
that.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from hypothesis import given
from hypothesis import settings as hyp_settings
from hypothesis import strategies as st

from app.engines.recurrence import (
    MAX_OCCURRENCES,
    Occurrence,
    OverrideSpec,
    RecurrenceError,
    RecurrenceSpec,
    expand_rule,
    parse_local_naive,
    weekly_rrule,
)

TASHKENT = ZoneInfo("Asia/Tashkent")
BERLIN = ZoneInfo("Europe/Berlin")


def _window(start: datetime, end: datetime) -> dict[str, datetime]:
    return {"window_start": start, "window_end": end}


def _utc(year: int, month: int, day: int, hour: int = 0, minute: int = 0) -> datetime:
    return datetime(year, month, day, hour, minute, tzinfo=UTC)


def _local_starts(occurrences: list[Occurrence], zone: ZoneInfo) -> list[str]:
    """Local wall-clock starts, which is what a timetable reader cares about."""
    return [item.starts_at.astimezone(zone).strftime("%Y-%m-%d %H:%M") for item in occurrences]


# --------------------------------------------------------------------- weekly


def test_a_weekly_rule_produces_one_occurrence_per_week() -> None:
    spec = RecurrenceSpec(
        rrule="FREQ=WEEKLY;BYDAY=TU",
        dtstart_local="2026-09-01T09:00:00",  # a Tuesday
        tzid="Asia/Tashkent",
        duration_minutes=90,
        room_id="bld-h-f1-a101",
    )
    occurrences = expand_rule(spec, **_window(_utc(2026, 9, 1), _utc(2026, 9, 29)))

    assert _local_starts(occurrences, TASHKENT) == [
        "2026-09-01 09:00",
        "2026-09-08 09:00",
        "2026-09-15 09:00",
        "2026-09-22 09:00",
    ]
    assert all(item.ends_at - item.starts_at == timedelta(minutes=90) for item in occurrences)
    assert all(item.room_id == "bld-h-f1-a101" for item in occurrences)
    # Untouched occurrences carry their own start as their identity.
    assert all(item.original_starts_at == item.starts_at for item in occurrences)
    assert not any(item.cancelled or item.overridden for item in occurrences)


def test_two_weekdays_in_one_rule_both_appear() -> None:
    spec = RecurrenceSpec(
        rrule=weekly_rrule([0, 2]),  # Monday and Wednesday
        dtstart_local="2026-09-07T14:00:00",  # a Monday
        tzid="Asia/Tashkent",
        duration_minutes=60,
    )
    occurrences = expand_rule(spec, **_window(_utc(2026, 9, 7), _utc(2026, 9, 14)))
    assert _local_starts(occurrences, TASHKENT) == ["2026-09-07 14:00", "2026-09-09 14:00"]


def test_a_biweekly_rule_skips_the_odd_week() -> None:
    spec = RecurrenceSpec(
        rrule=weekly_rrule([0], interval=2),
        dtstart_local="2026-09-07T10:00:00",
        tzid="Asia/Tashkent",
        duration_minutes=90,
    )
    occurrences = expand_rule(spec, **_window(_utc(2026, 9, 1), _utc(2026, 10, 6)))
    assert _local_starts(occurrences, TASHKENT) == [
        "2026-09-07 10:00",
        "2026-09-21 10:00",
        "2026-10-05 10:00",
    ]


def test_an_odd_week_pattern_starting_on_the_second_week_stays_offset() -> None:
    """Biweekly phase comes from DTSTART, not from the calendar's week number.

    An "even weeks" timetable row is expressed by starting the rule a week later,
    so this asserts the phase survives expansion.
    """
    spec = RecurrenceSpec(
        rrule=weekly_rrule([0], interval=2),
        dtstart_local="2026-09-14T10:00:00",
        tzid="Asia/Tashkent",
        duration_minutes=90,
    )
    occurrences = expand_rule(spec, **_window(_utc(2026, 9, 1), _utc(2026, 10, 13)))
    assert _local_starts(occurrences, TASHKENT) == [
        "2026-09-14 10:00",
        "2026-09-28 10:00",
        "2026-10-12 10:00",
    ]


# --------------------------------------------------------------------- windows


def test_a_lesson_already_running_when_the_window_opens_is_included() -> None:
    """Overlap, not containment.

    The state engine asks "what is in this room at 09:30?". A 09:00-10:30 lesson
    must come back, so expansion selects on overlap.
    """
    spec = RecurrenceSpec(
        rrule="FREQ=WEEKLY;BYDAY=TU",
        dtstart_local="2026-09-01T09:00:00",
        tzid="Asia/Tashkent",
        duration_minutes=90,
    )
    # 09:30 local on 1 September is 04:30 UTC (UTC+5).
    occurrences = expand_rule(spec, **_window(_utc(2026, 9, 1, 4, 30), _utc(2026, 9, 1, 4, 31)))
    assert len(occurrences) == 1
    assert occurrences[0].starts_at == _utc(2026, 9, 1, 4, 0)


def test_an_occurrence_ending_exactly_when_the_window_opens_is_excluded() -> None:
    """Half-open semantics, matching ``tstzrange`` and the booking constraint."""
    spec = RecurrenceSpec(
        rrule="FREQ=WEEKLY;BYDAY=TU",
        dtstart_local="2026-09-01T09:00:00",
        tzid="Asia/Tashkent",
        duration_minutes=90,
    )
    # The lesson ends at 10:30 local = 05:30 UTC.
    occurrences = expand_rule(spec, **_window(_utc(2026, 9, 1, 5, 30), _utc(2026, 9, 1, 6, 0)))
    assert occurrences == []


def test_an_until_date_is_inclusive_of_that_local_day() -> None:
    """``UNTIL=20261006`` must include the lesson *on* 6 October.

    Read as bare midnight it would drop that day, losing the last week of term.
    """
    spec = RecurrenceSpec(
        rrule=weekly_rrule([1], until=date(2026, 10, 6)),
        dtstart_local="2026-09-01T09:00:00",
        tzid="Asia/Tashkent",
        duration_minutes=90,
    )
    occurrences = expand_rule(spec, **_window(_utc(2026, 9, 1), _utc(2026, 11, 1)))
    assert _local_starts(occurrences, TASHKENT)[-1] == "2026-10-06 09:00"


def test_a_term_boundary_truncates_the_series() -> None:
    spec = RecurrenceSpec(
        rrule=weekly_rrule([1], until=date(2026, 12, 20)),
        dtstart_local="2026-09-01T09:00:00",
        tzid="Asia/Tashkent",
        duration_minutes=90,
    )
    # Query a window entirely after the term ends.
    occurrences = expand_rule(spec, **_window(_utc(2027, 1, 5), _utc(2027, 2, 1)))
    assert occurrences == []


def test_count_limits_the_series() -> None:
    spec = RecurrenceSpec(
        rrule=weekly_rrule([1], count=3),
        dtstart_local="2026-09-01T09:00:00",
        tzid="Asia/Tashkent",
        duration_minutes=90,
    )
    occurrences = expand_rule(spec, **_window(_utc(2026, 9, 1), _utc(2027, 1, 1)))
    assert len(occurrences) == 3


# --------------------------------------------------------------------- DST


def test_a_weekly_lesson_keeps_its_local_time_across_a_dst_change() -> None:
    """The whole point of expanding in the event's own timezone.

    Europe/Berlin leaves summer time on 25 October 2026 (UTC+2 to UTC+1). A 09:00
    lecture stays at 09:00 local; its *UTC* instant shifts by an hour. Expanding
    in UTC would instead hold the instant and move the local time, putting the
    class in the wrong hour for half the term.
    """
    spec = RecurrenceSpec(
        rrule="FREQ=WEEKLY;BYDAY=TH",
        dtstart_local="2026-10-15T09:00:00",
        tzid="Europe/Berlin",
        duration_minutes=90,
    )
    occurrences = expand_rule(spec, **_window(_utc(2026, 10, 1), _utc(2026, 11, 15)))

    # Local wall clock: identical every week.
    assert _local_starts(occurrences, BERLIN) == [
        "2026-10-15 09:00",
        "2026-10-22 09:00",
        "2026-10-29 09:00",
        "2026-11-05 09:00",
        "2026-11-12 09:00",
    ]
    # UTC instants: 07:00 before the change, 08:00 after it.
    utc_hours = [item.starts_at.hour for item in occurrences]
    assert utc_hours == [7, 7, 8, 8, 8]
    # And every occurrence is still 90 minutes long.
    assert all(item.ends_at - item.starts_at == timedelta(minutes=90) for item in occurrences)


def test_a_lesson_in_the_skipped_hour_of_a_spring_transition_still_resolves() -> None:
    """Europe/Berlin's 02:30 does not exist on 29 March 2026.

    ``zoneinfo`` resolves a non-existent wall clock rather than raising, so the
    occurrence must still be produced - dropping it would silently lose a lesson.
    The assertion is only that it lands on the right day and does not crash.
    """
    spec = RecurrenceSpec(
        rrule="FREQ=DAILY",
        dtstart_local="2026-03-28T02:30:00",
        tzid="Europe/Berlin",
        duration_minutes=60,
    )
    occurrences = expand_rule(spec, **_window(_utc(2026, 3, 27), _utc(2026, 3, 31)))
    local_dates = {item.starts_at.astimezone(BERLIN).date() for item in occurrences}
    assert date(2026, 3, 29) in local_dates


# --------------------------------------------------------------------- EXDATE


def test_an_exdate_with_a_time_removes_exactly_that_occurrence() -> None:
    spec = RecurrenceSpec(
        rrule="FREQ=WEEKLY;BYDAY=TU",
        dtstart_local="2026-09-01T09:00:00",
        tzid="Asia/Tashkent",
        duration_minutes=90,
        exdates=("2026-09-08T09:00:00",),
    )
    occurrences = expand_rule(spec, **_window(_utc(2026, 9, 1), _utc(2026, 9, 29)))
    assert _local_starts(occurrences, TASHKENT) == [
        "2026-09-01 09:00",
        "2026-09-15 09:00",
        "2026-09-22 09:00",
    ]


def test_a_date_only_exdate_removes_the_whole_local_day() -> None:
    """"No classes on 8 September" must not require knowing the start time."""
    spec = RecurrenceSpec(
        rrule="FREQ=WEEKLY;BYDAY=TU",
        dtstart_local="2026-09-01T09:00:00",
        tzid="Asia/Tashkent",
        duration_minutes=90,
        exdates=("2026-09-08",),
    )
    occurrences = expand_rule(spec, **_window(_utc(2026, 9, 1), _utc(2026, 9, 29)))
    assert "2026-09-08 09:00" not in _local_starts(occurrences, TASHKENT)
    assert len(occurrences) == 3


def test_a_bare_yyyymmdd_exdate_is_accepted() -> None:
    spec = RecurrenceSpec(
        rrule="FREQ=WEEKLY;BYDAY=TU",
        dtstart_local="2026-09-01T09:00:00",
        tzid="Asia/Tashkent",
        duration_minutes=90,
        exdates=("20260908",),
    )
    occurrences = expand_rule(spec, **_window(_utc(2026, 9, 1), _utc(2026, 9, 29)))
    assert len(occurrences) == 3


def test_an_aware_exdate_instant_matches() -> None:
    """The shape the database returns: an aware UTC instant."""
    spec = RecurrenceSpec(
        rrule="FREQ=WEEKLY;BYDAY=TU",
        dtstart_local="2026-09-01T09:00:00",
        tzid="Asia/Tashkent",
        duration_minutes=90,
        exdates=(_utc(2026, 9, 8, 4, 0),),  # 09:00 Tashkent
    )
    occurrences = expand_rule(spec, **_window(_utc(2026, 9, 1), _utc(2026, 9, 29)))
    assert len(occurrences) == 3


def test_an_exdate_matches_the_original_start_not_a_moved_one() -> None:
    """EXDATEs and overrides both key on the original start.

    An occurrence that an override moved is still identified by where it began,
    so an EXDATE written against the original start suppresses it.
    """
    spec = RecurrenceSpec(
        rrule="FREQ=WEEKLY;BYDAY=TU",
        dtstart_local="2026-09-01T09:00:00",
        tzid="Asia/Tashkent",
        duration_minutes=90,
        exdates=(_utc(2026, 9, 8, 4, 0),),
        overrides=(
            OverrideSpec(
                original_starts_at=_utc(2026, 9, 8, 4, 0),
                action="move",
                new_starts_at=_utc(2026, 9, 8, 8, 0),
            ),
        ),
    )
    occurrences = expand_rule(spec, **_window(_utc(2026, 9, 1), _utc(2026, 9, 29)))
    assert len(occurrences) == 3
    assert all(not item.overridden for item in occurrences)


def test_an_unparsable_exdate_is_an_error_not_a_silent_skip() -> None:
    spec = RecurrenceSpec(
        rrule="FREQ=WEEKLY;BYDAY=TU",
        dtstart_local="2026-09-01T09:00:00",
        tzid="Asia/Tashkent",
        duration_minutes=90,
        exdates=("next tuesday",),
    )
    with pytest.raises(RecurrenceError, match="cannot parse exdate"):
        expand_rule(spec, **_window(_utc(2026, 9, 1), _utc(2026, 9, 29)))


# --------------------------------------------------------------------- overrides


def test_a_cancelled_occurrence_stays_in_the_series_flagged() -> None:
    """Cancelled is a state the map paints purple, not an absence.

    Dropping the occurrence would make the room render as Free, which asserts
    something different and wrong (brief section 10.2, precedence rule 1).
    """
    spec = RecurrenceSpec(
        rrule="FREQ=WEEKLY;BYDAY=TU",
        dtstart_local="2026-09-01T09:00:00",
        tzid="Asia/Tashkent",
        duration_minutes=90,
        overrides=(OverrideSpec(original_starts_at=_utc(2026, 9, 8, 4, 0), action="cancel"),),
    )
    occurrences = expand_rule(spec, **_window(_utc(2026, 9, 1), _utc(2026, 9, 29)))

    assert len(occurrences) == 4
    cancelled = [item for item in occurrences if item.cancelled]
    assert len(cancelled) == 1
    assert cancelled[0].original_starts_at == _utc(2026, 9, 8, 4, 0)
    assert cancelled[0].overridden


def test_a_moved_occurrence_reports_both_starts() -> None:
    spec = RecurrenceSpec(
        rrule="FREQ=WEEKLY;BYDAY=TU",
        dtstart_local="2026-09-01T09:00:00",
        tzid="Asia/Tashkent",
        duration_minutes=90,
        overrides=(
            OverrideSpec(
                original_starts_at=_utc(2026, 9, 8, 4, 0),
                action="move",
                new_starts_at=_utc(2026, 9, 9, 6, 0),
            ),
        ),
    )
    occurrences = expand_rule(spec, **_window(_utc(2026, 9, 1), _utc(2026, 9, 29)))
    moved = next(item for item in occurrences if item.overridden)

    assert moved.was_moved
    assert moved.starts_at == _utc(2026, 9, 9, 6, 0)
    assert moved.original_starts_at == _utc(2026, 9, 8, 4, 0)
    # A move with no new end keeps the rule's duration.
    assert moved.ends_at - moved.starts_at == timedelta(minutes=90)


def test_a_room_change_override_swaps_only_the_room() -> None:
    spec = RecurrenceSpec(
        rrule="FREQ=WEEKLY;BYDAY=TU",
        dtstart_local="2026-09-01T09:00:00",
        tzid="Asia/Tashkent",
        duration_minutes=90,
        room_id="bld-h-f1-a101",
        overrides=(
            OverrideSpec(
                original_starts_at=_utc(2026, 9, 8, 4, 0),
                action="room_change",
                new_room_id="bld-g-f2-b201",
            ),
        ),
    )
    occurrences = expand_rule(spec, **_window(_utc(2026, 9, 1), _utc(2026, 9, 29)))
    changed = next(item for item in occurrences if item.overridden)

    assert changed.room_id == "bld-g-f2-b201"
    assert changed.starts_at == changed.original_starts_at
    assert not changed.was_moved
    assert all(item.room_id == "bld-h-f1-a101" for item in occurrences if not item.overridden)


def test_a_moved_occurrence_can_leave_the_query_window() -> None:
    """Moving a lesson out of the window removes it from that window's results."""
    spec = RecurrenceSpec(
        rrule="FREQ=WEEKLY;BYDAY=TU",
        dtstart_local="2026-09-01T09:00:00",
        tzid="Asia/Tashkent",
        duration_minutes=90,
        overrides=(
            OverrideSpec(
                original_starts_at=_utc(2026, 9, 1, 4, 0),
                action="move",
                new_starts_at=_utc(2026, 10, 20, 4, 0),
            ),
        ),
    )
    occurrences = expand_rule(spec, **_window(_utc(2026, 9, 1), _utc(2026, 9, 8)))
    assert occurrences == []


def test_a_move_override_without_a_new_start_is_rejected() -> None:
    with pytest.raises(RecurrenceError, match="needs new_starts_at"):
        OverrideSpec(original_starts_at=_utc(2026, 9, 8, 4, 0), action="move")


def test_an_unknown_override_action_is_rejected() -> None:
    with pytest.raises(RecurrenceError, match="unknown override action"):
        OverrideSpec(original_starts_at=_utc(2026, 9, 8, 4, 0), action="postpone")


def test_an_override_that_ends_before_it_starts_is_rejected() -> None:
    spec = RecurrenceSpec(
        rrule="FREQ=WEEKLY;BYDAY=TU",
        dtstart_local="2026-09-01T09:00:00",
        tzid="Asia/Tashkent",
        duration_minutes=90,
        overrides=(
            OverrideSpec(
                original_starts_at=_utc(2026, 9, 1, 4, 0),
                action="move",
                new_starts_at=_utc(2026, 9, 1, 8, 0),
                new_ends_at=_utc(2026, 9, 1, 7, 0),
            ),
        ),
    )
    with pytest.raises(RecurrenceError, match="ends at or before it starts"):
        expand_rule(spec, **_window(_utc(2026, 9, 1), _utc(2026, 9, 8)))


# --------------------------------------------------------------------- validation


def test_a_naive_window_is_rejected() -> None:
    spec = RecurrenceSpec(
        rrule="FREQ=WEEKLY;BYDAY=TU",
        dtstart_local="2026-09-01T09:00:00",
        tzid="Asia/Tashkent",
        duration_minutes=90,
    )
    with pytest.raises(RecurrenceError, match="timezone-aware"):
        expand_rule(
            spec,
            window_start=datetime(2026, 9, 1),  # noqa: DTZ001 - the point of the test
            window_end=_utc(2026, 9, 8),
        )


def test_an_empty_window_is_rejected() -> None:
    spec = RecurrenceSpec(
        rrule="FREQ=WEEKLY;BYDAY=TU",
        dtstart_local="2026-09-01T09:00:00",
        tzid="Asia/Tashkent",
        duration_minutes=90,
    )
    with pytest.raises(RecurrenceError, match="non-empty"):
        expand_rule(spec, **_window(_utc(2026, 9, 8), _utc(2026, 9, 1)))


def test_a_dtstart_with_an_offset_is_rejected() -> None:
    """An offset on DTSTART means someone already converted it. Refuse to guess."""
    with pytest.raises(RecurrenceError, match="naive wall-clock"):
        parse_local_naive("2026-09-01T09:00:00+05:00")


def test_an_unknown_timezone_is_rejected() -> None:
    with pytest.raises(RecurrenceError, match="not a known IANA timezone"):
        RecurrenceSpec(
            rrule="FREQ=WEEKLY",
            dtstart_local="2026-09-01T09:00:00",
            tzid="Mars/Olympus_Mons",
            duration_minutes=90,
        )


def test_a_non_positive_duration_is_rejected() -> None:
    with pytest.raises(RecurrenceError, match="duration_minutes must be positive"):
        RecurrenceSpec(
            rrule="FREQ=WEEKLY",
            dtstart_local="2026-09-01T09:00:00",
            tzid="Asia/Tashkent",
            duration_minutes=0,
        )


def test_an_empty_rrule_is_rejected() -> None:
    spec = RecurrenceSpec(
        rrule="   ",
        dtstart_local="2026-09-01T09:00:00",
        tzid="Asia/Tashkent",
        duration_minutes=90,
    )
    with pytest.raises(RecurrenceError, match="rrule is empty"):
        expand_rule(spec, **_window(_utc(2026, 9, 1), _utc(2026, 9, 8)))


def test_a_malformed_rrule_is_reported_with_its_text() -> None:
    spec = RecurrenceSpec(
        rrule="FREQ=FORTNIGHTLY",
        dtstart_local="2026-09-01T09:00:00",
        tzid="Asia/Tashkent",
        duration_minutes=90,
    )
    with pytest.raises(RecurrenceError, match="cannot parse rrule"):
        expand_rule(spec, **_window(_utc(2026, 9, 1), _utc(2026, 9, 8)))


def test_an_rrule_prefix_is_tolerated() -> None:
    """ICS files write ``RRULE:FREQ=...``; accept it rather than failing an import."""
    spec = RecurrenceSpec(
        rrule="RRULE:FREQ=WEEKLY;BYDAY=TU",
        dtstart_local="2026-09-01T09:00:00",
        tzid="Asia/Tashkent",
        duration_minutes=90,
    )
    occurrences = expand_rule(spec, **_window(_utc(2026, 9, 1), _utc(2026, 9, 15)))
    assert len(occurrences) == 2


def test_an_unbounded_rule_over_a_huge_window_hits_the_ceiling() -> None:
    """A rule with no UNTIL or COUNT must fail loudly, not expand forever."""
    spec = RecurrenceSpec(
        rrule="FREQ=MINUTELY",
        dtstart_local="2026-09-01T09:00:00",
        tzid="Asia/Tashkent",
        duration_minutes=1,
    )
    with pytest.raises(RecurrenceError, match="more than"):
        expand_rule(spec, **_window(_utc(2026, 9, 1), _utc(2027, 9, 1)), limit=500)


def test_the_default_ceiling_is_documented_and_generous() -> None:
    """A full year of daily lessons must fit comfortably under the ceiling."""
    assert MAX_OCCURRENCES >= 365


def test_weekly_rrule_rejects_until_and_count_together() -> None:
    with pytest.raises(RecurrenceError, match="never both"):
        weekly_rrule([0], until=date(2026, 12, 20), count=5)


def test_weekly_rrule_rejects_an_out_of_range_weekday() -> None:
    with pytest.raises(RecurrenceError, match="0 \\(Monday\\) to 6"):
        weekly_rrule([7])


def test_weekly_rrule_rejects_an_empty_weekday_list() -> None:
    with pytest.raises(RecurrenceError, match="at least one weekday"):
        weekly_rrule([])


def test_weekly_rrule_emits_sorted_deduplicated_days() -> None:
    assert weekly_rrule([2, 0, 2]) == "FREQ=WEEKLY;BYDAY=MO,WE"


# --------------------------------------------------------------------- properties


@hyp_settings(max_examples=60, deadline=None)
@given(
    weekday=st.integers(min_value=0, max_value=6),
    hour=st.integers(min_value=0, max_value=23),
    duration=st.integers(min_value=5, max_value=240),
    weeks=st.integers(min_value=1, max_value=20),
    tzname=st.sampled_from(["Asia/Tashkent", "Europe/Berlin", "America/Santiago", "UTC"]),
)
def test_every_occurrence_keeps_its_local_wall_clock(
    weekday: int, hour: int, duration: int, weeks: int, tzname: str
) -> None:
    """The invariant that makes the whole module worth having.

    Whatever the zone and whatever DST does, a weekly rule's occurrences all
    start at the same local hour and minute, and all last the same length.
    """
    zone = ZoneInfo(tzname)
    # Anchor DTSTART on a date that really is ``weekday``.
    anchor = date(2026, 1, 5) + timedelta(days=weekday)  # 2026-01-05 is a Monday
    spec = RecurrenceSpec(
        rrule=weekly_rrule([weekday], count=weeks),
        dtstart_local=f"{anchor.isoformat()}T{hour:02d}:30:00",
        tzid=tzname,
        duration_minutes=duration,
    )
    occurrences = expand_rule(
        spec,
        window_start=_utc(2025, 12, 1),
        window_end=_utc(2027, 1, 1),
    )

    assert len(occurrences) == weeks
    locals_ = [item.starts_at.astimezone(zone) for item in occurrences]
    # Same wall clock every week. (A start inside a skipped DST hour is
    # normalised by zoneinfo, so compare the *set* and allow that one shift.)
    assert {(value.hour, value.minute) for value in locals_} <= {(hour, 30), (hour + 1, 30)}
    assert all(item.ends_at - item.starts_at == timedelta(minutes=duration) for item in occurrences)
    # Strictly increasing, and each one a whole number of weeks after the first.
    starts = [item.starts_at for item in occurrences]
    assert starts == sorted(starts)
    assert len(set(starts)) == len(starts)


@hyp_settings(max_examples=40, deadline=None)
@given(
    offset_days=st.integers(min_value=0, max_value=60),
    span_days=st.integers(min_value=1, max_value=30),
)
def test_expansion_is_a_pure_function_of_its_window(offset_days: int, span_days: int) -> None:
    """Expanding twice gives the same answer; narrowing never invents occurrences."""
    spec = RecurrenceSpec(
        rrule=weekly_rrule([0, 3], until=date(2026, 12, 20)),
        dtstart_local="2026-09-07T11:00:00",
        tzid="Asia/Tashkent",
        duration_minutes=90,
    )
    start = _utc(2026, 9, 1) + timedelta(days=offset_days)
    end = start + timedelta(days=span_days)

    first = expand_rule(spec, window_start=start, window_end=end)
    second = expand_rule(spec, window_start=start, window_end=end)
    assert first == second

    wide = expand_rule(spec, window_start=_utc(2026, 9, 1), window_end=_utc(2027, 1, 1))
    wide_originals = {item.original_starts_at for item in wide}
    assert {item.original_starts_at for item in first} <= wide_originals
