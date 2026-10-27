"""Validation and diffing: say exactly what is wrong before anything is saved.

``POST /schedule/import?dry_run=true`` returns one of these reports and writes
nothing (brief section 10.1). The checks it performs:

* unknown rooms,
* enrolled count above room capacity,
* room double-booking,
* teacher double-booking,
* meetings outside the term,
* times that are not valid in the campus timezone,
* plus the structural problems the parsers found.

The report also carries a **diff** against the current timetable, so a human can
see what an import would actually change rather than approving a row count.

Two principles run through the module. First, **nothing is silently dropped**: a
row that cannot be used still appears, with the reason. Second, **errors block
and warnings do not** - an unknown room is an error because the resulting
meeting would have nowhere to be, while a class slightly larger than its room is
a warning because rooms are routinely over-subscribed in practice and refusing
the import would be unhelpful.
"""

from __future__ import annotations

import itertools
from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, datetime, time
from enum import StrEnum
from zoneinfo import ZoneInfo

from app.engines.timetable.template import TimetableRow

__all__ = [
    "ImportDiff",
    "ImportReport",
    "Issue",
    "RoomInfo",
    "Severity",
    "TermWindow",
    "validate_rows",
]


class Severity(StrEnum):
    """Whether an issue blocks the import.

    ``error`` blocks; ``warning`` is reported and applied anyway. Mirrors the
    two-level shape the repository already uses for geometry validation
    (ADR-011), so a reviewer reads one convention everywhere.
    """

    error = "error"
    warning = "warning"


class IssueCode(StrEnum):
    """Stable machine-readable issue identifiers."""

    unparsable_row = "unparsable_row"
    unknown_room = "unknown_room"
    ambiguous_room = "ambiguous_room"
    over_capacity = "over_capacity"
    room_double_booked = "room_double_booked"
    teacher_double_booked = "teacher_double_booked"
    outside_term = "outside_term"
    invalid_local_time = "invalid_local_time"
    non_positive_duration = "non_positive_duration"
    implausible_duration = "implausible_duration"
    missing_course = "missing_course"
    missing_teacher = "missing_teacher"
    unknown_week_pattern = "unknown_week_pattern"
    reversed_date_range = "reversed_date_range"
    tight_walking_transition = "tight_walking_transition"


@dataclass(frozen=True, slots=True)
class Issue:
    """One problem, tied to the rows that caused it."""

    code: IssueCode
    severity: Severity
    message: str
    #: 1-based row numbers in the source file. A conflict names both rows.
    rows: tuple[int, ...] = ()
    details: dict[str, object] = field(default_factory=dict)

    def as_dict(self) -> dict[str, object]:
        return {
            "code": self.code.value,
            "severity": self.severity.value,
            "message": self.message,
            "rows": list(self.rows),
            **({"details": self.details} if self.details else {}),
        }


@dataclass(frozen=True, slots=True)
class RoomInfo:
    """What validation needs to know about a room that exists."""

    room_id: str
    capacity: int | None = None
    out_of_service: bool = False
    building_id: str | None = None
    floor_level: int = 1

    @property
    def resolved_building_id(self) -> str | None:
        if self.building_id is not None:
            return self.building_id
        parts = self.room_id.split("-")
        if len(parts) >= 2 and parts[0] == "bld":
            return f"{parts[0]}-{parts[1]}"
        return None

    @property
    def resolved_floor_level(self) -> int:
        if self.floor_level != 1:
            return self.floor_level
        parts = self.room_id.split("-")
        if len(parts) >= 3 and parts[2].startswith("f") and parts[2][1:].lstrip("-").isdigit():
            return int(parts[2][1:])
        return self.floor_level


@dataclass(frozen=True, slots=True)
class TermWindow:
    """The term a timetable must fit inside."""

    starts_on: date
    ends_on: date
    code: str | None = None

    def contains(self, day: date) -> bool:
        return self.starts_on <= day <= self.ends_on


