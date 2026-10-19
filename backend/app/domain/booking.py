"""Booking, with PostgreSQL as the referee.

The correctness argument (brief section 10.4): an application-level availability
check is for friendly errors, but the *guarantee* that two bookings cannot
overlap comes from a database exclusion constraint on a ``tstzrange``. Under
concurrency, 50 simultaneous requests for one slot must produce exactly one
winner, and only the database can promise that.

``ResourceOccupancy`` is the single table that timetable meetings, bookings,
events and maintenance windows all write to, so one constraint covers all of
them and a booking can never be placed on top of a lesson.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, TSTZRANGE, ExcludeConstraint
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.domain.base import (
    OCCUPANCY_KIND,
    OCCUPANCY_STATUS,
    IsDemoMixin,
    OccupancyKind,
    OccupancyStatus,
    ShortText,
    SlugId,
    TimestampMixin,
    Utc,
    UuidPkMixin,
)


class Resource(Base, UuidPkMixin, TimestampMixin, IsDemoMixin):
    """Anything bookable: a room, a lab device, a court, a laundry slot, a hall.

    One table for all of them so the booking engine is written once
    (brief section 6.2). A resource backed by a room points at it; a projector or a
    washing machine does not.
    """

    __tablename__ = "resource"
    __table_args__ = (
        UniqueConstraint("campus_id", "code", name="uq_resource_campus_id_code"),
        Index("ix_resource_kind", "kind"),
    )

    campus_id: Mapped[SlugId] = mapped_column(ForeignKey("campus.id", ondelete="CASCADE"), nullable=False)
    code: Mapped[ShortText] = mapped_column(nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    #: "room" | "lab_device" | "court" | "laundry" | "hall" | "equipment"
    kind: Mapped[ShortText] = mapped_column(nullable=False)
    room_id: Mapped[SlugId | None] = mapped_column(ForeignKey("room.id", ondelete="CASCADE"), index=True)
    capacity: Mapped[int | None] = mapped_column(Integer)
    #: Per-resource policy: min/max duration, how far ahead, buffers, quotas,
    #: approval requirements, prerequisites. Data, not code, because every
    #: resource type wants different numbers (brief section 10.4).
    policy: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    requires_approval: Mapped[bool] = mapped_column(nullable=False, server_default=text("false"))
    is_bookable: Mapped[bool] = mapped_column(nullable=False, server_default=text("true"))

    occupancies: Mapped[list[ResourceOccupancy]] = relationship(
        back_populates="resource", cascade="all, delete-orphan"
    )


class ResourceOccupancy(Base, UuidPkMixin, TimestampMixin, IsDemoMixin):
    """A resource is held for a period. The overlap referee.

    The exclusion constraint below is the heart of the booking engine::

        EXCLUDE USING gist (resource_id WITH =, period WITH &&)
          WHERE (status IN ('pending', 'confirmed'))

    It needs the ``btree_gist`` extension for the equality operator on a scalar
    column inside a GiST index; the migration creates it. Verified against
    PostgreSQL 18 and SQLAlchemy 2.1's ``ExcludeConstraint``.

    ``period`` is a half-open ``[start, end)`` range, so a booking that starts
    exactly when a lesson ends does **not** overlap - which the brief requires
    as an explicit test.
    """

    __tablename__ = "resource_occupancy"
    __table_args__ = (
        ExcludeConstraint(
            ("resource_id", "="),
            ("period", "&&"),
            name="resource_occupancy_no_overlap",
            using="gist",
            where=text("status IN ('pending', 'confirmed')"),
        ),
        CheckConstraint("NOT isempty(period)", name="period_not_empty"),
        CheckConstraint("lower_inc(period) AND NOT upper_inc(period)", name="period_half_open"),
        Index("ix_resource_occupancy_period", "period", postgresql_using="gist"),
        Index("ix_resource_occupancy_resource_status", "resource_id", "status"),
    )

    resource_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("resource.id", ondelete="CASCADE"), nullable=False
    )
    #: Half-open [start, end) UTC range.
    period: Mapped[object] = mapped_column(TSTZRANGE, nullable=False)
    kind: Mapped[OccupancyKind] = mapped_column(OCCUPANCY_KIND, nullable=False)
    status: Mapped[OccupancyStatus] = mapped_column(OCCUPANCY_STATUS, nullable=False)

    #: Exactly one of these points back at what caused the occupancy.
    meeting_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("meeting.id", ondelete="CASCADE")
    )
    booking_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("booking.id", ondelete="CASCADE")
    )
    note: Mapped[str | None] = mapped_column(Text)

    resource: Mapped[Resource] = relationship(back_populates="occupancies")


class Booking(Base, UuidPkMixin, TimestampMixin, IsDemoMixin):
    """A user's reservation of a resource.

    Check-in and auto-release (brief section 10.4): if nobody checks in within the
    grace period the booking is released and the slot freed. Official timetable
    lessons are **never** auto-cancelled by this mechanism - they become
    unconfirmed and prompt a human.
    """

    __tablename__ = "booking"
    __table_args__ = (
        CheckConstraint("ends_at > starts_at", name="booking_window_ordered"),
        CheckConstraint("attendee_count IS NULL OR attendee_count >= 0", name="attendees_non_negative"),
        Index("ix_booking_resource_window", "resource_id", "starts_at", "ends_at"),
        Index("ix_booking_user", "user_id"),
    )

    resource_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("resource.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="SET NULL")
    )
    starts_at: Mapped[Utc] = mapped_column(nullable=False)
    ends_at: Mapped[Utc] = mapped_column(nullable=False)
    status: Mapped[OccupancyStatus] = mapped_column(OCCUPANCY_STATUS, nullable=False)
    purpose: Mapped[str | None] = mapped_column(String(300))
    attendee_count: Mapped[int | None] = mapped_column(Integer)

    #: Check-in window and auto-release bookkeeping.
    checked_in_at: Mapped[Utc | None] = mapped_column()
    released_at: Mapped[Utc | None] = mapped_column()
    #: Recurring bookings need periodic re-confirmation; this is when it lapses.
    expires_at: Mapped[Utc | None] = mapped_column()

    approved_by: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="SET NULL")
    )
    approved_at: Mapped[Utc | None] = mapped_column()


class Blackout(Base, UuidPkMixin, TimestampMixin, IsDemoMixin):
    """A period during which a resource may not be booked.

    Maintenance windows, holidays and reserved blocks. Written into
    ``resource_occupancy`` as well so the same exclusion constraint enforces it;
    this table keeps the human-facing reason and recurrence.
    """

    __tablename__ = "blackout"
    __table_args__ = (
        CheckConstraint("ends_at > starts_at", name="blackout_window_ordered"),
        Index("ix_blackout_resource_window", "resource_id", "starts_at", "ends_at"),
    )

    resource_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("resource.id", ondelete="CASCADE"), nullable=False
    )
    starts_at: Mapped[Utc] = mapped_column(nullable=False)
    ends_at: Mapped[Utc] = mapped_column(nullable=False)
    reason: Mapped[str | None] = mapped_column(Text)
