"""Layer 3 Academic Operations & Scenario Engine API (Phase 4 §6.2, §13.1-§13.4).

Endpoints:
* Lab & Equipment Booking Extensions (§13.1):
  - ``POST /academic/capabilities`` — grant a safety certification / prerequisite
  - ``GET /academic/capabilities/{user_id}`` — list capabilities held by a user
  - ``DELETE /academic/capabilities/{user_id}/{capability}`` — revoke a capability
  - ``POST /academic/resources/{resource_id}/blackouts`` — create a maintenance blackout
  - ``GET /academic/resources/{resource_id}/usage-logs`` — list resource usage logs
  - ``GET /academic/resources/{resource_id}/calendar.ics`` — RFC 5545 iCalendar feed
  - ``POST /academic/bookings/{booking_id}/approve`` — approve a pending lab booking
  - ``POST /academic/bookings/{booking_id}/reject`` — reject a pending lab booking
* Exam Seat Planner (§13.2):
  - ``POST /academic/exams/plans`` — generate an exam seat plan via OR-Tools CP-SAT
  - ``GET /academic/exams/plans`` — list exam seat plans
  - ``GET /academic/exams/plans/{plan_id}`` — get exam seat plan JSON
  - ``GET /academic/exams/plans/{plan_id}/export.csv`` — CSV export
  - ``GET /academic/exams/plans/{plan_id}/export.pdf`` — printable PDF seat map & list
  - ``GET /academic/exams/plans/{plan_id}/slips`` — per-student seat lookup slips
* QR Attendance (§13.3):
  - ``POST /academic/attendance/sessions`` — open a teacher attendance session
  - ``GET /academic/attendance/sessions/{session_id}`` — get session summary & scans
  - ``GET /academic/attendance/sessions/{session_id}/qr`` — get current rotating QR token
  - ``POST /academic/attendance/sessions/{session_id}/scan`` — student QR check-in
  - ``PATCH /academic/attendance/records/{record_id}/review`` — teacher review of pending scan
  - ``POST /academic/attendance/sessions/{session_id}/close`` — close session & update posterior
* Timetable Optimiser & Scenarios (§6.2, §13.4):
  - ``POST /academic/scenarios/optimise`` — run CP-SAT timetable optimiser in a Scenario
  - ``GET /academic/scenarios`` — list scenarios
  - ``GET /academic/scenarios/{scenario_id}`` — get scenario diff, metrics & trade-offs
  - ``POST /academic/scenarios/{scenario_id}/approve`` — approve a proposed scenario
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Response, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.busyness import ensure_principal_user
from app.core.db import get_session
from app.core.errors import PermissionDeniedError
from app.core.security import CurrentPrincipal, Role
from app.domain.academic import ExamPlan
from app.domain.platform import Scenario
from app.services import academic_service, booking_service

router = APIRouter(prefix="/academic", tags=["academic"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------


class CapabilityGrantIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_id: uuid.UUID
    capability: str = Field(min_length=1, max_length=64)
    expires_at: datetime | None = None
    notes: str | None = Field(default=None, max_length=1000)


class ResourceBlackoutIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    starts_at: datetime
    ends_at: datetime
    reason: str = Field(default="Scheduled maintenance", max_length=300)


class BookingRejectIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: str | None = Field(default=None, max_length=500)


class ExamPlanCreateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    campus_id: str = Field(default="ajou-tashkent", min_length=1, max_length=64)
    term_id: uuid.UUID | None = None
    title: str = Field(min_length=1, max_length=200)
    starts_at: datetime
    ends_at: datetime
    room_ids: list[str] = Field(min_length=1)
    students: list[dict[str, Any]] = Field(default_factory=list)
    min_spacing: int = Field(default=2, ge=1, le=5)
    prevent_same_course_adjacent: bool = True
    prevent_same_course_diagonal: bool = True
    seed: int = 42
    locked_seats: dict[str, dict[str, str]] | None = None


class AttendanceSessionOpenIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    meeting_id: uuid.UUID | None = None
    room_id: str | None = None
    token_step_seconds: int = Field(default=20, ge=10, le=120)
    late_after_minutes: int = Field(default=30, ge=1, le=180)
    expected_count: int | None = Field(default=None, ge=1, le=2000)


class AttendanceScanIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    token: str = Field(min_length=6, max_length=64)
    device_id: str | None = Field(default=None, max_length=256)
    latitude: float | None = Field(default=None, ge=-90.0, le=90.0)
    longitude: float | None = Field(default=None, ge=-180.0, le=180.0)
    geofence_enabled: bool = False
    geofence_radius_m: float = Field(default=50.0, ge=10.0, le=1000.0)


class AttendanceReviewIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    decision: str = Field(pattern="^(present|late|rejected)$")
    note: str | None = Field(default=None, max_length=500)


class TimetableOptimiseIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    campus_id: str = Field(default="ajou-tashkent", min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    term_id: uuid.UUID | None = None
    incremental_mode: bool = False
    movable_lecture_ids: list[uuid.UUID] | None = None
    blocked_room_ids: list[str] | None = None
    hard_capacity: bool = True
    seed: int = 42
    lectures: list[dict[str, Any]] | None = None
    rooms: list[dict[str, Any]] | None = None


# ---------------------------------------------------------------------------
# §13.1 Lab & Equipment Booking Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/capabilities",
    status_code=status.HTTP_201_CREATED,
    summary="Grant a safety certification or prerequisite capability (§13.1)",
)
async def grant_capability(
    body: CapabilityGrantIn,
    session: SessionDep,
    principal: CurrentPrincipal,
) -> dict[str, Any]:
    if not principal.has_role(Role.admin, Role.staff, Role.teacher, Role.facilities):
        raise PermissionDeniedError(
            "Only teachers, staff, facilities, or admins may grant capabilities.",
            code="capability_grant_forbidden",
        )
    actor_id = await ensure_principal_user(session, principal)
    cap = await academic_service.grant_user_capability(
        session,
        user_id=body.user_id,
        capability=body.capability,
        granted_by=actor_id,
        expires_at=body.expires_at,
        notes=body.notes,
    )
    await session.commit()
    return {
        "id": str(cap.id),
        "user_id": str(cap.user_id),
        "capability": cap.capability,
        "granted_by": str(cap.granted_by) if cap.granted_by else None,
        "granted_at": cap.granted_at.isoformat(),
        "expires_at": cap.expires_at.isoformat() if cap.expires_at else None,
        "notes": cap.notes,
    }


@router.get(
    "/capabilities/{user_id}",
    summary="List capabilities held by a user (§13.1)",
)
async def list_capabilities(
    user_id: uuid.UUID,
    session: SessionDep,
    principal: CurrentPrincipal,
) -> dict[str, Any]:
    _ = await ensure_principal_user(session, principal)
    rows = await academic_service.list_user_capabilities(session, user_id)
    return {
        "user_id": str(user_id),
        "capabilities": [
            {
                "id": str(r.id),
                "capability": r.capability,
                "granted_at": r.granted_at.isoformat(),
                "expires_at": r.expires_at.isoformat() if r.expires_at else None,
                "notes": r.notes,
            }
            for r in rows
        ],
    }


@router.delete(
    "/capabilities/{user_id}/{capability}",
    summary="Revoke a capability from a user (§13.1)",
)
async def revoke_capability(
    user_id: uuid.UUID,
    capability: str,
    session: SessionDep,
    principal: CurrentPrincipal,
) -> dict[str, Any]:
    if not principal.has_role(Role.admin, Role.staff, Role.teacher, Role.facilities):
        raise PermissionDeniedError(
            "Only teachers, staff, facilities, or admins may revoke capabilities.",
            code="capability_revoke_forbidden",
        )
    removed = await academic_service.revoke_user_capability(
        session, user_id=user_id, capability=capability
    )
    await session.commit()
    return {"revoked": removed, "user_id": str(user_id), "capability": capability}


@router.post(
    "/resources/{resource_id}/blackouts",
    status_code=status.HTTP_201_CREATED,
    summary="Create a maintenance blackout window for a resource (§13.1)",
)
async def create_blackout(
    resource_id: uuid.UUID,
    body: ResourceBlackoutIn,
    session: SessionDep,
    principal: CurrentPrincipal,
) -> dict[str, Any]:
    if not principal.has_role(Role.admin, Role.staff, Role.facilities, Role.teacher):
        raise PermissionDeniedError(
            "Only staff, teachers, facilities, or admins may create resource blackouts.",
            code="blackout_forbidden",
        )
    actor_id = await ensure_principal_user(session, principal)
    row = await academic_service.create_resource_blackout(
        session,
        resource_id=resource_id,
        starts_at=body.starts_at,
        ends_at=body.ends_at,
        reason=body.reason,
        created_by=actor_id,
    )
    await session.commit()
    return {
        "id": str(row.id),
        "resource_id": str(row.resource_id),
        "starts_at": row.starts_at.isoformat(),
        "ends_at": row.ends_at.isoformat(),
        "reason": row.reason,
    }


@router.get(
    "/resources/{resource_id}/usage-logs",
    summary="List usage logs for a lab or equipment resource (§13.1)",
)
async def get_resource_usage_logs(
    resource_id: uuid.UUID,
    session: SessionDep,
    principal: CurrentPrincipal,
) -> dict[str, Any]:
    _ = await ensure_principal_user(session, principal)
    logs = await academic_service.list_resource_usage_logs(session, resource_id)
    return {"resource_id": str(resource_id), "count": len(logs), "logs": logs}


@router.get(
    "/resources/{resource_id}/calendar.ics",
    summary="Export RFC 5545 iCalendar feed for a resource (§13.1)",
)
async def get_resource_ical(
    resource_id: uuid.UUID,
    session: SessionDep,
) -> Response:
    ics_body = await academic_service.export_resource_ical(session, resource_id)
    return Response(
        content=ics_body,
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="resource-{resource_id}.ics"'},
    )


@router.post(
    "/bookings/{booking_id}/approve",
    summary="Approve a pending lab or equipment booking (§13.1)",
)
async def approve_lab_booking(
    booking_id: uuid.UUID,
    session: SessionDep,
    principal: CurrentPrincipal,
) -> dict[str, Any]:
    if not principal.has_role(Role.admin, Role.staff, Role.teacher, Role.facilities):
        raise PermissionDeniedError(
            "Only staff, teachers, facilities, or admins may approve bookings.",
            code="booking_approval_forbidden",
        )
    actor_id = await ensure_principal_user(session, principal)
    booking = await booking_service.approve_booking(
        session, booking_id, approver_id=actor_id
    )
    await session.commit()
    return {
        "id": str(booking.id),
        "resource_id": str(booking.resource_id),
        "status": booking.status.value,
        "approved_by_id": str(booking.approved_by) if booking.approved_by else None,
    }


@router.post(
    "/bookings/{booking_id}/reject",
    summary="Reject a pending lab or equipment booking (§13.1)",
)
async def reject_lab_booking(
    booking_id: uuid.UUID,
    body: BookingRejectIn,
    session: SessionDep,
    principal: CurrentPrincipal,
) -> dict[str, Any]:
    if not principal.has_role(Role.admin, Role.staff, Role.teacher, Role.facilities):
        raise PermissionDeniedError(
            "Only staff, teachers, facilities, or admins may reject bookings.",
            code="booking_rejection_forbidden",
        )
    actor_id = await ensure_principal_user(session, principal)
    booking = await booking_service.reject_booking(
        session, booking_id, approver_id=actor_id, reason=body.reason
    )
    await session.commit()
    return {
        "id": str(booking.id),
        "resource_id": str(booking.resource_id),
        "status": booking.status.value,
    }


# ---------------------------------------------------------------------------
# §13.2 Exam Seat Planner Endpoints
# ---------------------------------------------------------------------------


def _serialize_exam_plan(plan: ExamPlan, *, include_names: bool = False) -> dict[str, Any]:
    assignments = list(plan.assignments_json or [])
    if not include_names:
        assignments = [
            {k: v for k, v in a.items() if k != "display_name"}
            for a in assignments
        ]
    return {
        "id": str(plan.id),
        "campus_id": plan.campus_id,
        "term_id": str(plan.term_id) if plan.term_id else None,
        "title": plan.title,
        "starts_at": plan.starts_at.isoformat(),
        "ends_at": plan.ends_at.isoformat(),
        "seed": plan.seed,
        "status": plan.status,
        "settings": plan.settings_json,
        "rooms": plan.rooms_json,
        "assignments": assignments,
        "locked_seats": plan.locked_seats_json,
        "summary": plan.summary_json,
    }


@router.post(
    "/exams/plans",
    status_code=status.HTTP_201_CREATED,
    summary="Generate an exam seat plan via OR-Tools CP-SAT (§13.2)",
)
async def create_exam_plan(
    body: ExamPlanCreateIn,
    session: SessionDep,
    principal: CurrentPrincipal,
) -> dict[str, Any]:
    if not principal.has_role(Role.admin, Role.staff, Role.teacher):
        raise PermissionDeniedError(
            "Only exam officers, teachers, staff, or admins may generate exam seat plans.",
            code="exam_plan_forbidden",
        )
    actor_id = await ensure_principal_user(session, principal)
    plan, _ = await academic_service.generate_exam_plan(
        session,
        campus_id=body.campus_id,
        term_id=body.term_id,
        title=body.title,
        starts_at=body.starts_at,
        ends_at=body.ends_at,
        room_ids=body.room_ids,
        students_payload=body.students,
        min_spacing=body.min_spacing,
        prevent_same_course_adjacent=body.prevent_same_course_adjacent,
        prevent_same_course_diagonal=body.prevent_same_course_diagonal,
        seed=body.seed,
        locked_seats=body.locked_seats,
        created_by=actor_id,
    )
    await session.commit()
    return _serialize_exam_plan(plan, include_names=True)


@router.get(
    "/exams/plans",
    summary="List exam seat plans (§13.2)",
)
async def list_exam_plans(
    session: SessionDep,
    principal: CurrentPrincipal,
    campus_id: Annotated[str | None, Query()] = None,
) -> dict[str, Any]:
    _ = await ensure_principal_user(session, principal)
    include_names = principal.has_role(Role.admin, Role.staff, Role.teacher)
    rows = await academic_service.list_exam_plans(session, campus_id=campus_id)
    return {
        "count": len(rows),
        "plans": [_serialize_exam_plan(p, include_names=include_names) for p in rows],
    }


@router.get(
    "/exams/plans/{plan_id}",
    summary="Get an exam seat plan (§13.2)",
)
async def get_exam_plan(
    plan_id: uuid.UUID,
    session: SessionDep,
    principal: CurrentPrincipal,
) -> dict[str, Any]:
    _ = await ensure_principal_user(session, principal)
    include_names = principal.has_role(Role.admin, Role.staff, Role.teacher)
    plan = await academic_service.get_exam_plan(session, plan_id)
    return _serialize_exam_plan(plan, include_names=include_names)


@router.get(
    "/exams/plans/{plan_id}/export.csv",
    summary="Export exam seat plan as CSV (§13.2)",
)
async def export_exam_plan_csv(
    plan_id: uuid.UUID,
    session: SessionDep,
    principal: CurrentPrincipal,
) -> Response:
    _ = await ensure_principal_user(session, principal)
    include_names = principal.has_role(Role.admin, Role.staff, Role.teacher)
    csv_body = await academic_service.export_exam_plan_csv_for_id(
        session, plan_id, include_student_names=include_names
    )
    return Response(
        content=csv_body,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="exam-plan-{plan_id}.csv"'},
    )


@router.get(
    "/exams/plans/{plan_id}/export.pdf",
    summary="Export printable exam seat plan PDF (§13.2)",
)
async def export_exam_plan_pdf(
    plan_id: uuid.UUID,
    session: SessionDep,
    principal: CurrentPrincipal,
) -> Response:
    _ = await ensure_principal_user(session, principal)
    include_names = principal.has_role(Role.admin, Role.staff, Role.teacher)
    pdf_bytes = await academic_service.export_exam_plan_pdf_for_id(
        session, plan_id, include_student_names=include_names
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="exam-plan-{plan_id}.pdf"'},
    )


@router.get(
    "/exams/plans/{plan_id}/slips",
    summary="Get student exam seat slips with privacy gating (§13.2)",
)
async def get_exam_student_slips(
    plan_id: uuid.UUID,
    session: SessionDep,
    principal: CurrentPrincipal,
    student_id: Annotated[uuid.UUID | None, Query()] = None,
) -> dict[str, Any]:
    caller_id = await ensure_principal_user(session, principal)
    is_officer = principal.has_role(Role.admin, Role.staff, Role.teacher)
    target_student = student_id if is_officer else (student_id or caller_id)
    slips = await academic_service.get_exam_student_slips_for_id(
        session,
        plan_id,
        include_student_names=is_officer,
        for_student_id=target_student,
    )
    return {"plan_id": str(plan_id), "count": len(slips), "slips": slips}


# ---------------------------------------------------------------------------
# §13.3 QR Attendance Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/attendance/sessions",
    status_code=status.HTTP_201_CREATED,
    summary="Open a QR attendance session for a meeting or room (§13.3)",
)
async def open_attendance_session(
    body: AttendanceSessionOpenIn,
    session: SessionDep,
    principal: CurrentPrincipal,
) -> dict[str, Any]:
    if not principal.has_role(Role.admin, Role.teacher, Role.staff):
        raise PermissionDeniedError(
            "Only teachers, staff, or admins may open an attendance session.",
            code="attendance_open_forbidden",
        )
    teacher_id = await ensure_principal_user(session, principal)
    att_session = await academic_service.open_attendance_session(
        session,
        teacher_user_id=teacher_id,
        meeting_id=body.meeting_id,
        room_id=body.room_id,
        token_step_seconds=body.token_step_seconds,
        late_after_minutes=body.late_after_minutes,
        expected_count=body.expected_count,
    )
    await session.commit()
    token_data = await academic_service.get_current_qr_token(
        session, att_session.id, include_svg=True
    )
    return {
        "id": str(att_session.id),
        "meeting_id": str(att_session.meeting_id) if att_session.meeting_id else None,
        "room_id": att_session.room_id,
        "opened_at": att_session.opened_at.isoformat(),
        "token_step_seconds": att_session.token_step_seconds,
        "late_after_minutes": att_session.late_after_minutes,
        "expected_count": att_session.expected_count,
        "qr": token_data,
    }


@router.get(
    "/attendance/sessions/{session_id}",
    summary="Get an attendance session summary and scan list (§13.3)",
)
async def get_attendance_session(
    session_id: uuid.UUID,
    session: SessionDep,
    principal: CurrentPrincipal,
) -> dict[str, Any]:
    _ = await ensure_principal_user(session, principal)
    return await academic_service.get_attendance_session_summary(session, session_id)


@router.get(
    "/attendance/sessions/{session_id}/qr",
    summary="Get the current rotating HMAC-SHA256 QR token (§13.3)",
)
async def get_attendance_qr(
    session_id: uuid.UUID,
    session: SessionDep,
    principal: CurrentPrincipal,
) -> dict[str, Any]:
    if not principal.has_role(Role.admin, Role.teacher, Role.staff):
        raise PermissionDeniedError(
            "Only teachers, staff, or admins may fetch the rotating QR display token.",
            code="attendance_qr_forbidden",
        )
    _ = await ensure_principal_user(session, principal)
    return await academic_service.get_current_qr_token(
        session, session_id, include_svg=True
    )


@router.post(
    "/attendance/sessions/{session_id}/scan",
    status_code=status.HTTP_201_CREATED,
    summary="Scan a rotating QR code to check in to class (§13.3)",
)
async def scan_attendance_qr(
    session_id: uuid.UUID,
    body: AttendanceScanIn,
    session: SessionDep,
    principal: CurrentPrincipal,
) -> dict[str, Any]:
    student_id = await ensure_principal_user(session, principal)
    record, outcome = await academic_service.scan_attendance_qr(
        session,
        session_id=session_id,
        student_user_id=student_id,
        token=body.token,
        raw_device_id=body.device_id,
        student_lat=body.latitude,
        student_lon=body.longitude,
        geofence_enabled=body.geofence_enabled,
        geofence_radius_m=body.geofence_radius_m,
    )
    await session.commit()
    return {
        "record_id": str(record.id),
        "session_id": str(record.session_id),
        "user_id": str(record.user_id),
        "state": record.state,
        "scanned_at": record.scanned_at.isoformat(),
        "review_reason": record.review_reason,
        "is_late": outcome.is_late,
        "counts_toward_occupancy": record.state in {"present", "late", "guest"},
    }


@router.patch(
    "/attendance/records/{record_id}/review",
    summary="Approve or reject a pending_review attendance scan (§13.3)",
)
async def review_attendance_record(
    record_id: uuid.UUID,
    body: AttendanceReviewIn,
    session: SessionDep,
    principal: CurrentPrincipal,
) -> dict[str, Any]:
    if not principal.has_role(Role.admin, Role.teacher, Role.staff):
        raise PermissionDeniedError(
            "Only teachers, staff, or admins may review pending attendance scans.",
            code="attendance_review_forbidden",
        )
    _ = await ensure_principal_user(session, principal)
    record = await academic_service.review_attendance_record(
        session,
        record_id=record_id,
        decision=body.decision,
        note=body.note,
    )
    await session.commit()
    return {
        "record_id": str(record.id),
        "session_id": str(record.session_id),
        "state": record.state,
        "review_reason": record.review_reason,
    }


@router.post(
    "/attendance/sessions/{session_id}/close",
    summary="Close an attendance session and update Beta-Binomial AttendanceRate (§13.3)",
)
async def close_attendance_session(
    session_id: uuid.UUID,
    session: SessionDep,
    principal: CurrentPrincipal,
) -> dict[str, Any]:
    if not principal.has_role(Role.admin, Role.teacher, Role.staff):
        raise PermissionDeniedError(
            "Only teachers, staff, or admins may close an attendance session.",
            code="attendance_close_forbidden",
        )
    _ = await ensure_principal_user(session, principal)
    att_session, rate_row = await academic_service.close_attendance_session(
        session, session_id=session_id
    )
    await session.commit()
    return {
        "session_id": str(att_session.id),
        "closed_at": att_session.closed_at.isoformat() if att_session.closed_at else None,
        "learned_rate": (
            {
                "section_id": str(rate_row.section_id),
                "weekday": rate_row.weekday,
                "hour": rate_row.hour,
                "alpha": rate_row.alpha,
                "beta": rate_row.beta,
                "mean": round(rate_row.mean, 4),
                "observations": rate_row.observations,
            }
            if rate_row is not None
            else None
        ),
    }


# ---------------------------------------------------------------------------
# §13.4 Timetable Optimiser & Scenario Engine (§6.2) Endpoints
# ---------------------------------------------------------------------------


def _serialize_scenario(scenario: Scenario) -> dict[str, Any]:
    return {
        "id": str(scenario.id),
        "campus_id": scenario.campus_id,
        "term_id": str(scenario.term_id) if scenario.term_id else None,
        "name": scenario.name,
        "description": scenario.description,
        "kind": scenario.kind,
        "status": scenario.status.value,
        "solver_status": scenario.solver_status,
        "baseline_metrics": scenario.baseline_metrics,
        "proposal_metrics": scenario.proposal_metrics,
        "tradeoffs_summary": scenario.tradeoffs_summary,
        "parameters": scenario.parameters_json,
        "approved_by": str(scenario.approved_by) if scenario.approved_by else None,
        "approved_at": scenario.approved_at.isoformat() if scenario.approved_at else None,
        "changes": [
            {
                "id": str(ch.id),
                "change_type": ch.change_type,
                "course_code": ch.course_code,
                "section_code": ch.section_code,
                "old_room_id": ch.old_room_id,
                "new_room_id": ch.new_room_id,
                "old_weekday": ch.old_weekday,
                "new_weekday": ch.new_weekday,
                "old_period": ch.old_period,
                "new_period": ch.new_period,
                "reason": ch.reason,
                "payload": ch.payload,
            }
            for ch in (scenario.changes or [])
        ],
    }


@router.post(
    "/scenarios/optimise",
    status_code=status.HTTP_201_CREATED,
    summary="Run the CP-SAT timetable optimiser on a copy-on-write Scenario (§6.2, §13.4)",
)
async def run_timetable_optimiser(
    body: TimetableOptimiseIn,
    session: SessionDep,
    principal: CurrentPrincipal,
) -> dict[str, Any]:
    if not principal.has_role(Role.admin, Role.staff, Role.teacher, Role.analyst):
        raise PermissionDeniedError(
            "Only schedulers, analysts, teachers, staff, or admins may run the timetable optimiser.",
            code="optimiser_forbidden",
        )
    actor_id = await ensure_principal_user(session, principal)
    scenario, opt_res = await academic_service.run_timetable_optimisation_scenario(
        session,
        campus_id=body.campus_id,
        name=body.name,
        description=body.description,
        term_id=body.term_id,
        incremental_mode=body.incremental_mode,
        movable_lecture_ids=body.movable_lecture_ids,
        blocked_room_ids=body.blocked_room_ids,
        hard_capacity=body.hard_capacity,
        seed=body.seed,
        lectures_override=body.lectures,
        rooms_override=body.rooms,
        created_by=actor_id,
    )
    await session.commit()
    loaded = await academic_service.get_scenario_with_changes(session, scenario.id)
    out = _serialize_scenario(loaded)
    out["feasible"] = opt_res.feasible
    out["tradeoffs"] = list(opt_res.tradeoffs)
    return out


@router.get(
    "/scenarios",
    summary="List timetable & what-if scenarios (§6.2, §13.4)",
)
async def list_scenarios(
    session: SessionDep,
    principal: CurrentPrincipal,
    campus_id: Annotated[str | None, Query()] = None,
) -> dict[str, Any]:
    _ = await ensure_principal_user(session, principal)
    rows = await academic_service.list_scenarios(session, campus_id=campus_id)
    return {
        "count": len(rows),
        "scenarios": [_serialize_scenario(s) for s in rows],
    }


@router.get(
    "/scenarios/{scenario_id}",
    summary="Get a scenario with its proposed diff and before/after metrics (§6.2, §13.4)",
)
async def get_scenario(
    scenario_id: uuid.UUID,
    session: SessionDep,
    principal: CurrentPrincipal,
) -> dict[str, Any]:
    _ = await ensure_principal_user(session, principal)
    scenario = await academic_service.get_scenario_with_changes(session, scenario_id)
    return _serialize_scenario(scenario)


@router.post(
    "/scenarios/{scenario_id}/approve",
    summary="Approve a proposed scenario (§6.2, §13.4)",
)
async def approve_scenario(
    scenario_id: uuid.UUID,
    session: SessionDep,
    principal: CurrentPrincipal,
) -> dict[str, Any]:
    if not principal.has_role(Role.admin, Role.staff):
        raise PermissionDeniedError(
            "Only staff or admins may approve a scenario.",
            code="scenario_approval_forbidden",
        )
    actor_id = await ensure_principal_user(session, principal)
    scenario = await academic_service.approve_scenario(
        session, scenario_id=scenario_id, approver_user_id=actor_id
    )
    await session.commit()
    return _serialize_scenario(scenario)
