"""Time handling.

The brief requires DST transitions to be tested "even if the campus does not use
them, because the code must not assume that" (section 9). Asia/Tashkent has had no
DST since 1991, so the DST tests below use Europe/Berlin - a real zone with a
real transition - to prove the helpers are correct rather than accidentally
correct for a fixed-offset zone.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from hypothesis import given
from hypothesis import settings as hyp_settings
from hypothesis import strategies as st

from app.core.time import (
    UTC,
    campus_date,
    campus_day_bounds,
    campus_instant_at_minutes,
    campus_local_naive,
    ensure_aware,
    minutes_since_campus_midnight,
    now,
    parse_campus_local_naive,
    to_campus,
    to_utc,
)

TASHKENT = ZoneInfo("Asia/Tashkent")
BERLIN = ZoneInfo("Europe/Berlin")


def test_now_is_aware_utc() -> None:
    value = now()
    assert value.tzinfo is not None
    assert value.utcoffset() == timedelta(0)


def test_ensure_aware_refuses_naive_without_a_zone() -> None:
    """A naive datetime must never be silently assumed to be UTC."""
    with pytest.raises(ValueError, match="naive datetime"):
        ensure_aware(datetime(2026, 10, 17, 9, 0))


def test_ensure_aware_accepts_an_explicit_assumption() -> None:
    result = ensure_aware(datetime(2026, 10, 17, 9, 0), assume=TASHKENT)
    assert result.tzinfo is TASHKENT


def test_tashkent_is_utc_plus_five() -> None:
    """Sanity check on the confirmed campus timezone."""
    local = to_campus(datetime(2026, 10, 17, 4, 0, tzinfo=UTC), TASHKENT)
    assert (local.hour, local.minute) == (9, 0)
    assert local.utcoffset() == timedelta(hours=5)


def test_compat_format_is_offset_naive_campus_local() -> None:
    """What the front end's `new Date(...)` parses as local time."""
    instant = datetime(2026, 10, 17, 4, 0, tzinfo=UTC)
    assert campus_local_naive(instant, TASHKENT) == "2026-10-17T09:00:00"


def test_compat_format_round_trips() -> None:
    instant = datetime(2026, 10, 17, 4, 0, tzinfo=UTC)
    rendered = campus_local_naive(instant, TASHKENT)
    assert parse_campus_local_naive(rendered, TASHKENT) == instant


def test_parse_accepts_an_offset_aware_string_too() -> None:
    """A client that upgraded to real instants must keep working."""
    parsed = parse_campus_local_naive("2026-10-17T09:00:00+05:00", TASHKENT)
    assert parsed == datetime(2026, 10, 17, 4, 0, tzinfo=UTC)


def test_campus_date_uses_campus_midnight_not_utc_midnight() -> None:
    """22:00 UTC is already the next day in Tashkent (UTC+5).

    This is exactly the bug that would make the map show the wrong day's
    lessons for anyone loading the page late in the evening.
    """
    late = datetime(2026, 10, 17, 22, 0, tzinfo=UTC)
    assert campus_date(late, TASHKENT) == date(2026, 10, 18)
    assert late.date() == date(2026, 10, 17)


def test_day_bounds_are_half_open_and_24h_without_dst() -> None:
    start, end = campus_day_bounds(date(2026, 10, 17), TASHKENT)
    assert end - start == timedelta(hours=24)
    assert to_campus(start, TASHKENT).hour == 0
    # Half-open: the end instant is the next day's midnight, not 23:59:59.
    assert to_campus(end, TASHKENT).date() == date(2026, 10, 18)


def test_day_bounds_handle_a_spring_forward_dst_day() -> None:
    """Europe/Berlin loses an hour on 2026-03-29, so that day is 23 hours.

    Computed from instants rather than by adding 24 hours of wall clock, which
    is the mistake this test exists to catch.
    """
    start, end = campus_day_bounds(date(2026, 3, 29), BERLIN)
    assert end - start == timedelta(hours=23)


def test_day_bounds_handle_an_autumn_back_dst_day() -> None:
    """Europe/Berlin gains an hour on 2026-10-25, so that day is 25 hours."""
    start, end = campus_day_bounds(date(2026, 10, 25), BERLIN)
    assert end - start == timedelta(hours=25)


def test_minutes_since_midnight_matches_the_simulate_slider() -> None:
    """The front end's slider default is 645 (10:45)."""
    instant = campus_instant_at_minutes(date(2026, 10, 17), 645, TASHKENT)
    assert minutes_since_campus_midnight(instant, TASHKENT) == 645
    assert campus_local_naive(instant, TASHKENT) == "2026-10-17T10:45:00"


def test_simulate_slider_range_round_trips() -> None:
    """mapConfig.schedule.simulatedRange spans 480..1140 (08:00-19:00)."""
    for minutes in range(480, 1141, 5):
        instant = campus_instant_at_minutes(date(2026, 10, 17), minutes, TASHKENT)
        assert minutes_since_campus_midnight(instant, TASHKENT) == minutes


def test_instant_at_minutes_rejects_out_of_range() -> None:
    with pytest.raises(ValueError, match="within a single day"):
        campus_instant_at_minutes(date(2026, 10, 17), 24 * 60, TASHKENT)


@given(
    st.datetimes(
        min_value=datetime(2020, 1, 1),
        max_value=datetime(2035, 12, 31),
    ),
    st.sampled_from(["Asia/Tashkent", "Europe/Berlin", "UTC", "America/New_York"]),
)
@hyp_settings(max_examples=200, deadline=None)
def test_utc_conversion_is_lossless(naive: datetime, zone_name: str) -> None:
    """Property: local -> UTC -> local is the identity on the instant.

    Not on the wall clock: during a DST fall-back the same wall clock happens
    twice, so only the instant is guaranteed to survive the round trip.
    """
    zone = ZoneInfo(zone_name)
    instant = to_utc(naive, assume=zone)
    assert instant.tzinfo is not None
    assert to_campus(instant, zone).astimezone(UTC) == instant
