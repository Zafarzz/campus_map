"""People, pseudonymously.

Privacy by design (brief section 3.4): the minimum is collected, the primary key
is an opaque UUID, and nothing here records where a person is. Names and emails
are nullable because most features need neither - a QR check-in needs to know
*that* an enrolled student attended, not who they are.

``external_ref`` is a stable pseudonymous handle from the university's own
systems (a hash, never the raw student number), so attendance can be linked
across imports without the backend ever storing an identifying number.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import Boolean, ForeignKey, Index, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.core.security import Role
from app.domain.base import (
    TEACHER_VISIBILITY_MODE,
    IsDemoMixin,
    ShortText,
    SlugId,
    TeacherVisibilityMode,
    TimestampMixin,
    Utc,
    UuidPkMixin,
    pg_enum,
)

# Named "app_role", not "user_role": creating the ``user_role`` *table* makes
# PostgreSQL define an implicit composite type of the same name, which collides
# with an enum type called ``user_role`` and makes the migration fail with
# "type user_role already exists".
ROLE_ENUM = pg_enum(Role, "app_role")


class AppUser(Base, UuidPkMixin, TimestampMixin, IsDemoMixin):
    """An account.

    Named ``app_user`` in SQL because ``user`` is reserved in PostgreSQL.
    """

    __tablename__ = "app_user"
    __table_args__ = (
        UniqueConstraint("external_ref", name="uq_app_user_external_ref"),
        Index(
            "ix_app_user_email_lower",
            text("lower(email)"),
            unique=True,
            postgresql_where=text("email IS NOT NULL"),
        ),
    )

    #: Pseudonymous handle from an upstream system. Never a raw student number.
    external_ref: Mapped[str | None] = mapped_column(String(128))
    #: Only stored when a feature genuinely needs to contact the person.
    email: Mapped[str | None] = mapped_column(String(254))
    display_name: Mapped[str | None] = mapped_column(String(200))
    #: Development-only local accounts (refused outside development by Settings).
    password_hash: Mapped[str | None] = mapped_column(String(256))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    locale: Mapped[str] = mapped_column(String(8), nullable=False, server_default=text("'en'"))
    last_seen_at: Mapped[Utc | None] = mapped_column()

    roles: Mapped[list[UserRole]] = relationship(
        back_populates="user", cascade="all, delete-orphan", lazy="selectin"
    )
    consents: Mapped[list[Consent]] = relationship(back_populates="user", cascade="all, delete-orphan")

    @property
    def role_set(self) -> frozenset[Role]:
        return frozenset(assignment.role for assignment in self.roles)


class UserRole(Base, TimestampMixin):
    """Role grant. A user may hold several."""

    __tablename__ = "user_role"

    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), primary_key=True
    )
    role: Mapped[Role] = mapped_column(ROLE_ENUM, primary_key=True)
    #: Optional scope, e.g. a building a facilities manager is responsible for.
    scope: Mapped[str | None] = mapped_column(String(96))

    user: Mapped[AppUser] = relationship(back_populates="roles")


class Consent(Base, UuidPkMixin, TimestampMixin):
    """Explicit opt-in for a sensitive feature.

    Features that could reveal a person's whereabouts - the teacher finder, the
    study-group matcher - are opt-in (brief section 3.4), and "opt-in" has to be a
    row somewhere or it is just a promise. ``granted_at``/``revoked_at`` keep the
    history rather than overwriting it.
    """

    __tablename__ = "consent"
    __table_args__ = (Index("ix_consent_user_purpose", "user_id", "purpose"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False
    )
    #: e.g. "teacher_visibility", "study_group_matching", "step_free_needs".
    purpose: Mapped[ShortText] = mapped_column(nullable=False)
    granted_at: Mapped[Utc] = mapped_column(nullable=False)
    revoked_at: Mapped[Utc | None] = mapped_column()
    #: Purpose-specific detail, e.g. which fields a teacher chose to expose.
    settings: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    note: Mapped[str | None] = mapped_column(Text)

    user: Mapped[AppUser] = relationship(back_populates="consents")

    @property
    def is_active(self) -> bool:
        return self.revoked_at is None


class EnrollmentRef(Base, UuidPkMixin, TimestampMixin, IsDemoMixin):
    """Pseudonymous student-to-section enrolment (brief sections 7 and 12.1).

    Allows server-side computation of a student's free windows for the opt-in
    study-group matcher without ever exposing a student's timetable to anyone
    else, and checks section membership for QR attendance in Phase 4.
    """

    __tablename__ = "enrollment_ref"
    __table_args__ = (
        UniqueConstraint("user_id", "section_id", name="uq_enrollment_ref_user_id_section_id"),
        Index("ix_enrollment_ref_section", "section_id"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False
    )
    section_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("section.id", ondelete="CASCADE"), nullable=False
    )


class TeacherProfile(Base, TimestampMixin, IsDemoMixin):
    """Teacher-controlled visibility and office hours (brief section 12.4).

    Default visibility is ``off``. Students see the current status only, never a
    history. When ``visibility_mode`` is ``off``, queries by students behave as
    if the teacher has not shared their whereabouts.
    """

    __tablename__ = "teacher_profile"

    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), primary_key=True
    )
    #: Links to Section.teacher_ref so timetable-derived status ("in class now")
    #: can be computed without exposing internal identifiers.
    teacher_ref: Mapped[str | None] = mapped_column(String(128), unique=True, index=True)
    public_name: Mapped[str] = mapped_column(String(200), nullable=False)
    department: Mapped[str | None] = mapped_column(String(200))
    office_room_id: Mapped[SlugId | None] = mapped_column(ForeignKey("room.id", ondelete="SET NULL"))
    #: Bookable resource representing appointment slots with this teacher.
    appointment_resource_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("resource.id", ondelete="SET NULL")
    )
    visibility_mode: Mapped[TeacherVisibilityMode] = mapped_column(
        TEACHER_VISIBILITY_MODE, nullable=False, server_default=text("'off'")
    )
    #: e.g. "in_office" | "away" | "back_at"
    manual_status: Mapped[ShortText | None] = mapped_column()
    manual_note: Mapped[str | None] = mapped_column(String(200))
    manual_until: Mapped[Utc | None] = mapped_column()
    manual_updated_at: Mapped[Utc | None] = mapped_column()
    #: Structured weekly office hours:
    #: [{"weekday": 0, "starts_at": "14:00", "ends_at": "16:00", "room_id": "..."}]
    office_hours: Mapped[list[Any] | None] = mapped_column(JSONB)


class UserCapability(Base, UuidPkMixin, TimestampMixin, IsDemoMixin):
    """Safety certification or training prerequisite held by a user (brief section 13.1).

    Checked by the booking engine when a lab or piece of equipment requires one
    or more ``prerequisites`` in its ``BookingPolicy``.
    """

    __tablename__ = "user_capability"
    __table_args__ = (
        UniqueConstraint("user_id", "capability", name="uq_user_capability_user_id_capability"),
        Index("ix_user_capability_user", "user_id"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False
    )
    #: e.g. "laser_safety_cert", "chem_lab_101", "cnc_training"
    capability: Mapped[ShortText] = mapped_column(nullable=False)
    granted_by: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="SET NULL")
    )
    granted_at: Mapped[Utc] = mapped_column(nullable=False)
    expires_at: Mapped[Utc | None] = mapped_column()
    notes: Mapped[str | None] = mapped_column(Text)
