"""Operational domain tables: shared issue/ticket engine (brief section 6.2).

Used by Layer 2 dorm maintenance requests in Phase 3 and Layer 4 facilities &
AV support in Phase 4. When ``blocks_use=True`` and the ticket is active
(``new``, ``triaged``, ``assigned``, ``in_progress``, ``reopened``), the
linked room's ``out_of_service`` flag is set to ``True`` so the room-state
precedence engine puts the room into ``out_of_service`` at the top of the
hierarchy.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.domain.base import (
    TICKET_PRIORITY,
    TICKET_STATUS,
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
