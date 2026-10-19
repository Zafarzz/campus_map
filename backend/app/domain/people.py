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
    IsDemoMixin,
    ShortText,
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
