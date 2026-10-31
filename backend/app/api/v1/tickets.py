"""Shared issue & maintenance tickets API (brief sections 6.2, 12.3, 14.1).

Endpoints:
* ``POST /tickets`` — create a ticket (or merge into an open duplicate within the
  24h window). Setting ``blocks_use=True`` places the room into ``out_of_service``.
* ``GET /tickets`` — list tickets with optional filters.
* ``GET /tickets/metrics`` — operational ticket metrics (time to triage, time to
  resolve, SLA breaches, reopen rate).
* ``POST /tickets/escalate-overdue`` — run SLA breach escalation on overdue tickets.
* ``GET /tickets/{ticket_id}`` — get a ticket with its chronological event log.
* ``PATCH /tickets/{ticket_id}/status`` — transition ticket status along the
  legal state machine (`new` -> `triaged` -> `assigned` -> `in_progress` ->
  `resolved` -> `closed`, `reopened`).
* ``POST /tickets/{ticket_id}/rate`` — submit a 1..5 satisfaction rating.
"""

from __future__ import annotations

import base64
import tempfile
import uuid
from dataclasses import asdict
from pathlib import Path
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.storage import LocalDiskStorageAdapter
from app.api.v1.busyness import ensure_principal_user
from app.core.db import get_session
from app.core.errors import PermissionDeniedError, ValidationError
from app.core.security import CurrentPrincipal, Role
from app.domain.base import TicketPriority, TicketStatus
from app.domain.operations import Ticket, TicketEvent
from app.services import ticket_service

router = APIRouter(prefix="/tickets", tags=["tickets"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]

_DEFAULT_STORAGE = LocalDiskStorageAdapter(Path(tempfile.gettempdir()) / "campus_map_storage")


class TicketCreateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    category: str = Field(min_length=1, max_length=64)
    subcategory: str | None = Field(default=None, max_length=64)
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=4000)
    building_id: str | None = None
    floor_id: str | None = None
    room_id: str | None = None
    place_id: str | None = None
    priority: TicketPriority = TicketPriority.normal
    blocks_use: bool = False
    photo_base64: str | None = None


class TicketTransitionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    to_status: TicketStatus
    assignee_user_id: uuid.UUID | None = None
    blocks_use: bool | None = None
    note: str | None = Field(default=None, max_length=2000)


class TicketRatingIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rating: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=2000)


def _serialize_ticket(
    t: Ticket,
    *,
    merged: bool = False,
    events: list[TicketEvent] | None = None,
) -> dict[str, Any]:
    out: dict[str, Any] = {
        "id": str(t.id),
        "reporter_user_id": str(t.reporter_user_id),
        "assignee_user_id": str(t.assignee_user_id) if t.assignee_user_id else None,
        "building_id": t.building_id,
        "floor_id": t.floor_id,
        "room_id": t.room_id,
        "place_id": t.place_id,
        "category": t.category,
        "subcategory": t.subcategory,
        "title": t.title,
        "description": t.description,
        "photo_storage_key": t.photo_storage_key,
        "priority": t.priority.value,
        "status": t.status.value,
        "blocks_use": t.blocks_use,
        "upvotes_count": t.upvotes_count,
        "merged_into_existing": merged,
        "sla_due_at": t.sla_due_at.isoformat() if t.sla_due_at else None,
        "resolved_at": t.resolved_at.isoformat() if t.resolved_at else None,
        "closed_at": t.closed_at.isoformat() if t.closed_at else None,
        "satisfaction_rating": t.satisfaction_rating,
        "satisfaction_comment": t.satisfaction_comment,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }
    if events is not None:
        out["events"] = [
            {
                "id": str(e.id),
                "actor_user_id": str(e.actor_user_id) if e.actor_user_id else None,
                "event_type": e.event_type,
                "from_status": e.from_status.value if e.from_status else None,
                "to_status": e.to_status.value if e.to_status else None,
                "note": e.note,
                "payload": e.payload,
                "created_at": e.created_at.isoformat(),
            }
            for e in events
        ]
    return out


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    summary="Create an issue or maintenance ticket",
)
async def create_ticket(
    body: TicketCreateIn,
    session: SessionDep,
    principal: CurrentPrincipal,
) -> dict[str, Any]:
    if body.blocks_use and not principal.has_role(Role.admin, Role.facilities, Role.staff, Role.teacher):
        raise PermissionDeniedError(
            "Only staff, teachers, facilities, or admins may mark a ticket as blocks_use.",
            code="blocks_use_forbidden",
        )

    photo_bytes: bytes | None = None
    if body.photo_base64:
        try:
            photo_bytes = base64.b64decode(body.photo_base64, validate=True)
        except Exception as exc:
            raise ValidationError("Invalid base64 photo payload.", code="invalid_photo_base64") from exc

    user_id = await ensure_principal_user(session, principal)
    ticket, merged = await ticket_service.create_ticket(
        session,
        reporter_user_id=user_id,
        category=body.category,
        subcategory=body.subcategory,
        title=body.title,
        description=body.description,
        building_id=body.building_id,
        floor_id=body.floor_id,
        room_id=body.room_id,
        place_id=body.place_id,
        priority=body.priority,
        blocks_use=body.blocks_use,
        photo_bytes=photo_bytes,
        storage=_DEFAULT_STORAGE,
    )
    await session.commit()
    return _serialize_ticket(ticket, merged=merged)


