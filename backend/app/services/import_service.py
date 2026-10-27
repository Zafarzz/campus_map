"""Applying a timetable import: idempotent, reversible, and never a surprise.

The flow (brief section 10.1):

1. **Dry run.** Parse, validate, diff. Nothing is written. The caller gets a
   report and decides.
2. **Apply.** Create an ``import_batch``, write ``meeting_rule`` rows, expand
   them in the event's own timezone, materialise ``meeting`` rows, and mirror
   each one into ``resource_occupancy`` so the booking engine's exclusion
   constraint covers lessons too.
3. **Roll back.** Delete everything the batch created, by batch id.

Every rule carries ``import_batch_id``, which is what makes step 3 a delete by
one key rather than a reconstruction. A dry run also records a batch - with
status ``dry_run`` and the report attached - so there is an audit trail of what
was proposed and not just what was applied.

**Materialised meetings are a cache.** The master rule is the source of truth
(``meeting_rule``: RRULE, DTSTART, TZID, EXDATEs), and the ``meeting`` rows can
always be rebuilt from it by :func:`rematerialise`. Range queries read the rows
and never re-expand per request.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import Range
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.core.logging import get_logger
from app.core.time import now as utc_now
from app.domain.academic import (
    Course,
    ImportBatch,
    Meeting,
    MeetingRule,
    Section,
    Term,
)
from app.domain.base import (
    ImportStatus,
    OccupancyKind,
    OccupancyStatus,
    new_uuid,
)
from app.domain.booking import Resource, ResourceOccupancy
from app.domain.spatial import Building, Floor, Room
from app.engines.recurrence import RecurrenceError, RecurrenceSpec, expand_rule, weekly_rrule
from app.engines.timetable.parsers import parse_csv, parse_ics, parse_xlsx, sniff_format
from app.engines.timetable.template import TimetableRow
from app.engines.timetable.validate import (
    ImportReport,
    RoomInfo,
    TermWindow,
    normalise_room_code,
    validate_rows,
)

log = get_logger(__name__)

__all__ = [
    "ApplyResult",
    "apply_import",
    "dry_run_import",
    "rematerialise",
    "rollback_import",
]


@dataclass
class ApplyResult:
    """What an applied batch created."""

    batch_id: uuid.UUID
    rules: int = 0
    meetings: int = 0
    occupancies: int = 0
    courses: int = 0
    sections: int = 0
    skipped_occupancies: list[dict[str, Any]] = field(default_factory=list)
    report: ImportReport | None = None

    def summary(self) -> str:
        line = (
            f"batch {self.batch_id}: {self.rules} rule(s), {self.meetings} meeting(s), "
            f"{self.occupancies} occupancy row(s), {self.courses} course(s), "
            f"{self.sections} section(s)"
        )
        if self.skipped_occupancies:
            line += f"; {len(self.skipped_occupancies)} occupancy row(s) skipped on conflict"
        return line


async def dry_run_import(
    session: AsyncSession,
    *,
    payload: bytes,
    filename: str | None,
    campus_id: str,
    timezone: ZoneInfo,
    overrides: dict[str, str] | None = None,
    term_id: uuid.UUID | None = None,
    record_batch: bool = True,
) -> tuple[ImportReport, uuid.UUID | None]:
    """Parse and validate without writing any timetable rows.

    Returns ``(report, batch_id)``. The batch row records the attempt and its
    report; it creates no rules, no meetings and no occupancies.
    """
    report = await _parse_and_validate(
        session,
        payload=payload,
        filename=filename,
        campus_id=campus_id,
        timezone=timezone,
        overrides=overrides,
        term_id=term_id,
    )

    batch_id: uuid.UUID | None = None
    if record_batch:
        batch = ImportBatch(
            source=_source_label(filename, payload),
            status=ImportStatus.dry_run,
            report=report.as_dict(),
        )
        session.add(batch)
        await session.flush()
        batch_id = batch.id

    log.info(
        "timetable_dry_run",
        rows=report.total_rows,
        usable=len(report.usable_rows),
        errors=len(report.errors),
        can_apply=report.can_apply,
    )
    return report, batch_id


async def apply_import(
    session: AsyncSession,
    *,
    payload: bytes,
    filename: str | None,
    campus_id: str,
    timezone: ZoneInfo,
    overrides: dict[str, str] | None = None,
    term_id: uuid.UUID | None = None,
    replace_existing: bool = False,
    created_by: uuid.UUID | None = None,
    force: bool = False,
) -> ApplyResult:
    """Validate, then write. Refuses outright if the report has errors.

    ``force=True`` applies despite errors. It exists because an operator with
    the full report in front of them may legitimately decide that an unknown
    room is a room they are about to create - but it is not the default, and the
    batch records that it was forced.
    """
    report = await _parse_and_validate(
        session,
        payload=payload,
        filename=filename,
        campus_id=campus_id,
        timezone=timezone,
        overrides=overrides,
        term_id=term_id,
    )

    if report.file_errors:
        raise ValidationError(
            "The file could not be read: " + "; ".join(report.file_errors),
            code="import_file_unreadable",
            details={"report": report.as_dict()},
        )
    if not report.can_apply and not force:
        raise ValidationError(
            f"The import has {len(report.errors)} error(s) and was not applied. "
            "Fix them, or re-submit with force=true to apply anyway.",
            code="import_has_errors",
            details={"report": report.as_dict()},
        )
    if not report.usable_rows:
        raise ValidationError(
            "The file contains no usable rows, so there is nothing to apply.",
            code="import_empty",
            details={"report": report.as_dict()},
        )

    term = await _resolve_term(session, campus_id=campus_id, term_id=term_id, rows=report.usable_rows)

    batch = ImportBatch(
        source=_source_label(filename, payload),
        status=ImportStatus.applied,
        report={**report.as_dict(), "forced": force},
        applied_at=utc_now(),
        created_by=created_by,
    )
    session.add(batch)
    await session.flush()

    if replace_existing:
        # Scoped to this term, and to non-demo imported rules only: a replace
        # must not quietly delete the demo timetable someone is still demoing
        # with, nor another term's data.
        await _clear_term_rules(session, term_id=term.id)

    result = ApplyResult(batch_id=batch.id, report=report)
    rooms = await _room_lookup(session, campus_id)
    resources = await _resource_lookup(session, campus_id)

    course_cache: dict[str, Course] = {}
    section_cache: dict[tuple[uuid.UUID, str], Section] = {}

    for row in report.usable_rows:
        room = rooms.get(normalise_room_code(row.room_code or ""))
        if room is None:
            # Only reachable with force=true; the row is skipped rather than
            # creating a rule that points at nothing.
            continue

        course = await _ensure_course(
            session, campus_id=campus_id, row=row, cache=course_cache, result=result
        )
        section = await _ensure_section(
            session, term=term, course=course, row=row, cache=section_cache, result=result
        )

        rule = _build_rule(
            row=row,
            section_id=section.id,
            room_id=room,
            timezone=timezone,
            term=term,
            batch_id=batch.id,
        )
        if rule is None:
            continue
        session.add(rule)
        await session.flush()
        result.rules += 1

        created, skipped = await _materialise_rule(
            session,
            rule=rule,
            row=row,
            term=term,
            timezone=timezone,
            resources=resources,
            room_id=room,
        )
        result.meetings += created
        result.occupancies += created - len(skipped)
        result.skipped_occupancies.extend(skipped)

    await session.flush()
    log.info(
        "timetable_applied",
        batch_id=str(batch.id),
        rules=result.rules,
        meetings=result.meetings,
        forced=force,
    )
    return result


async def rollback_import(session: AsyncSession, batch_id: uuid.UUID) -> dict[str, int]:
    """Undo an applied batch. Returns what was removed.

    Deletes by ``import_batch_id``, which is why every rule carries it. The
    batch row itself is kept and marked ``rolled_back``: the audit trail of what
    was once applied is the point, and deleting it would erase the history the
    time machine depends on.
    """
    batch = await session.get(ImportBatch, batch_id)
    if batch is None:
        raise NotFoundError(f"Import batch {batch_id} does not exist.", code="batch_not_found")
    if batch.status is ImportStatus.rolled_back:
        raise ConflictError(
            f"Import batch {batch_id} has already been rolled back.",
            code="batch_already_rolled_back",
        )
    if batch.status is ImportStatus.dry_run:
        raise ValidationError(
            "A dry run wrote nothing, so there is nothing to roll back.",
            code="batch_was_dry_run",
        )

    rule_ids = select(MeetingRule.id).where(MeetingRule.import_batch_id == batch_id).scalar_subquery()
    meeting_ids = select(Meeting.id).where(Meeting.rule_id.in_(rule_ids)).scalar_subquery()

    occupancies = await session.execute(
        delete(ResourceOccupancy).where(ResourceOccupancy.meeting_id.in_(meeting_ids))
    )
    meetings = await session.execute(delete(Meeting).where(Meeting.rule_id.in_(rule_ids)))
    rules = await session.execute(delete(MeetingRule).where(MeetingRule.import_batch_id == batch_id))

    batch.status = ImportStatus.rolled_back
    batch.rolled_back_at = utc_now()
    await session.flush()

    removed = {
        "rules": rules.rowcount or 0,  # type: ignore[attr-defined]
        "meetings": meetings.rowcount or 0,  # type: ignore[attr-defined]
        "occupancies": occupancies.rowcount or 0,  # type: ignore[attr-defined]
    }
    log.info("timetable_rolled_back", batch_id=str(batch_id), **removed)
    return removed


async def rematerialise(
    session: AsyncSession,
    *,
    rule_id: uuid.UUID,
    timezone: ZoneInfo,
    window_start: datetime | None = None,
    window_end: datetime | None = None,
) -> int:
    """Rebuild one rule's materialised meetings from the master rule.

    The reason ``meeting`` rows are safe to treat as a cache: the rule, its
    timezone and its exceptions are the source of truth, so this can always
    reconstruct them (brief section 10.1). Called when a rule or an override
    changes.
    """
    rule = await session.get(MeetingRule, rule_id)
    if rule is None:
        raise NotFoundError(f"Meeting rule {rule_id} does not exist.", code="rule_not_found")

    meeting_ids = select(Meeting.id).where(Meeting.rule_id == rule_id).scalar_subquery()
    await session.execute(delete(ResourceOccupancy).where(ResourceOccupancy.meeting_id.in_(meeting_ids)))
    await session.execute(delete(Meeting).where(Meeting.rule_id == rule_id))
    await session.flush()

    section = await session.get(Section, rule.section_id)
    term = await session.get(Term, section.term_id) if section else None
    if term is None:
        raise NotFoundError("The rule's term no longer exists.", code="term_not_found")

    start, end = _term_window(term, timezone)
    spec = RecurrenceSpec(
        rrule=rule.rrule,
        dtstart_local=rule.dtstart_local,
        tzid=rule.tzid,
        duration_minutes=rule.duration_minutes,
        room_id=rule.room_id,
        exdates=tuple(rule.exdates or ()),
    )
    occurrences = expand_rule(
        spec,
        window_start=window_start or start,
        window_end=window_end or end,
    )

    resources = await _resource_lookup(session, term.campus_id)
    created = 0
    for occurrence in occurrences:
        meeting = Meeting(
            id=new_uuid(),
            rule_id=rule.id,
            room_id=occurrence.room_id,
            starts_at=occurrence.starts_at,
            ends_at=occurrence.ends_at,
            original_starts_at=occurrence.original_starts_at,
            cancelled=occurrence.cancelled,
            subject=section.code if section else None,
            is_demo=False,
        )
        session.add(meeting)
        created += 1

        if occurrence.cancelled or occurrence.room_id is None:
            continue
        resource_id = resources.get(occurrence.room_id)
        if resource_id is None:
            continue
        session.add(
            ResourceOccupancy(
                resource_id=resource_id,
                period=Range(occurrence.starts_at, occurrence.ends_at, bounds="[)"),
                kind=OccupancyKind.lesson,
                status=OccupancyStatus.confirmed,
                meeting_id=meeting.id,
            )
        )

    await session.flush()
    return created


# --------------------------------------------------------------------- internals


async def _parse_and_validate(
    session: AsyncSession,
    *,
    payload: bytes,
    filename: str | None,
    campus_id: str,
    timezone: ZoneInfo,
    overrides: dict[str, str] | None,
    term_id: uuid.UUID | None,
) -> ImportReport:
    fmt = sniff_format(filename, payload)
    if fmt == "xlsx":
        parsed = parse_xlsx(payload, overrides=overrides)
    elif fmt == "ics":
        parsed = parse_ics(payload)
    else:
        parsed = parse_csv(payload, overrides=overrides)

    known_rooms = await _room_info(session, campus_id)
    term = await _find_term(session, campus_id=campus_id, term_id=term_id)
    window = (
        TermWindow(starts_on=term.starts_on, ends_on=term.ends_on, code=term.code)
        if term is not None
        else None
    )
    existing = await _existing_identities(session, term_id=term.id) if term else None

    return validate_rows(
        parsed.rows,
        known_rooms=known_rooms,
        timezone=timezone,
        term=window,
        existing_identities=existing,
        file_errors=parsed.errors,
        column_mapping=parsed.mapping.mapping,
    )


async def _room_info(session: AsyncSession, campus_id: str) -> dict[str, RoomInfo]:
    """Rooms keyed by their printed number, for validation.

    Keyed by ``number`` rather than ``id`` because that is what a timetable
    export contains: a registrar writes "A-101", not "bld-h-f1-a101".
    """
    result = await session.execute(
        select(Room)
        .join(Floor, Floor.id == Room.floor_id)
        .join(Building, Building.id == Floor.building_id)
        .where(Building.campus_id == campus_id)
    )
    return {
        room.number: RoomInfo(room_id=room.id, capacity=room.capacity, out_of_service=room.out_of_service)
        for room in result.scalars().all()
    }


async def _room_lookup(session: AsyncSession, campus_id: str) -> dict[str, str]:
    """``{normalised_number: room_id}``."""
    info = await _room_info(session, campus_id)
    return {normalise_room_code(number): item.room_id for number, item in info.items()}


async def _resource_lookup(session: AsyncSession, campus_id: str) -> dict[str, uuid.UUID]:
    """``{room_id: resource_id}`` for mirroring meetings into occupancies."""
    result = await session.execute(
        select(Resource.room_id, Resource.id).where(
            Resource.campus_id == campus_id, Resource.room_id.is_not(None)
        )
    )
    return {room_id: resource_id for room_id, resource_id in result.all() if room_id}


async def _find_term(session: AsyncSession, *, campus_id: str, term_id: uuid.UUID | None) -> Term | None:
    if term_id is not None:
        term = await session.get(Term, term_id)
        if term is None:
            raise NotFoundError(f"Term {term_id} does not exist.", code="term_not_found")
        return term
    result = await session.execute(
        select(Term)
        .where(Term.campus_id == campus_id, Term.is_current.is_(True))
        .order_by(Term.starts_on.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _resolve_term(
    session: AsyncSession,
    *,
    campus_id: str,
    term_id: uuid.UUID | None,
    rows: list[TimetableRow],
) -> Term:
    """Find the term to import into, creating one from the rows if need be.

    A file whose rows carry dates but whose campus has no term would otherwise
    be unimportable. Creating a term from the data's own span is better than
    refusing, and it is recorded as generated rather than passed off as the
    registrar's own calendar.
    """
    term = await _find_term(session, campus_id=campus_id, term_id=term_id)
    if term is not None:
        return term

    dates = [row.start_date for row in rows if row.start_date] + [
        row.end_date for row in rows if row.end_date
    ]
    if not dates:
        raise ValidationError(
            "No term exists for this campus and the file carries no dates, so the "
            "import window cannot be determined. Create a term first, or add "
            "start_date/end_date columns.",
            code="term_undeterminable",
        )

    term = Term(
        campus_id=campus_id,
        code=f"IMPORTED-{min(dates).isoformat()}",
        name=f"Imported term ({min(dates).isoformat()} to {max(dates).isoformat()})",
        starts_on=min(dates),
        ends_on=max(dates),
        is_current=True,
    )
    session.add(term)
    await session.flush()
    log.info("term_created_from_import", term_id=str(term.id), code=term.code)
    return term


async def _existing_identities(session: AsyncSession, *, term_id: uuid.UUID) -> set[str]:
    """Identities of the rules already stored for this term, for the diff.

    Read straight from ``meeting_rule.source_identity`` rather than
    reconstructed from the rule. Reconstruction is impossible to do faithfully:
    the declared date window is folded into ``DTSTART``/``UNTIL`` with weekday
    anchoring applied and a week parity becomes an ``INTERVAL``, so a rebuilt key
    never matches the row that produced it, and every re-import would report
    "replace everything" instead of "unchanged".

    Rules written before this column existed have ``NULL`` and are skipped. They
    then show up as additions, which is the safe direction to be wrong in: a
    human reviewing the dry run sees them, whereas a false "unchanged" would
    hide a real change.
    """
    result = await session.execute(
        select(MeetingRule.source_identity)
        .join(Section, Section.id == MeetingRule.section_id)
        .where(Section.term_id == term_id, MeetingRule.source_identity.is_not(None))
    )
    return {value for (value,) in result.all() if value}


async def _clear_term_rules(session: AsyncSession, *, term_id: uuid.UUID) -> None:
    """Remove this term's imported rules before a replacing import.

    Demo rows are left alone: ``is_demo`` data and real data must never be
    mixed, and that cuts both ways - a real import must not silently delete the
    demo timetable either.
    """
    rule_ids = (
        select(MeetingRule.id)
        .join(Section, Section.id == MeetingRule.section_id)
        .where(Section.term_id == term_id, MeetingRule.is_demo.is_(False))
        .scalar_subquery()
    )
    meeting_ids = select(Meeting.id).where(Meeting.rule_id.in_(rule_ids)).scalar_subquery()

    await session.execute(delete(ResourceOccupancy).where(ResourceOccupancy.meeting_id.in_(meeting_ids)))
    await session.execute(delete(Meeting).where(Meeting.rule_id.in_(rule_ids)))
    await session.execute(delete(MeetingRule).where(MeetingRule.id.in_(rule_ids)))
    await session.flush()


async def _ensure_course(
    session: AsyncSession,
    *,
    campus_id: str,
    row: TimetableRow,
    cache: dict[str, Course],
    result: ApplyResult,
) -> Course:
    code = row.course_code or (row.title or "UNTITLED")[:60]
    if code in cache:
        return cache[code]

    found = await session.execute(select(Course).where(Course.campus_id == campus_id, Course.code == code))
    course = found.scalar_one_or_none()
    if course is None:
        course = Course(campus_id=campus_id, code=code, title=row.title or code)
        session.add(course)
        await session.flush()
        result.courses += 1
    cache[code] = course
    return course


async def _ensure_section(
    session: AsyncSession,
    *,
    term: Term,
    course: Course,
    row: TimetableRow,
    cache: dict[tuple[uuid.UUID, str], Section],
    result: ApplyResult,
) -> Section:
    code = row.section_code or "DEFAULT"
    key = (course.id, code)
    if key in cache:
        return cache[key]

    found = await session.execute(
        select(Section).where(
            Section.term_id == term.id, Section.course_id == course.id, Section.code == code
        )
    )
    section = found.scalar_one_or_none()
    if section is None:
        section = Section(
            term_id=term.id,
            course_id=course.id,
            code=code,
            cohort=row.section_code,
            teacher_ref=row.teacher_ref,
            enrolled_count=row.enrolled_count,
        )
        session.add(section)
        await session.flush()
        result.sections += 1
    elif row.enrolled_count is not None:
        section.enrolled_count = row.enrolled_count
    cache[key] = section
    return section


def _build_rule(
    *,
    row: TimetableRow,
    section_id: uuid.UUID,
    room_id: str,
    timezone: ZoneInfo,
    term: Term,
    batch_id: uuid.UUID,
) -> MeetingRule | None:
    """Turn a canonical row into a master recurrence rule.

    ICS rows arrive with a real ``RRULE`` and keep it. CSV and XLSX rows carry a
    weekday and a date window, which :func:`weekly_rrule` turns into one - with
    a timezone-aware interpretation supplied separately via ``tzid``, never
    baked into ``dtstart_local``.
    """
    if row.starts_at is None or row.ends_at is None:
        return None
    minutes = row.interval_minutes
    if minutes is None or minutes <= 0:
        return None

    anchor = _first_occurrence_date(row=row, term=term)
    if anchor is None:
        return None

    if row.rrule:
        rrule_text = row.rrule
    elif row.weekday is not None:
        interval = 2 if row.week_pattern in {"odd", "even"} else 1
        rrule_text = weekly_rrule([row.weekday], interval=interval, until=row.end_date or term.ends_on)
    else:
        return None

    return MeetingRule(
        id=new_uuid(),
        section_id=section_id,
        room_id=room_id,
        source_room_code=row.room_code,
        rrule=rrule_text,
        dtstart_local=datetime.combine(anchor, row.starts_at).isoformat(timespec="seconds"),
        tzid=timezone.key,
        duration_minutes=minutes,
        exdates=list(row.exdates) or None,
        uid=row.uid,
        source_identity=row.identity_key(),
        import_batch_id=batch_id,
    )


def _first_occurrence_date(*, row: TimetableRow, term: Term) -> date | None:
    """The date of the rule's first occurrence.

    For a weekly pattern this is the first matching weekday on or after the
    start of the window - **not** the window's start itself. Anchoring a
    ``FREQ=WEEKLY;BYDAY=MO`` rule on a Wednesday would make ``dtstart`` and the
    rule disagree, and for a biweekly pattern it would also shift the phase by a
    week.
    """
    if row.rrule and row.start_date:
        return row.start_date

    window_start = row.start_date or term.starts_on
    if row.weekday is None:
        return window_start

    offset = (row.weekday - window_start.weekday()) % 7
    anchor = window_start + timedelta(days=offset)

    # "even weeks" means skip the first one.
    if row.week_pattern == "even":
        anchor += timedelta(days=7)

    limit = row.end_date or term.ends_on
    return anchor if anchor <= limit else None


async def _materialise_rule(
    session: AsyncSession,
    *,
    rule: MeetingRule,
    row: TimetableRow,
    term: Term,
    timezone: ZoneInfo,
    resources: dict[str, uuid.UUID],
    room_id: str,
) -> tuple[int, list[dict[str, Any]]]:
    """Expand a rule and write its meetings plus occupancy rows.

    An occupancy that collides with something already in the room is **skipped
    and reported**, not forced. The meeting row is still written: the timetable
    says the lesson exists, and dropping it would make the map lose a lesson the
    registrar believes in. What cannot happen is two confirmed occupancies on
    one resource, because the exclusion constraint forbids it.
    """
    start, end = _term_window(term, timezone)
    spec = RecurrenceSpec(
        rrule=rule.rrule,
        dtstart_local=rule.dtstart_local,
        tzid=rule.tzid,
        duration_minutes=rule.duration_minutes,
        room_id=room_id,
        exdates=tuple(rule.exdates or ()),
    )

    try:
        occurrences = expand_rule(spec, window_start=start, window_end=end)
    except RecurrenceError as exc:
        raise ValidationError(
            f"row {row.source_row}: the recurrence rule could not be expanded: {exc}",
            code="rule_not_expandable",
            details={"row": row.source_row, "rrule": rule.rrule},
        ) from exc

    resource_id = resources.get(room_id)
    created = 0
    skipped: list[dict[str, Any]] = []

    for occurrence in occurrences:
        meeting = Meeting(
            id=new_uuid(),
            rule_id=rule.id,
            room_id=occurrence.room_id,
            starts_at=occurrence.starts_at,
            ends_at=occurrence.ends_at,
            original_starts_at=occurrence.original_starts_at,
            cancelled=occurrence.cancelled,
            subject=row.title,
            teacher_label=row.teacher_ref,
            group_label=row.section_code,
            is_demo=False,
        )
        session.add(meeting)
        # Flushed **before** the savepoint opens, deliberately. A flush that
        # raises poisons the whole session, not just the savepoint, so anything
        # still pending when the conflicting insert is attempted would be
        # dragged down with it - and the caller would get a PendingRollbackError
        # instead of a skipped row. The meeting itself cannot conflict: no
        # constraint on `meeting` can be violated by a second occurrence.
        await session.flush()
        created += 1

        if occurrence.cancelled or resource_id is None:
            continue

        occupancy = ResourceOccupancy(
            resource_id=resource_id,
            period=Range(occurrence.starts_at, occurrence.ends_at, bounds="[)"),
            kind=OccupancyKind.lesson,
            status=OccupancyStatus.confirmed,
            meeting_id=meeting.id,
        )

        try:
            async with session.begin_nested():
                session.add(occupancy)
                await session.flush()
        except IntegrityError:
            # The savepoint rollback may already have detached the pending
            # insert, so expunging unconditionally raises "not present in this
            # Session" and turns a handled conflict into a 500.
            if occupancy in session:
                session.expunge(occupancy)
            skipped.append(
                {
                    "row": row.source_row,
                    "room_id": room_id,
                    "starts_at": occurrence.starts_at.isoformat(),
                    "reason": "the room is already occupied for that period",
                }
            )

    await session.flush()
    return created, skipped


def _term_window(term: Term, timezone: ZoneInfo) -> tuple[datetime, datetime]:
    """The term as a half-open UTC interval of campus-local days."""
    start = datetime.combine(term.starts_on, time.min).replace(tzinfo=timezone)
    end = datetime.combine(term.ends_on + timedelta(days=1), time.min).replace(tzinfo=timezone)
    return start.astimezone(ZoneInfo("UTC")), end.astimezone(ZoneInfo("UTC"))


def _source_label(filename: str | None, payload: bytes) -> str:
    fmt = sniff_format(filename, payload)
    return f"{fmt}:{filename}" if filename else fmt


async def count_batch_rows(session: AsyncSession, batch_id: uuid.UUID) -> dict[str, int]:
    """Row counts attributable to one batch. Used by the API and by tests."""
    rules = await session.scalar(
        select(func.count(MeetingRule.id)).where(MeetingRule.import_batch_id == batch_id)
    )
    rule_ids = select(MeetingRule.id).where(MeetingRule.import_batch_id == batch_id).scalar_subquery()
    meetings = await session.scalar(select(func.count(Meeting.id)).where(Meeting.rule_id.in_(rule_ids)))
    return {"rules": int(rules or 0), "meetings": int(meetings or 0)}
