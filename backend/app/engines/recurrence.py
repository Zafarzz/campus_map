"""Recurrence expansion: turn a master rule into concrete occurrences.

This is the module the brief singles out as "where timetable code usually
breaks" (section 10.1), so the rules it follows are worth stating plainly.

**Expand in the event's own timezone, then convert to UTC.** A weekly 09:00
lecture is 09:00 *local* every week. If you expand in UTC you get 09:00 on one
side of a daylight-saving change and 08:00 or 10:00 on the other. ``dateutil``'s
``rrule`` does calendar arithmetic on naive wall-clock values, so the sequence is
generated naive, each value is localised in ``tzid``, and only then converted to
an instant. Asia/Tashkent has no DST today, but the code must not assume that -
and :mod:`tests.test_recurrence` crosses a DST boundary in Europe/Berlin to
prove it.

**EXDATEs match the occurrence's original start.** Not its moved start: once an
override has moved an occurrence, the thing that identifies it is still where it
started life. That is also how ``RECURRENCE-ID`` works in iCalendar, which is
why :class:`Occurrence` carries ``original_starts_at`` all the way through.

**A duration, never an end time.** Storing ``ends_at`` per occurrence and
expanding it separately lets the two drift across a DST boundary. The rule holds
``duration_minutes`` and the end is always ``start + duration``.

Nothing here touches a database. :func:`expand_rule` takes a
:class:`RecurrenceSpec` and returns instants; persisting them as ``meeting`` rows
is :mod:`app.services.timetable_service`'s job.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from dateutil import rrule as dateutil_rrule

__all__ = [
    "MAX_OCCURRENCES",
    "Occurrence",
    "OverrideSpec",
    "RecurrenceError",
    "RecurrenceSpec",
    "expand_rule",
    "parse_local_naive",
    "weekly_rrule",
]

#: Hard ceiling on how many occurrences one rule may produce. A malformed or
#: hostile ``RRULE`` with no ``UNTIL`` and no ``COUNT`` would otherwise expand
#: forever; an import must fail loudly rather than exhaust memory.
MAX_OCCURRENCES = 10_000

#: ``BYDAY`` tokens in the order ``dateutil`` numbers weekdays (Monday = 0).
_WEEKDAY_TOKENS = ("MO", "TU", "WE", "TH", "FR", "SA", "SU")


class RecurrenceError(ValueError):
    """A rule could not be expanded. Always carries a human-readable reason.

    Raised rather than returning an empty list: an import report that says
    "0 meetings" when the real answer is "your RRULE is malformed" is worse than
    no report at all (brief section 10.1: every error reported, none silently
    dropped).
    """


@dataclass(frozen=True, slots=True)
class OverrideSpec:
    """A single-occurrence change, keyed by the occurrence's *original* start.

    Mirrors ``meeting_override`` and iCalendar's ``RECURRENCE-ID``. ``cancel``
    keeps the occurrence in the output with ``cancelled=True`` rather than
    dropping it, because the map has a dedicated "Cancelled" colour and a
    vanished lesson would silently render as "Free" - which is a different claim
    about the world (brief section 10.2, precedence rule 1).
    """

    #: The occurrence's original start, as a UTC instant.
    original_starts_at: datetime
    action: str  # "cancel" | "move" | "room_change"
    new_starts_at: datetime | None = None
    new_ends_at: datetime | None = None
    new_room_id: str | None = None

    def __post_init__(self) -> None:
        if self.action not in {"cancel", "move", "room_change"}:
            raise RecurrenceError(
                f"unknown override action {self.action!r}; expected cancel, move or room_change"
            )
        if self.action == "move" and self.new_starts_at is None:
            raise RecurrenceError("a 'move' override needs new_starts_at")
        if self.original_starts_at.tzinfo is None:
            raise RecurrenceError("override original_starts_at must be timezone-aware")


@dataclass(frozen=True, slots=True)
class Occurrence:
    """One materialised occurrence of a rule.

    ``starts_at``/``ends_at`` are the instants to store and query on;
    ``original_starts_at`` is the identity an ``EXDATE`` or ``RECURRENCE-ID``
    matches, and it differs from ``starts_at`` exactly when an override moved it.
    """

    starts_at: datetime
    ends_at: datetime
    original_starts_at: datetime
    room_id: str | None = None
    cancelled: bool = False
    #: True when an override changed this occurrence's time or room.
    overridden: bool = False

    @property
    def was_moved(self) -> bool:
        return self.starts_at != self.original_starts_at


@dataclass(frozen=True, slots=True)
class RecurrenceSpec:
    """A master recurrence rule, exactly as ``meeting_rule`` stores it.

    ``dtstart_local`` is a **naive** wall-clock string (``2026-09-01T09:00:00``)
    interpreted in ``tzid``. Keeping it naive is deliberate: it is the local time
    the timetable prints, and attaching an offset to it would bake in whichever
    offset happened to be in force on the first day of term.
    """

    rrule: str
    dtstart_local: str
    tzid: str
    duration_minutes: int
    room_id: str | None = None
    #: Excluded occurrence starts, matched by *original* start. Accepts an aware
    #: instant, a naive local timestamp, a ``date``, or a string in any of those
    #: spellings. ``datetime`` is a subclass of ``date``, so the annotation
    #: covers both and :func:`_normalise_exdates` distinguishes them.
    exdates: tuple[date | str, ...] = ()
    overrides: tuple[OverrideSpec, ...] = field(default=())

    def __post_init__(self) -> None:
        if self.duration_minutes <= 0:
            raise RecurrenceError(f"duration_minutes must be positive, got {self.duration_minutes}")
        try:
            ZoneInfo(self.tzid)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise RecurrenceError(f"tzid {self.tzid!r} is not a known IANA timezone") from exc

    @property
    def zone(self) -> ZoneInfo:
        return ZoneInfo(self.tzid)

    @property
    def duration(self) -> timedelta:
        return timedelta(minutes=self.duration_minutes)


def parse_local_naive(value: str) -> datetime:
    """Parse a naive wall-clock string, refusing anything with an offset.

    A ``dtstart_local`` that carries an offset is a sign the caller has already
    converted it, and silently accepting that is how a term's worth of lessons
    ends up an hour out.
    """
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is not None:
        raise RecurrenceError(
            f"dtstart_local must be a naive wall-clock time, got {value!r} with an offset. "
            "The timezone belongs in tzid."
        )
    return parsed


def weekly_rrule(
    weekdays: list[int] | tuple[int, ...],
    *,
    interval: int = 1,
    until: date | None = None,
    count: int | None = None,
) -> str:
    """Build a ``FREQ=WEEKLY`` rule string from a CSV-style weekly pattern.

    CSV and XLSX timetable exports give a weekday and a date window rather than
    an ``RRULE``, so this is the bridge (brief section 10.1). ``weekdays`` use
    Monday = 0, matching both ``dateutil`` and the timetable source's
    ``firstDayOfWeek``.

    ``UNTIL`` is emitted as a plain date. iCalendar would want a UTC instant with
    a ``Z`` suffix, but this string is only ever consumed by :func:`expand_rule`,
    which applies it as an inclusive local end date - the right semantics for
    "classes run until 20 December", which is a statement about local dates and
    not about an instant.
    """
    if not weekdays:
        raise RecurrenceError("a weekly rule needs at least one weekday")
    if interval < 1:
        raise RecurrenceError(f"interval must be at least 1, got {interval}")
    if until is not None and count is not None:
        raise RecurrenceError("an RRULE may carry UNTIL or COUNT, never both")
    for day in weekdays:
        if not 0 <= day <= 6:
            raise RecurrenceError(f"weekday must be 0 (Monday) to 6 (Sunday), got {day}")

    parts = ["FREQ=WEEKLY"]
    if interval != 1:
        parts.append(f"INTERVAL={interval}")
    parts.append("BYDAY=" + ",".join(_WEEKDAY_TOKENS[day] for day in sorted(set(weekdays))))
    if until is not None:
        parts.append(f"UNTIL={until.strftime('%Y%m%d')}")
    if count is not None:
        parts.append(f"COUNT={count}")
    return ";".join(parts)


def expand_rule(
    spec: RecurrenceSpec,
    *,
    window_start: datetime,
    window_end: datetime,
    limit: int = MAX_OCCURRENCES,
) -> list[Occurrence]:
    """Expand ``spec`` into the occurrences overlapping ``[window_start, window_end)``.

    "Overlapping", not "starting within": a lesson that began before the window
    opened is still in the room when the window opens, and the state engine needs
    it. An occurrence is included when ``start < window_end and end >
    window_start``.

    Returned in chronological order of ``starts_at``. Cancelled occurrences are
    present with ``cancelled=True`` - see :class:`OverrideSpec`.
    """
    # Awareness first: comparing a naive and an aware datetime is a TypeError,
    # so the ordering check below would mask the more useful diagnosis.
    if window_start.tzinfo is None or window_end.tzinfo is None:
        raise RecurrenceError("expansion window must be timezone-aware")
    if window_end <= window_start:
        raise RecurrenceError(f"window must be non-empty, got {window_start} to {window_end}")

    zone = spec.zone
    dtstart_naive = parse_local_naive(spec.dtstart_local)
    rule = _build_rule(spec.rrule, dtstart_naive)

    # Expand a generous band of *local* days around the window. The band is
    # widened by a day on each side so that an occurrence whose local date falls
    # just outside the window but whose instant falls inside it (possible with
    # any non-zero UTC offset) is still generated.
    local_from = (window_start.astimezone(zone) - timedelta(days=1)).replace(tzinfo=None)
    local_until = (window_end.astimezone(zone) + timedelta(days=1)).replace(tzinfo=None)

    excluded_instants, excluded_dates = _normalise_exdates(spec.exdates, zone)
    overrides = {override.original_starts_at: override for override in spec.overrides}

    occurrences: list[Occurrence] = []
    generated = 0
    for naive_start in rule:
        if naive_start > local_until:
            break
        generated += 1
        if generated > limit:
            raise RecurrenceError(
                f"rule {spec.rrule!r} produced more than {limit} occurrences; "
                "add an UNTIL or COUNT, or narrow the term window"
            )
        if naive_start < local_from:
            continue

        # Localise the wall-clock value, then convert. ``fold=0`` resolves the
        # ambiguous hour of a backward DST transition to the first (pre-change)
        # occurrence, which is what a human reading a timetable assumes.
        original = naive_start.replace(tzinfo=zone, fold=0).astimezone(UTC)

        if _is_excluded(original, zone, excluded_instants, excluded_dates):
            continue

        occurrence = _apply_override(
            original=original,
            duration=spec.duration,
            room_id=spec.room_id,
            override=overrides.get(original),
        )
        if occurrence.starts_at < window_end and occurrence.ends_at > window_start:
            occurrences.append(occurrence)

    occurrences.sort(key=lambda item: (item.starts_at, item.original_starts_at))
    return occurrences


def _apply_override(
    *,
    original: datetime,
    duration: timedelta,
    room_id: str | None,
    override: OverrideSpec | None,
) -> Occurrence:
    """Build one occurrence, folding in an override if there is one."""
    if override is None:
        return Occurrence(
            starts_at=original,
            ends_at=original + duration,
            original_starts_at=original,
            room_id=room_id,
        )

    if override.action == "cancel":
        return Occurrence(
            starts_at=original,
            ends_at=original + duration,
            original_starts_at=original,
            room_id=room_id,
            cancelled=True,
            overridden=True,
        )

    starts_at = override.new_starts_at or original
    # A move that gives no new end keeps the rule's duration rather than the old
    # end instant, so a moved lesson stays the same length.
    ends_at = override.new_ends_at or (starts_at + duration)
    if ends_at <= starts_at:
        raise RecurrenceError(
            f"override for occurrence at {original.isoformat()} ends at or before it starts"
        )
    return Occurrence(
        starts_at=starts_at,
        ends_at=ends_at,
        original_starts_at=original,
        room_id=override.new_room_id or room_id,
        overridden=True,
    )


def _build_rule(rrule_text: str, dtstart_naive: datetime) -> dateutil_rrule.rrule:
    """Parse an ``RRULE`` string against a naive ``DTSTART``.

    ``UNTIL`` is made inclusive-to-end-of-day when it was written as a bare date,
    so ``UNTIL=20261220`` includes a lesson on 20 December. ``dateutil`` would
    otherwise read it as midnight and drop that day's occurrence, which is the
    kind of off-by-one-week bug that only shows up at the end of term.
    """
    text = rrule_text.strip()
    if not text:
        raise RecurrenceError("rrule is empty")
    if text.upper().startswith("RRULE:"):
        text = text[len("RRULE:") :]
    if "\n" in text or "\r" in text:
        raise RecurrenceError(
            "rrule must be a single RRULE line; multi-line iCalendar belongs in the ICS parser"
        )

    text = _extend_bare_until(text)

    try:
        rule = dateutil_rrule.rrulestr(text, dtstart=dtstart_naive, forceset=False)
    except (ValueError, TypeError) as exc:
        raise RecurrenceError(f"cannot parse rrule {rrule_text!r}: {exc}") from exc
    if not isinstance(rule, dateutil_rrule.rrule):
        raise RecurrenceError(
            f"rrule {rrule_text!r} parsed to a rule set; pass EXDATEs through RecurrenceSpec.exdates"
        )
    return rule


def _extend_bare_until(text: str) -> str:
    """Rewrite ``UNTIL=YYYYMMDD`` to the last instant of that local day."""
    parts = []
    for part in text.split(";"):
        key, _, value = part.partition("=")
        if key.strip().upper() == "UNTIL" and len(value.strip()) == 8 and value.strip().isdigit():
            parts.append(f"UNTIL={value.strip()}T235959")
        else:
            parts.append(part)
    return ";".join(parts)


def _normalise_exdates(
    exdates: tuple[date | str, ...],
    zone: ZoneInfo,
) -> tuple[frozenset[datetime], frozenset[date]]:
    """Split EXDATEs into exact instants and whole local dates.

    Four input shapes are accepted because all four turn up in practice: an aware
    instant (from the database), a naive local timestamp (from an ICS
    ``EXDATE;TZID=``), an ISO local date, and a bare ``YYYYMMDD`` (how iCalendar
    writes a DATE-valued EXDATE).

    The two sets are kept apart on purpose, because the two spellings mean
    different things and collapsing them would silently change behaviour:

    * **An EXDATE with a time** excludes exactly the occurrence that starts at
      that instant.
    * **An EXDATE that is only a date** excludes *every* occurrence on that local
      date - which is what a registrar writing "no classes on 1 September" means,
      and it must not depend on them guessing the lesson's start time.
    """
    instants: set[datetime] = set()
    dates: set[date] = set()

    for raw in exdates:
        if isinstance(raw, datetime):
            aware = raw.replace(tzinfo=zone) if raw.tzinfo is None else raw
            instants.add(aware.astimezone(UTC))
            continue
        if isinstance(raw, date):
            dates.add(raw)
            continue

        value = str(raw).strip()
        if not value:
            continue

        # Decide date-vs-instant from the *text*, before parsing. Both spellings
        # of a bare date ("2026-09-08" and "20260908") parse to midnight, which
        # is indistinguishable from an explicit midnight timestamp once parsed -
        # and Python 3.11+ accepts the basic ISO form in ``fromisoformat``, so a
        # try/except around it never reaches a date branch.
        is_date_only = len(value) == 10 and value[4] == value[7] == "-"
        is_basic_date = len(value) == 8 and value.isdigit()

        try:
            if is_basic_date:
                # A DATE-valued EXDATE has no time and therefore no zone; the
                # whole point is that it names a local calendar day. Parsed with
                # ``date.fromisoformat``, which takes the basic form since 3.11
                # and never produces a naive *datetime* to be misread as UTC.
                dates.add(date.fromisoformat(value))
                continue
            parsed = datetime.fromisoformat(value)
        except ValueError as exc:
            raise RecurrenceError(
                f"cannot parse exdate {raw!r}; expected an ISO date, an ISO timestamp or YYYYMMDD"
            ) from exc

        if is_date_only:
            dates.add(parsed.date())
        elif parsed.tzinfo is not None:
            instants.add(parsed.astimezone(UTC))
        else:
            instants.add(parsed.replace(tzinfo=zone).astimezone(UTC))

    return frozenset(instants), frozenset(dates)


def _is_excluded(
    original: datetime,
    zone: ZoneInfo,
    excluded_instants: frozenset[datetime],
    excluded_dates: frozenset[date],
) -> bool:
    """True when an EXDATE suppresses the occurrence starting at ``original``."""
    if original in excluded_instants:
        return True
    return original.astimezone(zone).date() in excluded_dates
