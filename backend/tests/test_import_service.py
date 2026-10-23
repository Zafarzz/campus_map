"""Applying and rolling back a timetable import, against a real PostgreSQL.

These tests exist mostly to pin down one class of bug that unit tests cannot
see: **a flush that raises poisons the whole SQLAlchemy session, not just the
savepoint it happened in.** Both the booking engine and this importer hit it, in
the same way, and the fix in both cases is that the savepoint must contain only
the insert that can actually conflict. A regression would surface here as a
``PendingRollbackError`` 500 where a skipped row was expected.

The second thing worth testing against a database is the batch lifecycle: every
rule carries ``import_batch_id``, which is what makes a rollback a delete by one
key instead of a reconstruction.
"""

from __future__ import annotations

import uuid
from datetime import date
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import Range
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.domain.academic import Course, ImportBatch, Meeting, MeetingRule, Section, Term
from app.domain.base import ImportStatus, OccupancyKind, OccupancyStatus
from app.domain.booking import Resource, ResourceOccupancy
from app.services import import_service

TASHKENT = ZoneInfo("Asia/Tashkent")
CAMPUS = "ajou-tashkent"

#: A clean two-row file using the canonical headers.
CLEAN = (
    b"course_code,section_code,title,teacher_ref,room_code,weekday,starts_at,ends_at,"
    b"start_date,end_date,enrolled_count\n"
    b"CS101,CSE-21,Intro to CS,t.kim,A-101,Monday,09:00,10:20,2026-10-19,2026-11-16,28\n"
    b"CS102,CSE-22,Data Structures,t.lee,A-102,Tuesday,10:30,11:50,2026-10-19,2026-11-16,22\n"
)

#: Foreign headers, to exercise the inferred column mapping end to end.
FOREIGN = (
    b"Course,Group,Subject,Lecturer,Room No.,Day,From,To,Valid From,Valid To,Enrolled\n"
    b"CS101,CSE-21,Intro to CS,t.kim,A-101,Monday,09:00,10:20,2026-10-19,2026-11-16,28\n"
)

#: Two lessons in one room at overlapping times: blocked by validation.
BROKEN = (
    b"course_code,section_code,title,teacher_ref,room_code,weekday,starts_at,ends_at,"
    b"start_date,end_date\n"
    b"CS101,CSE-21,First,t.kim,A-101,Monday,09:00,10:20,2026-10-19,2026-11-16\n"
    b"CS102,CSE-22,Second,t.lee,A-101,Monday,10:00,11:20,2026-10-19,2026-11-16\n"
)


@pytest.fixture
async def campus_with_term(seeded_session: AsyncSession) -> AsyncSession:
    """The seeded campus, plus a term and a bookable resource per room.

    A real import needs all three: rooms to resolve codes against, a term to
    bound the expansion window, and resources to mirror meetings into so the
    exclusion constraint covers lessons.
    """
    from app.domain.spatial import Building, Floor, Room

    seeded_session.add(
        Term(
            campus_id=CAMPUS,
            code="2026F",
            name="Autumn 2026",
            starts_on=date(2026, 10, 19),
            ends_on=date(2026, 12, 20),
            is_current=True,
        )
    )

    rooms = await seeded_session.execute(
        select(Room)
        .join(Floor, Floor.id == Room.floor_id)
        .join(Building, Building.id == Floor.building_id)
        .where(Building.campus_id == CAMPUS)
    )
    for room in rooms.scalars().all():
        seeded_session.add(
            Resource(
                campus_id=CAMPUS,
                code=f"room:{room.id}",
                name=room.number,
                kind="room",
                room_id=room.id,
                capacity=room.capacity,
            )
        )

    await seeded_session.flush()
    return seeded_session


async def _apply(session: AsyncSession, payload: bytes, **kwargs: object):  # type: ignore[no-untyped-def]
    return await import_service.apply_import(
        session,
        payload=payload,
        filename="timetable.csv",
        campus_id=CAMPUS,
        timezone=TASHKENT,
        **kwargs,  # type: ignore[arg-type]
    )


# --------------------------------------------------------------------- dry run


async def test_a_dry_run_writes_no_timetable_rows(campus_with_term: AsyncSession) -> None:
    """The brief's rule: nothing is saved until a human confirms."""
    report, batch_id = await import_service.dry_run_import(
        campus_with_term,
        payload=CLEAN,
        filename="timetable.csv",
        campus_id=CAMPUS,
        timezone=TASHKENT,
    )

    assert report.can_apply
    assert batch_id is not None

    rules = await campus_with_term.scalar(select(func.count(MeetingRule.id)))
    meetings = await campus_with_term.scalar(select(func.count(Meeting.id)).where(Meeting.is_demo.is_(False)))
    assert rules == 0
    assert meetings == 0


