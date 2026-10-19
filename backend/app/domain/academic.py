"""Academic time: terms, courses, sections, recurrence rules and meetings.

The hard-won rule from the brief (section 10.1) is encoded here: **store the
master recurrence rule, not only pre-expanded UTC times**. ``MeetingRule`` keeps
``RRULE``/``DTSTART``/``TZID``/``EXDATE``, and ``Meeting`` holds the materialised
occurrences that range queries actually read. Expansion happens in the event's
own timezone and is then converted to UTC, so a weekly 09:00 lecture stays at
09:00 local across a DST boundary.

The real source is the university's public EduPage timetable (aSc Timetables).
Its model maps cleanly: an aSc *lesson* (subject x teacher x class) becomes a
:class:`Section` plus a :class:`MeetingRule`, and an aSc *card* (period + weekday
bitmask + classroom) becomes the rule's placement. See
``docs/adr/0010-timetable-source-edupage.md``.
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    Date,
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
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.domain.base import (
    IMPORT_STATUS,
    ImportStatus,
    IsDemoMixin,
    ShortText,
    SlugId,
    TimestampMixin,
    Utc,
    UuidPkMixin,
)


class Term(Base, UuidPkMixin, TimestampMixin, IsDemoMixin):
    """An academic term with its own calendar window and holidays."""

    __tablename__ = "term"
    __table_args__ = (
        UniqueConstraint("campus_id", "code", name="uq_term_campus_id_code"),
        CheckConstraint("ends_on >= starts_on", name="term_window_ordered"),
    )

    campus_id: Mapped[SlugId] = mapped_column(
        ForeignKey("campus.id", ondelete="CASCADE"), nullable=False, index=True
    )
    code: Mapped[ShortText] = mapped_column(nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    starts_on: Mapped[date] = mapped_column(Date, nullable=False)
    ends_on: Mapped[date] = mapped_column(Date, nullable=False)
    #: Non-teaching dates as ISO strings. Kept as data so adding a holiday is
    #: not a code change.
    holidays: Mapped[list[Any] | None] = mapped_column(JSONB)
    is_current: Mapped[bool] = mapped_column(nullable=False, server_default=text("false"))


class Course(Base, UuidPkMixin, TimestampMixin, IsDemoMixin):
    """A course offered in a term."""

    __tablename__ = "course"
    __table_args__ = (UniqueConstraint("campus_id", "code", name="uq_course_campus_id_code"),)

    campus_id: Mapped[SlugId] = mapped_column(
        ForeignKey("campus.id", ondelete="CASCADE"), nullable=False, index=True
    )
    code: Mapped[ShortText] = mapped_column(nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    department: Mapped[str | None] = mapped_column(String(200))


class Section(Base, UuidPkMixin, TimestampMixin, IsDemoMixin):
    """One taught instance of a course: a cohort, a teacher, an enrolled count.

    ``enrolled_count`` is the prior for the occupancy estimator
    (``expected = enrolled x attendance_rate``, brief section 10.3), which is why it
    lives on the section rather than being derived per meeting.

    ``teacher_ref`` is a pseudonymous handle. The EduPage export publishes
    teachers' real names; those are stored in :class:`~app.domain.people.AppUser`
    only when a teacher actually has an account, and analytics never groups by
    teacher name (brief section 21.2).
    """

    __tablename__ = "section"
    __table_args__ = (
        UniqueConstraint("term_id", "course_id", "code", name="uq_section_term_id_course_id_code"),
        CheckConstraint("enrolled_count IS NULL OR enrolled_count >= 0", name="enrolled_non_negative"),
        Index("ix_section_term", "term_id"),
    )

    term_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("term.id", ondelete="CASCADE"), nullable=False
    )
    course_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("course.id", ondelete="CASCADE"), nullable=False
    )
    code: Mapped[ShortText] = mapped_column(nullable=False)
    #: The cohort label as the timetable prints it, e.g. "A24A".
    cohort: Mapped[ShortText | None] = mapped_column()
    teacher_ref: Mapped[str | None] = mapped_column(String(128))
    teacher_user_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="SET NULL")
    )
    enrolled_count: Mapped[int | None] = mapped_column(Integer)
    #: Needs a step-free room. Feeds the timetable optimiser as a hard
    #: constraint; stores the flag only, never the reason (brief section 17).
    requires_step_free: Mapped[bool] = mapped_column(nullable=False, server_default=text("false"))

    rules: Mapped[list[MeetingRule]] = relationship(back_populates="section", cascade="all, delete-orphan")


class MeetingRule(Base, UuidPkMixin, TimestampMixin, IsDemoMixin):
    """The master recurrence rule for a section's meetings.

    Never store only expanded UTC instants: the rule, its timezone and its
    exceptions are the source of truth, and the materialised
    :class:`Meeting` rows are a cache that can always be rebuilt.
    """

    __tablename__ = "meeting_rule"
    __table_args__ = (
        Index("ix_meeting_rule_section", "section_id"),
        CheckConstraint("duration_minutes > 0", name="duration_positive"),
    )

    section_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("section.id", ondelete="CASCADE"), nullable=False
    )
    room_id: Mapped[SlugId | None] = mapped_column(ForeignKey("room.id", ondelete="SET NULL"), index=True)
    #: Room code exactly as the source wrote it, kept even when it does not
    #: resolve to a known room, so the import report can list it.
    source_room_code: Mapped[ShortText | None] = mapped_column()

    #: iCalendar RRULE, e.g. "FREQ=WEEKLY;BYDAY=MO".
    rrule: Mapped[str] = mapped_column(Text, nullable=False)
    #: Local wall-clock start of the first occurrence, with ``tzid``.
    dtstart_local: Mapped[str] = mapped_column(String(32), nullable=False)
    tzid: Mapped[str] = mapped_column(String(64), nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    #: Excluded occurrence start times, matched by *original* start
    #: (brief section 10.1).
    exdates: Mapped[list[Any] | None] = mapped_column(JSONB)
    #: iCalendar UID, so a moved or cancelled single occurrence can be linked
    #: back to its parent by UID + RECURRENCE-ID.
    uid: Mapped[str | None] = mapped_column(String(256), index=True)
    import_batch_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("import_batch.id", ondelete="SET NULL")
    )

    section: Mapped[Section] = relationship(back_populates="rules")
    meetings: Mapped[list[Meeting]] = relationship(back_populates="rule", cascade="all, delete-orphan")


class Meeting(Base, UuidPkMixin, TimestampMixin, IsDemoMixin):
    """A materialised occurrence.

    Range queries read these rows and never re-expand rules per request
    (brief section 10.1). Re-materialised whenever a rule or override changes.
    """

    __tablename__ = "meeting"
    __table_args__ = (
        CheckConstraint("ends_at > starts_at", name="meeting_window_ordered"),
        # The state engine's bulk query: every meeting of a room around an instant.
        Index("ix_meeting_room_window", "room_id", "starts_at", "ends_at"),
        Index("ix_meeting_window", "starts_at", "ends_at"),
        UniqueConstraint("rule_id", "original_starts_at", name="uq_meeting_rule_id_original_starts_at"),
    )

    rule_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("meeting_rule.id", ondelete="CASCADE"), index=True
    )
    room_id: Mapped[SlugId | None] = mapped_column(ForeignKey("room.id", ondelete="SET NULL"))
    starts_at: Mapped[Utc] = mapped_column(nullable=False)
    ends_at: Mapped[Utc] = mapped_column(nullable=False)
    #: The occurrence's start before any override moved it. This is the key
    #: EXDATEs and RECURRENCE-IDs match on.
    original_starts_at: Mapped[Utc | None] = mapped_column()
    cancelled: Mapped[bool] = mapped_column(nullable=False, server_default=text("false"))
    #: Denormalised for display so the map does not need three joins per room.
    subject: Mapped[str | None] = mapped_column(String(300))
    teacher_label: Mapped[str | None] = mapped_column(String(200))
    group_label: Mapped[ShortText | None] = mapped_column()

    rule: Mapped[MeetingRule | None] = relationship(back_populates="meetings")


class MeetingOverride(Base, UuidPkMixin, TimestampMixin, IsDemoMixin):
    """A single-occurrence change: cancel, move, or swap room."""

    __tablename__ = "meeting_override"
    __table_args__ = (Index("ix_meeting_override_meeting", "meeting_id"),)

    meeting_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("meeting.id", ondelete="CASCADE"), nullable=False
    )
    #: "cancel" | "move" | "room_change"
    action: Mapped[ShortText] = mapped_column(nullable=False)
    new_starts_at: Mapped[Utc | None] = mapped_column()
    new_ends_at: Mapped[Utc | None] = mapped_column()
    new_room_id: Mapped[SlugId | None] = mapped_column(ForeignKey("room.id", ondelete="SET NULL"))
    reason: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="SET NULL")
    )


class ImportBatch(Base, UuidPkMixin, TimestampMixin):
    """One timetable import.

    Imports are idempotent and reversible (brief section 10.1): a batch has an ID,
    a version, a validation report, and everything it created is linked back to
    it so a rollback is a delete by batch.
    """

    __tablename__ = "import_batch"
    __table_args__ = (Index("ix_import_batch_status_created", "status", "created_at"),)

    source: Mapped[ShortText] = mapped_column(nullable=False)
    #: Stable identity of the upstream snapshot, e.g. the EduPage ``tt_num``.
    source_version: Mapped[str | None] = mapped_column(String(128))
    status: Mapped[ImportStatus] = mapped_column(IMPORT_STATUS, nullable=False)
    #: ``{"errors": [...], "warnings": [...]}`` - the same two-level shape the
    #: repository already uses for geometry validation (ADR-011).
    report: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    applied_at: Mapped[Utc | None] = mapped_column()
    rolled_back_at: Mapped[Utc | None] = mapped_column()
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="SET NULL")
    )
