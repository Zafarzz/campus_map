"""Layer 3 Academic Operations & Scenario Engine service (Phase 4 §6.2, §13.1-§13.4).

Coordinates:
1. Lab & equipment booking extensions (§13.1): user safety certifications /
   prerequisites (`UserCapability`), resource maintenance blackouts (`Blackout`),
   usage logs, and RFC 5545 iCalendar feed export (`calendar.ics`).
2. Exam seat planner (§13.2): two-stage capacity-aware room split + OR-Tools
   CP-SAT seat assignment (`ExamPlan`), seat locking & re-planning, CSV/PDF
   exports, and privacy-gated student slips.
3. QR attendance (§13.3): teacher `AttendanceSession` with rotating HMAC-SHA256
   tokens, student check-in (`AttendanceRecord`) with soft device binding
   (`UserDevice`) and optional Haversine geofence weak signal, live check-in
   `Signal` + `OccupancyEstimate` emission, and Beta-Binomial posterior update
   (`AttendanceRate`) on session close.
4. Timetable optimiser & Scenario engine (§6.2, §13.4): copy-on-write
   `Scenario` & `ScenarioChange` creation via OR-Tools CP-SAT curriculum-based
   course timetabling without ever mutating live `Meeting` or `MeetingRule` rows.
"""

from __future__ import annotations

import uuid
from dataclasses import asdict
from datetime import UTC, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.core.logging import get_logger
from app.domain.academic import Course, ExamPlan, Meeting, MeetingRule, Section
from app.domain.base import (
    ConfirmationState,
    OccupancyStatus,
    Provenance,
    ScenarioStatus,
    SignalType,
)
from app.domain.booking import Blackout, Booking, Resource
from app.domain.evidence import (
    AttendanceRate,
    AttendanceRecord,
    AttendanceSession,
    OccupancyEstimate,
    Signal,
    UserDevice,
)
from app.domain.people import AppUser, EnrollmentRef, UserCapability
from app.domain.platform import Scenario, ScenarioChange
from app.domain.spatial import Floor, Room
from app.engines.attendance import (
    ScanClassification,
    classify_attendance_scan,
    generate_rotating_qr_token,
    hash_device_identifier,
    render_qr_svg,
    verify_rotating_qr_token,
)
from app.engines.evidence import (
    AttendancePrior,
    SignalInput,
    estimate_occupancy,
    update_attendance_prior,
)
from app.engines.exam_seating import (
    ExamPlanResult,
    ExamPlanSettings,
    RoomSeatMap,
    SeatAssignment,
    SeatSpec,
    StudentExamInput,
    build_grid_seat_map,
    format_exam_plan_csv,
    format_student_slips,
    plan_exam_seating,
    render_exam_plan_pdf,
)
from app.engines.timetable_optimiser import (
    LectureInput,
    OptimiserConfig,
    OptimiserResult,
    OptimiserRoomInput,
    optimise_timetable,
)
from app.services.state_service import invalidate_state_cache

log = get_logger(__name__)

__all__ = [
    "approve_scenario",
    "close_attendance_session",
    "create_resource_blackout",
    "export_exam_plan_csv_for_id",
    "export_exam_plan_pdf_for_id",
    "export_resource_ical",
    "generate_exam_plan",
    "get_attendance_session_summary",
    "get_current_qr_token",
    "get_exam_plan",
    "get_exam_student_slips_for_id",
    "get_scenario_with_changes",
    "grant_user_capability",
    "list_exam_plans",
    "list_resource_usage_logs",
    "list_scenarios",
    "list_user_capabilities",
    "open_attendance_session",
    "review_attendance_record",
    "revoke_user_capability",
    "run_timetable_optimisation_scenario",
    "scan_attendance_qr",
]


def _slug_uuid(slug: str) -> uuid.UUID:
    """Deterministic UUIDv5 for string-slugged spatial entities (`Room.id`, `Building.id`)."""
    return uuid.uuid5(uuid.NAMESPACE_OID, f"campus-spatial:{slug}")


# ===========================================================================
# §13.1 Lab & Equipment Booking Extensions
# ===========================================================================


async def grant_user_capability(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    capability: str,
    granted_by: uuid.UUID | None = None,
    expires_at: datetime | None = None,
    notes: str | None = None,
    is_demo: bool = False,
    now: datetime | None = None,
) -> UserCapability:
    """Grant or renew a safety certification / prerequisite capability for a user."""
    instant = now or datetime.now(UTC)
    norm_cap = capability.strip()
    if not norm_cap:
        raise ValidationError("Capability code must not be empty.", code="empty_capability")

    user = await session.get(AppUser, user_id)
    if user is None:
        raise NotFoundError(f"User {user_id} does not exist.", code="user_not_found")

    existing = (
        await session.execute(
            select(UserCapability).where(
                UserCapability.user_id == user_id,
                UserCapability.capability == norm_cap,
            )
        )
    ).scalar_one_or_none()

    if existing is not None:
        existing.granted_by = granted_by
        existing.granted_at = instant
        existing.expires_at = expires_at
        existing.notes = notes
        await session.flush()
        return existing

    row = UserCapability(
        user_id=user_id,
        capability=norm_cap,
        granted_by=granted_by,
        granted_at=instant,
        expires_at=expires_at,
        notes=notes,
        is_demo=is_demo,
    )
    session.add(row)
    await session.flush()
    return row


async def revoke_user_capability(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    capability: str,
) -> bool:
    """Revoke a capability from a user."""
    existing = (
        await session.execute(
            select(UserCapability).where(
                UserCapability.user_id == user_id,
                UserCapability.capability == capability.strip(),
            )
        )
    ).scalar_one_or_none()
    if existing is None:
        return False
    await session.delete(existing)
    await session.flush()
    return True


async def list_user_capabilities(
    session: AsyncSession,
    user_id: uuid.UUID,
) -> list[UserCapability]:
    """List all capabilities held by a user."""
    rows = (
        await session.execute(
            select(UserCapability)
            .where(UserCapability.user_id == user_id)
            .order_by(UserCapability.capability.asc())
        )
    ).scalars().all()
    return list(rows)