async def test_a_dry_run_records_its_report_for_audit(
    campus_with_term: AsyncSession,
) -> None:
    """There is a trail of what was *proposed*, not only what was applied."""
    _, batch_id = await import_service.dry_run_import(
        campus_with_term,
        payload=BROKEN,
        filename="broken.csv",
        campus_id=CAMPUS,
        timezone=TASHKENT,
    )
    batch = await campus_with_term.get(ImportBatch, batch_id)

    assert batch is not None
    assert batch.status is ImportStatus.dry_run
    assert batch.applied_at is None
    assert batch.report is not None
    assert batch.report["can_apply"] is False
    assert batch.report["error_count"] >= 1


# --------------------------------------------------------------------- apply


async def test_applying_a_clean_file_creates_the_whole_chain(
    campus_with_term: AsyncSession,
) -> None:
    """Course, section, rule, materialised meetings and occupancy rows."""
    result = await _apply(campus_with_term, CLEAN)

    assert result.rules == 2
    assert result.courses == 2
    assert result.sections == 2
    assert result.meetings > 0

    rules = await campus_with_term.scalar(
        select(func.count(MeetingRule.id)).where(MeetingRule.import_batch_id == result.batch_id)
    )
    assert rules == 2


async def test_the_master_rule_is_stored_not_only_expanded_times(
    campus_with_term: AsyncSession,
) -> None:
    """The brief's hard rule (section 10.1).

    ``meeting`` rows are a cache; the rule, its timezone and its exceptions are
    the source of truth and must be recoverable.
    """
    result = await _apply(campus_with_term, CLEAN)
    rule = (
        await campus_with_term.execute(
            select(MeetingRule).where(MeetingRule.import_batch_id == result.batch_id).limit(1)
        )
    ).scalar_one()

    assert "FREQ=WEEKLY" in rule.rrule
    assert rule.tzid == "Asia/Tashkent"
    assert rule.duration_minutes == 80
    # DTSTART is naive wall clock; the zone lives in tzid.
    assert "+" not in rule.dtstart_local and not rule.dtstart_local.endswith("Z")
    assert rule.source_room_code == "A-101"


async def test_the_rule_is_anchored_on_a_matching_weekday(
    campus_with_term: AsyncSession,
) -> None:
    """A ``BYDAY=MO`` rule must not start on a Tuesday.

    The term opens on Monday 19 October, but a Tuesday lesson's DTSTART has to
    land on the 20th - otherwise the rule and its own start disagree, and for a
    biweekly pattern the phase would be a week out too.
    """
    from datetime import datetime

    result = await _apply(campus_with_term, CLEAN)
    rows = (
        (
            await campus_with_term.execute(
                select(MeetingRule).where(MeetingRule.import_batch_id == result.batch_id)
            )
        )
        .scalars()
        .all()
    )

    for rule in rows:
        dtstart = datetime.fromisoformat(rule.dtstart_local)
        token = {0: "MO", 1: "TU", 2: "WE", 3: "TH", 4: "FR"}[dtstart.weekday()]
        assert f"BYDAY={token}" in rule.rrule, rule.rrule


async def test_materialised_meetings_keep_their_local_time(
    campus_with_term: AsyncSession,
) -> None:
    """09:00 local every week, whatever the UTC offset does."""
    result = await _apply(campus_with_term, CLEAN)
    meetings = (
        (
            await campus_with_term.execute(
                select(Meeting)
                .join(MeetingRule, MeetingRule.id == Meeting.rule_id)
                .where(MeetingRule.import_batch_id == result.batch_id)
                .order_by(Meeting.starts_at)
            )
        )
        .scalars()
        .all()
    )

    assert meetings
    mondays = [
        item.starts_at.astimezone(TASHKENT)
        for item in meetings
        if item.starts_at.astimezone(TASHKENT).weekday() == 0
    ]
    assert mondays
    assert {(value.hour, value.minute) for value in mondays} == {(9, 0)}


