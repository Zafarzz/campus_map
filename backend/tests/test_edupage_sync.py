"""Tests for EduPage JSON parsing and live PostgreSQL timetable synchronisation.

Fixtures use synthetic instructor names only (``docs/privacy/timetable.md`` rule 5).
"""

from __future__ import annotations

import json
from datetime import date, time
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.academic import Meeting, Section
from app.engines.timetable.edupage import (
    parse_edupage,
    pseudonymise_teacher,
    resolve_edupage_room_code,
)
from app.engines.timetable.parsers import sniff_format
from app.services import compat_service, schedule_service
from app.services.demo_schedule_service import seed_demo_schedule
from app.services.edupage_sync_service import sync_edupage_timetable

TASHKENT = ZoneInfo("Asia/Tashkent")
CAMPUS = "ajou-tashkent"


def _synthetic_edupage_payload(*, subject_monday_d101: str = "Physics 1") -> bytes:
    """Build an anonymised aSc/EduPage ``regularttGetData`` payload."""
    doc = {
        "r": {
            "dbiAccessorRes": {
                "tables": [
                    {
                        "id": "periods",
                        "data_rows": [
                            {"id": "1", "period": "1", "starttime": "08:30", "endtime": "09:45"},
                            {"id": "2", "period": "2", "starttime": "10:00", "endtime": "11:15"},
                            {"id": "3", "period": "3", "starttime": "11:30", "endtime": "12:45"},
                            {"id": "4", "period": "4", "starttime": "13:30", "endtime": "14:45"},
                            {"id": "5", "period": "5", "starttime": "15:00", "endtime": "16:15"},
                            {"id": "6", "period": "6", "starttime": "16:30", "endtime": "17:45"},
                            {"id": "7", "period": "7", "starttime": "18:00", "endtime": "19:15"},
                        ],
                    },
                    {
                        "id": "classrooms",
                        "data_rows": [
                            {"id": "r1", "short": "D-101", "name": "D-101"},
                            {"id": "r2", "short": "C-CONFERENCE HAL", "name": "Conference Hall"},
                            {"id": "r3", "short": "F-DS_101_2 ", "name": "Design Studio"},
                            {"id": "r4", "short": "E-201", "name": "E-201"},
                        ],
                    },
                    {
                        "id": "subjects",
                        "data_rows": [
                            {"id": "s1", "name": f"{subject_monday_d101}   ", "short": subject_monday_d101},
                            {
                                "id": "s2",
                                "name": "Fundamentals of Business Management",
                                "short": "Fundamentals of Business Management",
                            },
                            {
                                "id": "s3",
                                "name": "Project Management for Construction",
                                "short": "Project Management for Construction",
                            },
                        ],
                    },
                    {
                        "id": "classes",
                        "data_rows": [
                            {"id": "c1", "short": "A25A", "name": "A25A"},
                            {"id": "c2", "short": "A25B", "name": "A25B"},
                            {"id": "c3", "short": "I26C", "name": "I26C"},
                        ],
                    },
                    {
                        "id": "teachers",
                        "data_rows": [
                            {"id": "t1", "short": "Prof. Synthetic Alpha"},
                            {"id": "t2", "short": "Prof. Synthetic Beta"},
                        ],
                    },
                    {
                        "id": "lessons",
                        "data_rows": [
                            {
                                "id": "l1",
                                "subjectid": "s1",
                                "teacherids": ["t1"],
                                "classids": ["c1", "c2"],
                                "durationperiods": 1,
                            },
                            {
                                "id": "l2",
                                "subjectid": "s2",
                                "teacherids": ["t1"],
                                "classids": ["c3"],
                                "durationperiods": 2,
                            },
                            {
                                "id": "l3",
                                "subjectid": "s3",
                                "teacherids": ["t1"],
                                "classids": ["c1"],
                                "durationperiods": 1,
                            },
                        ],
                    },
                    {
                        "id": "cards",
                        "data_rows": [
                            {
                                "id": "k1",
                                "lessonid": "l1",
                                "period": "1",
                                "days": "10000",
                                "weeks": "1",
                                "classroomids": ["r1"],
                            },
                            {
                                "id": "k2",
                                "lessonid": "l2",
                                "period": "1",
                                "days": "10000",
                                "weeks": "1",
                                "classroomids": ["r2"],
                            },
                            {
                                "id": "k3",
                                "lessonid": "l3",
                                "period": "4",
                                "days": "10000",
                                "weeks": "1",
                                "classroomids": ["r1"],
                            },
                            {
                                "id": "k4",
                                "lessonid": "l3",
                                "period": "5",
                                "days": "01000",
                                "weeks": "1",
                                "classroomids": ["r3"],
                            },
                            {
                                "id": "k5",
                                "lessonid": "l3",
                                "period": "6",
                                "days": "00100",
                                "weeks": "1",
                                "classroomids": ["r4"],
                            },
                        ],
                    },
                ]
            }
        }
    }
    return json.dumps(doc).encode("utf-8")


