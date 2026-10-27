"""Shared notifications API (brief section 6.2).

Endpoints:
* ``GET /notifications`` — list caller's notifications.
* ``POST /notifications/{notification_id}/ack`` — acknowledge a notification.
* ``POST /notifications/push-subscriptions`` — register a Web Push VAPID endpoint.
* ``POST /notifications/broadcast`` — broadcast a notification to an audience
  (requires ``admin`` or ``facilities`` role; audited).
"""

from __future__ import annotations

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.busyness import ensure_principal_user
from app.core.db import get_session
from app.core.security import CurrentPrincipal, Role, require_roles
from app.domain.base import NotificationChannel
from app.domain.platform import Notification
from app.services import notification_service

router = APIRouter(prefix="/notifications", tags=["notifications"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]


class PushSubscriptionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    endpoint: str = Field(min_length=1, max_length=512)
    p256dh: str = Field(min_length=1, max_length=256)
    auth: str = Field(min_length=1, max_length=128)


class BroadcastIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    template_id: str = Field(default="broadcast.general", max_length=64)
    params: dict[str, Any] = Field(default_factory=dict)
    target_role: Role | None = None
    audience_label: str = Field(default="campus", max_length=120)
    channels: list[NotificationChannel] = Field(default_factory=lambda: [NotificationChannel.in_app])
    reason: str | None = Field(default=None, max_length=500)


def _serialize_notification(n: Notification) -> dict[str, Any]:
    return {
        "id": str(n.id),
        "recipient_id": str(n.recipient_id) if n.recipient_id else None,
        "audience": n.audience,
        "channel": n.channel.value,
        "status": n.status.value,
        "template_id": n.template_id,
        "locale": n.locale,
        "subject": n.subject,
        "body": n.body,
        "payload": n.payload,
        "created_at": n.created_at.isoformat() if n.created_at else None,
        "sent_at": n.sent_at.isoformat() if n.sent_at else None,
        "acknowledged_at": n.acknowledged_at.isoformat() if n.acknowledged_at else None,
    }


@router.get(
    "",
    summary="List notifications for the signed-in user",
)
async def list_notifications(
    session: SessionDep,
    principal: CurrentPrincipal,
    unread_only: Annotated[bool, Query()] = False,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> dict[str, Any]:
    user_id = await ensure_principal_user(session, principal)
    rows = await notification_service.list_user_notifications(
        session, user_id=user_id, unread_only=unread_only, limit=limit
    )
    return {
        "count": len(rows),
        "notifications": [_serialize_notification(r) for r in rows],
    }


@router.post(
    "/{notification_id}/ack",
    summary="Acknowledge a notification",
)
async def ack_notification(
    notification_id: uuid.UUID,
    session: SessionDep,
    principal: CurrentPrincipal,
) -> dict[str, Any]:
    user_id = await ensure_principal_user(session, principal)
    row = await notification_service.acknowledge_notification(
        session, notification_id=notification_id, user_id=user_id
    )
    await session.commit()
    return _serialize_notification(row)


@router.post(
    "/push-subscriptions",
    status_code=status.HTTP_201_CREATED,
    summary="Register a Web Push subscription endpoint",
)
async def register_push(
    body: PushSubscriptionIn,
    session: SessionDep,
    principal: CurrentPrincipal,
) -> dict[str, Any]:
    user_id = await ensure_principal_user(session, principal)
    sub = await notification_service.register_push_subscription(
        session,
        user_id=user_id,
        endpoint=body.endpoint,
        p256dh=body.p256dh,
        auth=body.auth,
    )
    await session.commit()
    return {
        "id": str(sub.id),
        "user_id": str(sub.user_id),
        "endpoint": sub.endpoint,
        "is_active": sub.is_active,
    }


@router.post(
    "/broadcast",
    status_code=status.HTTP_201_CREATED,
    summary="Broadcast a notification to a campus audience",
    dependencies=[Depends(require_roles(Role.admin, Role.facilities, Role.safety_officer))],
)
async def broadcast(
    body: BroadcastIn,
    session: SessionDep,
    principal: CurrentPrincipal,
) -> dict[str, Any]:
    actor_id = await ensure_principal_user(session, principal)
    rows = await notification_service.broadcast_notification(
        session,
        template_id=body.template_id,
        params=body.params,
        target_role=body.target_role,
        audience_label=body.audience_label,
        channels=tuple(body.channels),
        actor_id=actor_id,
        reason=body.reason,
    )
    await session.commit()
    return {
        "dispatched_count": len(rows),
        "audience": body.audience_label,
        "template_id": body.template_id,
    }