async def create_resource_blackout(
    session: AsyncSession,
    *,
    resource_id: uuid.UUID,
    starts_at: datetime,
    ends_at: datetime,
    reason: str,
    created_by: uuid.UUID | None = None,
) -> Blackout:
    """Create a maintenance/blackout window for a lab or equipment resource."""
    resource = await session.get(Resource, resource_id)
    if resource is None:
        raise NotFoundError(f"Resource {resource_id} does not exist.", code="resource_not_found")
    if ends_at <= starts_at:
        raise ValidationError("Blackout ends_at must be after starts_at.", code="invalid_window")

    blackout = Blackout(
        resource_id=resource_id,
        starts_at=starts_at,
        ends_at=ends_at,
        reason=reason.strip() or "Maintenance window",
        created_by=created_by,
        is_demo=resource.is_demo,
    )
    session.add(blackout)
    await session.flush()
    invalidate_state_cache()
    return blackout


async def list_resource_usage_logs(
    session: AsyncSession,
    resource_id: uuid.UUID,
    *,
    limit: int = 100,
) -> list[dict[str, Any]]:
    """Return booking & check-in usage log entries for a lab or equipment resource."""
    resource = await session.get(Resource, resource_id)
    if resource is None:
        raise NotFoundError(f"Resource {resource_id} does not exist.", code="resource_not_found")

    rows = (
        await session.execute(
            select(Booking)
            .where(Booking.resource_id == resource_id)
            .order_by(Booking.starts_at.desc())
            .limit(limit)
        )
    ).scalars().all()

    logs: list[dict[str, Any]] = []
    for b in rows:
        duration_hours = round((b.ends_at - b.starts_at).total_seconds() / 3600.0, 2)
        logs.append(
            {
                "booking_id": str(b.id),
                "resource_id": str(b.resource_id),
                "resource_code": resource.code,
                "user_id": str(b.user_id) if b.user_id else None,
                "starts_at": b.starts_at.isoformat(),
                "ends_at": b.ends_at.isoformat(),
                "duration_hours": duration_hours,
                "status": b.status.value,
                "checked_in_at": b.checked_in_at.isoformat() if b.checked_in_at else None,
                "purpose": b.purpose,
            }
        )
    return logs


async def export_resource_ical(
    session: AsyncSession,
    resource_id: uuid.UUID,
) -> str:
    """Export RFC 5545 iCalendar (`.ics`) feed for a lab or equipment resource (§13.1)."""
    resource = await session.get(Resource, resource_id)
    if resource is None:
        raise NotFoundError(f"Resource {resource_id} does not exist.", code="resource_not_found")

    bookings = (
        await session.execute(
            select(Booking)
            .where(
                Booking.resource_id == resource_id,
                Booking.status.in_((OccupancyStatus.pending, OccupancyStatus.confirmed)),
            )
            .order_by(Booking.starts_at.asc())
        )
    ).scalars().all()

    blackouts = (
        await session.execute(
            select(Blackout)
            .where(Blackout.resource_id == resource_id)
            .order_by(Blackout.starts_at.asc())
        )
    ).scalars().all()

    def _fmt_utc(dt: datetime) -> str:
        return dt.astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")

    now_stamp = _fmt_utc(datetime.now(UTC))
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Ajou Campus Pulse//Lab & Equipment Booking//EN",
        "CALSCALE:GREGORIAN",
        f"X-WR-CALNAME:{resource.name} ({resource.code})",
    ]

    for b in bookings:
        summary = b.purpose or f"Booking ({b.status.value})"
        lines.extend(
            [
                "BEGIN:VEVENT",
                f"UID:booking-{b.id}@campus.ajou.uz",
                f"DTSTAMP:{now_stamp}",
                f"DTSTART:{_fmt_utc(b.starts_at)}",
                f"DTEND:{_fmt_utc(b.ends_at)}",
                f"SUMMARY:{summary}",
                f"STATUS:{'CONFIRMED' if b.status == OccupancyStatus.confirmed else 'TENTATIVE'}",
                f"LOCATION:{resource.room_id or resource.code}",
                "END:VEVENT",
            ]
        )

    for bl in blackouts:
        lines.extend(
            [
                "BEGIN:VEVENT",
                f"UID:blackout-{bl.id}@campus.ajou.uz",
                f"DTSTAMP:{now_stamp}",
                f"DTSTART:{_fmt_utc(bl.starts_at)}",
                f"DTEND:{_fmt_utc(bl.ends_at)}",
                f"SUMMARY:[MAINTENANCE] {bl.reason or 'Maintenance Window'}",
                "STATUS:CONFIRMED",
                f"LOCATION:{resource.room_id or resource.code}",
                "END:VEVENT",
            ]
        )

    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"


# ===========================================================================
# §13.2 Exam Seat Planner
# ===========================================================================


