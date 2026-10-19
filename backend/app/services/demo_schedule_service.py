"""Seeding a demo timetable that matches the front end's, lesson for lesson.

Layer 0 is "done when ... the demo campus runs end to end" (brief section 10),
and the state engine needs meetings to have anything to say. Until a real
EduPage import is applied, this fills the gap with the *same* timetable the front
end already generates - see :mod:`app.adapters.frontend.demo_schedule` for why
parity is the goal rather than plausibility.

Shape of the data this writes:

* One :class:`~app.domain.academic.Term` covering the seeded window.
* One :class:`~app.domain.academic.Course` and
  :class:`~app.domain.academic.Section` per (subject, group) pair the generator
  produces, so attendance rates and analytics have something to key on later.
* One :class:`~app.domain.academic.Meeting` per generated lesson.
* One :class:`~app.domain.booking.Resource` per room and a matching
  ``resource_occupancy`` row per meeting, so the booking engine's exclusion
  constraint already covers lessons and a booking can never land on top of one
  (brief section 10.4).

No ``MeetingRule`` rows. The front end's demo schedule is a per-date hash, not a
weekly recurrence - there is no rule to store, and inventing one would imply a
regularity the data does not have. Real imports do create rules; see
:mod:`app.engines.timetable`.

Everything written here is ``is_demo = True``. The brief forbids mixing demo and
real data in reports (section 3.5), and :func:`clear_demo_schedule` exists so a
real import can displace it cleanly.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any, cast
from zoneinfo import ZoneInfo

from sqlalchemy import CursorResult, delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.frontend.demo_schedule import DEMO_SLOTS, generate_demo_lessons
from app.core.logging import get_logger
from app.domain.academic import Course, Meeting, Section, Term
from app.domain.base import OccupancyKind, OccupancyStatus
from app.domain.booking import Resource, ResourceOccupancy
from app.domain.spatial import Building, Floor, Room

log = get_logger(__name__)

__all__ = ["DemoScheduleResult", "clear_demo_schedule", "seed_demo_schedule"]

#: Term code for the generated window. Distinct from any real term code so a
#: real import can never collide with it.
DEMO_TERM_CODE = "DEMO"


@dataclass
class DemoScheduleResult:
    """Counts a phase report can quote."""

    campus_id: str
    term_id: str | None = None
    days: int = 0
    created: dict[str, int] = field(default_factory=dict)
    deleted: dict[str, int] = field(default_factory=dict)

    def summary(self) -> str:
        def fmt(label: str, data: dict[str, int]) -> str:
            parts = ", ".join(f"{k}={v}" for k, v in sorted(data.items()) if v)
            return f"  {label:<9} {parts or '-'}"

        return "\n".join(
            [
                f"campus    {self.campus_id}",
                f"days      {self.days}",
                fmt("created", self.created),
                fmt("deleted", self.deleted),
            ]
        )


async def seed_demo_schedule(
    session: AsyncSession,
    *,
    campus_id: str,
    timezone: ZoneInfo,
    start_day: date,
    days: int,
    include_weekends: bool = False,
) -> DemoScheduleResult:
    """Generate and store ``days`` campus-local days of demo lessons.

    Idempotent: existing demo meetings in the window are removed first, so
    re-running after a front-end change refreshes rather than duplicating.

    Weekends are skipped by default. The front end's generator happily invents
    Saturday lessons - it keys only on the date string - but a map showing a full
    Sunday timetable reads as a bug, so the default matches what a university
    actually looks like. Pass ``include_weekends=True`` to reproduce the front
    end's output for every date exactly.
    """
    if days <= 0:
        raise ValueError(f"days must be positive, got {days}")

    result = DemoScheduleResult(campus_id=campus_id, days=days)

    rooms = await _load_rooms(session, campus_id)
    if not rooms:
        log.warning("demo_schedule_no_rooms", campus_id=campus_id)
        return result

    end_day = start_day + timedelta(days=days)
    removed = await clear_demo_schedule(
        session, campus_id=campus_id, timezone=timezone, start_day=start_day, end_day=end_day
    )
    result.deleted.update(removed)

    term = await _upsert_demo_term(session, campus_id=campus_id, starts_on=start_day, ends_on=end_day)
    await session.flush()
    result.term_id = str(term.id)

    resources = await _ensure_room_resources(session, rooms, campus_id=campus_id, result=result)
    await session.flush()

    # (subject, group) -> Section, created lazily as the generator produces them.
    sections: dict[tuple[str, str], Section] = {}
    courses: dict[str, Course] = {}

    room_pairs = [(room.id, room.room_kind.value) for room in rooms.values()]

    for offset in range(days):
        day = start_day + timedelta(days=offset)
        if not include_weekends and day.weekday() >= 5:
            continue

        lessons = generate_demo_lessons(
            room_ids=room_pairs, day=day, timezone=timezone, slots=DEMO_SLOTS
        )
        for lesson in lessons:
            # Called for its side effect: the section must exist before the
            # meeting, so attendance rates and analytics have something to key
            # on later. The row itself is not needed here - meetings carry
            # denormalised subject/teacher/group labels for display.
            await _ensure_section(
                session,
                sections=sections,
                courses=courses,
                term=term,
                campus_id=campus_id,
                subject=lesson.subject,
                group=lesson.group,
                teacher=lesson.teacher,
                result=result,
            )

            meeting = Meeting(
                rule_id=None,
                room_id=lesson.room_id,
                starts_at=lesson.starts_at,
                ends_at=lesson.ends_at,
                original_starts_at=lesson.starts_at,
                cancelled=lesson.cancelled,
                subject=lesson.subject,
                teacher_label=lesson.teacher,
                group_label=lesson.group,
                is_demo=True,
            )
            session.add(meeting)
            _bump(result.created, "meetings")
            await session.flush()

            # A cancelled lesson does not hold the room: the slot is genuinely
            # free and must be bookable, so no occupancy row is written for it.
            if lesson.cancelled:
                continue

            resource = resources.get(lesson.room_id)
            if resource is None:  # pragma: no cover - every room gets a resource
                continue
            session.add(
                ResourceOccupancy(
                    resource_id=resource.id,
                    period=_range(lesson.starts_at, lesson.ends_at),
                    kind=OccupancyKind.lesson,
                    status=OccupancyStatus.confirmed,
                    meeting_id=meeting.id,
                    is_demo=True,
                )
            )
            _bump(result.created, "occupancies")

        # Flush per day so a large window does not hold the whole term in the
        # identity map.
        await session.flush()

    log.info(
        "demo_schedule_seeded",
        campus_id=campus_id,
        days=days,
        meetings=result.created.get("meetings", 0),
    )
    return result


async def clear_demo_schedule(
    session: AsyncSession,
    *,
    campus_id: str,
    timezone: ZoneInfo,
    start_day: date,
    end_day: date,
) -> dict[str, int]:
    """Remove demo meetings (and their occupancies) in a campus-local window.

    Scoped to ``is_demo = True`` so a real imported timetable is never touched.
    Occupancies go first: they reference the meetings, and letting the cascade do
    it would depend on the foreign key's ``ondelete`` rather than stating the
    intent here.
    """
    from app.core.time import campus_day_bounds

    window_start, _ = campus_day_bounds(start_day, timezone)
    _, window_end = campus_day_bounds(end_day, timezone)

    doomed = (
        select(Meeting.id)
        .where(
            Meeting.is_demo.is_(True),
            Meeting.starts_at >= window_start,
            Meeting.starts_at < window_end,
        )
        .scalar_subquery()
    )

    # ``rowcount`` lives on CursorResult, which is what a DELETE actually
    # returns; the generic Result protocol does not declare it.
    occupancies = cast(
        "CursorResult[Any]",
        await session.execute(
            delete(ResourceOccupancy).where(
                ResourceOccupancy.is_demo.is_(True),
                ResourceOccupancy.meeting_id.in_(doomed),
            )
        ),
    )
    meetings = cast(
        "CursorResult[Any]",
        await session.execute(
            delete(Meeting).where(
                Meeting.is_demo.is_(True),
                Meeting.starts_at >= window_start,
                Meeting.starts_at < window_end,
            )
        ),
    )
    await session.flush()

    return {
        "meetings": meetings.rowcount or 0,
        "occupancies": occupancies.rowcount or 0,
    }


# --------------------------------------------------------------------- helpers


async def _load_rooms(session: AsyncSession, campus_id: str) -> dict[str, Room]:
    result = await session.execute(
        select(Room)
        .join(Floor, Floor.id == Room.floor_id)
        .join(Building, Building.id == Floor.building_id)
        .where(Building.campus_id == campus_id)
        .order_by(Room.id)
    )
    return {room.id: room for room in result.scalars().all()}


async def _upsert_demo_term(
    session: AsyncSession, *, campus_id: str, starts_on: date, ends_on: date
) -> Term:
    existing = await session.execute(
        select(Term).where(Term.campus_id == campus_id, Term.code == DEMO_TERM_CODE)
    )
    term = existing.scalar_one_or_none()
    if term is None:
        term = Term(campus_id=campus_id, code=DEMO_TERM_CODE, is_demo=True)
        session.add(term)

    term.name = "Demo term (generated)"
    # Widen rather than replace, so re-seeding a different window keeps the term
    # covering everything that has been generated.
    term.starts_on = min(starts_on, term.starts_on) if term.starts_on else starts_on
    term.ends_on = max(ends_on, term.ends_on) if term.ends_on else ends_on
    term.is_current = True
    term.is_demo = True
    return term


async def _ensure_room_resources(
    session: AsyncSession,
    rooms: dict[str, Room],
    *,
    campus_id: str,
    result: DemoScheduleResult,
) -> dict[str, Resource]:
    """One bookable :class:`Resource` per room, created once.

    Rooms and resources are deliberately separate tables: a room is a place, a
    resource is something reservable, and the booking engine works on resources
    so that a projector or a laundry slot needs no new code (brief section 6.2).
    """
    existing_result = await session.execute(
        select(Resource).where(Resource.campus_id == campus_id, Resource.room_id.is_not(None))
    )
    by_room = {res.room_id: res for res in existing_result.scalars().all() if res.room_id}

    for room_id, room in rooms.items():
        if room_id in by_room:
            continue
        resource = Resource(
            campus_id=campus_id,
            code=f"room:{room_id}",
            name=room.name or room.number,
            kind="room",
            room_id=room_id,
            capacity=room.capacity,
            is_bookable=room.room_kind.value != "office",
            is_demo=room.is_demo,
        )
        session.add(resource)
        by_room[room_id] = resource
        _bump(result.created, "resources")

    return by_room


async def _ensure_section(
    session: AsyncSession,
    *,
    sections: dict[tuple[str, str], Section],
    courses: dict[str, Course],
    term: Term,
    campus_id: str,
    subject: str,
    group: str,
    teacher: str,
    result: DemoScheduleResult,
) -> Section:
    """Find or create the ``(subject, group)`` section, caching within the run."""
    key = (subject, group)
    if key in sections:
        return sections[key]

    course_code = _course_code(subject)
    course = courses.get(course_code)
    if course is None:
        found = await session.execute(
            select(Course).where(Course.campus_id == campus_id, Course.code == course_code)
        )
        course = found.scalar_one_or_none()
        if course is None:
            course = Course(
                campus_id=campus_id, code=course_code, title=subject, is_demo=True
            )
            session.add(course)
            await session.flush()
            _bump(result.created, "courses")
        courses[course_code] = course

    found_section = await session.execute(
        select(Section).where(
            Section.term_id == term.id, Section.course_id == course.id, Section.code == group
        )
    )
    section = found_section.scalar_one_or_none()
    if section is None:
        section = Section(
            term_id=term.id,
            course_id=course.id,
            code=group,
            cohort=group,
            # Pseudonymous handle, not the display name. The generated names are
            # invented, but the rule is the same as for real data: analytics
            # never groups by a teacher's name (brief section 21.2).
            teacher_ref=f"demo:{_slug(teacher)}",
            # No enrolled count is known for demo data, and guessing one would
            # feed the occupancy estimator a fabricated prior. NULL means
            # "unknown", which the estimator handles explicitly.
            enrolled_count=None,
            is_demo=True,
        )
        session.add(section)
        await session.flush()
        _bump(result.created, "sections")

    sections[key] = section
    return section


def _course_code(subject: str) -> str:
    """A stable code for a generated subject, e.g. "Discrete Math" -> ``DEMO-DISCRETE-MATH``."""
    return f"DEMO-{_slug(subject).upper()}"


def _slug(value: str) -> str:
    cleaned = [char if char.isalnum() else "-" for char in value.strip()]
    slug = "".join(cleaned)
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug.strip("-").lower()


def _range(start: object, end: object) -> object:
    from sqlalchemy.dialects.postgresql import Range

    return Range(start, end, bounds="[)")


def _bump(counter: dict[str, int], key: str) -> None:
    counter[key] = counter.get(key, 0) + 1