@router.get(
    "",
    summary="List tickets",
)
async def list_tickets(
    session: SessionDep,
    principal: CurrentPrincipal,
    status_filter: Annotated[TicketStatus | None, Query(alias="status")] = None,
    category: Annotated[str | None, Query()] = None,
    building_id: Annotated[str | None, Query()] = None,
    room_id: Annotated[str | None, Query()] = None,
    mine_only: Annotated[bool, Query()] = False,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
) -> dict[str, Any]:
    user_id = await ensure_principal_user(session, principal)
    reporter_filter = (
        user_id if (mine_only or not principal.has_role(Role.admin, Role.facilities, Role.staff)) else None
    )
    rows = await ticket_service.list_tickets(
        session,
        status=status_filter,
        category=category,
        building_id=building_id,
        room_id=room_id,
        reporter_user_id=reporter_filter,
        limit=limit,
    )
    return {
        "count": len(rows),
        "tickets": [_serialize_ticket(r) for r in rows],
    }


@router.get(
    "/metrics",
    summary="Operational ticket metrics (§14.1)",
)
async def get_ticket_metrics(
    session: SessionDep,
    principal: CurrentPrincipal,
    building_id: Annotated[str | None, Query()] = None,
    category: Annotated[str | None, Query()] = None,
) -> dict[str, Any]:
    _ = await ensure_principal_user(session, principal)
    summary = await ticket_service.get_ticket_metrics(
        session,
        building_id=building_id,
        category=category,
    )
    return asdict(summary)


@router.post(
    "/escalate-overdue",
    summary="Escalate overdue tickets whose SLA deadline has passed (§14.1)",
)
async def escalate_overdue_tickets(
    session: SessionDep,
    principal: CurrentPrincipal,
) -> dict[str, Any]:
    if not principal.has_role(Role.admin, Role.facilities, Role.staff):
        raise PermissionDeniedError(
            "Only facilities, staff, or admins may trigger SLA escalation.",
            code="sla_escalation_forbidden",
        )
    escalated = await ticket_service.escalate_overdue_tickets(session)
    await session.commit()
    return {
        "escalated_count": len(escalated),
        "tickets": [_serialize_ticket(t) for t in escalated],
    }


@router.get(
    "/{ticket_id}",
    summary="Get a ticket and its event history",
)
async def get_ticket(
    ticket_id: uuid.UUID,
    session: SessionDep,
    principal: CurrentPrincipal,
) -> dict[str, Any]:
    _ = await ensure_principal_user(session, principal)
    ticket, events = await ticket_service.get_ticket_with_events(session, ticket_id)
    return _serialize_ticket(ticket, events=events)


@router.patch(
    "/{ticket_id}/status",
    summary="Transition a ticket's status",
)
async def update_ticket_status(
    ticket_id: uuid.UUID,
    body: TicketTransitionIn,
    session: SessionDep,
    principal: CurrentPrincipal,
) -> dict[str, Any]:
    actor_id = await ensure_principal_user(session, principal)
    if not principal.has_role(Role.admin, Role.facilities, Role.staff) and body.to_status not in {
        TicketStatus.reopened,
        TicketStatus.closed,
    }:
        raise PermissionDeniedError(
            "Only facilities, staff, or admins may perform this status transition.",
            code="ticket_transition_forbidden",
        )
    ticket = await ticket_service.transition_ticket(
        session,
        ticket_id=ticket_id,
        to_status=body.to_status,
        actor_user_id=actor_id,
        assignee_user_id=body.assignee_user_id,
        blocks_use=body.blocks_use,
        note=body.note,
    )
    await session.commit()
    return _serialize_ticket(ticket)


@router.post(
    "/{ticket_id}/rate",
    summary="Rate a resolved or closed ticket",
)
async def rate_ticket(
    ticket_id: uuid.UUID,
    body: TicketRatingIn,
    session: SessionDep,
    principal: CurrentPrincipal,
) -> dict[str, Any]:
    user_id = await ensure_principal_user(session, principal)
    ticket = await ticket_service.rate_ticket(
        session,
        ticket_id=ticket_id,
        reporter_user_id=user_id,
        rating=body.rating,
        comment=body.comment,
    )
    await session.commit()
    return _serialize_ticket(ticket)
