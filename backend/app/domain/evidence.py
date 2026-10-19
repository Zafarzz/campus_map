"""Evidence: the only way this system can know anything about occupancy.

There are no sensors and there never will be (brief section 3.1), so the system
cannot *measure* who is in a room. It can only combine four kinds of evidence -
the schedule, human confirmations, crowd reports, and history - and every number
it produces must carry its provenance and a confidence.

Everything here is **append-only**. A signal is a statement that something was
observed at an instant; it is never edited, and it expires rather than being
deleted. That is what makes the time machine (brief section 10.6) possible: you
cannot reconstruct history that was overwritten.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import (
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
    CONFIRMATION_STATE,
    CROWD_LEVEL,
    PROVENANCE,
    SIGNAL_TYPE,
    ConfirmationState,
    CrowdLevel,
    IsDemoMixin,
    Provenance,
    ShortText,
    SignalType,
    SlugId,
    TimestampMixin,
    Utc,
    UuidPkMixin,
)


class Signal(Base, UuidPkMixin, TimestampMixin, IsDemoMixin):
    """One piece of evidence about one subject at one instant.

    The estimator fuses these by precision weighting with exponential decay
    (brief section 10.3)::

        estimate = (p0 * x0 + sum(w_i * x_i)) / (p0 + sum(w_i))
        w_i      = reliability_i * exp(-(now - observed_at_i) / tau)

    ``reliability`` is the per-source weight and ``value`` is normalised to a
    fraction of capacity, which is what lets signals of different kinds be
    combined at all.

    Note the two timestamps: ``observed_at`` is when the thing was true,
    ``created_at`` is when we learned it. Both are needed to answer "what did the
    system believe at the time?" versus "what do we know now?".
    """

    __tablename__ = "signal"
    __table_args__ = (
        CheckConstraint("value IS NULL OR (value >= 0.0 AND value <= 5.0)", name="value_in_range"),
        CheckConstraint("reliability >= 0.0 AND reliability <= 1.0", name="reliability_in_range"),
        CheckConstraint("expires_at IS NULL OR expires_at > observed_at", name="expiry_after_observation"),
        # The estimator's query: fresh signals for a subject.
        Index("ix_signal_subject_observed", "subject_type", "subject_id", "observed_at"),
        Index("ix_signal_observed_at", "observed_at"),
    )

    signal_type: Mapped[SignalType] = mapped_column(SIGNAL_TYPE, nullable=False)
    #: "room" | "building" | "floor" | "place" | "parking_lot"
    subject_type: Mapped[ShortText] = mapped_column(nullable=False)
    subject_id: Mapped[SlugId] = mapped_column(nullable=False)

    #: Normalised measure, usually a fraction of capacity in [0, 1]. The upper
    #: bound of 5 allows an over-capacity observation rather than clipping it
    #: silently, which would hide a real problem.
    value: Mapped[float | None] = mapped_column(Float)
    #: Raw count when the source gave one (check-ins, for example).
    count: Mapped[int | None] = mapped_column(Integer)
    reliability: Mapped[float] = mapped_column(Float, nullable=False, server_default=text("0.5"))
    provenance: Mapped[Provenance] = mapped_column(PROVENANCE, nullable=False)

    #: When the observation was true.
    observed_at: Mapped[Utc] = mapped_column(nullable=False)
    #: After this instant the signal no longer contributes. Crowd reports
    #: default to about 10 minutes (configurable per place type).
    expires_at: Mapped[Utc | None] = mapped_column()

    source_ref: Mapped[str | None] = mapped_column(String(128))
    payload: Mapped[dict[str, Any] | None] = mapped_column(JSONB)


class CrowdReport(Base, UuidPkMixin, TimestampMixin, IsDemoMixin):
    """A user's one-tap "how busy is it" report.

    Rules from the brief (section 10.3): authenticated users only, one report per
    user per place per few minutes, per-user reliability that rises when reports
    agree with others, and a minimum number of reports before provenance becomes
    ``reported``.

    **The reporter's location is never requested or stored.** There is no
    latitude, no longitude and no device position column here, by design.
    """

    __tablename__ = "crowd_report"
    __table_args__ = (
        # One report per user per subject per minute bucket: the rate limit is
        # enforced by the database, not only by application code.
        UniqueConstraint(
            "user_id",
            "subject_type",
            "subject_id",
            "bucket_minute",
            name="uq_crowd_report_user_subject_bucket",
        ),
        Index("ix_crowd_report_subject_created", "subject_type", "subject_id", "created_at"),
    )

    user_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="SET NULL")
    )
    subject_type: Mapped[ShortText] = mapped_column(nullable=False)
    subject_id: Mapped[SlugId] = mapped_column(nullable=False)
    level: Mapped[CrowdLevel] = mapped_column(CROWD_LEVEL, nullable=False)
    #: Minutes since the Unix epoch, used by the uniqueness constraint above.
    bucket_minute: Mapped[int] = mapped_column(Integer, nullable=False)
    #: Optional waiting-time band for canteen queue calibration
    #: ("under_5", "5_10", "10_20", "over_20").
    wait_band: Mapped[ShortText | None] = mapped_column()
    signal_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("signal.id", ondelete="SET NULL")
    )


class ReporterReliability(Base, TimestampMixin):
    """Per-user reliability, learned from agreement with other reporters."""

    __tablename__ = "reporter_reliability"

    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), primary_key=True
    )
    reliability: Mapped[float] = mapped_column(Float, nullable=False, server_default=text("0.5"))
    agreements: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    disagreements: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))


class AttendanceSession(Base, UuidPkMixin, TimestampMixin, IsDemoMixin):
    """A teacher's open attendance window for one meeting.

    The rotating QR token is derived, never stored:
    ``HMAC-SHA256(server_secret, session_id || floor(now / step))`` truncated,
    with the current and previous window accepted for clock skew
    (brief section 13.3). Storing tokens would defeat the rotation.
    """

    __tablename__ = "attendance_session"
    __table_args__ = (
        Index("ix_attendance_session_meeting", "meeting_id"),
        CheckConstraint("token_step_seconds BETWEEN 10 AND 120", name="token_step_sane"),
    )

    meeting_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("meeting.id", ondelete="CASCADE")
    )
    room_id: Mapped[SlugId | None] = mapped_column(ForeignKey("room.id", ondelete="SET NULL"))
    opened_by: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="SET NULL")
    )
    opened_at: Mapped[Utc] = mapped_column(nullable=False)
    closed_at: Mapped[Utc | None] = mapped_column()
    token_step_seconds: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("20"))
    #: Minutes after the start beyond which a scan is recorded as late, not
    #: rejected.
    late_after_minutes: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("15"))
    expected_count: Mapped[int | None] = mapped_column(Integer)


class AttendanceRecord(Base, UuidPkMixin, TimestampMixin, IsDemoMixin):
    """One student's scan.

    The unique constraint is the anti-duplicate rule: a student has at most one
    record per session. Device mismatches go to ``pending_review`` for the
    teacher rather than being rejected, because a hard block on a soft signal
    locks real students out of a real class.
    """

    __tablename__ = "attendance_record"
    __table_args__ = (
        UniqueConstraint("session_id", "user_id", name="uq_attendance_record_session_id_user_id"),
        Index("ix_attendance_record_session", "session_id"),
    )

    session_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("attendance_session.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="SET NULL")
    )
    #: "present" | "late" | "pending_review" | "guest"
    state: Mapped[ShortText] = mapped_column(nullable=False)
    scanned_at: Mapped[Utc] = mapped_column(nullable=False)
    #: Soft device binding. A hash, never a raw device fingerprint.
    device_ref: Mapped[str | None] = mapped_column(String(128))
    review_reason: Mapped[str | None] = mapped_column(Text)


class AttendanceRate(Base, TimestampMixin, IsDemoMixin):
    """Learned attendance rate per section, weekday and hour.

    A Beta-Binomial posterior (brief section 10.3): ``alpha`` counts attendees,
    ``beta`` counts enrolled students who did not attend. Attendance is *learned*,
    never hard-coded - published measurements vary from roughly 22% on Fridays to
    65% on Mondays at one university, so a single global rate would be fiction.

    The configured default prior mean (0.6) is an assumption and is documented as
    one in ``docs/privacy/`` and the API.
    """

    __tablename__ = "attendance_rate"

    section_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("section.id", ondelete="CASCADE"), primary_key=True
    )
    #: 0 = Monday, matching the timetable source's ``firstDayOfWeek``.
    weekday: Mapped[int] = mapped_column(Integer, primary_key=True)
    hour: Mapped[int] = mapped_column(Integer, primary_key=True)
    alpha: Mapped[float] = mapped_column(Float, nullable=False)
    beta: Mapped[float] = mapped_column(Float, nullable=False)
    observations: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))

    __table_args__ = (
        CheckConstraint("weekday BETWEEN 0 AND 6", name="weekday_in_range"),
        CheckConstraint("hour BETWEEN 0 AND 23", name="hour_in_range"),
        CheckConstraint("alpha > 0 AND beta > 0", name="beta_params_positive"),
    )

    @property
    def mean(self) -> float:
        """Posterior mean attendance rate."""
        return self.alpha / (self.alpha + self.beta)


class OccupancyEstimate(Base, UuidPkMixin, TimestampMixin, IsDemoMixin):
    """A materialised estimate, kept so the number shown can be explained later.

    Never rendered as a measurement: ``provenance`` and ``confidence`` travel with
    it, and ``inputs`` records which signals produced it so a user who asks "why
    does it say busy?" gets a real answer.
    """

    __tablename__ = "occupancy_estimate"
    __table_args__ = (
        CheckConstraint("confidence >= 0.0 AND confidence <= 1.0", name="confidence_in_range"),
        Index("ix_occupancy_estimate_subject_at", "subject_type", "subject_id", "at"),
    )

    subject_type: Mapped[ShortText] = mapped_column(nullable=False)
    subject_id: Mapped[SlugId] = mapped_column(nullable=False)
    at: Mapped[Utc] = mapped_column(nullable=False)
    #: Fraction of capacity.
    fraction: Mapped[float] = mapped_column(Float, nullable=False)
    headcount_low: Mapped[int | None] = mapped_column(Integer)
    headcount_likely: Mapped[int | None] = mapped_column(Integer)
    headcount_high: Mapped[int | None] = mapped_column(Integer)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    provenance: Mapped[Provenance] = mapped_column(PROVENANCE, nullable=False)
    confirmation: Mapped[ConfirmationState] = mapped_column(
        CONFIRMATION_STATE, nullable=False, server_default=text("'not_required'")
    )
    #: The signal IDs and weights behind this number.
    inputs: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