@dataclass(frozen=True, slots=True)
class ImportDiff:
    """What applying this batch would change.

    Counts plus a bounded sample of each. The sample is capped because a first
    import of a whole university is thousands of additions, and a report nobody
    can read is not a report.
    """

    added: tuple[TimetableRow, ...] = ()
    #: Identity keys present in the database but absent from the import.
    removed: tuple[str, ...] = ()
    unchanged_count: int = 0
    sample_limit: int = 20

    @property
    def added_count(self) -> int:
        return len(self.added)

    @property
    def removed_count(self) -> int:
        return len(self.removed)

    def as_dict(self) -> dict[str, object]:
        return {
            "added": self.added_count,
            "removed": self.removed_count,
            "unchanged": self.unchanged_count,
            "added_sample": [
                {
                    "row": item.source_row,
                    "room_code": item.room_code,
                    "weekday": item.weekday,
                    "starts_at": item.starts_at.isoformat() if item.starts_at else None,
                    "ends_at": item.ends_at.isoformat() if item.ends_at else None,
                    "title": item.title,
                    "section_code": item.section_code,
                }
                for item in self.added[: self.sample_limit]
            ],
            "removed_sample": list(self.removed[: self.sample_limit]),
        }


@dataclass
class ImportReport:
    """The whole answer to a dry run."""

    issues: list[Issue] = field(default_factory=list)
    #: Rows that would become meeting rules.
    usable_rows: list[TimetableRow] = field(default_factory=list)
    total_rows: int = 0
    file_errors: list[str] = field(default_factory=list)
    diff: ImportDiff | None = None
    column_mapping: dict[str, str] = field(default_factory=dict)

    @property
    def errors(self) -> list[Issue]:
        return [item for item in self.issues if item.severity is Severity.error]

    @property
    def warnings(self) -> list[Issue]:
        return [item for item in self.issues if item.severity is Severity.warning]

    @property
    def can_apply(self) -> bool:
        """True when nothing blocks the import.

        File-level errors always block. Row-level errors block too: applying a
        timetable that is known to contain meetings with nowhere to happen would
        put the map into a state no one asked for.
        """
        return not self.file_errors and not self.errors and bool(self.usable_rows)

    def as_dict(self) -> dict[str, object]:
        return {
            "can_apply": self.can_apply,
            "total_rows": self.total_rows,
            "usable_rows": len(self.usable_rows),
            "error_count": len(self.errors),
            "warning_count": len(self.warnings),
            "file_errors": list(self.file_errors),
            "issues": [item.as_dict() for item in self.issues],
            "column_mapping": dict(self.column_mapping),
            **({"diff": self.diff.as_dict()} if self.diff else {}),
        }

    def summary(self) -> str:
        """One-line human summary, for a CLI or a log."""
        verdict = "can be applied" if self.can_apply else "BLOCKED"
        return (
            f"{self.total_rows} rows, {len(self.usable_rows)} usable, "
            f"{len(self.errors)} error(s), {len(self.warnings)} warning(s) - {verdict}"
        )


def validate_rows(
    rows: list[TimetableRow] | tuple[TimetableRow, ...],
    *,
    known_rooms: dict[str, RoomInfo],
    timezone: ZoneInfo,
    term: TermWindow | None = None,
    existing_identities: set[str] | None = None,
    file_errors: list[str] | None = None,
    column_mapping: dict[str, str] | None = None,
    max_duration_minutes: int = 8 * 60,
) -> ImportReport:
    """Validate parsed rows and build the report.

    ``known_rooms`` is keyed by a **normalised** room code (see
    :func:`normalise_room_code`) so that "A-101", "a101" and "A 101" all resolve
    to the same room. Several real codes normalising to one key is itself
    reported, rather than resolved by picking one.
    """
    report = ImportReport(
        total_rows=len(rows),
        file_errors=list(file_errors or []),
        column_mapping=dict(column_mapping or {}),
    )

    lookup, collisions = _build_lookup(known_rooms)
    for key, codes in collisions.items():
        report.issues.append(
            Issue(
                code=IssueCode.ambiguous_room,
                severity=Severity.error,
                message=(
                    f"room code {key!r} matches several rooms ({sorted(codes)}); "
                    "it cannot be resolved without a change to the room data"
                ),
                details={"normalised": key, "candidates": sorted(codes)},
            )
        )

    usable: list[TimetableRow] = []

    for row in rows:
        issues = _validate_row(
            row,
            lookup=lookup,
            timezone=timezone,
            term=term,
            max_duration_minutes=max_duration_minutes,
        )
        report.issues.extend(issues)
        if row.is_usable and not any(item.severity is Severity.error for item in issues):
            usable.append(row)

    report.issues.extend(_find_double_bookings(usable))
    report.issues.extend(_find_walking_transition_warnings(usable, lookup))
    report.usable_rows = usable

    if existing_identities is not None:
        report.diff = _build_diff(usable, existing_identities)

    return report


