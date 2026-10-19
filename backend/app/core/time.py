"""Time handling.

The rule for the whole backend (brief section 9): **UTC in the database, campus
timezone in the API**. Everything stored is an aware UTC instant; everything
rendered for a human is converted to the campus zone at the edge.

Two shapes of timestamp exist in this project and must not be confused:

* **instants** - aware datetimes, what the clean API and the database use.
* **offset-naive campus-local** strings like ``2026-10-17T09:00:00`` - what the
  front end already produces and parses (``src/data/demo-schedule.ts``). The
  compatibility layer must keep emitting these, so the conversion lives here
  rather than being improvised per endpoint.

Nothing in this module reads the clock implicitly: ``now()`` is the single
source of "now", which makes the state engine testable at any instant.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta, tzinfo
from zoneinfo import ZoneInfo

__all__ = [
    "NAIVE_LOCAL_FORMAT",
    "UTC",
    "campus_date",
    "campus_day_bounds",
    "campus_instant_at_minutes",
    "campus_local_naive",
    "ensure_aware",
    "minutes_since_campus_midnight",
    "now",
    "parse_campus_local_naive",
    "to_campus",
    "to_utc",
]

#: Format the front end's ``new Date(...)`` accepts as local time.
NAIVE_LOCAL_FORMAT = "%Y-%m-%dT%H:%M:%S"


def now() -> datetime:
    """Current instant, timezone-aware in UTC."""
    return datetime.now(UTC)


def ensure_aware(value: datetime, *, assume: tzinfo | None = None) -> datetime:
    """Return ``value`` as an aware datetime.

    A naive datetime is interpreted in ``assume`` when given. Without ``assume``
    it is an error: silently treating a naive timestamp as UTC is how timezone
    bugs are born, and this project has two timestamp shapes in play.
    """
    if value.tzinfo is not None:
        return value
    if assume is None:
        raise ValueError(
            "naive datetime received with no timezone to assume; "
            "pass assume=<ZoneInfo> to state how it should be interpreted"
        )
    return value.replace(tzinfo=assume)


def to_utc(value: datetime, *, assume: tzinfo | None = None) -> datetime:
    """Convert any datetime to an aware UTC instant."""
    return ensure_aware(value, assume=assume).astimezone(UTC)


def to_campus(value: datetime, tz: ZoneInfo) -> datetime:
    """Convert an instant to campus-local wall-clock time."""
    return ensure_aware(value, assume=UTC).astimezone(tz)


def campus_local_naive(value: datetime, tz: ZoneInfo) -> str:
    """Render an instant the way the front end's demo data is written.

    ``2026-10-17T09:00:00`` - campus-local wall clock, no offset suffix, which is
    exactly what ``new Date(...)`` in the browser parses as local time. Used only
    by the compatibility layer; the clean API returns offset-aware instants.
    """
    return to_campus(value, tz).strftime(NAIVE_LOCAL_FORMAT)


def parse_campus_local_naive(value: str, tz: ZoneInfo) -> datetime:
    """Inverse of :func:`campus_local_naive`, returning a UTC instant.

    Accepts an offset-aware string too, so a caller that upgraded to real
    instants keeps working.
    """
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is not None:
        return parsed.astimezone(UTC)
    return parsed.replace(tzinfo=tz).astimezone(UTC)


def campus_date(value: datetime, tz: ZoneInfo) -> date:
    """The campus-local calendar date of an instant.

    This is the key the front end uses to pick a day's lessons
    (``toLocalDateKey`` in ``src/services/schedule/scheduleService.ts``).
    """
    return to_campus(value, tz).date()


def campus_day_bounds(day: date, tz: ZoneInfo) -> tuple[datetime, datetime]:
    """Half-open UTC interval ``[start, end)`` covering one campus-local day.

    Computed by localising midnight and adding 24 hours to the *instant*, not by
    assuming the day is 24 hours of wall clock: on a DST transition it is 23 or
    25. The campus (Asia/Tashkent) has no DST today, but the code must not
    assume that - the brief requires DST transitions to be tested anyway.
    """
    start_local = datetime.combine(day, time.min).replace(tzinfo=tz)
    start = start_local.astimezone(UTC)
    next_local = datetime.combine(day + timedelta(days=1), time.min).replace(tzinfo=tz)
    return start, next_local.astimezone(UTC)


def minutes_since_campus_midnight(value: datetime, tz: ZoneInfo) -> int:
    """Minutes since local midnight, matching the front end's Simulate slider.

    ``src/hooks/useNow.ts`` models simulated time as minutes since midnight, and
    ``mapConfig.schedule.simulatedRange`` spans 480..1140 (08:00-19:00).
    """
    local = to_campus(value, tz)
    return local.hour * 60 + local.minute


def campus_instant_at_minutes(day: date, minutes: int, tz: ZoneInfo) -> datetime:
    """Inverse of :func:`minutes_since_campus_midnight`.

    Turns the front end's ``(date, minutes)`` pair into a UTC instant usable as
    the clean API's ``at`` parameter.
    """
    if not 0 <= minutes < 24 * 60:
        raise ValueError(f"minutes must be within a single day, got {minutes}")
    local = datetime.combine(day, time.min).replace(tzinfo=tz) + timedelta(minutes=minutes)
    return local.astimezone(UTC)
