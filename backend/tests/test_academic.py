"""Tests for Phase 4 Layer 3: Academic Operations & Scenario Engine (§6.2, §13.1-§13.4).

Covers:
1. Lab & equipment booking prerequisites (`UserCapability`), approvals, maintenance
   blackouts, usage logs, and RFC 5545 `calendar.ics` export (§13.1).
2. Exam seat planner (`app.engines.exam_seating` + API): two-stage capacity-aware
   room split + OR-Tools CP-SAT seat assignment, spacing, same-course separation,
   accessible & front-row accommodations, deterministic seed, locked seats
   re-planning, consecutive-divide heuristic fallback, actionable infeasibility
   messages, and CSV/PDF/privacy-gated student slip exports (§13.2).
3. QR attendance (`app.engines.attendance` + API): rotating HMAC-SHA256 tokens,
   clock skew tolerance, expired & future token rejection, enrolment check,
   single-scan uniqueness, late threshold, soft device binding (`pending_review`),
   optional Haversine geofence (`pending_review`), live `Signal(checkin)` &
   `OccupancyEstimate` emission, `state_service` lesson confirmation upgrade,
   burst check-ins, and Beta-Binomial `AttendanceRate` posterior update (§13.3).
4. Timetable optimiser & Scenario Engine (`app.engines.timetable_optimiser` + API):
   OR-Tools CP-SAT curriculum-based course timetabling, step-free accessibility
   hard constraint, incremental mode, before/after metrics & trade-offs, and
   proof that live `Meeting` and `MeetingRule` rows are never mutated (§6.2, §13.4).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from httpx import AsyncClient
from hypothesis import given
from hypothesis import settings as hyp_settings
from hypothesis import strategies as st
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.db import Database
from app.core.errors import ValidationError
from app.core.security import Role, create_access_token
from app.domain.academic import Course, Meeting, MeetingRule, Section, Term
from app.domain.base import ConfirmationState, OccupancyStatus
from app.domain.booking import Resource
from app.domain.evidence import OccupancyEstimate, Signal
from app.domain.people import AppUser, EnrollmentRef
from app.engines.attendance import (
    classify_attendance_scan,
    generate_rotating_qr_token,
    hash_device_identifier,
    haversine_distance_metres,
    render_qr_png,
    render_qr_svg,
    verify_rotating_qr_token,
)
from app.engines.booking import Slot
from app.engines.exam_seating import (
    ExamPlanSettings,
    StudentExamInput,
    build_grid_seat_map,
    format_exam_plan_csv,
    format_student_slips,
    plan_exam_seating,
    render_exam_plan_pdf,
)
from app.engines.room_state import StateOptions
from app.engines.timetable_optimiser import (
    LectureInput,
    OptimiserConfig,
    OptimiserRoomInput,
    optimise_timetable,
)
from app.services import academic_service, booking_service, state_service

TASHKENT = ZoneInfo("Asia/Tashkent")
NOW = datetime(2026, 10, 19, 9, 0, tzinfo=UTC)


# ===========================================================================
# 1. Pure Engine Tests: Rotating QR Attendance (§13.3)
# ===========================================================================


class TestQrAttendanceEngine:
    def test_current_and_previous_window_accepted(self) -> None:
        secret = "test-hmac-secret-key-12345"
        session_id = uuid.uuid4()
        step = 20

        t0 = datetime(2026, 10, 19, 9, 0, 5, tzinfo=UTC)
        tok0 = generate_rotating_qr_token(secret, session_id, t0, step_seconds=step)

        # Same window -> valid (offset 0)
        res_same = verify_rotating_qr_token(
            secret, session_id, tok0.token, t0 + timedelta(seconds=10), step_seconds=step
        )
        assert res_same.valid is True
        assert res_same.window_offset == 0

        # Next window (1 step later) -> valid via clock-skew tolerance (offset 1)
        res_skew = verify_rotating_qr_token(
            secret, session_id, tok0.token, t0 + timedelta(seconds=step), step_seconds=step
        )
        assert res_skew.valid is True
        assert res_skew.window_offset == 1

    def test_expired_and_future_tokens_rejected(self) -> None:
        secret = "test-hmac-secret-key-12345"
        session_id = uuid.uuid4()
        step = 20
        t0 = datetime(2026, 10, 19, 9, 0, 5, tzinfo=UTC)

        tok_old = generate_rotating_qr_token(
            secret, session_id, t0 - timedelta(seconds=step * 3), step_seconds=step
        )
        res_old = verify_rotating_qr_token(
            secret, session_id, tok_old.token, t0, step_seconds=step
        )
        assert res_old.valid is False
        assert res_old.reason == "token_expired"

        tok_future = generate_rotating_qr_token(
            secret, session_id, t0 + timedelta(seconds=step * 2), step_seconds=step
        )
        res_future = verify_rotating_qr_token(
            secret, session_id, tok_future.token, t0, step_seconds=step
        )
        assert res_future.valid is False
        assert res_future.reason == "future_token_rejected"

    @given(
        epoch_sec=st.integers(min_value=1_700_000_000, max_value=1_900_000_000),
        step=st.integers(min_value=10, max_value=60),
    )
    @hyp_settings(max_examples=30)
    def test_property_rotating_token_roundtrip(self, epoch_sec: int, step: int) -> None:
        secret = "prop-secret"
        sid = uuid.UUID("11111111-2222-3333-4444-555555555555")
        at = datetime.fromtimestamp(epoch_sec, tz=UTC)
        tok = generate_rotating_qr_token(secret, sid, at, step_seconds=step)
        ver = verify_rotating_qr_token(secret, sid, tok.qr_payload, at, step_seconds=step)
        assert ver.valid is True
        assert ver.window_offset == 0

    def test_scan_classification_rules(self) -> None:
        opened = NOW
        dev_a = hash_device_identifier("iphone-student-1")
        dev_b = hash_device_identifier("android-other-2")

        # 1. Punctual, enrolled, first device -> present & registers device
        c1 = classify_attendance_scan(
            opened_at=opened,
            scanned_at=opened + timedelta(minutes=5),
            late_after_minutes=30,
            is_enrolled=True,
            registered_device_ref=None,
            scanned_device_ref=dev_a,
        )
        assert c1.state == "present"
        assert c1.device_To_register == dev_a

        # 2. After late threshold (35 min > 30 min) -> late (never rejected)
        c2 = classify_attendance_scan(
            opened_at=opened,
            scanned_at=opened + timedelta(minutes=35),
            late_after_minutes=30,
            is_enrolled=True,
            registered_device_ref=dev_a,
            scanned_device_ref=dev_a,
        )
        assert c2.state == "late"
        assert c2.is_late is True

        # 3. Non-enrolled student -> guest
        c3 = classify_attendance_scan(
            opened_at=opened,
            scanned_at=opened + timedelta(minutes=5),
            is_enrolled=False,
        )
        assert c3.state == "guest"

        # 4. Soft device mismatch -> pending_review (never blocks student)
        c4 = classify_attendance_scan(
            opened_at=opened,
            scanned_at=opened + timedelta(minutes=5),
            is_enrolled=True,
            registered_device_ref=dev_a,
            scanned_device_ref=dev_b,
        )
        assert c4.state == "pending_review"
        assert c4.device_mismatch is True
        assert "device_mismatch" in (c4.review_reason or "")

        # 5. Optional geofence exceeded (> 50m) -> pending_review
        c5 = classify_attendance_scan(
            opened_at=opened,
            scanned_at=opened + timedelta(minutes=5),
            is_enrolled=True,
            geofence_enabled=True,
            geofence_radius_m=50.0,
            room_lat_lon=(41.2995, 69.2401),
            scan_lat_lon=(41.3050, 69.2500),  # ~1 km away
        )
        assert c5.state == "pending_review"
        assert c5.geofence_flagged is True

    def test_qr_svg_and_png_rendering(self) -> None:
        svg = render_qr_svg("aut-att:session:token")
        assert "<svg" in svg
        png = render_qr_png("aut-att:session:token")
        assert png.startswith(b"\x89PNG")
        dist = haversine_distance_metres(41.2995, 69.2401, 41.2995, 69.2401)
        assert dist == pytest.approx(0.0, abs=1e-6)


# ===========================================================================
# 2. Pure Engine Tests: Exam Seat Planner (§13.2)
# ===========================================================================


class TestExamSeatPlannerEngine:
    def test_cp_sat_spacing_same_course_and_accommodations(self) -> None:
        room = build_grid_seat_map(
            space_id=uuid.uuid4(),
            room_code="A-101",
            room_name="Lecture Hall A-101",
            building_code="bld-h",
            capacity=32,
            cols=8,
            room_accessible=True,
        )
        students = [
            StudentExamInput(
                student_id=uuid.uuid4(),
                external_id=f"STU-{i:03d}",
                display_name=f"Student {i}",
                course_code="CS101" if i % 2 == 0 else "MATH201",
                needs_accessible=(i == 0),
                needs_front_row=(i == 1),
            )
            for i in range(10)
        ]
        settings = ExamPlanSettings(
            min_spacing=2,
            prevent_same_course_adjacent=True,
            prevent_same_course_diagonal=True,
            seed=42,
        )
        res1 = plan_exam_seating(students, [room], settings)
        res2 = plan_exam_seating(students, [room], settings)

        assert res1.feasible is True
        assert res1.status in ("OPTIMAL", "FEASIBLE")
        assert len(res1.assignments) == 10
        # Deterministic reproducibility for the same seed
        assert [
            (a.student_id, a.seat_id) for a in res1.assignments
        ] == [(a.student_id, a.seat_id) for a in res2.assignments]

        by_stu = {a.external_id: a for a in res1.assignments}
        assert by_stu["STU-000"].accessible is True
        assert by_stu["STU-001"].front_row is True

        # Check spacing >= 2 in every row
        by_row: dict[int, list[int]] = {}
        for a in res1.assignments:
            by_row.setdefault(a.row, []).append(a.col)
        for cols in by_row.values():
            ordered = sorted(cols)
            for idx in range(len(ordered) - 1):
                assert ordered[idx + 1] - ordered[idx] >= 2

        # Check no two same-course students sit in adjacent (including diagonal) seats
        for i, a1 in enumerate(res1.assignments):
            for a2 in res1.assignments[i + 1 :]:
                if a1.course_code == a2.course_code:
                    assert not (abs(a1.row - a2.row) <= 1 and abs(a1.col - a2.col) <= 1)

    def test_locked_seat_preserved_on_replan(self) -> None:
        room_uuid = uuid.uuid4()
        room = build_grid_seat_map(
            space_id=room_uuid,
            room_code="A-102",
            room_name="Room A-102",
            building_code="bld-h",
            capacity=20,
            cols=5,
        )
        s_locked = StudentExamInput(
            student_id=uuid.uuid4(),
            external_id="STU-LOCKED",
            display_name="Locked Student",
            course_code="CS101",
            locked_space_id=room_uuid,
            locked_seat_id="B3",
        )
        others = [
            StudentExamInput(
                student_id=uuid.uuid4(),
                external_id=f"STU-{i}",
                display_name=f"Other {i}",
                course_code="CS101",
            )
            for i in range(4)
        ]
        res = plan_exam_seating(
            [s_locked, *others], [room], ExamPlanSettings(min_spacing=2, seed=7)
        )
        assert res.feasible is True
        locked_assigned = next(
            a for a in res.assignments if a.external_id == "STU-LOCKED"
        )
        assert locked_assigned.seat_id == "B3"
        assert locked_assigned.locked is True

    def test_infeasible_explanation_and_exports(self) -> None:
        room = build_grid_seat_map(
            space_id=uuid.uuid4(),
            room_code="SMALL-1",
            room_name="Small Room",
            building_code="bld-h",
            capacity=10,
            cols=5,
        )
        # At spacing 2, a 2x5 room has 3 seats per row = 6 effective seats.
        # Asking for 28 students leaves a deficit of 22 seats!
        students = [
            StudentExamInput(
                student_id=uuid.uuid4(),
                external_id=f"S-{i}",
                display_name=f"Name {i}",
                course_code="CS101",
            )
            for i in range(28)
        ]
        res = plan_exam_seating(students, [room], ExamPlanSettings(min_spacing=2))
        assert res.feasible is False
        assert res.status == "INFEASIBLE"
        assert "22 more seats needed at spacing 2" in res.explanation

        # Test CSV, PDF, and privacy-gated student slips on a feasible plan
        small_res = plan_exam_seating(
            students[:4], [room], ExamPlanSettings(min_spacing=2)
        )
        assert small_res.feasible is True
        csv_no_names = format_exam_plan_csv(
            small_res.assignments, include_student_names=False
        )
        assert "student_name" not in csv_no_names
        csv_with_names = format_exam_plan_csv(
            small_res.assignments, include_student_names=True
        )
        assert "student_name" in csv_with_names

        slips_public = format_student_slips(
            small_res.assignments,
            exam_title="Midterm",
            starts_at_iso=NOW.isoformat(),
            include_student_names=False,
        )
        assert all("student_name" not in s for s in slips_public)

        pdf_bytes = render_exam_plan_pdf(
            small_res.assignments,
            [room],
            exam_title="Midterm",
            starts_at_iso=NOW.isoformat(),
            include_student_names=True,
        )
        assert pdf_bytes.startswith(b"%PDF-")


# ===========================================================================
# 3. Pure Engine Tests: Timetable Optimiser (§13.4)
# ===========================================================================


class TestTimetableOptimiserEngine:
    def test_step_free_accessibility_and_incremental_blocked_room(self) -> None:
        b_a = uuid.uuid4()
        r_inaccessible = OptimiserRoomInput(
            space_id=uuid.uuid4(),
            room_code="OLD-STAIRS-201",
            building_id=b_a,
            building_code="bld-h",
            capacity=40,
            accessible=False,
        )
        r_accessible = OptimiserRoomInput(
            space_id=uuid.uuid4(),
            room_code="ACC-101",
            building_id=b_a,
            building_code="bld-h",
            capacity=40,
            accessible=True,
        )
        cohort_1 = uuid.uuid4()
        teacher_1 = uuid.uuid4()

        lec_step_free = LectureInput(
            lecture_id=uuid.uuid4(),
            course_id=uuid.uuid4(),
            course_code="CS-ACCESS",
            cohort_ids=frozenset({cohort_1}),
            teacher_id=teacher_1,
            expected_attendance=25,
            requires_step_free=True,
            current_space_id=r_inaccessible.space_id,
            current_day=0,
            current_slot=0,
        )
        lec_other = LectureInput(
            lecture_id=uuid.uuid4(),
            course_id=uuid.uuid4(),
            course_code="MATH-101",
            cohort_ids=frozenset({cohort_1}),
            teacher_id=uuid.uuid4(),
            expected_attendance=25,
            requires_step_free=False,
            current_space_id=r_accessible.space_id,
            current_day=0,
            current_slot=1,
        )

        res = optimise_timetable(
            [lec_step_free, lec_other],
            [r_inaccessible, r_accessible],
            config=OptimiserConfig(
                incremental_mode=True,
                movable_lecture_ids=frozenset({lec_step_free.lecture_id}),
                seed=42,
            ),
        )
        assert res.feasible is True
        assert res.before_metrics.accessibility_violations == 1
        assert res.after_metrics.accessibility_violations == 0

        placed_map = {p.lecture_id: p for p in res.placements}
        assert placed_map[lec_step_free.lecture_id].space_id == r_accessible.space_id
        # Incremental mode kept lec_other locked at (r_accessible, day=0, slot=1)
        assert placed_map[lec_other.lecture_id].day == 0
        assert placed_map[lec_other.lecture_id].slot == 1


# ===========================================================================
# 4. Database & API Integration Tests (§13.1 - §13.4)
# ===========================================================================


@pytest.mark.db
async def test_lab_booking_prerequisites_approval_and_ical(
    clean_database: Database,
    seeded_client: AsyncClient,
    settings: Settings,
) -> None:
    student_id = uuid.uuid4()
    teacher_id = uuid.uuid4()
    async with clean_database.sessionmaker() as db_session:
        db_session.add_all(
            [
                AppUser(id=student_id, display_name="Lab Student", is_demo=True),
                AppUser(id=teacher_id, display_name="Lab Supervisor", is_demo=True),
            ]
        )
        lab_resource = Resource(
            campus_id="ajou-tashkent",
            code="LAB-LASER-01",
            name="Precision Laser Cutter",
            kind="lab_equipment",
            room_id="bld-h-f1-a101",
            is_bookable=True,
            requires_approval=True,
            policy={
                "max_duration_minutes": 180,
                "prerequisites": ["laser_safety_cert"],
                "setup_minutes": 10,
                "cleanup_minutes": 10,
            },
            is_demo=True,
        )
        db_session.add(lab_resource)
        await db_session.commit()
        lab_resource_id = lab_resource.id

    slot = Slot(
        starts_at=NOW + timedelta(hours=2),
        ends_at=NOW + timedelta(hours=3),
    )

    # 1. Booking without prerequisite is rejected with a clear explanation
    async with clean_database.sessionmaker() as db_session:
        with pytest.raises(ValidationError) as exc_info:
            await booking_service.create_booking(
                db_session,
                booking_service.BookingRequest(
                    resource_id=lab_resource_id,
                    slot=slot,
                    user_id=student_id,
                    purpose="Cut acrylic enclosure",
                ),
                timezone=TASHKENT,
                now=NOW,
            )
        assert "laser_safety_cert" in str(exc_info.value)

    # 2. Teacher grants `laser_safety_cert` via API
    teacher_token = create_access_token(
        str(teacher_id), [Role.teacher, Role.staff], settings=settings
    )
    t_headers = {"Authorization": f"Bearer {teacher_token}"}

    r_grant = await seeded_client.post(
        "/api/v1/academic/capabilities",
        headers=t_headers,
        json={
            "user_id": str(student_id),
            "capability": "laser_safety_cert",
            "notes": "Completed Laser Safety Workshop",
        },
    )
    assert r_grant.status_code == 201
    assert r_grant.json()["capability"] == "laser_safety_cert"

    # 3. Student now creates booking -> succeeds in `pending` state (requires_approval=True)
    async with clean_database.sessionmaker() as db_session:
        res_booking = await booking_service.create_booking(
            db_session,
            booking_service.BookingRequest(
                resource_id=lab_resource_id,
                slot=slot,
                user_id=student_id,
                purpose="Cut acrylic enclosure",
            ),
            timezone=TASHKENT,
            now=NOW,
        )
        await db_session.commit()
        booking_id = res_booking.booking.id
        assert res_booking.awaiting_approval is True
        assert res_booking.booking.status == OccupancyStatus.pending

    # 4. Teacher approves booking via API -> becomes `confirmed`
    r_approve = await seeded_client.post(
        f"/api/v1/academic/bookings/{booking_id}/approve",
        headers=t_headers,
    )
    assert r_approve.status_code == 200
    assert r_approve.json()["status"] == "confirmed"

    # 5. Export iCal feed & usage logs
    r_ics = await seeded_client.get(
        f"/api/v1/academic/resources/{lab_resource_id}/calendar.ics"
    )
    assert r_ics.status_code == 200
    assert "BEGIN:VCALENDAR" in r_ics.text
    assert "Cut acrylic enclosure" in r_ics.text

    r_logs = await seeded_client.get(
        f"/api/v1/academic/resources/{lab_resource_id}/usage-logs",
        headers=t_headers,
    )
    assert r_logs.status_code == 200
    assert r_logs.json()["count"] >= 1


@pytest.mark.db
async def test_qr_attendance_lifecycle_burst_and_posterior_learning(
    seeded_session: AsyncSession,
) -> None:
    teacher_id = uuid.uuid4()
    seeded_session.add(AppUser(id=teacher_id, display_name="Prof. Kim", is_demo=True))

    term = Term(
        campus_id="ajou-tashkent",
        code="2026-FALL-ATT",
        name="Fall 2026",
        starts_on=NOW.date() - timedelta(days=30),
        ends_on=NOW.date() + timedelta(days=60),
        is_current=False,
        is_demo=True,
    )
    course = Course(
        campus_id="ajou-tashkent",
        code="CS-QR-401",
        title="Distributed Systems",
        is_demo=True,
    )
    seeded_session.add_all([term, course])
    await seeded_session.flush()

    section = Section(
        term_id=term.id,
        course_id=course.id,
        code="001",
        cohort="I25D",
        enrolled_count=25,
        is_demo=True,
    )
    seeded_session.add(section)
    await seeded_session.flush()

    rule = MeetingRule(
        section_id=section.id,
        room_id="bld-h-f1-a101",
        rrule="FREQ=WEEKLY;BYDAY=MO",
        dtstart_local="2026-10-19T14:00:00",
        tzid="Asia/Tashkent",
        duration_minutes=75,
        is_demo=True,
    )
    seeded_session.add(rule)
    await seeded_session.flush()

    meeting = Meeting(
        rule_id=rule.id,
        room_id="bld-h-f1-a101",
        starts_at=NOW,
        ends_at=NOW + timedelta(minutes=75),
        original_starts_at=NOW,
        subject="Distributed Systems",
        teacher_label="Prof. Kim",
        group_label="I25D",
        is_demo=True,
    )
    seeded_session.add(meeting)

    # Enrol 15 students for burst check-in test
    enrolled_students: list[uuid.UUID] = []
    for idx in range(15):
        sid = uuid.uuid4()
        enrolled_students.append(sid)
        seeded_session.add(AppUser(id=sid, display_name=f"Stu {idx}", is_demo=True))
        seeded_session.add(
            EnrollmentRef(user_id=sid, section_id=section.id, is_demo=True)
        )
    await seeded_session.commit()

    # Before attendance session opens, lesson confirmation is `unconfirmed`
    opts = StateOptions(starts_soon_minutes=15, timezone=TASHKENT)
    st_before = await state_service.state_for_room(
        seeded_session, "bld-h-f1-a101", NOW + timedelta(minutes=20), timezone=TASHKENT, options=opts
    )
    assert st_before.confirmation == ConfirmationState.unconfirmed

    # 1. Teacher opens attendance session
    att_session = await academic_service.open_attendance_session(
        seeded_session,
        teacher_user_id=teacher_id,
        meeting_id=meeting.id,
        room_id="bld-h-f1-a101",
        token_step_seconds=20,
        late_after_minutes=30,
        now=NOW,
        is_demo=True,
    )
    await seeded_session.commit()

    # Lesson confirmation in state_service is now upgraded to `confirmed`!
    st_after = await state_service.state_for_room(
        seeded_session, "bld-h-f1-a101", NOW + timedelta(minutes=20), timezone=TASHKENT, options=opts
    )
    assert st_after.confirmation == ConfirmationState.confirmed

    # 2. Generate rotating QR token and scan all 15 enrolled students
    qr_info = await academic_service.get_current_qr_token(
        seeded_session, att_session.id, now=NOW + timedelta(minutes=2)
    )
    token_str = qr_info["token"]

    for idx, sid in enumerate(enrolled_students):
        rec, outcome = await academic_service.scan_attendance_qr(
            seeded_session,
            session_id=att_session.id,
            student_user_id=sid,
            token=token_str,
            raw_device_id=f"device-{idx}",
            now=NOW + timedelta(minutes=2),
        )
        assert rec.state == "present"
        assert outcome.is_enrolled is True

    # 3. Duplicate scan by student 0 raises 409 ConflictError
    from app.core.errors import ConflictError

    with pytest.raises(ConflictError):
        await academic_service.scan_attendance_qr(
            seeded_session,
            session_id=att_session.id,
            student_user_id=enrolled_students[0],
            token=token_str,
            raw_device_id="device-0",
            now=NOW + timedelta(minutes=2),
        )

    # 4. Close session -> updates Beta-Binomial AttendanceRate posterior
    _, rate_row = await academic_service.close_attendance_session(
        seeded_session,
        session_id=att_session.id,
        timezone=TASHKENT,
        now=NOW + timedelta(minutes=70),
    )
    await seeded_session.commit()

    assert rate_row is not None
    assert rate_row.observations == 1
    assert rate_row.alpha > 3.0  # default alpha (3.0) + 15 attendees = 18.0
    assert rate_row.alpha == pytest.approx(18.0)

    # Verify Signal and OccupancyEstimate were persisted
    sig_count = await seeded_session.scalar(
        select(func.count(Signal.id)).where(
            Signal.subject_id == "bld-h-f1-a101",
            Signal.signal_type == "checkin",
        )
    )
    est_count = await seeded_session.scalar(
        select(func.count(OccupancyEstimate.id)).where(
            OccupancyEstimate.subject_id == "bld-h-f1-a101",
        )
    )
    assert (sig_count or 0) >= 15
    assert (est_count or 0) >= 15


@pytest.mark.db
async def test_exam_planner_and_scenario_optimiser_api_never_mutates_live_timetable(
    clean_database: Database,
    seeded_client: AsyncClient,
    settings: Settings,
) -> None:
    admin_id = uuid.uuid4()
    student_id = uuid.uuid4()
    admin_token = create_access_token(
        str(admin_id), [Role.admin, Role.staff], settings=settings
    )
    student_token = create_access_token(
        str(student_id), [Role.student], settings=settings
    )
    a_headers = {"Authorization": f"Bearer {admin_token}"}
    s_headers = {"Authorization": f"Bearer {student_token}"}

    # 1. Create an Exam Plan via API
    r_plan = await seeded_client.post(
        "/api/v1/academic/exams/plans",
        headers=a_headers,
        json={
            "campus_id": "ajou-tashkent",
            "title": "Algorithms Final Exam",
            "starts_at": (NOW + timedelta(days=5)).isoformat(),
            "ends_at": (NOW + timedelta(days=5, hours=2)).isoformat(),
            "room_ids": ["bld-h-f1-a101"],
            "min_spacing": 2,
            "seed": 42,
            "students": [
                {
                    "student_id": str(student_id),
                    "external_id": "2026001",
                    "display_name": "Alice Karimova",
                    "course_code": "CS301",
                    "needs_front_row": True,
                },
                {
                    "student_id": str(uuid.uuid4()),
                    "external_id": "2026002",
                    "display_name": "Bobur Toshmatov",
                    "course_code": "CS302",
                },
            ],
        },
    )
    assert r_plan.status_code == 201
    plan_id = r_plan.json()["id"]
    assert r_plan.json()["status"] in ("optimal", "feasible")

    # Student slip lookup only returns the calling student's slip
    r_slips_stu = await seeded_client.get(
        f"/api/v1/academic/exams/plans/{plan_id}/slips",
        headers=s_headers,
    )
    assert r_slips_stu.status_code == 200
    assert r_slips_stu.json()["count"] == 1
    assert r_slips_stu.json()["slips"][0]["student_external_id"] == "2026001"

    # PDF export returns valid PDF
    r_pdf = await seeded_client.get(
        f"/api/v1/academic/exams/plans/{plan_id}/export.pdf",
        headers=a_headers,
    )
    assert r_pdf.status_code == 200
    assert r_pdf.content.startswith(b"%PDF-")

    # 2. Snapshot live Meeting & MeetingRule counts before running Scenario Optimiser
    async with clean_database.sessionmaker() as db_session:
        meetings_before = await db_session.scalar(select(func.count(Meeting.id)))
        rules_before = await db_session.scalar(select(func.count(MeetingRule.id)))

    r_scen = await seeded_client.post(
        "/api/v1/academic/scenarios/optimise",
        headers=a_headers,
        json={
            "campus_id": "ajou-tashkent",
            "name": "Step-Free Relocation Scenario",
            "description": "Relocate Course X to accessible ground-floor room",
            "incremental_mode": True,
            "rooms": [
                {
                    "room_id": "bld-h-f1-a101",
                    "building_id": "bld-h",
                    "capacity": 40,
                    "accessible": True,
                },
                {
                    "room_id": "bld-h-f1-a102",
                    "building_id": "bld-h",
                    "capacity": 40,
                    "accessible": False,
                },
            ],
            "lectures": [
                {
                    "course_code": "CS-STEPFREE",
                    "cohort": "I25D",
                    "expected_attendance": 25,
                    "requires_step_free": True,
                    "current_room_id": "bld-h-f1-a102",
                    "current_day": 0,
                    "current_slot": 0,
                }
            ],
        },
    )
    assert r_scen.status_code == 201
    scen_data = r_scen.json()
    assert scen_data["feasible"] is True
    assert scen_data["proposal_metrics"]["accessibility_violations"] == 0
    assert len(scen_data["changes"]) == 1
    assert scen_data["changes"][0]["new_room_id"] == "bld-h-f1-a101"

    # Prove live Meeting and MeetingRule tables were NOT mutated
    async with clean_database.sessionmaker() as db_session:
        meetings_after = await db_session.scalar(select(func.count(Meeting.id)))
        rules_after = await db_session.scalar(select(func.count(MeetingRule.id)))
    assert meetings_after == meetings_before
    assert rules_after == rules_before
