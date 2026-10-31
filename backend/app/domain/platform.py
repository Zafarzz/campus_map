"""Platform concerns: audit, API clients, notifications, and the scenario engine.

``audit_log`` exists because the brief requires an entry for every privileged
action (section 9), and because some later features - break-glass access to named
unaccounted people during a drill, campus-wide emergency broadcasts - are only
defensible if they are logged immutably.

``scenario`` and ``scenario_change`` implement the shared Scenario Engine
(brief sections 6.2, 7, 13.4, and 20.5): a copy-on-write overlay of the timetable
so the timetable optimiser and what-if sandbox never mutate live tables.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.domain.base import (
    NOTIFICATION_CHANNEL,
    NOTIFICATION_STATUS,
    SCENARIO_STATUS,
    IsDemoMixin,
    NotificationChannel,
    NotificationStatus,
    ScenarioStatus,
    ShortText,
    SlugId,
    TimestampMixin,
    Utc,
    UuidPkMixin,
)


class AuditLog(Base, UuidPkMixin):
    """Append-only record of a privileged action.

    Deliberately has no ``updated_at`` and no mixin that would let it be
    rewritten: an audit trail that can be edited is not an audit trail.
    """

    __tablename__ = "audit_log"
    __table_args__ = (
        Index("ix_audit_log_actor_at", "actor_id", "at"),
        Index("ix_audit_log_action_at", "action", "at"),
        Index("ix_audit_log_target", "target_type", "target_id"),
    )

    at: Mapped[Utc] = mapped_column(server_default=text("now()"), nullable=False)
    #: Pseudonymous actor. NULL for system and scheduled actions.
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="SET NULL")
    )
    actor_label: Mapped[str | None] = mapped_column(String(120))
    #: Dotted action name, e.g. "schedule.import.apply", "alert.broadcast.send".
    action: Mapped[ShortText] = mapped_column(nullable=False)
    target_type: Mapped[ShortText | None] = mapped_column()
    target_id: Mapped[str | None] = mapped_column(String(128))
    #: Why, when the action requires a stated reason (break-glass access).
    reason: Mapped[str | None] = mapped_column(Text)
    #: Correlates the entry with the logs for the same request.
    request_id: Mapped[str | None] = mapped_column(String(64))
    #: Action-specific detail. Must never contain credentials or a person's
    #: location.
    details: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    outcome: Mapped[ShortText] = mapped_column(nullable=False, server_default=text("'ok'"))


class ApiClient(Base, UuidPkMixin, TimestampMixin):
    """A machine consumer of the API.

    Only a hash of the token is stored, so a database leak does not hand out
    working credentials.
    """

    __tablename__ = "api_client"
    __table_args__ = (Index("ix_api_client_token_hash", "token_hash", unique=True),)

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    #: Granted scopes, e.g. ["state:read", "busyness:read"].
    scopes: Mapped[list[Any] | None] = mapped_column(JSONB)
    is_active: Mapped[bool] = mapped_column(nullable=False, server_default=text("true"))
    rate_limit_per_minute: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("60"))
    last_used_at: Mapped[Utc | None] = mapped_column()


class SeedRun(Base, UuidPkMixin):
    """Record of a seeding run.

    Keeps the extractor's content hash so a later run can tell whether the front
    end's data actually changed, and keeps the counts so the Phase report can
    cite real numbers instead of claims.
    """

    __tablename__ = "seed_run"

    at: Mapped[Utc] = mapped_column(server_default=text("now()"), nullable=False)
    source: Mapped[ShortText] = mapped_column(nullable=False)
    #: SHA-256 of the extracted inventory, so drift is detectable.
    inventory_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    random_seed: Mapped[int] = mapped_column(Integer, nullable=False)
    counts: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    warnings: Mapped[list[Any] | None] = mapped_column(JSONB)


class Notification(Base, UuidPkMixin, TimestampMixin, IsDemoMixin):
    """A notification delivered or queued for a recipient (brief section 6.2).

    All user-facing text goes through the i18n message catalogues via
    ``template_id`` and ``template_params``; ``subject`` and ``body`` hold the
    rendered text in the recipient's locale at the time of dispatch.
    """

    __tablename__ = "notification"
    __table_args__ = (
        Index("ix_notification_recipient_created", "recipient_id", "created_at"),
        Index("ix_notification_status", "status"),
    )

    recipient_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE")
    )
    #: Audience tag when targeting a role, building, or group.
    audience: Mapped[str | None] = mapped_column(String(120))
    channel: Mapped[NotificationChannel] = mapped_column(NOTIFICATION_CHANNEL, nullable=False)
    status: Mapped[NotificationStatus] = mapped_column(
        NOTIFICATION_STATUS, nullable=False, server_default=text("'queued'")
    )
    template_id: Mapped[ShortText] = mapped_column(nullable=False)
    locale: Mapped[str] = mapped_column(String(8), nullable=False, server_default=text("'en'"))
    subject: Mapped[str] = mapped_column(String(300), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    payload: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    sent_at: Mapped[Utc | None] = mapped_column()
    acknowledged_at: Mapped[Utc | None] = mapped_column()
    error_detail: Mapped[str | None] = mapped_column(Text)


class PushSubscription(Base, UuidPkMixin, TimestampMixin):
    """Web Push VAPID subscription endpoint registered by a user's browser."""

    __tablename__ = "push_subscription"
    __table_args__ = (
        Index("ix_push_subscription_user", "user_id"),
        Index("ix_push_subscription_endpoint", "endpoint", unique=True),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False
    )
    endpoint: Mapped[str] = mapped_column(String(512), nullable=False)
    p256dh: Mapped[str] = mapped_column(String(256), nullable=False)
    auth: Mapped[str] = mapped_column(String(128), nullable=False)
    is_active: Mapped[bool] = mapped_column(nullable=False, server_default=text("true"))


