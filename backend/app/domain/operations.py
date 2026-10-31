"""Operational domain tables: tickets, smart cleaning tasks, and asset registry
(brief sections 6.2, 7, 13.1, 14.1, 14.3, 14.4).

Used by Layer 2 dorm maintenance requests in Phase 3 and Layer 4 facilities &
AV support in Phase 4. When ``blocks_use=True`` and the ticket is active
(``new``, ``triaged``, ``assigned``, ``in_progress``, ``reopened``), the
linked room's ``out_of_service`` flag is set to ``True`` so the room-state
precedence engine puts the room into ``out_of_service`` at the top of the
hierarchy.
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.domain.base import (
    ASSET_CONDITION,
    ASSET_STATUS,
    CLEANING_TASK_STATUS,
    TICKET_PRIORITY,
    TICKET_STATUS,
    AssetCondition,
    AssetStatus,
    CleaningTaskStatus,
    IsDemoMixin,
    ShortText,
    SlugId,
    TicketPriority,
    TicketStatus,
    TimestampMixin,
    Utc,
    UuidPkMixin,
)


class Ticket(Base, UuidPkMixin, TimestampMixin, IsDemoMixin):
    """Shared issue / maintenance ticket."""

    __tablename__ = "ticket"
    __table_args__ = (
        CheckConstraint(
            "satisfaction_rating IS NULL OR (satisfaction_rating >= 1 AND satisfaction_rating <= 5)",
            name="ticket_satisfaction_bounds",
        ),
        Index("ix_ticket_status_priority", "status", "priority"),
        Index("ix_ticket_room_status", "room_id", "status"),
        Index("ix_ticket_category_created", "category", "created_at"),
    )

    reporter_user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("app_user.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    assignee_user_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("app_user.id", ondelete="SET NULL"),
        index=True,
    )
    building_id: Mapped[SlugId | None] = mapped_column(
        ForeignKey("building.id", ondelete="SET NULL"),
        index=True,
    )
    floor_id: Mapped[SlugId | None] = mapped_column(
        ForeignKey("floor.id", ondelete="SET NULL"),
    )
    room_id: Mapped[SlugId | None] = mapped_column(
        ForeignKey("room.id", ondelete="SET NULL"),
        index=True,
    )
    place_id: Mapped[SlugId | None] = mapped_column(
        ForeignKey("place.id", ondelete="SET NULL"),
    )
    category: Mapped[ShortText] = mapped_column(nullable=False)
    subcategory: Mapped[ShortText | None] = mapped_column()
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("''"))
    photo_storage_key: Mapped[str | None] = mapped_column(String(256))
    priority: Mapped[TicketPriority] = mapped_column(
        TICKET_PRIORITY, nullable=False, server_default=text("'normal'")
    )
    status: Mapped[TicketStatus] = mapped_column(TICKET_STATUS, nullable=False, server_default=text("'new'"))
    blocks_use: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    duplicate_of_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("ticket.id", ondelete="SET NULL"),
    )
    upvotes_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("1"))
    sla_due_at: Mapped[Utc | None] = mapped_column()
    resolved_at: Mapped[Utc | None] = mapped_column()
    closed_at: Mapped[Utc | None] = mapped_column()
    satisfaction_rating: Mapped[int | None] = mapped_column(Integer)
    satisfaction_comment: Mapped[str | None] = mapped_column(Text)
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB)


class TicketEvent(Base, UuidPkMixin):
    """Append-only history log of state transitions and updates on a ticket."""

    __tablename__ = "ticket_event"
    __table_args__ = (Index("ix_ticket_event_ticket_time", "ticket_id", "created_at"),)

    ticket_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("ticket.id", ondelete="CASCADE"),
        nullable=False,
    )
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("app_user.id", ondelete="SET NULL"),
    )
    event_type: Mapped[ShortText] = mapped_column(nullable=False)
    from_status: Mapped[TicketStatus | None] = mapped_column(TICKET_STATUS)
    to_status: Mapped[TicketStatus | None] = mapped_column(TICKET_STATUS)
    note: Mapped[str | None] = mapped_column(Text)
    payload: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    created_at: Mapped[Utc] = mapped_column(server_default=func.now(), nullable=False)


class Asset(Base, UuidPkMixin, TimestampMixin, IsDemoMixin):
    """Tracked campus or laboratory asset (brief sections 7, 13.1, 14.4).

    Supports printable QR labels, loans with due dates, condition tracking, and
    preventive-maintenance reminders by date or usage hours. No GPS or RFID.
    """

    __tablename__ = "asset"
    __table_args__ = (
        UniqueConstraint("campus_id", "asset_code", name="uq_asset_campus_id_asset_code"),
        CheckConstraint("usage_hours >= 0.0", name="asset_usage_hours_non_negative"),
        Index("ix_asset_campus_type", "campus_id", "asset_type"),
        Index("ix_asset_room", "room_id"),
    )

    campus_id: Mapped[SlugId] = mapped_column(
        ForeignKey("campus.id", ondelete="CASCADE"), nullable=False, index=True
    )
    asset_code: Mapped[ShortText] = mapped_column(nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    asset_type: Mapped[ShortText] = mapped_column(nullable=False)
    room_id: Mapped[SlugId | None] = mapped_column(ForeignKey("room.id", ondelete="SET NULL"))
    building_id: Mapped[SlugId | None] = mapped_column(ForeignKey("building.id", ondelete="SET NULL"))
    #: Optional link to a bookable Resource row when this asset is reservable.
    resource_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("resource.id", ondelete="SET NULL")
    )
    condition: Mapped[AssetCondition] = mapped_column(
        ASSET_CONDITION, nullable=False, server_default=text("'good'")
    )
    status: Mapped[AssetStatus] = mapped_column(
        ASSET_STATUS, nullable=False, server_default=text("'available'")
    )
    serial_number: Mapped[str | None] = mapped_column(String(128))
    usage_hours: Mapped[float] = mapped_column(Float, nullable=False, server_default=text("0.0"))
    maintenance_interval_days: Mapped[int | None] = mapped_column(Integer)
    maintenance_interval_hours: Mapped[float | None] = mapped_column(Float)
    last_maintained_at: Mapped[Utc | None] = mapped_column()
    next_maintenance_due_at: Mapped[Utc | None] = mapped_column()
    notes: Mapped[str | None] = mapped_column(Text)
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB)


class AssetLoan(Base, UuidPkMixin, TimestampMixin, IsDemoMixin):
    """Loan and return log for a campus or lab asset (brief sections 13.1, 14.4)."""

    __tablename__ = "asset_loan"
    __table_args__ = (
        CheckConstraint("due_at > checked_out_at", name="asset_loan_window_ordered"),
        Index("ix_asset_loan_asset_returned", "asset_id", "returned_at"),
        Index("ix_asset_loan_borrower", "borrower_user_id"),
    )

    asset_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("asset.id", ondelete="CASCADE"), nullable=False
    )
    borrower_user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False
    )
    issued_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="SET NULL")
    )
    checked_out_at: Mapped[Utc] = mapped_column(nullable=False)
    due_at: Mapped[Utc] = mapped_column(nullable=False)
    returned_at: Mapped[Utc | None] = mapped_column()
    usage_hours_logged: Mapped[float | None] = mapped_column(Float)
    condition_out: Mapped[AssetCondition] = mapped_column(
        ASSET_CONDITION, nullable=False, server_default=text("'good'")
    )
    condition_in: Mapped[AssetCondition | None] = mapped_column(ASSET_CONDITION)
    purpose: Mapped[str | None] = mapped_column(String(300))
    overdue_notified_at: Mapped[Utc | None] = mapped_column()
    notes: Mapped[str | None] = mapped_column(Text)


class CleaningTask(Base, UuidPkMixin, TimestampMixin, IsDemoMixin):
    """Scheduled room cleaning task produced by the smart cleaning planner (brief section 14.3)."""

    __tablename__ = "cleaning_task"
    __table_args__ = (
        CheckConstraint("window_end > window_start", name="cleaning_task_window_ordered"),
        CheckConstraint("dirt_score >= 0.0", name="cleaning_task_dirt_non_negative"),
        Index("ix_cleaning_task_date_zone", "campus_id", "plan_date", "cleaner_zone", "sequence_order"),
        Index("ix_cleaning_task_room_date", "room_id", "plan_date"),
    )

    campus_id: Mapped[SlugId] = mapped_column(
        ForeignKey("campus.id", ondelete="CASCADE"), nullable=False, index=True
    )
    plan_date: Mapped[date] = mapped_column(Date, nullable=False)
    cleaner_zone: Mapped[ShortText] = mapped_column(nullable=False)
    sequence_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    room_id: Mapped[SlugId] = mapped_column(
        ForeignKey("room.id", ondelete="CASCADE"), nullable=False
    )
    building_id: Mapped[SlugId | None] = mapped_column(
        ForeignKey("building.id", ondelete="SET NULL")
    )
    dirt_score: Mapped[float] = mapped_column(Float, nullable=False)
    #: "used_today" | "deep_clean_due"
    reason: Mapped[ShortText] = mapped_column(nullable=False, server_default=text("'used_today'"))
    window_start: Mapped[Utc] = mapped_column(nullable=False)
    window_end: Mapped[Utc] = mapped_column(nullable=False)
    estimated_arrival: Mapped[Utc | None] = mapped_column()
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("15"))
    walking_distance_m: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    status: Mapped[CleaningTaskStatus] = mapped_column(
        CLEANING_TASK_STATUS, nullable=False, server_default=text("'pending'")
    )
    completed_at: Mapped[Utc | None] = mapped_column()
    completed_by: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="SET NULL")
    )