def normalise_room_code(code: str) -> str:
    """Normalise a room code for matching.

    Uppercased, with spaces, hyphens, dots and underscores removed, so "A-101",
    "a 101" and "A101" are one key. Nothing else is changed - in particular no
    digits are stripped or padded, because ``GEOMETRY_SPEC.md`` section 5.4
    requires room numbers to be stored exactly as the official source prints
    them, and a normaliser that "corrected" 101 to 0101 would invent a room.
    """
    text = code.strip().upper()
    for char in (" ", "-", ".", "_", "/"):
        text = text.replace(char, "")
    return text


def _build_lookup(
    known_rooms: dict[str, RoomInfo],
) -> tuple[dict[str, RoomInfo], dict[str, set[str]]]:
    """Index rooms by normalised code, reporting any collisions."""
    lookup: dict[str, RoomInfo] = {}
    seen: dict[str, set[str]] = defaultdict(set)

    for code, info in known_rooms.items():
        key = normalise_room_code(code)
        seen[key].add(code)
        lookup[key] = info

    collisions = {key: codes for key, codes in seen.items() if len(codes) > 1}
    for key in collisions:
        lookup.pop(key, None)  # ambiguous: refuse to resolve
    return lookup, collisions


def _validate_row(
    row: TimetableRow,
    *,
    lookup: dict[str, RoomInfo],
    timezone: ZoneInfo,
    term: TermWindow | None,
    max_duration_minutes: int,
) -> list[Issue]:
    issues: list[Issue] = []

    for message in row.parse_errors:
        issues.append(
            Issue(
                code=IssueCode.unparsable_row,
                severity=Severity.error,
                message=f"row {row.source_row}: {message}",
                rows=(row.source_row,),
            )
        )

    # Room resolution.
    room: RoomInfo | None = None
    if row.room_code:
        room = lookup.get(normalise_room_code(row.room_code))
        if room is None:
            issues.append(
                Issue(
                    code=IssueCode.unknown_room,
                    severity=Severity.error,
                    message=(f"row {row.source_row}: room {row.room_code!r} does not exist on this campus"),
                    rows=(row.source_row,),
                    details={"room_code": row.room_code},
                )
            )

    # Duration.
    minutes = row.interval_minutes
    if minutes is not None:
        if minutes <= 0:
            issues.append(
                Issue(
                    code=IssueCode.non_positive_duration,
                    severity=Severity.error,
                    message=f"row {row.source_row}: the lesson ends at or before it starts",
                    rows=(row.source_row,),
                )
            )
        elif minutes > max_duration_minutes:
            issues.append(
                Issue(
                    code=IssueCode.implausible_duration,
                    severity=Severity.warning,
                    message=(
                        f"row {row.source_row}: the lesson lasts {minutes} minutes, which is "
                        f"longer than the {max_duration_minutes}-minute plausibility limit"
                    ),
                    rows=(row.source_row,),
                    details={"minutes": minutes},
                )
            )

    # Capacity. A warning, not an error: rooms are routinely over-subscribed and
    # refusing the whole import over it would be unhelpful.
    if room is not None and room.capacity and row.enrolled_count and (row.enrolled_count > room.capacity):
        issues.append(
            Issue(
                code=IssueCode.over_capacity,
                severity=Severity.warning,
                message=(
                    f"row {row.source_row}: {row.enrolled_count} students are enrolled but "
                    f"room {row.room_code} seats {room.capacity}"
                ),
                rows=(row.source_row,),
                details={"enrolled": row.enrolled_count, "capacity": room.capacity},
            )
        )

    # Term window.
    if term is not None:
        for label, day in (("start_date", row.start_date), ("end_date", row.end_date)):
            if day is not None and not term.contains(day):
                issues.append(
                    Issue(
                        code=IssueCode.outside_term,
                        severity=Severity.warning,
                        message=(
                            f"row {row.source_row}: {label} {day.isoformat()} falls outside the "
                            f"term ({term.starts_on.isoformat()} to {term.ends_on.isoformat()})"
                        ),
                        rows=(row.source_row,),
                        details={"field": label, "value": day.isoformat()},
                    )
                )

    if row.start_date and row.end_date and row.end_date < row.start_date:
        issues.append(
            Issue(
                code=IssueCode.reversed_date_range,
                severity=Severity.error,
                message=f"row {row.source_row}: end_date is before start_date",
                rows=(row.source_row,),
            )
        )

    # Local-time validity. A wall clock that does not exist on the day it starts
    # (a DST spring-forward gap) would silently be moved by an hour.
    if (
        row.starts_at is not None
        and row.start_date is not None
        and not _local_time_exists(row.start_date, row.starts_at, timezone)
    ):
        issues.append(
            Issue(
                code=IssueCode.invalid_local_time,
                severity=Severity.error,
                message=(
                    f"row {row.source_row}: {row.starts_at.isoformat()} does not exist on "
                    f"{row.start_date.isoformat()} in {timezone.key} (daylight-saving gap)"
                ),
                rows=(row.source_row,),
            )
        )

    if row.week_pattern and row.week_pattern not in {"weekly", "odd", "even"}:
        issues.append(
            Issue(
                code=IssueCode.unknown_week_pattern,
                severity=Severity.warning,
                message=(
                    f"row {row.source_row}: week pattern {row.week_pattern!r} was not recognised; "
                    "it will be treated as weekly"
                ),
                rows=(row.source_row,),
            )
        )

    if not row.course_code and not row.title:
        issues.append(
            Issue(
                code=IssueCode.missing_course,
                severity=Severity.warning,
                message=f"row {row.source_row}: neither a course code nor a title was given",
                rows=(row.source_row,),
            )
        )

    if not row.teacher_ref:
        issues.append(
            Issue(
                code=IssueCode.missing_teacher,
                severity=Severity.warning,
                message=f"row {row.source_row}: no teacher reference",
                rows=(row.source_row,),
            )
        )

    return issues


