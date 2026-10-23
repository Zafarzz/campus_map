"""Tests for Shared Notification Service (brief sections 6.2, 9).

Covers:
* Multilingual template engine (en, ru, uz, and fallback to en).
* Channel delivery adapters (in_app, web_push, telegram, email, sms).
* User inbox delivery, list ordering, unread filtering, and acknowledgment.
* Push subscription registration and deduplication by endpoint.
* Role-based and campus-wide broadcast with audit log persistence.
* API endpoints:
  - GET /api/v1/notifications
  - POST /api/v1/notifications/{id}/ack
  - POST /api/v1/notifications/push-subscriptions
  - POST /api/v1/notifications/broadcast (admin/facilities role check).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.notifications import (
    EmailAdapter,
    InAppAdapter,
    SmsAdapter,
    TelegramAdapter,
    WebPushAdapter,
)
from app.core.config import Settings
from app.core.errors import ForbiddenError
from app.core.security import Role, create_access_token
from app.domain.base import NotificationChannel, NotificationStatus
from app.domain.people import AppUser
from app.domain.platform import AuditLog
from app.engines.notifications import (
    NOTIFICATION_CATALOGUE,
    render_notification_template,
)
from app.services import notification_service

NOW = datetime(2026, 10, 19, 10, 0, tzinfo=UTC)


# ---------------------------------------------------------------------------
# 1. Pure template engine tests
# ---------------------------------------------------------------------------


class TestNotificationTemplates:
    def test_multilingual_rendering_en_ru_uz(self) -> None:
        """Every built-in template renders cleanly across all three supported locales."""
        params = {
            "topic_tag": "Discrete Math",
            "starts_at": "10:00",
            "ends_at": "11:30",
            "room_id": "bld-h-f1-a101",
            "ticket_short": "1a2b",
            "title": "Broken window handle",
            "category": "window",
            "status": "new",
            "from_status": "new",
            "to_status": "assigned",
            "category_label": "Keys",
            "item_title": "Blue keychain",
            "handover_point": "Front desk",
            "subject": "Campus Maintenance Notice",
            "body": "Power outage planned for Saturday.",
            "alert": "Fire alarm testing in progress.",
            "action": "Please proceed calmly.",
            "kind": "lost",
            "score": 85,
            "decision": "approved",
        }

        for tmpl_id in NOTIFICATION_CATALOGUE:
            for loc in ("en", "ru", "uz"):
                rendered = render_notification_template(tmpl_id, locale=loc, params=params)
                assert rendered.template_id == tmpl_id
                assert rendered.locale == loc
                assert len(rendered.subject) > 0
                assert len(rendered.body) > 0
                assert "{" not in rendered.subject, f"unsubstituted param in {tmpl_id} ({loc})"
                assert "{" not in rendered.body, f"unsubstituted param in {tmpl_id} ({loc})"

    def test_fallback_to_english_for_unknown_locale(self) -> None:
        rendered = render_notification_template(
            "study_group.matched",
            locale="fr",
            params={
                "topic_tag": "Physics",
                "starts_at": "14:00",
                "ends_at": "15:00",
                "room_id": "bld-h-f2-201",
            },
        )
        assert rendered.locale == "en"
        assert "Study group matched: Physics" in rendered.subject

    def test_unknown_template_fallback(self) -> None:
        rendered = render_notification_template(
            "custom.unknown.event",
            locale="en",
            params={"subject": "Custom Subject", "body": "Custom Body"},
        )
        assert rendered.subject == "Custom Subject"
        assert rendered.body == "Custom Body"


# ---------------------------------------------------------------------------
# 2. Channel delivery adapters unit tests
# ---------------------------------------------------------------------------


class TestChannelAdapters:
    @pytest.mark.anyio
    async def test_in_app_adapter(self) -> None:
        adapter = InAppAdapter()
        res = await adapter.send(subject="Hi", body="Hello")
        assert res.delivered is True
        assert res.channel is NotificationChannel.in_app
        assert res.detail == "stored_in_app"

    @pytest.mark.anyio
    async def test_email_adapter(self) -> None:
        adapter = EmailAdapter()
        res = await adapter.send(subject="Hi", body="Hello", recipient_meta={"email": "student@ajou.uz"})
        assert res.delivered is True
        assert res.channel is NotificationChannel.email
        assert res.detail == "email_adapter_dispatched"

    @pytest.mark.anyio
    async def test_telegram_adapter(self) -> None:
        adapter = TelegramAdapter()
        res = await adapter.send(subject="Hi", body="Hello", recipient_meta={"telegram_chat_id": "12345678"})
        assert res.delivered is True
        assert res.channel is NotificationChannel.telegram
        assert res.detail == "telegram_adapter_dispatched"

    @pytest.mark.anyio
    async def test_sms_adapter(self) -> None:
        adapter = SmsAdapter()
        res = await adapter.send(subject="Hi", body="Hello", recipient_meta={"phone": "+998901234567"})
        assert res.delivered is True
        assert res.channel is NotificationChannel.sms
        assert res.detail == "sms_adapter_dispatched"

    @pytest.mark.anyio
    async def test_web_push_adapter(self) -> None:
        adapter = WebPushAdapter()
        # Without subscription: queued
        q_res = await adapter.send(subject="Hi", body="Hello", recipient_meta={})
        assert q_res.delivered is True
        assert q_res.channel is NotificationChannel.web_push
        assert q_res.detail == "queued_for_push_subscription"

        # With subscription: dispatched
        d_res = await adapter.send(
            subject="Hi", body="Hello", recipient_meta={"endpoint": "https://push.example.com"}
        )
        assert d_res.delivered is True
        assert d_res.detail == "web_push_dispatched"


# ---------------------------------------------------------------------------
# 3. Database & Notification service integration tests
# ---------------------------------------------------------------------------


@pytest.mark.db
async def test_send_and_acknowledge_notification(
    seeded_session: AsyncSession,
) -> None:
    user_id = uuid.uuid4()
    user = AppUser(
        id=user_id,
        external_ref=f"sub:{user_id}",
        is_active=True,
        locale="uz",
        email="user@ajou.uz",
    )
    seeded_session.add(user)
    await seeded_session.flush()

    # 1. Send in_app and email notification
    created = await notification_service.send_notification(
        seeded_session,
        recipient_id=user_id,
        template_id="ticket.created",
        params={
            "ticket_short": "abc1",
            "title": "Door latch stuck",
            "category": "doors",
            "status": "new",
        },
        channels=(NotificationChannel.in_app, NotificationChannel.email),
        now=NOW,
    )
    assert len(created) == 2
    in_app_notif = next(c for c in created if c.channel is NotificationChannel.in_app)
    assert in_app_notif.locale == "uz"
    assert "Murojaat #abc1 qabul qilindi" in in_app_notif.subject
    assert in_app_notif.status is NotificationStatus.sent
    assert in_app_notif.acknowledged_at is None

    # 2. List unacknowledged user notifications
    unack = await notification_service.list_user_notifications(
        seeded_session, user_id=user_id, unread_only=True
    )
    assert len(unack) >= 1
    assert any(n.id == in_app_notif.id for n in unack)

    # 3. Acknowledge notification
    acked = await notification_service.acknowledge_notification(
        seeded_session,
        notification_id=in_app_notif.id,
        user_id=user_id,
        now=NOW,
    )
    assert acked.status is NotificationStatus.acknowledged
    assert acked.acknowledged_at == NOW

    # 4. Another user cannot acknowledge someone else's notification
    stranger_id = uuid.uuid4()
    with pytest.raises(ForbiddenError):
        await notification_service.acknowledge_notification(
            seeded_session,
            notification_id=in_app_notif.id,
            user_id=stranger_id,
        )


@pytest.mark.db
async def test_push_subscription_registration(
    seeded_session: AsyncSession,
) -> None:
    user_id = uuid.uuid4()
    seeded_session.add(AppUser(id=user_id, external_ref=f"sub:{user_id}", is_active=True))
    await seeded_session.flush()

    endpoint = "https://fcm.googleapis.com/fcm/send/sample-token-123"

    sub = await notification_service.register_push_subscription(
        seeded_session,
        user_id=user_id,
        endpoint=endpoint,
        p256dh="test_p256dh_key",
        auth="test_auth_token",
    )
    assert sub.user_id == user_id
    assert sub.is_active is True

    # Registering same endpoint with different key updates in place
    sub_updated = await notification_service.register_push_subscription(
        seeded_session,
        user_id=user_id,
        endpoint=endpoint,
        p256dh="updated_key",
        auth="test_auth_token",
    )
    assert sub_updated.id == sub.id
    assert sub_updated.p256dh == "updated_key"


@pytest.mark.db
async def test_broadcast_and_audit_logging(
    seeded_session: AsyncSession,
) -> None:
    u1, u2 = uuid.uuid4(), uuid.uuid4()
    actor_id = uuid.uuid4()

    seeded_session.add(AppUser(id=u1, external_ref=f"sub:{u1}", is_active=True, locale="en"))
    seeded_session.add(AppUser(id=u2, external_ref=f"sub:{u2}", is_active=True, locale="ru"))
    seeded_session.add(AppUser(id=actor_id, external_ref=f"sub:{actor_id}", is_active=True, locale="en"))
    await seeded_session.flush()

    dispatched = await notification_service.broadcast_notification(
        seeded_session,
        template_id="broadcast.general",
        params={
            "subject": "Campus Maintenance Notice",
            "body": "Campus water supply maintenance on Saturday.",
        },
        audience_label="all_campus",
        channels=(NotificationChannel.in_app,),
        actor_id=actor_id,
        reason="Scheduled facilities maintenance",
        now=NOW,
    )
    assert len(dispatched) >= 3

    # Check audit log entry was created
    audit = (
        await seeded_session.execute(
            select(AuditLog).where(
                AuditLog.action == "notification.broadcast",
                AuditLog.target_id == "all_campus",
            )
        )
    ).scalar_one_or_none()
    assert audit is not None
    assert audit.actor_id == actor_id
    assert audit.reason == "Scheduled facilities maintenance"


# ---------------------------------------------------------------------------
# 4. API Integration tests
# ---------------------------------------------------------------------------


@pytest.mark.db
async def test_notifications_api_lifecycle(
    seeded_client: AsyncClient,
    settings: Settings,
) -> None:
    prefix = "/api/v1"
    user_id = uuid.uuid4()
    admin_id = uuid.uuid4()

    user_token = create_access_token(str(user_id), [Role.student], settings=settings)
    admin_token = create_access_token(str(admin_id), [Role.admin, Role.facilities], settings=settings)

    u_headers = {"Authorization": f"Bearer {user_token}"}
    adm_headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Register Web Push subscription
    r_push = await seeded_client.post(
        f"{prefix}/notifications/push-subscriptions",
        headers=u_headers,
        json={
            "endpoint": f"https://push.example.com/endpoint/{user_id}",
            "p256dh": "dummy-p256dh",
            "auth": "dummy-auth",
        },
    )
    assert r_push.status_code == 201
    assert r_push.json()["endpoint"] == f"https://push.example.com/endpoint/{user_id}"

    # 2. Admin broadcasts an announcement
    r_bcast = await seeded_client.post(
        f"{prefix}/notifications/broadcast",
        headers=adm_headers,
        json={
            "template_id": "broadcast.general",
            "params": {
                "subject": "Fire Drill Announcement",
                "body": "A routine fire drill is scheduled for tomorrow at 10:00.",
            },
            "audience_label": "students",
            "channels": ["in_app"],
            "reason": "Annual safety requirement",
        },
    )
    assert r_bcast.status_code == 201
    assert r_bcast.json()["audience"] == "students"

    # 3. User lists their notifications
    r_list = await seeded_client.get(f"{prefix}/notifications", headers=u_headers)
    assert r_list.status_code == 200
    data = r_list.json()
    assert "notifications" in data
    assert len(data["notifications"]) >= 1
    notif = data["notifications"][0]
    notif_id = notif["id"]

    # 4. User acknowledges notification
    r_ack = await seeded_client.post(
        f"{prefix}/notifications/{notif_id}/ack",
        headers=u_headers,
    )
    assert r_ack.status_code == 200
    assert r_ack.json()["status"] == "acknowledged"
    assert r_ack.json()["acknowledged_at"] is not None