async def test_meetings_are_mirrored_into_resource_occupancy(
    campus_with_term: AsyncSession,
) -> None:
    """One table, one constraint: a booking can never land on a lesson."""
    result = await _apply(campus_with_term, CLEAN)
    held = await campus_with_term.scalar(
        select(func.count(ResourceOccupancy.id)).where(
            ResourceOccupancy.kind == OccupancyKind.lesson,
            ResourceOccupancy.status == OccupancyStatus.confirmed,
        )
    )
    assert held is not None and held >= result.meetings - len(result.skipped_occupancies)


async def test_a_foreign_header_layout_imports_without_a_code_change(
    campus_with_term: AsyncSession,
) -> None:
    """The column-mapping step, exercised end to end."""
    result = await _apply(campus_with_term, FOREIGN)

    assert result.rules == 1
    assert result.report is not None
    mapping = result.report.column_mapping
    assert mapping["room_code"] == "Room No."
    assert mapping["teacher_ref"] == "Lecturer"
    assert mapping["starts_at"] == "From"


async def test_a_file_with_errors_is_refused_and_writes_nothing(
    campus_with_term: AsyncSession,
) -> None:
    with pytest.raises(ValidationError) as caught:
        await _apply(campus_with_term, BROKEN)

    assert caught.value.code == "import_has_errors"
    assert caught.value.details["report"]["error_count"] >= 1

    rules = await campus_with_term.scalar(select(func.count(MeetingRule.id)))
    assert rules == 0


async def test_force_applies_despite_errors_and_records_that_it_was_forced(
    campus_with_term: AsyncSession,
) -> None:
    """An operator who has read the report may override - visibly."""
    result = await _apply(campus_with_term, BROKEN, force=True)
    batch = await campus_with_term.get(ImportBatch, result.batch_id)

    assert batch is not None
    assert batch.report is not None
    assert batch.report["forced"] is True
    assert batch.status is ImportStatus.applied


async def test_an_unreadable_file_is_refused(campus_with_term: AsyncSession) -> None:
    with pytest.raises(ValidationError) as caught:
        await _apply(campus_with_term, b"course_code,title\nCS101,Intro\n")
    assert caught.value.code == "import_file_unreadable"


async def test_an_empty_file_is_refused(campus_with_term: AsyncSession) -> None:
    with pytest.raises(ValidationError):
        await _apply(campus_with_term, b"")


# ------------------------------------------- the savepoint bug these tests pin


async def test_a_conflicting_occupancy_is_skipped_and_reported_not_a_crash(
    campus_with_term: AsyncSession,
) -> None:
    """The regression test for the session-poisoning bug.

    A flush that raises poisons the entire SQLAlchemy session, not just the
    savepoint it happened inside. When the meeting insert was still pending at
    the moment the conflicting occupancy was flushed, the failure took the outer
    transaction with it and the caller got a ``PendingRollbackError`` 500
    instead of a skipped row.

    Here the room is pre-occupied, so every occurrence collides. The import must
    still succeed, the meetings must still be written - the registrar says the
    lesson exists, and dropping it would make the map lose a lesson - and each
    collision must be reported.
    """
    resource = (
        await campus_with_term.execute(select(Resource).where(Resource.room_id == "bld-h-f1-a101"))
    ).scalar_one()

    # Block the whole term in that room.
    from datetime import datetime

    campus_with_term.add(
        ResourceOccupancy(
            resource_id=resource.id,
            period=Range(
                datetime(2026, 10, 1, tzinfo=TASHKENT),
                datetime(2026, 12, 31, tzinfo=TASHKENT),
                bounds="[)",
            ),
            kind=OccupancyKind.maintenance,
            status=OccupancyStatus.confirmed,
            note="major refurbishment",
        )
    )
    await campus_with_term.flush()

    result = await _apply(campus_with_term, FOREIGN)

    assert result.rules == 1
    assert result.meetings > 0, "the lesson still exists, even with nowhere to sit"
    assert len(result.skipped_occupancies) == result.meetings
    for skipped in result.skipped_occupancies:
        assert skipped["room_id"] == "bld-h-f1-a101"
        assert "already occupied" in skipped["reason"]

    # And the session is still usable afterwards, which is the actual point.
    assert await campus_with_term.scalar(select(func.count(Meeting.id))) is not None