def _local_time_exists(day: date, wall_clock: time, timezone: ZoneInfo) -> bool:
    """False when a wall-clock time is skipped by a DST transition.

    Detected by round-tripping: ``zoneinfo`` resolves a non-existent local time
    rather than raising, so a value that converts to UTC and back to a
    *different* wall clock did not exist.

    Asia/Tashkent has no DST, so this never fires there today - but the code
    must not assume that (brief section 9), and a campus that did observe DST
    would otherwise get an hour of lessons silently relocated.
    """
    local = datetime.combine(day, wall_clock).replace(tzinfo=timezone)
    round_tripped = local.astimezone(ZoneInfo("UTC")).astimezone(timezone)
    return round_tripped.hour == wall_clock.hour and round_tripped.minute == wall_clock.minute


def _find_double_bookings(rows: list[TimetableRow]) -> list[Issue]:
    """Rooms and teachers that would be in two places at once.

    Compared within a ``(weekday, week_pattern)`` bucket, because two lessons in
    one room on the same weekday only clash if they run in the same weeks: an
    odd-week and an even-week lesson at 09:00 Monday are a normal arrangement,
    not a conflict. ``weekly`` overlaps both parities and is bucketed with each.
    """
    issues: list[Issue] = []

    # Annotated so the lambdas are not untyped calls under strict mypy.
    subjects: tuple[tuple[str, Callable[[TimetableRow], str | None]], ...] = (
        ("room", lambda row: row.room_code),
        ("teacher", lambda row: row.teacher_ref),
    )

    for key_name, extract in subjects:
        buckets: dict[tuple[object, ...], list[TimetableRow]] = defaultdict(list)
        for row in rows:
            subject = extract(row)
            if subject is None or row.weekday is None or row.starts_at is None:
                continue
            for parity in _parities(row.week_pattern):
                buckets[(subject, row.weekday, parity)].append(row)

        reported: set[tuple[int, int]] = set()
        for bucket_key, group in buckets.items():
            bucket_subject, bucket_weekday = bucket_key[0], bucket_key[1]
            for first, second in itertools.combinations(group, 2):
                if not _times_overlap(first, second):
                    continue
                pair = tuple(sorted((first.source_row, second.source_row)))
                if pair in reported:
                    continue
                reported.add(pair)  # type: ignore[arg-type]

                if not _dates_overlap(first, second):
                    continue

                code = IssueCode.room_double_booked if key_name == "room" else IssueCode.teacher_double_booked
                issues.append(
                    Issue(
                        code=code,
                        severity=Severity.error,
                        message=(
                            f"{key_name} {bucket_subject!r} is booked twice on weekday "
                            f"{bucket_weekday}: "
                            f"rows {first.source_row} and {second.source_row} overlap "
                            f"({first.starts_at}-{first.ends_at} and "
                            f"{second.starts_at}-{second.ends_at})"
                        ),
                        rows=pair,
                        details={key_name: bucket_subject, "weekday": bucket_weekday},
                    )
                )

    return issues