async def generate_exam_plan(
    session: AsyncSession,
    *,
    campus_id: str,
    title: str,
    starts_at: datetime,
    ends_at: datetime,
    room_ids: list[str],
    students_payload: list[dict[str, Any]],
    min_spacing: int = 2,
    prevent_same_course_adjacent: bool = True,
    prevent_same_course_diagonal: bool = True,
    seed: int = 42,
    locked_seats: dict[str, dict[str, str]] | None = None,
    term_id: uuid.UUID | None = None,
    created_by: uuid.UUID | None = None,
    is_demo: bool = False,
) -> tuple[ExamPlan, ExamPlanResult]:
    """Generate and persist an exam seating plan (§13.2)."""
    if ends_at <= starts_at:
        raise ValidationError("Exam ends_at must be after starts_at.", code="invalid_exam_window")

    room_maps: list[RoomSeatMap] = []
    slug_by_space_uuid: dict[uuid.UUID, str] = {}
    space_uuid_by_slug: dict[str, uuid.UUID] = {}

    for rid in room_ids:
        room = await session.get(Room, rid)
        if room is None:
            raise NotFoundError(f"Room {rid!r} does not exist.", code="room_not_found")
        building_id = "campus"
        if room.floor_id:
            fl = await session.get(Floor, room.floor_id)
            if fl is not None:
                building_id = fl.building_id
        s_uuid = _slug_uuid(room.id)
        slug_by_space_uuid[s_uuid] = room.id
        space_uuid_by_slug[room.id] = s_uuid
        room_maps.append(
            build_grid_seat_map(
                space_id=s_uuid,
                room_code=room.id,
                room_name=room.name or room.id,
                building_code=building_id,
                capacity=max(1, room.capacity or 30),
                room_accessible=bool(room.accessible if room.accessible is not None else True),
            )
        )

    locks = locked_seats or {}
    student_inputs: list[StudentExamInput] = []
    for idx, item in enumerate(students_payload):
        raw_sid = item.get("student_id")
        s_uuid = (
            uuid.UUID(str(raw_sid))
            if raw_sid
            else uuid.uuid5(uuid.NAMESPACE_OID, f"exam-student:{item.get('external_id', idx)}")
        )
        ext_id = str(item.get("external_id") or f"STU-{idx + 1:04d}")
        lock_info = locks.get(str(s_uuid)) or locks.get(ext_id)
        locked_space_uuid: uuid.UUID | None = None
        locked_seat_id: str | None = None
        if lock_info:
            r_slug = lock_info.get("room_id")
            if r_slug:
                locked_space_uuid = space_uuid_by_slug.get(r_slug, _slug_uuid(r_slug))
            locked_seat_id = lock_info.get("seat_id")
        elif item.get("locked_room_id") and item.get("locked_seat_id"):
            r_slug = str(item["locked_room_id"])
            locked_space_uuid = space_uuid_by_slug.get(r_slug, _slug_uuid(r_slug))
            locked_seat_id = str(item["locked_seat_id"])

        student_inputs.append(
            StudentExamInput(
                student_id=s_uuid,
                external_id=ext_id,
                display_name=str(item.get("display_name") or ext_id),
                course_code=str(item.get("course_code") or "EXAM"),
                needs_accessible=bool(item.get("needs_accessible", False)),
                needs_front_row=bool(item.get("needs_front_row", False)),
                locked_space_id=locked_space_uuid,
                locked_seat_id=locked_seat_id,
            )
        )

    settings = ExamPlanSettings(
        min_spacing=min_spacing,
        prevent_same_course_adjacent=prevent_same_course_adjacent,
        prevent_same_course_diagonal=prevent_same_course_diagonal,
        seed=seed,
    )
    result = plan_exam_seating(student_inputs, room_maps, settings)

    rooms_serialized = [
        {
            "space_id": str(rm.space_id),
            "room_id": slug_by_space_uuid.get(rm.space_id, rm.room_code),
            "room_code": rm.room_code,
            "room_name": rm.room_name,
            "building_code": rm.building_code,
            "rows": rm.rows,
            "cols": rm.cols,
            "room_accessible": rm.room_accessible,
            "effective_capacity": rm.effective_capacity(min_spacing),
            "seats": [asdict(s) for s in rm.seats],
        }
        for rm in room_maps
    ]
    assignments_serialized = [
        {
            "student_id": str(a.student_id),
            "external_id": a.external_id,
            "display_name": a.display_name,
            "course_code": a.course_code,
            "space_id": str(a.space_id),
            "room_id": slug_by_space_uuid.get(a.space_id, a.room_code),
            "room_code": a.room_code,
            "seat_id": a.seat_id,
            "seat_label": a.seat_label,
            "row": a.row,
            "col": a.col,
            "accessible": a.accessible,
            "front_row": a.front_row,
            "locked": a.locked,
        }
        for a in result.assignments
    ]

    status_map = {
        "OPTIMAL": "optimal",
        "FEASIBLE": "feasible",
        "HEURISTIC_FALLBACK": "heuristic",
    }
    plan_row = ExamPlan(
        campus_id=campus_id,
        term_id=term_id,
        title=title.strip(),
        starts_at=starts_at,
        ends_at=ends_at,
        seed=seed,
        status=status_map.get(result.status, "infeasible"),
        settings_json={
            "min_spacing": min_spacing,
            "prevent_same_course_adjacent": prevent_same_course_adjacent,
            "prevent_same_course_diagonal": prevent_same_course_diagonal,
            "seed": seed,
        },
        rooms_json=rooms_serialized,
        sessions_json=students_payload,
        assignments_json=assignments_serialized,
        locked_seats_json=locks,
        summary_json={
            "feasible": result.feasible,
            "solver_status": result.status,
            "explanation": result.explanation,
            "unassigned_student_ids": [str(uid) for uid in result.unassigned_student_ids],
            "metrics": result.metrics,
        },
        created_by=created_by,
        is_demo=is_demo,
    )
    session.add(plan_row)
    await session.flush()
    return plan_row, result


async def get_exam_plan(
    session: AsyncSession,
    plan_id: uuid.UUID,
) -> ExamPlan:
    plan = await session.get(ExamPlan, plan_id)
    if plan is None:
        raise NotFoundError(f"ExamPlan {plan_id} does not exist.", code="exam_plan_not_found")
    return plan


async def list_exam_plans(
    session: AsyncSession,
    *,
    campus_id: str | None = None,
    limit: int = 50,
) -> list[ExamPlan]:
    stmt = select(ExamPlan).order_by(ExamPlan.starts_at.desc()).limit(limit)
    if campus_id is not None:
        stmt = stmt.where(ExamPlan.campus_id == campus_id)
    return list((await session.execute(stmt)).scalars().all())


