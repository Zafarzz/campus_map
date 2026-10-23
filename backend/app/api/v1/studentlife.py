"""Layer 2: Student Life API (brief section 12).

Endpoints:
* **Consents (section 3.4)**:
  * ``POST /consents`` — grant or revoke explicit opt-in consent
    (`study_group_matching`, `teacher_visibility`).
* **Study-group matcher (section 12.1)**:
  * ``POST /study-groups/requests`` — submit an opt-in request and run matching.
  * ``GET /study-groups/requests`` — list caller's requests.
  * ``GET /study-groups/sessions`` — list caller's matched study sessions.
  * ``POST /study-groups/sessions/{session_id}/respond`` — accept/decline session.
* **Lost and found (section 12.2)**:
  * ``POST /lost-found/items`` — report a lost/found item (strips EXIF, masks ID).
  * ``GET /lost-found/items`` — list lost/found items.
  * ``GET /lost-found/items/{item_id}/matches`` — get ranked hybrid matches.
  * ``POST /lost-found/items/{item_id}/claims`` — submit verification answer.
  * ``POST /lost-found/claims/{claim_id}/resolve`` — finder approves or rejects.
* **Dorm services (section 12.3)**:
  * ``GET /dorm/machines`` — crowd-reported machine status with exponential decay.
  * ``POST /dorm/machines/{resource_code}/report`` — report machine free/in-use.
  * ``POST /dorm/bookings`` — book laundry, kitchen, or study-room slot.
  * ``POST /dorm/tickets`` — submit dorm maintenance ticket via ticket engine.
  * ``GET /dorm/notices`` & ``POST /dorm/notices`` — dorm notice board.
* **Teacher finder (section 12.4)**:
  * ``PUT /teachers/me/profile`` — teacher configures visibility (default `off`).
  * ``GET /teachers`` & ``GET /teachers/{teacher_user_id}`` — current status only.
  * ``POST /teachers/{teacher_user_id}/appointments`` — book office-hours slot.
"""

from __future__ import annotations

import base64
import tempfile
import uuid
from datetime import datetime
from pathlib import Path
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.storage import LocalDiskStorageAdapter
from app.api.v1.busyness import ensure_principal_user
from app.api.v1.state import parse_at
from app.core.db import get_session
from app.core.errors import ValidationError
from app.core.security import CurrentPrincipal, Role, require_roles
from app.domain.base import (
    LostFoundKind,
    LostFoundStatus,
    TeacherVisibilityMode,
    TicketPriority,
)
from app.domain.studentlife import LostFoundItem
from app.engines.studentlife import TeacherStatusView
from app.services import studentlife_service