def test_sniff_format_detects_edupage_json() -> None:
    payload = _synthetic_edupage_payload()
    assert sniff_format("edupage-tt163.json", payload) == "edupage"
    assert sniff_format(None, payload) == "edupage"


def test_edupage_room_aliases_and_pseudonymous_teachers() -> None:
    assert resolve_edupage_room_code("C-CONFERENCE HAL") == "C-conF"
    assert resolve_edupage_room_code("C-SPORT HAL") == "SC101"
    assert resolve_edupage_room_code("E-DS_101_1") == "E-102"
    assert resolve_edupage_room_code("F-DS_101_2 ") == "F-103"
    assert resolve_edupage_room_code("E-201") == "E-205"
    assert resolve_edupage_room_code("D-101") == "D-101"

    parsed = parse_edupage(_synthetic_edupage_payload())
    assert parsed.ok
    assert len(parsed.rows) == 5

    first = parsed.rows[0]
    assert first.room_code == "D-101"
    assert first.weekday == 0
    assert first.starts_at == time(8, 30)
    assert first.ends_at == time(9, 45)
    assert first.title == "Physics 1"
    assert first.section_code == "A25A, A25B"
    assert first.teacher_label == "Prof. Synthetic Alpha"
    assert first.teacher_ref == f"edupage:{pseudonymise_teacher('Prof. Synthetic Alpha')}"
    assert "Alpha" not in (first.teacher_ref or "")

    multi = parsed.rows[1]
    assert multi.room_code == "C-conF"
    assert multi.starts_at == time(8, 30)
    assert multi.ends_at == time(11, 15)


async def test_sync_edupage_purges_demo_schedule_and_switches_versions(
    seeded_session: AsyncSession,
) -> None:
    # 1. Start with a database polluted by generated demo lessons (including 12:00-13:20).
    await seed_demo_schedule(
        seeded_session,
        campus_id=CAMPUS,
        timezone=TASHKENT,
        start_day=date(2026, 10, 26),
        days=7,
        include_weekends=True,
    )
    demo_before = await seeded_session.scalar(
        select(func.count(Meeting.id)).where(Meeting.is_demo.is_(True))
    )
    assert (demo_before or 0) > 0

    # 2. Sync TT #163 (Mid-term Exam schedule).
    payload_163 = _synthetic_edupage_payload(subject_monday_d101="Physics 1 (Midterm Exam)")
    res1 = await sync_edupage_timetable(
        seeded_session,
        payload_override=("163", "26-27.Fall V5 Mid-term Exam", payload_163),
    )
    assert res1.changed is True
    assert res1.rules == 5
    assert res1.meetings > 0

    # Demo meetings must be completely gone.
    demo_after = await seeded_session.scalar(
        select(func.count(Meeting.id)).where(Meeting.is_demo.is_(True))
    )
    assert demo_after == 0

    # Section.teacher_ref must remain pseudonymous (never storing display names).
    refs = (await seeded_session.scalars(select(Section.teacher_ref))).all()
    assert refs
    for ref in refs:
        assert ref is not None and ref.startswith("edupage:")
        assert "Synthetic" not in ref

    # Verify a Monday within the active window has real EduPage slots and NO 12:00-13:20 lunch class.
    monday = res1_monday(seeded_session)
    target_monday = await monday
    day_meetings = await schedule_service.lessons_for_day(
        seeded_session, day=target_monday, timezone=TASHKENT
    )
    assert len(day_meetings) >= 2
    compat_lessons = [compat_service.meeting_to_compat(m, TASHKENT) for m in day_meetings]
    for item in compat_lessons:
        assert not item.startsAt.endswith("T12:00:00")
    d101_subjects = [item.subject for item in compat_lessons if item.subject.startswith("Physics 1")]
    assert d101_subjects == ["Physics 1 (Midterm Exam)"]

    # 3. Re-running with the identical payload is an instant no-op.
    res_noop = await sync_edupage_timetable(
        seeded_session,
        payload_override=("163", "26-27.Fall V5 Mid-term Exam", payload_163),
    )
    assert res_noop.changed is False

    # 4. When EduPage switches default_num back to #154 (regular schedule), sync updates automatically.
    payload_154 = _synthetic_edupage_payload(subject_monday_d101="General Physics Lecture")
    res2 = await sync_edupage_timetable(
        seeded_session,
        payload_override=("154", "26-27.Fall V5", payload_154),
    )
    assert res2.changed is True

    updated_meetings = await schedule_service.lessons_for_day(
        seeded_session, day=target_monday, timezone=TASHKENT
    )
    updated_subjects = {m.subject for m in updated_meetings}
    assert "General Physics Lecture" in updated_subjects
    assert "Physics 1 (Midterm Exam)" not in updated_subjects


async def res1_monday(session: AsyncSession) -> date:
    first = (
        await session.execute(
            select(Meeting).where(Meeting.is_demo.is_(False)).order_by(Meeting.starts_at.asc()).limit(1)
        )
    ).scalar_one()
    local_dt = first.starts_at.astimezone(TASHKENT)
    return local_dt.date()