def _rehydrate_assignments_and_rooms(
    plan: ExamPlan,
) -> tuple[list[SeatAssignment], list[RoomSeatMap]]:
    assignments: list[SeatAssignment] = []
    for item in plan.assignments_json or []:
        assignments.append(
            SeatAssignment(
                student_id=uuid.UUID(str(item["student_id"])),
                external_id=str(item["external_id"]),
                display_name=str(item["display_name"]),
                course_code=str(item["course_code"]),
                space_id=uuid.UUID(str(item["space_id"])),
                room_code=str(item["room_code"]),
                seat_id=str(item["seat_id"]),
                seat_label=str(item["seat_label"]),
                row=int(item["row"]),
                col=int(item["col"]),
                accessible=bool(item.get("accessible", False)),
                front_row=bool(item.get("front_row", False)),
                locked=bool(item.get("locked", False)),
            )
        )
    rooms: list[RoomSeatMap] = []
    for r in plan.rooms_json or []:
        seats = tuple(
            SeatSpec(
                seat_id=str(s["seat_id"]),
                row=int(s["row"]),
                col=int(s["col"]),
                label=str(s["label"]),
                accessible=bool(s.get("accessible", False)),
                front_row=bool(s.get("front_row", False)),
                usable=bool(s.get("usable", True)),
            )
            for s in r.get("seats", [])
        )
        rooms.append(
            RoomSeatMap(
                space_id=uuid.UUID(str(r["space_id"])),
                room_code=str(r["room_code"]),
                room_name=str(r.get("room_name") or r["room_code"]),
                building_code=str(r.get("building_code") or "campus"),
                rows=int(r.get("rows", 1)),
                cols=int(r.get("cols", 1)),
                seats=seats,
                room_accessible=bool(r.get("room_accessible", True)),
            )
        )
    return assignments, rooms


async def export_exam_plan_csv_for_id(
    session: AsyncSession,
    plan_id: uuid.UUID,
    *,
    include_student_names: bool = False,
) -> str:
    plan = await get_exam_plan(session, plan_id)
    assignments, _ = _rehydrate_assignments_and_rooms(plan)
    return format_exam_plan_csv(assignments, include_student_names=include_student_names)


async def export_exam_plan_pdf_for_id(
    session: AsyncSession,
    plan_id: uuid.UUID,
    *,
    include_student_names: bool = False,
) -> bytes:
    plan = await get_exam_plan(session, plan_id)
    assignments, rooms = _rehydrate_assignments_and_rooms(plan)
    return render_exam_plan_pdf(
        assignments,
        rooms,
        exam_title=plan.title,
        starts_at_iso=plan.starts_at.isoformat(),
        include_student_names=include_student_names,
    )


async def get_exam_student_slips_for_id(
    session: AsyncSession,
    plan_id: uuid.UUID,
    *,
    include_student_names: bool = False,
    for_student_id: uuid.UUID | None = None,
) -> list[dict[str, object]]:
    plan = await get_exam_plan(session, plan_id)
    assignments, _ = _rehydrate_assignments_and_rooms(plan)
    return format_student_slips(
        assignments,
        exam_title=plan.title,
        starts_at_iso=plan.starts_at.isoformat(),
        include_student_names=include_student_names,
        for_student_id=for_student_id,
    )


# ===========================================================================
# §13.3 QR Attendance
# ===========================================================================


async def open_attendance_session(
    session: AsyncSession,
    *,
    teacher_user_id: uuid.UUID,
    meeting_id: uuid.UUID | None = None,
    room_id: str | None = None,
    token_step_seconds: int = 20,
    late_after_minutes: int = 30,
    expected_count: int | None = None,
    now: datetime | None = None,
    is_demo: bool = False,
) -> AttendanceSession:
    """Open an attendance session for a meeting or room (§13.3).

    Opening a session immediately emits a ``teacher_confirmation`` signal for the
    room and upgrades the meeting's room-state confirmation to ``confirmed``.
    """
    instant = now or datetime.now(UTC)
    if not (10 <= token_step_seconds <= 120):
        raise ValidationError(
            "token_step_seconds must be between 10 and 120.",
            code="invalid_token_step",
        )

    meeting: Meeting | None = None
    if meeting_id is not None:
        meeting = await session.get(Meeting, meeting_id)
        if meeting is None:
            raise NotFoundError(f"Meeting {meeting_id} does not exist.", code="meeting_not_found")
        if room_id is None:
            room_id = meeting.room_id

        # If an open session already exists for this meeting, return it idempotently
        existing = (
            await session.execute(
                select(AttendanceSession).where(AttendanceSession.meeting_id == meeting_id)
            )
        ).scalar_one_or_none()
        if existing is not None:
            if existing.closed_at is not None:
                existing.closed_at = None
                await session.flush()
            invalidate_state_cache()
            return existing

        if expected_count is None and meeting.rule_id is not None:
            rule = await session.get(MeetingRule, meeting.rule_id)
            if rule is not None:
                sec = await session.get(Section, rule.section_id)
                if sec is not None and sec.enrolled_count is not None:
                    expected_count = sec.enrolled_count

    att_session = AttendanceSession(
        meeting_id=meeting_id,
        room_id=room_id,
        opened_by=teacher_user_id,
        opened_at=instant,
        token_step_seconds=token_step_seconds,
        late_after_minutes=late_after_minutes,
        expected_count=expected_count,
        is_demo=is_demo,
    )
    session.add(att_session)
    await session.flush()

    if room_id is not None:
        session.add(
            Signal(
                signal_type=SignalType.teacher_confirmation,
                subject_type="room",
                subject_id=room_id,
                value=0.1,
                count=1,
                reliability=0.85,
                provenance=Provenance.confirmed,
                observed_at=instant,
                expires_at=instant + timedelta(minutes=90),
                source_ref=str(att_session.id),
                is_demo=is_demo,
            )
        )
        await session.flush()

    invalidate_state_cache()
    return att_session


async def get_current_qr_token(
    session: AsyncSession,
    session_id: uuid.UUID,
    *,
    now: datetime | None = None,
    include_svg: bool = True,
) -> dict[str, Any]:
    """Derive the current rotating HMAC-SHA256 QR token for an open session (§13.3)."""
    instant = now or datetime.now(UTC)
    att_session = await session.get(AttendanceSession, session_id)
    if att_session is None:
        raise NotFoundError(
            f"AttendanceSession {session_id} does not exist.",
            code="attendance_session_not_found",
        )
    if att_session.closed_at is not None:
        raise ValidationError(
            "Attendance session is closed.",
            code="attendance_session_closed",
        )

    secret = get_settings().jwt_secret.get_secret_value()
    token_obj = generate_rotating_qr_token(
        secret,
        att_session.id,
        instant,
        step_seconds=att_session.token_step_seconds,
    )
    payload_str = token_obj.qr_payload
    result: dict[str, Any] = {
        "session_id": str(att_session.id),
        "token": token_obj.token,
        "window_index": token_obj.window,
        "step_seconds": att_session.token_step_seconds,
        "valid_from": token_obj.valid_from.isoformat(),
        "valid_until": token_obj.expires_at.isoformat(),
        "qr_payload": payload_str,
    }
    if include_svg:
        result["qr_svg"] = render_qr_svg(payload_str)
    return result


