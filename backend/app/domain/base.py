"""Shared column types, mixins and enumerations.

Conventions that apply to every table:

* **Timestamps are ``timestamptz``**, stored in UTC (brief section 7). There is no
  naive timestamp column anywhere.
* **Spatial identifiers are text, not generated**, because they must equal the
  front end's identifiers exactly (``bld-h``, ``bld-h-f1``, ``bld-h-f1-a102``).
  The IDs are the contract between front end and backend; see
  ``docs/adr/0008-identifiers-and-legacy-aliases.md``.
* **Everything else uses UUIDv7-style ordered UUIDs** so inserts stay
  index-friendly without leaking a row count.
* **``is_demo`` is mandatory on anything that can hold demo data.** The brief
  forbids mixing demo and real data in reports (section 3.5), and a nullable
  flag would make that impossible to enforce.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import StrEnum
from typing import Annotated

from sqlalchemy import Boolean, DateTime, Enum, String, func, text
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

# --------------------------------------------------------------------- types

#: Stable, externally meaningful identifier (front-end parity).
SlugId = Annotated[str, mapped_column(String(96))]

#: Short code such as a room number, kept exactly as the source prints it.
ShortText = Annotated[str, mapped_column(String(64))]

Utc = Annotated[datetime, mapped_column(DateTime(timezone=True))]


def new_uuid() -> uuid.UUID:
    """Time-ordered UUID.

    Python's stdlib gained ``uuid7`` in 3.14; this backend targets 3.13, so
    compose the same layout here: 48-bit big-endian Unix milliseconds, version 7,
    random tail. Ordered UUIDs keep B-tree inserts at the right-hand edge of the
    index instead of scattering them, which matters for the append-only evidence
    and state-history tables.
    """
    import os
    import time

    unix_ms = int(time.time() * 1000) & 0xFFFFFFFFFFFF
    rand_a = int.from_bytes(os.urandom(2), "big") & 0x0FFF
    rand_b = int.from_bytes(os.urandom(8), "big") & 0x3FFFFFFFFFFFFFFF
    value = (unix_ms << 80) | (0x7 << 76) | (rand_a << 64) | (0b10 << 62) | rand_b
    return uuid.UUID(int=value)


# --------------------------------------------------------------------- mixins


class UuidPkMixin:
    """UUID primary key generated in Python so the caller knows it before flush."""

    id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=new_uuid)


class TimestampMixin:
    """Row creation and update instants, maintained by the database clock.

    ``server_default=now()`` rather than a Python default so that rows inserted
    by a migration or by raw SQL are stamped consistently.
    """

    created_at: Mapped[Utc] = mapped_column(server_default=func.now(), nullable=False)
    updated_at: Mapped[Utc] = mapped_column(server_default=func.now(), onupdate=func.now(), nullable=False)


class IsDemoMixin:
    """Marks rows that came from demo data rather than an official source."""

    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"), index=True)


# --------------------------------------------------------------------- enums


class Provenance(StrEnum):
    """Where a value came from (brief section 2.4).

    Every computed number the API returns carries one of these, and an estimate
    is never presented as a measurement.
    """

    #: The plan only: timetable, booking or event record.
    scheduled = "scheduled"
    #: A person confirmed it: QR check-in, teacher tap.
    confirmed = "confirmed"
    #: Enough fresh crowd reports agree.
    reported = "reported"
    #: A model's output.
    estimated = "estimated"
    #: A forecast for a future instant.
    forecast = "forecast"
    #: Imported from a system the university already runs.
    imported = "imported"
    #: Generated placeholder data.
    demo = "demo"


class DataProvenance(StrEnum):
    """The front end's narrower provenance (``src/domain/campus/types.ts``).

    Kept separate from :class:`Provenance` on purpose: this one is part of the
    compatibility contract and must not gain members the front end's TypeScript
    union does not have.
    """

    confirmed = "confirmed"
    demo = "demo"


class RoomKind(StrEnum):
    """Exactly the front end's ``RoomKind`` union. Do not extend.

    Adding a member here would produce compat responses that fail the front
    end's type check. Richer classification belongs in ``Room.features``.
    """

    classroom = "classroom"
    lab = "lab"
    office = "office"
    hall = "hall"
    other = "other"


class SpaceKind(StrEnum):
    """Superset of :class:`RoomKind` from ``docs/GEOMETRY_SPEC.md`` section 4.2.

    Only spaces that carry a room become searchable, timetabled rooms;
    corridors, stairs and WCs are places the routing graph needs but the map's
    room list must not show.
    """

    room = "room"
    corridor = "corridor"
    hall = "hall"
    lobby = "lobby"
    stair = "stair"
    elevator = "elevator"
    wc = "wc"
    technical = "technical"
    storage = "storage"
    shaft = "shaft"
    other = "other"


class RoomStateKind(StrEnum):
    """Clean-API room states (brief section 10.2)."""

    free = "free"
    lesson_now = "lesson_now"
    starts_soon = "starts_soon"
    done_for_today = "done_for_today"
    cancelled = "cancelled"


class RoomStatusCompat(StrEnum):
    """The front end's ``RoomStatus`` spelling (``src/domain/schedule/types.ts``).

    The compatibility layer returns these verbatim; the colours on the map are
    keyed by them.
    """

    AVAILABLE = "AVAILABLE"
    CURRENT = "CURRENT"
    UPCOMING = "UPCOMING"
    FINISHED = "FINISHED"
    CANCELLED = "CANCELLED"

    @classmethod
    def from_clean(cls, state: RoomStateKind) -> RoomStatusCompat:
        return {
            RoomStateKind.free: cls.AVAILABLE,
            RoomStateKind.lesson_now: cls.CURRENT,
            RoomStateKind.starts_soon: cls.UPCOMING,
            RoomStateKind.done_for_today: cls.FINISHED,
            RoomStateKind.cancelled: cls.CANCELLED,
        }[state]


class OccupancyKind(StrEnum):
    """What is holding a resource for a period of time."""

    lesson = "lesson"
    booking = "booking"
    event = "event"
    maintenance = "maintenance"
    blackout = "blackout"


class OccupancyStatus(StrEnum):
    """Lifecycle of an occupancy row.

    Only ``confirmed`` and ``pending`` participate in the overlap exclusion
    constraint, so a cancelled booking frees its slot immediately.
    """

    pending = "pending"
    confirmed = "confirmed"
    cancelled = "cancelled"
    released = "released"


class ConfirmationState(StrEnum):
    """Whether anyone confirmed that a scheduled thing is actually happening.

    ``unconfirmed`` is never rendered as "empty": absence of evidence is not
    evidence of absence (brief section 10.3).
    """

    not_required = "not_required"
    unconfirmed = "unconfirmed"
    confirmed = "confirmed"


class SignalType(StrEnum):
    """Kinds of evidence the estimator fuses (brief section 10.3)."""

    schedule = "schedule"
    booking = "booking"
    checkin = "checkin"
    teacher_confirmation = "teacher_confirmation"
    crowd_report = "crowd_report"
    ticket = "ticket"
    history_profile = "history_profile"


class CrowdLevel(StrEnum):
    """Five-level crowd scale, mapped to configurable fractions of capacity."""

    empty = "empty"
    quiet = "quiet"
    moderate = "moderate"
    busy = "busy"
    full = "full"


class ImportStatus(StrEnum):
    """An import batch is a dry run until someone confirms it."""

    dry_run = "dry_run"
    applied = "applied"
    rolled_back = "rolled_back"
    failed = "failed"


class PlaceKind(StrEnum):
    """Kinds of non-classroom venues monitored by Layer 1 (brief section 11)."""

    library = "library"
    canteen = "canteen"
    gym = "gym"
    sports_hall = "sports_hall"
    study_area = "study_area"
    corridor = "corridor"
    entrance = "entrance"
    dorm_common = "dorm_common"
    other = "other"


class TicketStatus(StrEnum):
    """Ticket state machine (brief sections 12.3 and 14.1)."""

    new = "new"
    triaged = "triaged"
    assigned = "assigned"
    in_progress = "in_progress"
    resolved = "resolved"
    closed = "closed"
    reopened = "reopened"


class TicketPriority(StrEnum):
    """Severity of a reported maintenance or service issue."""

    low = "low"
    normal = "normal"
    high = "high"
    urgent = "urgent"


class NotificationChannel(StrEnum):
    """Delivery channels supported by the notification service (brief section 6.2)."""

    in_app = "in_app"
    web_push = "web_push"
    telegram = "telegram"
    email = "email"
    sms = "sms"


class NotificationStatus(StrEnum):
    """Delivery lifecycle of a notification."""

    queued = "queued"
    sent = "sent"
    delivered = "delivered"
    acknowledged = "acknowledged"
    failed = "failed"


class LostFoundKind(StrEnum):
    """Whether an item was lost by someone or found by someone."""

    lost = "lost"
    found = "found"


class LostFoundStatus(StrEnum):
    """Lifecycle of a lost-or-found report (brief section 12.2)."""

    open = "open"
    matched = "matched"
    claimed = "claimed"
    returned = "returned"
    expired = "expired"


class StudyGroupStatus(StrEnum):
    """Lifecycle of an opt-in study-group request or session (brief section 12.1)."""

    open = "open"
    matched = "matched"
    dissolved = "dissolved"
    cancelled = "cancelled"


class TeacherVisibilityMode(StrEnum):
    """What a teacher allows students to see (brief section 12.4). Default ``off``."""

    off = "off"
    office_hours_only = "office_hours_only"
    timetable_status = "timetable_status"
    manual_status = "manual_status"


# --------------------------------------------------------------------- SQL enums


def pg_enum(enum_type: type[StrEnum], name: str) -> Enum:
    """Native PostgreSQL enum storing member *values*.

    ``values_callable`` is essential: without it SQLAlchemy persists Python
    member *names*. For the lowercase StrEnums above the two happen to coincide,
    but for anything renamed later they would silently diverge from the API
    contract, so it is set explicitly everywhere.
    """
    return Enum(
        enum_type,
        name=name,
        values_callable=lambda e: [member.value for member in e],
        native_enum=True,
        validate_strings=True,
    )


# One instance per database type, shared by every column that uses it. Creating
# a second Enum() with the same name would make the migration try to CREATE TYPE
# twice.
PROVENANCE = pg_enum(Provenance, "provenance")
DATA_PROVENANCE = pg_enum(DataProvenance, "data_provenance")
ROOM_KIND = pg_enum(RoomKind, "room_kind")
SPACE_KIND = pg_enum(SpaceKind, "space_kind")
ROOM_STATE_KIND = pg_enum(RoomStateKind, "room_state_kind")
OCCUPANCY_KIND = pg_enum(OccupancyKind, "occupancy_kind")
OCCUPANCY_STATUS = pg_enum(OccupancyStatus, "occupancy_status")
CONFIRMATION_STATE = pg_enum(ConfirmationState, "confirmation_state")
SIGNAL_TYPE = pg_enum(SignalType, "signal_type")
CROWD_LEVEL = pg_enum(CrowdLevel, "crowd_level")
IMPORT_STATUS = pg_enum(ImportStatus, "import_status")
PLACE_KIND = pg_enum(PlaceKind, "place_kind")
TICKET_STATUS = pg_enum(TicketStatus, "ticket_status")
TICKET_PRIORITY = pg_enum(TicketPriority, "ticket_priority")
NOTIFICATION_CHANNEL = pg_enum(NotificationChannel, "notification_channel")
NOTIFICATION_STATUS = pg_enum(NotificationStatus, "notification_status")
LOST_FOUND_KIND = pg_enum(LostFoundKind, "lost_found_kind")
LOST_FOUND_STATUS = pg_enum(LostFoundStatus, "lost_found_status")
STUDY_GROUP_STATUS = pg_enum(StudyGroupStatus, "study_group_status")
TEACHER_VISIBILITY_MODE = pg_enum(TeacherVisibilityMode, "teacher_visibility_mode")