async def test_the_session_survives_a_partial_conflict(
    campus_with_term: AsyncSession,
) -> None:
    """One room blocked, one free: the free one must still get its occupancy."""
    from datetime import datetime

    resource = (
        await campus_with_term.execute(select(Resource).where(Resource.room_id == "bld-h-f1-a101"))
    ).scalar_one()
    campus_with_term.add(
        ResourceOccupancy(
            resource_id=resource.id,
            period=Range(
                datetime(2026, 10, 1, tzinfo=TASHKENT),
                datetime(2026, 12, 31, tzinfo=TASHKENT),
                bounds="[)",
            ),
            kind=OccupancyKind.maintenance,
            status=OccupancyStatus.confirmed,
        )
    )
    await campus_with_term.flush()

    result = await _apply(campus_with_term, CLEAN)

    assert result.rules == 2
    assert result.occupancies > 0, "the unblocked room still gets occupancy rows"
    assert result.skipped_occupancies, "the blocked room's rows are reported"
    assert {item["room_id"] for item in result.skipped_occupancies} == {"bld-h-f1-a101"}


# --------------------------------------------------------------------- rollback


async def test_a_rollback_removes_exactly_what_the_batch_created(
    campus_with_term: AsyncSession,
) -> None:
    applied = await _apply(campus_with_term, CLEAN)
    before = await campus_with_term.scalar(select(func.count(Meeting.id)))

    removed = await import_service.rollback_import(campus_with_term, applied.batch_id)

    assert removed["rules"] == 2
    assert removed["meetings"] == applied.meetings

    after = await campus_with_term.scalar(select(func.count(Meeting.id)))
    assert before is not None and after is not None
    assert after == before - applied.meetings


async def test_a_rollback_keeps_the_batch_row_as_an_audit_trail(
    campus_with_term: AsyncSession,
) -> None:
    """The record of what was once applied is the point; deleting it loses history."""
    applied = await _apply(campus_with_term, CLEAN)
    await import_service.rollback_import(campus_with_term, applied.batch_id)

    batch = await campus_with_term.get(ImportBatch, applied.batch_id)
    assert batch is not None
    assert batch.status is ImportStatus.rolled_back
    assert batch.rolled_back_at is not None
    assert batch.report is not None


async def test_a_rollback_leaves_the_demo_timetable_alone(
    campus_with_term: AsyncSession,
) -> None:
    """Demo and real data must never be mixed - in either direction."""
    from app.services.demo_schedule_service import seed_demo_schedule

    await seed_demo_schedule(
        campus_with_term,
        campus_id=CAMPUS,
        timezone=TASHKENT,
        start_day=date(2026, 10, 19),
        days=1,
    )
    await campus_with_term.flush()
    demo_before = await campus_with_term.scalar(
        select(func.count(Meeting.id)).where(Meeting.is_demo.is_(True))
    )

    applied = await _apply(campus_with_term, CLEAN)
    await import_service.rollback_import(campus_with_term, applied.batch_id)

    demo_after = await campus_with_term.scalar(
        select(func.count(Meeting.id)).where(Meeting.is_demo.is_(True))
    )
    assert demo_after == demo_before


async def test_rolling_back_twice_is_a_conflict(campus_with_term: AsyncSession) -> None:
    applied = await _apply(campus_with_term, CLEAN)
    await import_service.rollback_import(campus_with_term, applied.batch_id)

    with pytest.raises(ConflictError) as caught:
        await import_service.rollback_import(campus_with_term, applied.batch_id)
    assert caught.value.code == "batch_already_rolled_back"


async def test_rolling_back_a_dry_run_is_refused(campus_with_term: AsyncSession) -> None:
    """A dry run wrote nothing, so there is nothing to undo."""
    _, batch_id = await import_service.dry_run_import(
        campus_with_term,
        payload=CLEAN,
        filename="t.csv",
        campus_id=CAMPUS,
        timezone=TASHKENT,
    )
    assert batch_id is not None

    with pytest.raises(ValidationError) as caught:
        await import_service.rollback_import(campus_with_term, batch_id)
    assert caught.value.code == "batch_was_dry_run"


async def test_rolling_back_an_unknown_batch_is_404(
    campus_with_term: AsyncSession,
) -> None:
    with pytest.raises(NotFoundError):
        await import_service.rollback_import(campus_with_term, uuid.uuid4())


# --------------------------------------------------------------------- idempotence


async def test_reimporting_the_same_file_diffs_as_unchanged(
    campus_with_term: AsyncSession,
) -> None:
    """Imports are idempotent (brief section 10.1).

    The second dry run should see the rules already present and report nothing
    to add, rather than offering to duplicate the whole timetable.
    """
    await _apply(campus_with_term, CLEAN)

    report, _ = await import_service.dry_run_import(
        campus_with_term,
        payload=CLEAN,
        filename="timetable.csv",
        campus_id=CAMPUS,
        timezone=TASHKENT,
    )
    assert report.diff is not None
    assert report.diff.added_count == 0, report.diff.as_dict()
    assert report.diff.unchanged_count == 2