async def scan_attendance_qr(
    session: AsyncSession,
    *,
    session_id: uuid.UUID,
    student_user_id: uuid.UUID,
    token: str,
    raw_device_id: str | None = None,
    student_lat: float | None = None,
    student_lon: float | None = None,
    room_lat: float | None = None,
    room_lon: float | None = None,
    geofence_enabled: bool = False,
    geofence_radius_m: float = 50.0,
    now: datetime | None = None,
) -> tuple[AttendanceRecord, ScanClassification]:
    """Process a student's QR attendance scan (§13.3)."""
    instant = now or datetime.now(UTC)
    att_session = await session.get(AttendanceSession, session_id)
    if att_session is None:
        raise NotFoundError(
            f"AttendanceSession {session_id} does not exist.",
            code="attendance_session_not_found",
        )

    if att_session.closed_at is not None:
        raise ValidationError(
            "Attendance session is closed.",
            code="invalid_attendance_scan",
            details={"status": "rejected", "reason": "session_closed"},
        )

    secret = get_settings().jwt_secret.get_secret_value()
    verification = verify_rotating_qr_token(
        secret,
        att_session.id,
        token,
        instant,
        step_seconds=att_session.token_step_seconds,
    )

    if not verification.valid:
        raise ValidationError(
            verification.reason or "Invalid or expired QR attendance token.",
            code="invalid_attendance_scan",
            details={"status": "rejected", "reason": verification.reason},
        )

    # Check duplicate scan before classifying
    existing_rec = (
        await session.execute(
            select(AttendanceRecord).where(
                AttendanceRecord.session_id == session_id,
                AttendanceRecord.user_id == student_user_id,
            )
        )
    ).scalar_one_or_none()
    if existing_rec is not None:
        raise ConflictError(
            "Student has already scanned into this attendance session.",
            code="duplicate_attendance_scan",
            details={"record_id": str(existing_rec.id), "state": existing_rec.state},
        )

    # Check section enrolment if linked to a meeting with a section
    is_enrolled = True
    if att_session.meeting_id is not None:
        meeting = await session.get(Meeting, att_session.meeting_id)
        if meeting is not None and meeting.rule_id is not None:
            rule = await session.get(MeetingRule, meeting.rule_id)
            if rule is not None:
                total_enrolled_in_sec = await session.scalar(
                    select(func.count(EnrollmentRef.id)).where(
                        EnrollmentRef.section_id == rule.section_id
                    )
                )
                if (total_enrolled_in_sec or 0) > 0:
                    match = (
                        await session.execute(
                            select(EnrollmentRef.id).where(
                                EnrollmentRef.section_id == rule.section_id,
                                EnrollmentRef.user_id == student_user_id,
                            )
                        )
                    ).scalar_one_or_none()
                    is_enrolled = match is not None

    # Soft device binding (hash only)
    device_hash: str | None = None
    bound_hash: str | None = None
    if raw_device_id:
        device_hash = hash_device_identifier(raw_device_id, salt=secret)
        device_row = await session.get(UserDevice, student_user_id)
        if device_row is None:
            session.add(
                UserDevice(
                    user_id=student_user_id,
                    device_ref=device_hash,
                    registered_at=instant,
                )
            )
            await session.flush()
            bound_hash = device_hash
        else:
            bound_hash = device_row.device_ref

    # Default Ajou University in Tashkent campus coordinates when geofence is enabled
    target_lat_lon: tuple[float, float] | None = None
    scan_lat_lon: tuple[float, float] | None = None
    if geofence_enabled and student_lat is not None and student_lon is not None:
        scan_lat_lon = (student_lat, student_lon)
        target_lat_lon = (
            room_lat if room_lat is not None else 41.2995,
            room_lon if room_lon is not None else 69.2401,
        )

    outcome = classify_attendance_scan(
        opened_at=att_session.opened_at,
        scanned_at=instant,
        late_after_minutes=att_session.late_after_minutes,
        is_enrolled=is_enrolled,
        registered_device_ref=bound_hash,
        scanned_device_ref=device_hash,
        geofence_enabled=geofence_enabled,
        geofence_radius_m=geofence_radius_m,
        room_lat_lon=target_lat_lon,
        scan_lat_lon=scan_lat_lon,
    )

    record = AttendanceRecord(
        session_id=att_session.id,
        user_id=student_user_id,
        state=outcome.state,
        scanned_at=instant,
        device_ref=device_hash,
        review_reason=outcome.review_reason,
        is_demo=att_session.is_demo,
    )
    try:
        async with session.begin_nested():
            session.add(record)
            await session.flush()
    except IntegrityError as exc:
        raise ConflictError(
            "Student has already scanned into this attendance session.",
            code="duplicate_attendance_scan",
        ) from exc

    # Feed live room occupancy estimation (`Signal(checkin)` + `OccupancyEstimate`)
    if att_session.room_id is not None:
        await _update_room_occupancy_from_attendance(
            session,
            att_session=att_session,
            instant=instant,
            matched_window_offset=verification.window_offset,
        )

    return record, outcome