class Scenario(Base, UuidPkMixin, TimestampMixin, IsDemoMixin):
    """Copy-on-write timetable overlay for the optimiser and what-if sandbox (brief sections 6.2, 13.4, 20.5).

    Creating or evaluating a scenario never mutates live ``meeting`` or
    ``meeting_rule`` rows.
    """

    __tablename__ = "scenario"
    __table_args__ = (Index("ix_scenario_campus_status", "campus_id", "status"),)

    campus_id: Mapped[SlugId] = mapped_column(
        ForeignKey("campus.id", ondelete="CASCADE"), nullable=False, index=True
    )
    term_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("term.id", ondelete="SET NULL")
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    #: "timetable_optimiser" | "what_if" | "energy_plan" | "drill"
    kind: Mapped[ShortText] = mapped_column(nullable=False, server_default=text("'timetable_optimiser'"))
    status: Mapped[ScenarioStatus] = mapped_column(
        SCENARIO_STATUS, nullable=False, server_default=text("'proposed'")
    )
    solver_status: Mapped[ShortText | None] = mapped_column()
    baseline_metrics: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    proposal_metrics: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    tradeoffs_summary: Mapped[str | None] = mapped_column(Text)
    parameters_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="SET NULL")
    )
    approved_by: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="SET NULL")
    )
    approved_at: Mapped[Utc | None] = mapped_column()
    committed_at: Mapped[Utc | None] = mapped_column()

    changes: Mapped[list[ScenarioChange]] = relationship(
        back_populates="scenario", cascade="all, delete-orphan"
    )


class ScenarioChange(Base, UuidPkMixin, TimestampMixin):
    """One proposed modification inside a :class:`Scenario`."""

    __tablename__ = "scenario_change"
    __table_args__ = (Index("ix_scenario_change_scenario", "scenario_id"),)

    scenario_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("scenario.id", ondelete="CASCADE"), nullable=False
    )
    #: "move" | "room_change" | "move_and_room_change" | "cancel" | "capacity_change" | "room_closure"
    change_type: Mapped[ShortText] = mapped_column(nullable=False)
    section_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("section.id", ondelete="SET NULL")
    )
    meeting_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("meeting.id", ondelete="SET NULL")
    )
    course_code: Mapped[ShortText | None] = mapped_column()
    section_code: Mapped[ShortText | None] = mapped_column()
    old_room_id: Mapped[SlugId | None] = mapped_column(ForeignKey("room.id", ondelete="SET NULL"))
    new_room_id: Mapped[SlugId | None] = mapped_column(ForeignKey("room.id", ondelete="SET NULL"))
    old_weekday: Mapped[int | None] = mapped_column(Integer)
    new_weekday: Mapped[int | None] = mapped_column(Integer)
    old_period: Mapped[int | None] = mapped_column(Integer)
    new_period: Mapped[int | None] = mapped_column(Integer)
    reason: Mapped[str | None] = mapped_column(Text)
    payload: Mapped[dict[str, Any] | None] = mapped_column(JSONB)

    scenario: Mapped[Scenario] = relationship(back_populates="changes")
