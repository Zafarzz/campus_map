"""Shared notification service (brief section 6.2).

Handles audience resolution, locale-aware template rendering, multi-channel
dispatch (`in_app`, `web_push`, `telegram`, `email`, `sms`), acknowledgement
tracking, and audit logging for broadcasts.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.notifications import ChannelAdapter, default_channel_adapters
from app.core.errors import ForbiddenError, NotFoundError
from app.core.security import Role
from app.domain.base import NotificationChannel, NotificationStatus
from app.domain.people import AppUser, UserRole
from app.domain.platform import AuditLog, Notification, PushSubscription
from app.engines.notifications import render_notification_template

__all__ = [
    "acknowledge_notification",
    "broadcast_notification",
    "list_user_notifications",
    "register_push_subscription",
    "send_notification",
]


async def send_notification(
    session: AsyncSession,
    *,
    recipient_id: uuid.UUID | None,
    template_id: str,
    params: dict[str, Any] | None = None,
    channels: tuple[NotificationChannel, ...] = (NotificationChannel.in_app,),
    audience: str | None = None,
    locale: str | None = None,
    payload: dict[str, Any] | None = None,
    is_demo: bool = False,
    adapters: dict[NotificationChannel, ChannelAdapter] | None = None,
    now: datetime | None = None,
) -> list[Notification]:
    """Render and dispatch a notification to ``recipient_id`` across ``channels``."""
    instant = now or datetime.now(UTC)
    resolved_locale = locale
    recipient_meta: dict[str, Any] = {}

    if recipient_id is not None:
        user = await session.get(AppUser, recipient_id)
        if user is not None:
            if resolved_locale is None:
                resolved_locale = user.locale or "en"
            recipient_meta["email"] = user.email
        if NotificationChannel.web_push in channels:
            subs = (
                (
                    await session.execute(
                        select(PushSubscription).where(
                            PushSubscription.user_id == recipient_id,
                            PushSubscription.is_active.is_(True),
                        )
                    )
                )
                .scalars()
                .all()
            )
            recipient_meta["push_subscriptions"] = [
                {"endpoint": s.endpoint, "p256dh": s.p256dh, "auth": s.auth} for s in subs
            ]

    rendered = render_notification_template(
        template_id,
        locale=resolved_locale or "en",
        params=params,
    )

    channel_map = adapters or default_channel_adapters()
    created: list[Notification] = []

    for channel in channels:
        adapter = channel_map.get(channel)
        status = NotificationStatus.queued
        sent_at: datetime | None = None
        error_detail: str | None = None

        if adapter is not None:
            try:
                result = await adapter.send(
                    subject=rendered.subject,
                    body=rendered.body,
                    recipient_meta=recipient_meta,
                )
                if result.delivered:
                    status = NotificationStatus.sent
                    sent_at = instant
                else:
                    status = NotificationStatus.failed
                    error_detail = result.detail
            except Exception as exc:
                status = NotificationStatus.failed
                error_detail = str(exc)

        row = Notification(
            recipient_id=recipient_id,
            audience=audience,
            channel=channel,
            status=status,
            template_id=template_id,
            locale=rendered.locale,
            subject=rendered.subject,
            body=rendered.body,
            payload=payload or params,
            sent_at=sent_at,
            error_detail=error_detail,
            is_demo=is_demo,
        )
        session.add(row)
        created.append(row)

    await session.flush()
    return created


async def broadcast_notification(
    session: AsyncSession,
    *,
    template_id: str,
    params: dict[str, Any] | None = None,
    target_role: Role | None = None,
    audience_label: str = "campus",
    channels: tuple[NotificationChannel, ...] = (NotificationChannel.in_app,),
    actor_id: uuid.UUID | None = None,
    reason: str | None = None,
    now: datetime | None = None,
) -> list[Notification]:
    """Broadcast a notification to an audience (all active users or a specific role)."""
    instant = now or datetime.now(UTC)

    stmt = select(AppUser).where(AppUser.is_active.is_(True))
    if target_role is not None:
        stmt = stmt.join(UserRole, UserRole.user_id == AppUser.id).where(UserRole.role == target_role)
    users = (await session.execute(stmt)).scalars().all()

    dispatched: list[Notification] = []
    for user in users:
        rows = await send_notification(
            session,
            recipient_id=user.id,
            template_id=template_id,
            params=params,
            channels=channels,
            audience=audience_label,
            locale=user.locale,
            now=instant,
        )
        dispatched.extend(rows)

    session.add(
        AuditLog(
            actor_id=actor_id,
            action="notification.broadcast",
            target_type="audience",
            target_id=audience_label,
            reason=reason,
            details={
                "template_id": template_id,
                "target_role": target_role.value if target_role else None,
                "recipient_count": len(users),
                "channels": [c.value for c in channels],
            },
        )
    )
    await session.flush()
    return dispatched


async def list_user_notifications(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    unread_only: bool = False,
    limit: int = 50,
) -> list[Notification]:
    """Return notifications for ``user_id`` ordered newest-first."""
    stmt = select(Notification).where(Notification.recipient_id == user_id)
    if unread_only:
        stmt = stmt.where(Notification.acknowledged_at.is_(None))
    stmt = stmt.order_by(Notification.created_at.desc()).limit(limit)
    return list((await session.execute(stmt)).scalars().all())


async def acknowledge_notification(
    session: AsyncSession,
    *,
    notification_id: uuid.UUID,
    user_id: uuid.UUID,
    now: datetime | None = None,
) -> Notification:
    """Mark a notification as acknowledged by its recipient."""
    row = await session.get(Notification, notification_id)
    if row is None:
        raise NotFoundError(
            f"Notification {notification_id} does not exist.",
            code="notification_not_found",
        )
    if row.recipient_id is not None and row.recipient_id != user_id:
        raise ForbiddenError(
            "You may only acknowledge your own notifications.",
            code="not_notification_owner",
        )
    instant = now or datetime.now(UTC)
    row.status = NotificationStatus.acknowledged
    row.acknowledged_at = instant
    await session.flush()
    return row


async def register_push_subscription(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    endpoint: str,
    p256dh: str,
    auth: str,
) -> PushSubscription:
    """Register or update a Web Push subscription endpoint for ``user_id``."""
    existing = (
        await session.execute(select(PushSubscription).where(PushSubscription.endpoint == endpoint))
    ).scalar_one_or_none()
    if existing is not None:
        existing.user_id = user_id
        existing.p256dh = p256dh
        existing.auth = auth
        existing.is_active = True
        await session.flush()
        return existing

    sub = PushSubscription(
        user_id=user_id,
        endpoint=endpoint,
        p256dh=p256dh,
        auth=auth,
        is_active=True,
    )
    session.add(sub)
    await session.flush()
    return sub