async def _update_room_occupancy_from_attendance(
    session: AsyncSession,
    *,
    att_session: AttendanceSession,
    instant: datetime,
    matched_window_offset: int | None = None,
) -> None:
    """Emit a ``checkin`` Signal and persist a fresh ``OccupancyEstimate``."""
    room_id = att_session.room_id
    if room_id is None:
        return
    room = await session.get(Room, room_id)
    capacity = max(1, (room.capacity if room and room.capacity else None) or 30)

    confirmed_count = int(
        (
            await session.scalar(
                select(func.count(AttendanceRecord.id)).where(
                    AttendanceRecord.session_id == att_session.id,
                    AttendanceRecord.state.in_(("present", "late", "guest")),
                )
            )
        )
        or 0
    )

    fraction = min(5.0, round(confirmed_count / capacity, 4))
    sig = Signal(
        signal_type=SignalType.checkin,
        subject_type="room",
        subject_id=room_id,
        value=fraction,
        count=confirmed_count,
        reliability=0.95,
        provenance=Provenance.confirmed,
        observed_at=instant,
        expires_at=instant + timedelta(minutes=75),
        source_ref=str(att_session.id),
        payload={"window_offset": matched_window_offset},
        is_demo=att_session.is_demo,
    )
    session.add(sig)
    await session.flush()

    est = estimate_occupancy(
        at=instant,
        capacity=capacity,
        prior_fraction=(
            min(1.0, (att_session.expected_count or confirmed_count) / capacity)
            if att_session.expected_count
            else None
        ),
        signals=[
            SignalInput(
                signal_type=SignalType.checkin,
                value=fraction,
                observed_at=instant,
                reliability=0.95,
                count=confirmed_count,
                ref=str(sig.id),
            )
        ],
        meeting_scheduled=att_session.meeting_id is not None,
    )
    session.add(
        OccupancyEstimate(
            subject_type="room",
            subject_id=room_id,
            at=instant,
            fraction=est.fraction,
            headcount_low=est.headcount_low,
            headcount_likely=est.headcount_likely,
            headcount_high=est.headcount_high,
            confidence=est.confidence,
            provenance=Provenance.confirmed,
            confirmation=ConfirmationState.confirmed,
            inputs={"signals": list(est.inputs), "checked_in_count": confirmed_count},
            is_demo=att_session.is_demo,
        )
    )
    await session.flush()
    invalidate_state_cache()


async def review_attendance_record(
    session: AsyncSession,
    *,
    record_id: uuid.UUID,
    decision: str,
    note: str | None = None,
) -> AttendanceRecord:
    """Allow a teacher to approve (`present`/`late`) or reject (`rejected`) a `pending_review` scan."""
    if decision not in {"present", "late", "rejected"}:
        raise ValidationError(
            "Decision must be 'present', 'late', or 'rejected'.",
            code="invalid_review_decision",
        )
    record = await session.get(AttendanceRecord, record_id)
    if record is None:
        raise NotFoundError(
            f"AttendanceRecord {record_id} does not exist.",
            code="attendance_record_not_found",
        )
    record.state = decision
    if note:
        record.review_reason = note
    await session.flush()
    return record


async def close_attendance_session(
    session: AsyncSession,
    *,
    session_id: uuid.UUID,
    timezone: ZoneInfo | None = None,
    now: datetime | None = None,
) -> tuple[AttendanceSession, AttendanceRate | None]:
    """Close an attendance session and fold headcount into ``AttendanceRate`` (§13.3).

    Updates the Beta-Binomial posterior ``AttendanceRate(section_id, weekday, hour)``
    via :func:`app.engines.evidence.update_attendance_prior`.
    """
    instant = now or datetime.now(UTC)
    tz = timezone or get_settings().timezone
    att_session = await session.get(AttendanceSession, session_id)
    if att_session is None:
        raise NotFoundError(
            f"AttendanceSession {session_id} does not exist.",
            code="attendance_session_not_found",
        )

    att_session.closed_at = instant
    await session.flush()

    # Count enrolled attendees (present + late)
    attended_count = int(
        (
            await session.scalar(
                select(func.count(AttendanceRecord.id)).where(
                    AttendanceRecord.session_id == att_session.id,
                    AttendanceRecord.state.in_(("present", "late")),
                )
            )
        )
        or 0
    )

    rate_row: AttendanceRate | None = None
    if att_session.meeting_id is not None:
        meeting = await session.get(Meeting, att_session.meeting_id)
        if meeting is not None and meeting.rule_id is not None:
            rule = await session.get(MeetingRule, meeting.rule_id)
            if rule is not None:
                sec = await session.get(Section, rule.section_id)
                if sec is not None:
                    enrolled = max(
                        attended_count,
                        sec.enrolled_count or att_session.expected_count or max(1, attended_count),
                    )
                    local_start = meeting.starts_at.astimezone(tz)
                    weekday = local_start.weekday()
                    hour = local_start.hour

                    rate_row = await session.get(
                        AttendanceRate, (sec.id, weekday, hour)
                    )
                    current_prior = (
                        AttendancePrior(
                            alpha=rate_row.alpha,
                            beta=rate_row.beta,
                            observations=rate_row.observations,
                        )
                        if rate_row is not None
                        else AttendancePrior.from_default()
                    )
                    updated_prior = update_attendance_prior(
                        current_prior,
                        attended=attended_count,
                        enrolled=enrolled,
                    )
                    if rate_row is None:
                        rate_row = AttendanceRate(
                            section_id=sec.id,
                            weekday=weekday,
                            hour=hour,
                            alpha=updated_prior.alpha,
                            beta=updated_prior.beta,
                            observations=updated_prior.observations,
                            is_demo=att_session.is_demo,
                        )
                        session.add(rate_row)
                    else:
                        rate_row.alpha = updated_prior.alpha
                        rate_row.beta = updated_prior.beta
                        rate_row.observations = updated_prior.observations
                    await session.flush()

    return att_session, rate_row


async def get_attendance_session_summary(
    session: AsyncSession,
    session_id: uuid.UUID,
) -> dict[str, Any]:
    """Return an attendance session and its scan breakdown."""
    att_session = await session.get(AttendanceSession, session_id)
    if att_session is None:
        raise NotFoundError(
            f"AttendanceSession {session_id} does not exist.",
            code="attendance_session_not_found",
        )
    records = (
        await session.execute(
            select(AttendanceRecord)
            .where(AttendanceRecord.session_id == session_id)
            .order_by(AttendanceRecord.scanned_at.asc())
        )
    ).scalars().all()

    counts: dict[str, int] = {
        "present": 0,
        "late": 0,
        "pending_review": 0,
        "guest": 0,
        "rejected": 0,
    }
    for r in records:
        counts[r.state] = counts.get(r.state, 0) + 1

    return {
        "id": str(att_session.id),
        "meeting_id": str(att_session.meeting_id) if att_session.meeting_id else None,
        "room_id": att_session.room_id,
        "opened_by": str(att_session.opened_by) if att_session.opened_by else None,
        "opened_at": att_session.opened_at.isoformat(),
        "closed_at": att_session.closed_at.isoformat() if att_session.closed_at else None,
        "token_step_seconds": att_session.token_step_seconds,
        "late_after_minutes": att_session.late_after_minutes,
        "expected_count": att_session.expected_count,
        "counts": counts,
        "total_scans": len(records),
        "records": [
            {
                "id": str(r.id),
                "user_id": str(r.user_id) if r.user_id else None,
                "state": r.state,
                "scanned_at": r.scanned_at.isoformat(),
                "review_reason": r.review_reason,
            }
            for r in records
        ],
    }