async def test_replace_existing_clears_the_previous_import(
    campus_with_term: AsyncSession,
) -> None:
    first = await _apply(campus_with_term, CLEAN)
    second = await _apply(campus_with_term, CLEAN, replace_existing=True)

    surviving = await campus_with_term.scalar(
        select(func.count(MeetingRule.id)).where(MeetingRule.import_batch_id == first.batch_id)
    )
    assert surviving == 0
    assert second.rules == 2


# --------------------------------------------------------------------- rematerialise


async def test_rematerialising_rebuilds_meetings_from_the_master_rule(
    campus_with_term: AsyncSession,
) -> None:
    """Proof that ``meeting`` rows really are a cache.

    Delete them and rebuild from the rule alone; the count comes back.
    """
    from sqlalchemy import delete

    result = await _apply(campus_with_term, FOREIGN)
    rule = (
        await campus_with_term.execute(
            select(MeetingRule).where(MeetingRule.import_batch_id == result.batch_id)
        )
    ).scalar_one()

    original = await campus_with_term.scalar(select(func.count(Meeting.id)).where(Meeting.rule_id == rule.id))

    await campus_with_term.execute(delete(Meeting).where(Meeting.rule_id == rule.id))
    await campus_with_term.flush()
    assert (
        await campus_with_term.scalar(select(func.count(Meeting.id)).where(Meeting.rule_id == rule.id)) == 0
    )

    rebuilt = await import_service.rematerialise(campus_with_term, rule_id=rule.id, timezone=TASHKENT)
    assert rebuilt == original


async def test_rematerialising_an_unknown_rule_is_404(
    campus_with_term: AsyncSession,
) -> None:
    with pytest.raises(NotFoundError):
        await import_service.rematerialise(campus_with_term, rule_id=uuid.uuid4(), timezone=TASHKENT)


# --------------------------------------------------------------------- term handling


async def test_an_import_without_a_term_creates_one_from_the_data(
    seeded_session: AsyncSession,
) -> None:
    """Better than refusing - and recorded as generated, not as the registrar's."""
    from app.domain.spatial import Building, Floor, Room

    rooms = await seeded_session.execute(
        select(Room)
        .join(Floor, Floor.id == Room.floor_id)
        .join(Building, Building.id == Floor.building_id)
        .where(Building.campus_id == CAMPUS)
    )
    for room in rooms.scalars().all():
        seeded_session.add(
            Resource(
                campus_id=CAMPUS,
                code=f"room:{room.id}",
                name=room.number,
                kind="room",
                room_id=room.id,
            )
        )
    await seeded_session.flush()

    result = await _apply(seeded_session, CLEAN)
    assert result.rules == 2

    term = (await seeded_session.execute(select(Term).where(Term.campus_id == CAMPUS))).scalar_one()
    assert term.code.startswith("IMPORTED-")
    assert term.starts_on == date(2026, 10, 19)


async def test_an_import_with_no_dates_and_no_term_is_refused(
    seeded_session: AsyncSession,
) -> None:
    """Honest refusal: the expansion window genuinely cannot be determined."""
    payload = (
        b"course_code,section_code,title,teacher_ref,room_code,weekday,starts_at,ends_at\n"
        b"CS101,CSE-21,Intro,t.kim,A-101,Monday,09:00,10:20\n"
    )
    with pytest.raises(ValidationError) as caught:
        await _apply(seeded_session, payload)
    assert caught.value.code == "term_undeterminable"


async def test_an_unknown_term_id_is_404(campus_with_term: AsyncSession) -> None:
    with pytest.raises(NotFoundError):
        await _apply(campus_with_term, CLEAN, term_id=uuid.uuid4())


async def test_the_enrolled_count_reaches_the_section(
    campus_with_term: AsyncSession,
) -> None:
    """It is the estimator's prior, so it must survive the import."""
    await _apply(campus_with_term, CLEAN)
    section = (
        await campus_with_term.execute(
            select(Section).join(Course, Course.id == Section.course_id).where(Course.code == "CS101")
        )
    ).scalar_one()
    assert section.enrolled_count == 28
    assert section.teacher_ref == "t.kim"