def _parities(week_pattern: str | None) -> tuple[str, ...]:
    """Which parity buckets a row belongs to."""
    if week_pattern == "odd":
        return ("odd",)
    if week_pattern == "even":
        return ("even",)
    # Weekly (or unknown) runs every week, so it can clash with both.
    return ("odd", "even")


def _times_overlap(first: TimetableRow, second: TimetableRow) -> bool:
    """Half-open overlap on the wall clock: touching is not a clash."""
    if None in (first.starts_at, first.ends_at, second.starts_at, second.ends_at):
        return False
    return first.starts_at < second.ends_at and first.ends_at > second.starts_at  # type: ignore[operator]


def _dates_overlap(first: TimetableRow, second: TimetableRow) -> bool:
    """Whether two rows' date ranges can coincide.

    An absent bound is treated as unbounded, so two rows with no dates at all
    are assumed to overlap - the conservative reading, since reporting a
    possible clash is better than hiding a real one.
    """
    first_start = first.start_date or date.min
    first_end = first.end_date or date.max
    second_start = second.start_date or date.min
    second_end = second.end_date or date.max
    return first_start <= second_end and first_end >= second_start


def _build_diff(rows: list[TimetableRow], existing: set[str]) -> ImportDiff:
    """Compare an import against what is already stored.

    Keyed on :meth:`TimetableRow.identity_key`, the same string the importer
    persists to ``meeting_rule.source_identity`` - so the two sides of the
    comparison are computed by one function rather than two that have to agree.
    """
    incoming = {row.identity_key(): row for row in rows}

    added = [row for key, row in incoming.items() if key not in existing]
    removed = [key for key in existing if key not in incoming]
    unchanged = len(incoming) - len(added)

    return ImportDiff(
        added=tuple(added),
        removed=tuple(removed),
        unchanged_count=unchanged,
    )


def _find_walking_transition_warnings(
    rows: list[TimetableRow],
    lookup: dict[str, RoomInfo],
) -> list[Issue]:
    """Flag consecutive lessons where the gap is shorter than walking time (section 11.4)."""
    from app.engines.crowds import ScheduledTransitionSlot, check_walking_transitions

    slots: list[ScheduledTransitionSlot] = []
    for row in rows:
        if row.weekday is None or row.starts_at is None or row.ends_at is None or not row.room_code:
            continue
        room = lookup.get(normalise_room_code(row.room_code))
        if room is None:
            continue
        bld_id = room.resolved_building_id
        if bld_id is None:
            continue
        pattern = row.week_pattern if row.week_pattern in {"weekly", "odd", "even"} else "weekly"
        if row.teacher_ref:
            slots.append(
                ScheduledTransitionSlot(
                    subject_kind="teacher",
                    subject_id=row.teacher_ref,
                    weekday=row.weekday,
                    starts_at=row.starts_at,
                    ends_at=row.ends_at,
                    room_id=room.room_id,
                    building_id=bld_id,
                    floor_level=room.resolved_floor_level,
                    week_pattern=pattern,
                    source_row=row.source_row,
                )
            )
        if row.section_code:
            slots.append(
                ScheduledTransitionSlot(
                    subject_kind="cohort",
                    subject_id=row.section_code,
                    weekday=row.weekday,
                    starts_at=row.starts_at,
                    ends_at=row.ends_at,
                    room_id=room.room_id,
                    building_id=bld_id,
                    floor_level=room.resolved_floor_level,
                    week_pattern=pattern,
                    source_row=row.source_row,
                )
            )

    transitions = check_walking_transitions(slots)
    issues: list[Issue] = []
    for item in transitions:
        issues.append(
            Issue(
                code=IssueCode.tight_walking_transition,
                severity=Severity.warning,
                message=(
                    f"{item.subject_kind} {item.subject_id!r} on weekday {item.weekday} has "
                    f"{int(item.gap_seconds)}s between {item.from_room_id} and {item.to_room_id}, "
                    f"but walking requires ~{int(item.required_seconds)}s ({item.distance_m}m)"
                ),
                rows=item.source_rows,
                details={
                    "subject_kind": item.subject_kind,
                    "subject_id": item.subject_id,
                    "weekday": item.weekday,
                    "from_room_id": item.from_room_id,
                    "to_room_id": item.to_room_id,
                    "from_building_id": item.from_building_id,
                    "to_building_id": item.to_building_id,
                    "gap_seconds": item.gap_seconds,
                    "required_seconds": item.required_seconds,
                    "distance_m": item.distance_m,
                },
            )
        )
    return issues