# ===========================================================================
# §13.4 Timetable Optimiser & Scenario Engine (§6.2)
# ===========================================================================


async def run_timetable_optimisation_scenario(
    session: AsyncSession,
    *,
    campus_id: str,
    name: str,
    description: str | None = None,
    term_id: uuid.UUID | None = None,
    incremental_mode: bool = False,
    movable_lecture_ids: list[uuid.UUID] | None = None,
    blocked_room_ids: list[str] | None = None,
    hard_capacity: bool = True,
    seed: int = 42,
    lectures_override: list[dict[str, Any]] | None = None,
    rooms_override: list[dict[str, Any]] | None = None,
    created_by: uuid.UUID | None = None,
    is_demo: bool = False,
) -> tuple[Scenario, OptimiserResult]:
    """Run the CP-SAT timetable optimiser inside a copy-on-write Scenario (§6.2, §13.4).

    Never mutates ``Meeting`` or ``MeetingRule`` rows.
    """
    slug_by_space_uuid: dict[uuid.UUID, str] = {}
    space_uuid_by_slug: dict[str, uuid.UUID] = {}

    room_inputs: list[OptimiserRoomInput] = []
    if rooms_override is not None:
        for r_item in rooms_override:
            r_slug = str(r_item["room_id"])
            s_uuid = _slug_uuid(r_slug)
            b_slug = str(r_item.get("building_id") or "bld-a")
            b_uuid = _slug_uuid(b_slug)
            slug_by_space_uuid[s_uuid] = r_slug
            space_uuid_by_slug[r_slug] = s_uuid
            room_inputs.append(
                OptimiserRoomInput(
                    space_id=s_uuid,
                    room_code=r_slug,
                    building_id=b_uuid,
                    building_code=b_slug,
                    capacity=max(1, int(r_item.get("capacity", 30))),
                    kind=str(r_item.get("kind", "classroom")),
                    accessible=bool(r_item.get("accessible", True)),
                    features=frozenset(r_item.get("features", [])),
                    unavailable_periods=frozenset(
                        (int(p[0]), int(p[1])) for p in r_item.get("unavailable_periods", [])
                    ),
                )
            )
    else:
        db_rooms = (
            await session.execute(
                select(Room, Floor.building_id)
                .join(Floor, Floor.id == Room.floor_id)
                .where(Room.out_of_service.is_(False))
                .order_by(Room.id.asc())
                .limit(60)
            )
        ).all()
        for rm, bld_id in db_rooms:
            s_uuid = _slug_uuid(rm.id)
            b_uuid = _slug_uuid(bld_id)
            slug_by_space_uuid[s_uuid] = rm.id
            space_uuid_by_slug[rm.id] = s_uuid
            room_inputs.append(
                OptimiserRoomInput(
                    space_id=s_uuid,
                    room_code=rm.id,
                    building_id=b_uuid,
                    building_code=bld_id,
                    capacity=max(1, rm.capacity or 30),
                    kind=rm.room_kind.value if rm.room_kind else "classroom",
                    accessible=bool(rm.accessible if rm.accessible is not None else True),
                    features=frozenset((rm.features or {}).keys()),
                )
            )

    lecture_inputs: list[LectureInput] = []
    section_by_lecture_id: dict[uuid.UUID, tuple[uuid.UUID | None, str | None]] = {}

    if lectures_override is not None:
        for idx, l_item in enumerate(lectures_override):
            lid = (
                uuid.UUID(str(l_item["lecture_id"]))
                if l_item.get("lecture_id")
                else uuid.uuid5(uuid.NAMESPACE_OID, f"opt-lecture:{idx}:{l_item.get('course_code')}")
            )
            cid = (
                uuid.UUID(str(l_item["course_id"]))
                if l_item.get("course_id")
                else uuid.uuid5(uuid.NAMESPACE_OID, f"opt-course:{l_item.get('course_code', idx)}")
            )
            cur_room_slug = l_item.get("current_room_id")
            cur_space_uuid = (
                space_uuid_by_slug.get(str(cur_room_slug), _slug_uuid(str(cur_room_slug)))
                if cur_room_slug
                else None
            )
            cohorts = frozenset(
                _slug_uuid(str(c)) for c in l_item.get("cohorts", [l_item.get("cohort", "DEFAULT")]) if c
            )
            t_ref = l_item.get("teacher_id")
            t_uuid = _slug_uuid(str(t_ref)) if t_ref else None
            section_by_lecture_id[lid] = (None, str(l_item.get("section_code") or "S1"))
            lecture_inputs.append(
                LectureInput(
                    lecture_id=lid,
                    course_id=cid,
                    course_code=str(l_item.get("course_code") or f"COURSE-{idx + 1}"),
                    cohort_ids=cohorts,
                    teacher_id=t_uuid,
                    expected_attendance=max(1, int(l_item.get("expected_attendance", 20))),
                    required_room_kind=l_item.get("required_room_kind"),
                    required_features=frozenset(l_item.get("required_features", [])),
                    requires_step_free=bool(l_item.get("requires_step_free", False)),
                    min_working_days=int(l_item.get("min_working_days", 1)),
                    current_space_id=cur_space_uuid,
                    current_day=(
                        int(l_item["current_day"])
                        if l_item.get("current_day") is not None
                        else None
                    ),
                    current_slot=(
                        int(l_item["current_slot"])
                        if l_item.get("current_slot") is not None
                        else None
                    ),
                    locked=bool(l_item.get("locked", False)),
                    teacher_unavailable_periods=frozenset(
                        (int(p[0]), int(p[1]))
                        for p in l_item.get("teacher_unavailable_periods", [])
                    ),
                )
            )
    else:
        stmt = (
            select(MeetingRule, Section, Course)
            .join(Section, Section.id == MeetingRule.section_id)
            .join(Course, Course.id == Section.course_id)
            .order_by(Course.code.asc(), Section.code.asc())
            .limit(40)
        )
        if term_id is not None:
            stmt = stmt.where(Section.term_id == term_id)
        rows = (await session.execute(stmt)).all()
        weekday_map = {"MO": 0, "TU": 1, "WE": 2, "TH": 3, "FR": 4}
        for idx, (rule, sec, course) in enumerate(rows):
            cur_space = (
                space_uuid_by_slug.get(rule.room_id, _slug_uuid(rule.room_id))
                if rule.room_id
                else None
            )
            cur_day = idx % 5
            for token, day_num in weekday_map.items():
                if f"BYDAY={token}" in (rule.rrule or ""):
                    cur_day = day_num
                    break
            cur_slot = idx % 6
            section_by_lecture_id[rule.id] = (sec.id, sec.code)
            lecture_inputs.append(
                LectureInput(
                    lecture_id=rule.id,
                    course_id=course.id,
                    course_code=course.code,
                    cohort_ids=(
                        frozenset({_slug_uuid(sec.cohort)})
                        if sec.cohort
                        else frozenset()
                    ),
                    teacher_id=(
                        sec.teacher_user_id
                        or (_slug_uuid(sec.teacher_ref) if sec.teacher_ref else None)
                    ),
                    expected_attendance=max(1, sec.enrolled_count or 20),
                    requires_step_free=bool(sec.requires_step_free),
                    current_space_id=cur_space,
                    current_day=cur_day,
                    current_slot=cur_slot,
                )
            )

    blocked_uuids = frozenset(
        space_uuid_by_slug.get(rid, _slug_uuid(rid))
        for rid in (blocked_room_ids or [])
    )
    movable_set = (
        frozenset(movable_lecture_ids) if movable_lecture_ids is not None else None
    )
    cfg = OptimiserConfig(
        hard_capacity=hard_capacity,
        incremental_mode=incremental_mode,
        movable_lecture_ids=movable_set,
        blocked_space_ids=blocked_uuids,
        seed=seed,
    )
    opt_result = optimise_timetable(lecture_inputs, room_inputs, config=cfg)

    scenario = Scenario(
        campus_id=campus_id,
        term_id=term_id,
        name=name.strip(),
        description=description,
        kind="timetable_optimiser",
        status=ScenarioStatus.proposed if opt_result.feasible else ScenarioStatus.draft,
        solver_status=opt_result.status.lower(),
        baseline_metrics=asdict(opt_result.before_metrics),
        proposal_metrics=asdict(opt_result.after_metrics),
        tradeoffs_summary=opt_result.summary + " " + " ".join(opt_result.tradeoffs),
        parameters_json={
            "incremental_mode": incremental_mode,
            "blocked_room_ids": blocked_room_ids or [],
            "hard_capacity": hard_capacity,
            "seed": seed,
        },
        created_by=created_by,
        is_demo=is_demo,
    )
    session.add(scenario)
    await session.flush()

    valid_db_rooms = set(
        (await session.execute(select(Room.id))).scalars().all()
    )
    for diff in opt_result.diffs:
        if diff.change_kind == "unchanged":
            continue
        sec_id, sec_code = section_by_lecture_id.get(diff.lecture_id, (None, None))
        old_slug = (
            slug_by_space_uuid.get(diff.before_space_id, diff.before_room_code)
            if diff.before_space_id
            else diff.before_room_code
        )
        new_slug = slug_by_space_uuid.get(diff.after_space_id, diff.after_room_code)
        session.add(
            ScenarioChange(
                scenario_id=scenario.id,
                change_type=diff.change_kind,
                section_id=sec_id,
                meeting_id=None,
                course_code=diff.course_code,
                section_code=sec_code,
                old_room_id=old_slug if old_slug in valid_db_rooms else None,
                new_room_id=new_slug if new_slug in valid_db_rooms else None,
                old_weekday=diff.before_day,
                new_weekday=diff.after_day,
                old_period=diff.before_slot,
                new_period=diff.after_slot,
                reason=diff.reason,
                payload={
                    "lecture_id": str(diff.lecture_id),
                    "before_room_code": old_slug,
                    "after_room_code": new_slug,
                },
            )
        )
    await session.flush()
    return scenario, opt_result