router = APIRouter(tags=["studentlife"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]

_DEFAULT_STORAGE = LocalDiskStorageAdapter(Path(tempfile.gettempdir()) / "campus_map_storage")


# ---------------------------------------------------------------------------
# Consents
# ---------------------------------------------------------------------------


class ConsentIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    purpose: str = Field(min_length=1, max_length=64)
    granted: bool
    settings: dict[str, Any] | None = None
    note: str | None = Field(default=None, max_length=500)


@router.post(
    "/consents",
    summary="Grant or revoke explicit opt-in consent for a sensitive feature",
)
async def set_consent(
    body: ConsentIn,
    session: SessionDep,
    principal: CurrentPrincipal,
) -> dict[str, Any]:
    user_id = await ensure_principal_user(session, principal)
    row = await studentlife_service.grant_or_revoke_consent(
        session,
        user_id=user_id,
        purpose=body.purpose,
        granted=body.granted,
        settings=body.settings,
        note=body.note,
    )
    await session.commit()
    return {
        "id": str(row.id),
        "user_id": str(row.user_id),
        "purpose": row.purpose,
        "is_active": row.is_active,
        "granted_at": row.granted_at.isoformat(),
        "revoked_at": row.revoked_at.isoformat() if row.revoked_at else None,
    }


# ---------------------------------------------------------------------------
# 12.1 Study-group matcher
# ---------------------------------------------------------------------------


class StudyGroupRequestIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    topic_tag: str = Field(min_length=1, max_length=120)
    course_id: uuid.UUID | None = None
    wanted_group_size: int = Field(default=2, ge=2, le=8)
    min_duration_minutes: int = Field(default=60, ge=15, le=360)
    window_start: datetime
    window_end: datetime
    preferred_building_id: str | None = None
    notes: str | None = Field(default=None, max_length=1000)


class StudyGroupRespondIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    accept: bool


@router.post(
    "/study-groups/requests",
    status_code=status.HTTP_201_CREATED,
    summary="Submit an opt-in study-group request and run matching",
)
async def create_study_request(
    body: StudyGroupRequestIn,
    session: SessionDep,
    principal: CurrentPrincipal,
) -> dict[str, Any]:
    if body.window_start.tzinfo is None or body.window_end.tzinfo is None:
        raise ValidationError(
            "window_start and window_end must carry a timezone offset.",
            code="naive_instant",
        )
    user_id = await ensure_principal_user(session, principal)
    req, matched_sessions = await studentlife_service.create_study_group_request(
        session,
        user_id=user_id,
        topic_tag=body.topic_tag,
        course_id=body.course_id,
        wanted_group_size=body.wanted_group_size,
        min_duration_minutes=body.min_duration_minutes,
        window_start=body.window_start,
        window_end=body.window_end,
        preferred_building_id=body.preferred_building_id,
        notes=body.notes,
    )
    await session.commit()
    return {
        "request": {
            "id": str(req.id),
            "user_id": str(req.user_id),
            "topic_tag": req.topic_tag,
            "course_id": str(req.course_id) if req.course_id else None,
            "wanted_group_size": req.wanted_group_size,
            "min_duration_minutes": req.min_duration_minutes,
            "window_start": req.window_start.isoformat(),
            "window_end": req.window_end.isoformat(),
            "preferred_building_id": req.preferred_building_id,
            "status": req.status.value,
        },
        "matched_session_ids": [str(s.id) for s in matched_sessions],
    }


@router.get(
    "/study-groups/requests",
    summary="List caller's study-group requests",
)
async def list_study_requests(
    session: SessionDep,
    principal: CurrentPrincipal,
) -> dict[str, Any]:
    user_id = await ensure_principal_user(session, principal)
    rows = await studentlife_service.list_study_group_requests(session, user_id=user_id)
    return {
        "count": len(rows),
        "requests": [
            {
                "id": str(r.id),
                "topic_tag": r.topic_tag,
                "course_id": str(r.course_id) if r.course_id else None,
                "wanted_group_size": r.wanted_group_size,
                "min_duration_minutes": r.min_duration_minutes,
                "window_start": r.window_start.isoformat(),
                "window_end": r.window_end.isoformat(),
                "preferred_building_id": r.preferred_building_id,
                "status": r.status.value,
            }
            for r in rows
        ],
    }


@router.get(
    "/study-groups/sessions",
    summary="List caller's matched study-group sessions (privacy-safe)",
)
async def list_study_sessions(
    session: SessionDep,
    principal: CurrentPrincipal,
) -> dict[str, Any]:
    user_id = await ensure_principal_user(session, principal)
    sessions = await studentlife_service.list_study_group_sessions_for_user(session, user_id=user_id)
    return {"count": len(sessions), "sessions": sessions}


@router.post(
    "/study-groups/sessions/{session_id}/respond",
    summary="Accept or decline a proposed study-group session",
)
async def respond_study_session(
    session_id: uuid.UUID,
    body: StudyGroupRespondIn,
    session: SessionDep,
    principal: CurrentPrincipal,
) -> dict[str, Any]:
    user_id = await ensure_principal_user(session, principal)
    await studentlife_service.respond_study_group_session(
        session,
        session_id=session_id,
        user_id=user_id,
        accept=body.accept,
    )
    view = await studentlife_service.get_study_group_session_view(session, session_id, viewer_user_id=user_id)
    await session.commit()
    return view


# ---------------------------------------------------------------------------
# 12.2 Lost and found
# ---------------------------------------------------------------------------


class LostFoundCreateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: LostFoundKind
    category: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=4000)
    building_id: str | None = None
    floor_id: str | None = None
    room_id: str | None = None
    pin_x_m: float | None = None
    pin_z_m: float | None = None
    occurred_at: datetime | None = None
    verification_question: str | None = Field(default=None, max_length=300)
    handover_point: str | None = Field(default=None, max_length=200)
    photo_base64: str | None = None


class LostFoundClaimIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    verification_answer: str = Field(min_length=1, max_length=1000)


class LostFoundClaimResolveIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    approve: bool
    handover_point: str | None = Field(default=None, max_length=200)
    mark_returned: bool = False


def _serialize_lost_found(item: LostFoundItem) -> dict[str, Any]:
    return {
        "id": str(item.id),
        "reporter_user_id": str(item.reporter_user_id),
        "kind": item.kind.value,
        "status": item.status.value,
        "category": item.category,
        "title": item.title,
        "description": item.description,
        "photo_storage_key": item.photo_storage_key,
        "building_id": item.building_id,
        "floor_id": item.floor_id,
        "room_id": item.room_id,
        "pin_x_m": item.pin_x_m,
        "pin_z_m": item.pin_z_m,
        "occurred_at": item.occurred_at.isoformat(),
        "verification_question": item.verification_question,
        "handover_point": item.handover_point,
        "expires_at": item.expires_at.isoformat(),
    }


@router.post(
    "/lost-found/items",
    status_code=status.HTTP_201_CREATED,
    summary="Report a lost or found item",
)
async def create_lost_found(
    body: LostFoundCreateIn,
    session: SessionDep,
    principal: CurrentPrincipal,
) -> dict[str, Any]:
    photo_bytes: bytes | None = None
    if body.photo_base64:
        try:
            photo_bytes = base64.b64decode(body.photo_base64, validate=True)
        except Exception as exc:
            raise ValidationError("Invalid base64 photo payload.", code="invalid_photo_base64") from exc

    user_id = await ensure_principal_user(session, principal)
    item, matches = await studentlife_service.report_lost_found_item(
        session,
        reporter_user_id=user_id,
        kind=body.kind,
        category=body.category,
        title=body.title,
        description=body.description,
        building_id=body.building_id,
        floor_id=body.floor_id,
        room_id=body.room_id,
        pin_x_m=body.pin_x_m,
        pin_z_m=body.pin_z_m,
        occurred_at=body.occurred_at,
        verification_question=body.verification_question,
        handover_point=body.handover_point,
        photo_bytes=photo_bytes,
        storage=_DEFAULT_STORAGE,
    )
    await session.commit()
    return {
        "item": _serialize_lost_found(item),
        "matches": [
            {
                "candidate_id": str(m.candidate_id),
                "score": m.score,
                "text_similarity": m.text_similarity,
                "category_match": m.category_match,
                "time_proximity": m.time_proximity,
                "spatial_proximity": m.spatial_proximity,
            }
            for m in matches
        ],
    }


@router.get(
    "/lost-found/items",
    summary="List lost and found items",
)
async def list_lost_found(
    session: SessionDep,
    kind: Annotated[LostFoundKind | None, Query()] = None,
    status_filter: Annotated[LostFoundStatus | None, Query(alias="status")] = None,
    category: Annotated[str | None, Query()] = None,
    building_id: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
) -> dict[str, Any]:
    rows = await studentlife_service.list_lost_found_items(
        session,
        kind=kind,
        status=status_filter,
        category=category,
        building_id=building_id,
        limit=limit,
    )
    return {
        "count": len(rows),
        "items": [_serialize_lost_found(r) for r in rows],
    }


@router.get(
    "/lost-found/items/{item_id}/matches",
    summary="Get ranked potential matches for a lost or found item",
)
async def get_lost_found_matches(
    item_id: uuid.UUID,
    session: SessionDep,
) -> dict[str, Any]:
    matches = await studentlife_service.find_matches_for_item(session, item_id)
    return {
        "item_id": str(item_id),
        "count": len(matches),
        "matches": [
            {
                "candidate_id": str(m.candidate_id),
                "score": m.score,
                "text_similarity": m.text_similarity,
                "category_match": m.category_match,
                "time_proximity": m.time_proximity,
                "spatial_proximity": m.spatial_proximity,
            }
            for m in matches
        ],
    }


