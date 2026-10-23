"""Layer 2 (Student Life) domain tables (brief section 12).

Covers:
* Study-group matcher (opt-in): ``StudyGroupRequest``, ``StudyGroupSession``,
  ``StudyGroupMember``.
* Lost and found: ``LostFoundItem``, ``LostFoundClaim``.
* Dorm notice board: ``DormNotice``.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.domain.base import (
    LOST_FOUND_KIND,
    LOST_FOUND_STATUS,
    STUDY_GROUP_STATUS,
    IsDemoMixin,
    LostFoundKind,
    LostFoundStatus,
    ShortText,
    SlugId,
    StudyGroupStatus,
    TimestampMixin,
    Utc,
    UuidPkMixin,
)


class StudyGroupRequest(Base, UuidPkMixin, TimestampMixin, IsDemoMixin):
    """Opt-in student request to find a study partner or small group."""

    __tablename__ = "study_group_request"
    __table_args__ = (
        CheckConstraint("window_end > window_start", name="study_group_request_window"),
        CheckConstraint(
            "wanted_group_size >= 2 AND wanted_group_size <= 8",
            name="study_group_request_size_bounds",
        ),
        Index("ix_study_group_request_status_tag", "status", "topic_tag"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("app_user.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    course_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("course.id", ondelete="SET NULL"),
        index=True,
    )
    topic_tag: Mapped[str] = mapped_column(String(120), nullable=False)
    wanted_group_size: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("2"))
    min_duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("60"))
    window_start: Mapped[Utc] = mapped_column(nullable=False)
    window_end: Mapped[Utc] = mapped_column(nullable=False)
    preferred_building_id: Mapped[SlugId | None] = mapped_column(
        ForeignKey("building.id", ondelete="SET NULL"),
    )
    status: Mapped[StudyGroupStatus] = mapped_column(
        STUDY_GROUP_STATUS, nullable=False, server_default=text("'open'")
    )
    notes: Mapped[str | None] = mapped_column(Text)


class StudyGroupSession(Base, UuidPkMixin, TimestampMixin, IsDemoMixin):
    """Matched study session with a proposed room, time window, and optional booking."""

    __tablename__ = "study_group_session"
    __table_args__ = (
        CheckConstraint("ends_at > starts_at", name="study_group_session_window"),
        Index("ix_study_group_session_status_time", "status", "starts_at"),
    )

    topic_tag: Mapped[str] = mapped_column(String(120), nullable=False)
    course_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("course.id", ondelete="SET NULL"),
    )
    proposed_room_id: Mapped[SlugId | None] = mapped_column(
        ForeignKey("room.id", ondelete="SET NULL"),
    )
    booking_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("booking.id", ondelete="SET NULL"),
    )
    starts_at: Mapped[Utc] = mapped_column(nullable=False)
    ends_at: Mapped[Utc] = mapped_column(nullable=False)
    status: Mapped[StudyGroupStatus] = mapped_column(
        STUDY_GROUP_STATUS, nullable=False, server_default=text("'matched'")
    )
    match_score: Mapped[float] = mapped_column(Float, nullable=False, server_default=text("0.0"))


class StudyGroupMember(Base, UuidPkMixin, TimestampMixin):
    """Membership linking a student and their request to a matched study session."""

    __tablename__ = "study_group_member"
    __table_args__ = (UniqueConstraint("session_id", "user_id", name="uq_study_group_member"),)

    session_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("study_group_session.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    request_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("study_group_request.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("app_user.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    accepted: Mapped[bool | None] = mapped_column(Boolean)
    responded_at: Mapped[Utc | None] = mapped_column()


class LostFoundItem(Base, UuidPkMixin, TimestampMixin, IsDemoMixin):
    """Lost or found item report on campus (brief section 12.2)."""

    __tablename__ = "lost_found_item"
    __table_args__ = (
        Index("ix_lost_found_kind_status", "kind", "status"),
        Index("ix_lost_found_category_time", "category", "occurred_at"),
    )

    reporter_user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("app_user.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    kind: Mapped[LostFoundKind] = mapped_column(LOST_FOUND_KIND, nullable=False)
    status: Mapped[LostFoundStatus] = mapped_column(
        LOST_FOUND_STATUS, nullable=False, server_default=text("'open'")
    )
    category: Mapped[ShortText] = mapped_column(nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("''"))
    photo_storage_key: Mapped[str | None] = mapped_column(String(256))
    building_id: Mapped[SlugId | None] = mapped_column(
        ForeignKey("building.id", ondelete="SET NULL"),
        index=True,
    )
    floor_id: Mapped[SlugId | None] = mapped_column(
        ForeignKey("floor.id", ondelete="SET NULL"),
    )
    room_id: Mapped[SlugId | None] = mapped_column(
        ForeignKey("room.id", ondelete="SET NULL"),
    )
    pin_x_m: Mapped[float | None] = mapped_column(Float)
    pin_z_m: Mapped[float | None] = mapped_column(Float)
    occurred_at: Mapped[Utc] = mapped_column(nullable=False)
    verification_question: Mapped[str | None] = mapped_column(String(300))
    handover_point: Mapped[str | None] = mapped_column(String(200))
    expires_at: Mapped[Utc] = mapped_column(nullable=False, index=True)


class LostFoundClaim(Base, UuidPkMixin, TimestampMixin):
    """Claim submitted for a found item, requiring verification by the finder."""

    __tablename__ = "lost_found_claim"
    __table_args__ = (Index("ix_lost_found_claim_item", "item_id", "status"),)

    item_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("lost_found_item.id", ondelete="CASCADE"),
        nullable=False,
    )
    claimant_user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("app_user.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    verification_answer: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[ShortText] = mapped_column(nullable=False, server_default=text("'pending'"))
    handover_point: Mapped[str | None] = mapped_column(String(200))
    resolved_at: Mapped[Utc | None] = mapped_column()


class DormNotice(Base, UuidPkMixin, TimestampMixin, IsDemoMixin):
    """Notice board entry for dormitory residents (brief section 12.3)."""

    __tablename__ = "dorm_notice"
    __table_args__ = (Index("ix_dorm_notice_building_pinned", "building_id", "pinned"),)

    author_user_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("app_user.id", ondelete="SET NULL"),
    )
    building_id: Mapped[SlugId] = mapped_column(
        ForeignKey("building.id", ondelete="CASCADE"),
        nullable=False,
        server_default=text("'bld-j'"),
    )
    title_i18n: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    body_i18n: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    expires_at: Mapped[Utc | None] = mapped_column()