async def get_scenario_with_changes(
    session: AsyncSession,
    scenario_id: uuid.UUID,
) -> Scenario:
    stmt = (
        select(Scenario)
        .options(selectinload(Scenario.changes))
        .where(Scenario.id == scenario_id)
    )
    scenario = (await session.execute(stmt)).scalar_one_or_none()
    if scenario is None:
        raise NotFoundError(f"Scenario {scenario_id} does not exist.", code="scenario_not_found")
    return scenario


async def list_scenarios(
    session: AsyncSession,
    *,
    campus_id: str | None = None,
    limit: int = 50,
) -> list[Scenario]:
    stmt = (
        select(Scenario)
        .options(selectinload(Scenario.changes))
        .order_by(Scenario.created_at.desc())
        .limit(limit)
    )
    if campus_id is not None:
        stmt = stmt.where(Scenario.campus_id == campus_id)
    return list((await session.execute(stmt)).scalars().all())


async def approve_scenario(
    session: AsyncSession,
    *,
    scenario_id: uuid.UUID,
    approver_user_id: uuid.UUID,
    now: datetime | None = None,
) -> Scenario:
    """Mark a proposed scenario as ``approved`` without automatically mutating live meetings."""
    instant = now or datetime.now(UTC)
    scenario = await get_scenario_with_changes(session, scenario_id)
    scenario.status = ScenarioStatus.approved
    scenario.approved_by = approver_user_id
    scenario.approved_at = instant
    await session.flush()
    return scenario