@router.post(
    "/lost-found/items/{item_id}/claims",
    status_code=status.HTTP_201_CREATED,
    summary="Submit a verification answer to claim a found item",
)
async def claim_lost_found(
    item_id: uuid.UUID,
    body: LostFoundClaimIn,
    session: SessionDep,
    principal: CurrentPrincipal,
) -> dict[str, Any]:
    user_id = await ensure_principal_user(session, principal)
    claim = await studentlife_service.submit_claim(
        session,
        item_id=item_id,
        claimant_user_id=user_id,
        verification_answer=body.verification_answer,
    )
    await session.commit()
    return {
        "id": str(claim.id),
        "item_id": str(claim.item_id),
        "claimant_user_id": str(claim.claimant_user_id),
        "status": claim.status,
        "handover_point": claim.handover_point,
    }


@router.post(
    "/lost-found/claims/{claim_id}/resolve",
    summary="Approve or reject a claim on a found item",
)
async def resolve_lost_found_claim(
    claim_id: uuid.UUID,
    body: LostFoundClaimResolveIn,
    session: SessionDep,
    principal: CurrentPrincipal,
) -> dict[str, Any]:
    user_id = await ensure_principal_user(session, principal)
    claim = await studentlife_service.resolve_claim(
        session,
        claim_id=claim_id,
        actor_user_id=user_id,
        approve=body.approve,
        handover_point=body.handover_point,
        mark_returned=body.mark_returned,
    )
    await session.commit()
    return {
        "id": str(claim.id),
        "item_id": str(claim.item_id),
        "status": claim.status,
        "handover_point": claim.handover_point,
        "resolved_at": claim.resolved_at.isoformat() if claim.resolved_at else None,
    }


# ---------------------------------------------------------------------------
# 12.3 Dorm services
# ---------------------------------------------------------------------------


class DormMachineReportIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    is_free: bool


class DormBookingIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    resource_code: str = Field(min_length=1, max_length=64)
    starts_at: datetime
    ends_at: datetime
    purpose: str | None = Field(default=None, max_length=300)


class DormTicketIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    subcategory: str = Field(default="maintenance", max_length=64)
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=4000)
    room_id: str | None = None
    priority: TicketPriority = TicketPriority.normal


class DormNoticeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title_i18n: dict[str, str]
    body_i18n: dict[str, str]
    building_id: str = Field(default="bld-j", max_length=64)
    pinned: bool = False
    expires_at: datetime | None = None


@router.get(
    "/dorm/machines",
    summary="Get crowd-reported dorm machine status with exponential decay",
)
async def get_dorm_machines(
    session: SessionDep,
    at: Annotated[str | None, Query()] = None,
) -> dict[str, Any]:
    instant, _ = parse_at(at)
    statuses = await studentlife_service.get_dorm_machines_status(session, at=instant)
    return {"at": instant.isoformat(), "machines": statuses}


@router.post(
    "/dorm/machines/{resource_code}/report",
    status_code=status.HTTP_201_CREATED,
    summary="Report whether a dorm machine is free or in use",
)
async def report_dorm_machine(
    resource_code: str,
    body: DormMachineReportIn,
    session: SessionDep,
    principal: CurrentPrincipal,
    at: Annotated[str | None, Query()] = None,
) -> dict[str, Any]:
    instant, _ = parse_at(at)
    user_id = await ensure_principal_user(session, principal)
    res = await studentlife_service.report_dorm_machine_status(
        session,
        user_id=user_id,
        resource_code=resource_code,
        is_free=body.is_free,
        at=instant,
    )
    await session.commit()
    return res


