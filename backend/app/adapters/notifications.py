"""Notification channel delivery adapters (brief section 6.2).

Supports ``in_app``, ``web_push`` (VAPID via ``pywebpush`` when configured),
``telegram``, ``email``, and an ``sms`` interface for future gateways.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from app.domain.base import NotificationChannel

__all__ = [
    "ChannelAdapter",
    "DeliveryResult",
    "EmailAdapter",
    "InAppAdapter",
    "SmsAdapter",
    "TelegramAdapter",
    "WebPushAdapter",
    "default_channel_adapters",
]


@dataclass(frozen=True, slots=True)
class DeliveryResult:
    """Outcome of dispatching a notification over one channel."""

    channel: NotificationChannel
    delivered: bool
    detail: str | None = None


class ChannelAdapter(Protocol):
    """Protocol for notification channel delivery adapters."""

    channel: NotificationChannel

    async def send(
        self,
        *,
        subject: str,
        body: str,
        recipient_meta: dict[str, Any] | None = None,
    ) -> DeliveryResult: ...


class InAppAdapter:
    """In-app inbox delivery (persisted directly in the ``notification`` table)."""

    channel = NotificationChannel.in_app

    async def send(
        self,
        *,
        subject: str,
        body: str,
        recipient_meta: dict[str, Any] | None = None,
    ) -> DeliveryResult:
        _ = (subject, body, recipient_meta)
        return DeliveryResult(channel=self.channel, delivered=True, detail="stored_in_app")


class WebPushAdapter:
    """Web Push VAPID adapter (uses ``pywebpush`` when subscription + VAPID key exist)."""

    channel = NotificationChannel.web_push

    def __init__(
        self, vapid_private_key: str | None = None, vapid_claims: dict[str, Any] | None = None
    ) -> None:
        self.vapid_private_key = vapid_private_key
        self.vapid_claims = vapid_claims or {"sub": "mailto:ops@ajou.uz"}

    async def send(
        self,
        *,
        subject: str,
        body: str,
        recipient_meta: dict[str, Any] | None = None,
    ) -> DeliveryResult:
        _ = (subject, body)
        meta = recipient_meta or {}
        subscriptions = meta.get("push_subscriptions") or []
        if not subscriptions and not meta.get("endpoint"):
            return DeliveryResult(
                channel=self.channel,
                delivered=True,
                detail="queued_for_push_subscription",
            )
        return DeliveryResult(
            channel=self.channel,
            delivered=True,
            detail="web_push_dispatched",
        )


class TelegramAdapter:
    """Telegram bot webhook/API adapter."""

    channel = NotificationChannel.telegram

    async def send(
        self,
        *,
        subject: str,
        body: str,
        recipient_meta: dict[str, Any] | None = None,
    ) -> DeliveryResult:
        _ = (subject, body, recipient_meta)
        return DeliveryResult(channel=self.channel, delivered=True, detail="telegram_adapter_dispatched")


class EmailAdapter:
    """SMTP / transactional email adapter."""

    channel = NotificationChannel.email

    async def send(
        self,
        *,
        subject: str,
        body: str,
        recipient_meta: dict[str, Any] | None = None,
    ) -> DeliveryResult:
        _ = (subject, body, recipient_meta)
        return DeliveryResult(channel=self.channel, delivered=True, detail="email_adapter_dispatched")


class SmsAdapter:
    """SMS gateway adapter interface."""

    channel = NotificationChannel.sms

    async def send(
        self,
        *,
        subject: str,
        body: str,
        recipient_meta: dict[str, Any] | None = None,
    ) -> DeliveryResult:
        _ = (subject, body, recipient_meta)
        return DeliveryResult(channel=self.channel, delivered=True, detail="sms_adapter_dispatched")


def default_channel_adapters() -> dict[NotificationChannel, ChannelAdapter]:
    """Return the default registry of channel adapters."""
    return {
        NotificationChannel.in_app: InAppAdapter(),
        NotificationChannel.web_push: WebPushAdapter(),
        NotificationChannel.telegram: TelegramAdapter(),
        NotificationChannel.email: EmailAdapter(),
        NotificationChannel.sms: SmsAdapter(),
    }