@router.post(
    "/dorm/bookings",
    status_code=status.HTTP_201_CREATED,
    summary="Book a dorm laundry slot, kitchen, or shared study room",
)
async def create_dorm_booking(
    body: DormBookingIn,
    session: SessionDep,
    principal: CurrentPrincipal,
) -> dict[str, Any]:
    if body.starts_at.tzinfo is None or body.ends_at.tzinfo is None:
        raise ValidationError(
            "starts_at and ends_at must carry a timezone offset.",
            code="naive_instant",
        )
    user_id = await ensure_principal_user(session, principal)
    res = await studentlife_service.book_dorm_resource(
        session,
        user_id=user_id,
        resource_code=body.resource_code,
        starts_at=body.starts_at,
        ends_at=body.ends_at,
        purpose=body.purpose,
    )
    await session.commit()
    return {
        "booking_id": str(res.booking.id),
        "resource_id": str(res.booking.resource_id),
        "resource_code": body.resource_code,
        "starts_at": res.booking.starts_at.isoformat(),
        "ends_at": res.booking.ends_at.isoformat(),
        "status": res.booking.status.value,
    }


@router.post(
    "/dorm/tickets",
    status_code=status.HTTP_201_CREATED,
    summary="Submit a dorm maintenance ticket via the shared ticket engine",
)
async def create_dorm_ticket_endpoint(
    body: DormTicketIn,
    session: SessionDep,
    principal: CurrentPrincipal,
) -> dict[str, Any]:
    user_id = await ensure_principal_user(session, principal)
    ticket, merged = await studentlife_service.create_dorm_ticket(
        session,
        reporter_user_id=user_id,
        subcategory=body.subcategory,
        title=body.title,
        description=body.description,
        room_id=body.room_id,
        priority=body.priority,
    )
    await session.commit()
    return {
        "id": str(ticket.id),
        "category": ticket.category,
        "subcategory": ticket.subcategory,
        "title": ticket.title,
        "status": ticket.status.value,
        "upvotes_count": ticket.upvotes_count,
        "merged_into_existing": merged,
    }


@router.get(
    "/dorm/notices",
    summary="List active dorm notice board items",
)
async def list_dorm_notices_endpoint(
    session: SessionDep,
    building_id: Annotated[str, Query()] = "bld-j",
) -> dict[str, Any]:
    rows = await studentlife_service.list_dorm_notices(session, building_id=building_id)
    return {
        "count": len(rows),
        "notices": [
            {
                "id": str(n.id),
                "building_id": n.building_id,
                "title_i18n": n.title_i18n,
                "body_i18n": n.body_i18n,
                "pinned": n.pinned,
                "expires_at": n.expires_at.isoformat() if n.expires_at else None,
                "created_at": n.created_at.isoformat() if n.created_at else None,
            }
            for n in rows
        ],
    }


@router.post(
    "/dorm/notices",
    status_code=status.HTTP_201_CREATED,
    summary="Post a dorm notice board item",
    dependencies=[Depends(require_roles(Role.admin, Role.staff, Role.facilities))],
)
async def create_dorm_notice_endpoint(
    body: DormNoticeIn,
    session: SessionDep,
    principal: CurrentPrincipal,
) -> dict[str, Any]:
    user_id = await ensure_principal_user(session, principal)
    notice = await studentlife_service.create_dorm_notice(
        session,
        author_user_id=user_id,
        title_i18n=body.title_i18n,
        body_i18n=body.body_i18n,
        building_id=body.building_id,
        pinned=body.pinned,
        expires_at=body.expires_at,
    )
    await session.commit()
    return {
        "id": str(notice.id),
        "building_id": notice.building_id,
        "title_i18n": notice.title_i18n,
        "body_i18n": notice.body_i18n,
        "pinned": notice.pinned,
    }


# ---------------------------------------------------------------------------
# 12.4 Teacher finder (teacher-controlled, default off)
# ---------------------------------------------------------------------------


class TeacherProfileIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    public_name: str = Field(min_length=1, max_length=200)
    department: str | None = Field(default=None, max_length=200)
    teacher_ref: str | None = Field(default=None, max_length=128)
    office_room_id: str | None = None
    visibility_mode: TeacherVisibilityMode = TeacherVisibilityMode.off
    manual_status: str | None = Field(default=None, max_length=64)
    manual_note: str | None = Field(default=None, max_length=200)
    manual_until: datetime | None = None
    office_hours: list[dict[str, Any]] = Field(default_factory=list)


class TeacherAppointmentIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    starts_at: datetime
    ends_at: datetime
    purpose: str | None = Field(default=None, max_length=300)


def _serialize_teacher_view(v: TeacherStatusView) -> dict[str, Any]:
    return {
        "user_id": str(v.user_id),
        "public_name": v.public_name,
        "department": v.department,
        "visibility_mode": v.visibility_mode.value,
        "status": v.status,
        "status_label": v.status_label,
        "office_room_id": v.office_room_id,
        "current_room_id": v.current_room_id,
        "office_hours": v.office_hours,
        "manual_note": v.manual_note,
        "manual_until": v.manual_until.isoformat() if v.manual_until else None,
        "appointment_resource_id": (str(v.appointment_resource_id) if v.appointment_resource_id else None),
    }


@router.put(
    "/teachers/me/profile",
    summary="Configure teacher visibility mode, office hours, and manual status",
    dependencies=[Depends(require_roles(Role.teacher, Role.admin, Role.staff))],
)
async def update_my_teacher_profile(
    body: TeacherProfileIn,
    session: SessionDep,
    principal: CurrentPrincipal,
) -> dict[str, Any]:
    user_id = await ensure_principal_user(session, principal)
    profile = await studentlife_service.upsert_teacher_profile(
        session,
        user_id=user_id,
        public_name=body.public_name,
        department=body.department,
        teacher_ref=body.teacher_ref,
        office_room_id=body.office_room_id,
        visibility_mode=body.visibility_mode,
        manual_status=body.manual_status,
        manual_note=body.manual_note,
        manual_until=body.manual_until,
        office_hours=body.office_hours,
    )
    view = await studentlife_service.get_teacher_status_for_student(session, profile.user_id)
    await session.commit()
    return _serialize_teacher_view(view)


@router.get(
    "/teachers",
    summary="List teachers and their current status (privacy-controlled)",
)
async def list_teachers(
    session: SessionDep,
    at: Annotated[str | None, Query()] = None,
) -> dict[str, Any]:
    instant, _ = parse_at(at)
    views = await studentlife_service.list_teachers_for_students(session, at=instant)
    return {
        "count": len(views),
        "teachers": [_serialize_teacher_view(v) for v in views],
    }


@router.get(
    "/teachers/{teacher_user_id}",
    summary="Get a teacher's current status (never history)",
)
async def get_teacher_status(
    teacher_user_id: uuid.UUID,
    session: SessionDep,
    at: Annotated[str | None, Query()] = None,
) -> dict[str, Any]:
    instant, _ = parse_at(at)
    view = await studentlife_service.get_teacher_status_for_student(session, teacher_user_id, at=instant)
    return _serialize_teacher_view(view)


@router.post(
    "/teachers/{teacher_user_id}/appointments",
    status_code=status.HTTP_201_CREATED,
    summary="Book an office-hours appointment slot with a teacher",
)
async def book_teacher_appointment_endpoint(
    teacher_user_id: uuid.UUID,
    body: TeacherAppointmentIn,
    session: SessionDep,
    principal: CurrentPrincipal,
) -> dict[str, Any]:
    if body.starts_at.tzinfo is None or body.ends_at.tzinfo is None:
        raise ValidationError(
            "starts_at and ends_at must carry a timezone offset.",
            code="naive_instant",
        )
    student_id = await ensure_principal_user(session, principal)
    res = await studentlife_service.book_teacher_appointment(
        session,
        teacher_user_id=teacher_user_id,
        student_user_id=student_id,
        starts_at=body.starts_at,
        ends_at=body.ends_at,
        purpose=body.purpose,
    )
    await session.commit()
    return {
        "booking_id": str(res.booking.id),
        "teacher_user_id": str(teacher_user_id),
        "resource_id": str(res.booking.resource_id),
        "starts_at": res.booking.starts_at.isoformat(),
        "ends_at": res.booking.ends_at.isoformat(),
        "status": res.booking.status.value,
    }
