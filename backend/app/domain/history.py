"""State history: the foundation of the time machine.

Append-only, always (brief section 10.6). Rows are never updated or deleted
except under the documented retention policy, because history cannot be created
after the fact - if we do not capture it now, the replay feature in Layer 10 has
nothing to replay.

Two timestamps again, and they are not the same thing:

* ``effective_at`` - when the state became true.
* ``recorded_at`` - when the system learned it.

That pair is what lets ``GET /replay`` answer both "what was true then?" and
"what did we believe then?" (``as_known_at``).
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import BigInteger, CheckConstraint, ForeignKey, Index, Integer, Sequence, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.domain.base import (
    CONFIRMATION_STATE,
    PROVENANCE,
    ROOM_STATE_KIND,
    ConfirmationState,
    IsDemoMixin,
    Provenance,
    RoomStateKind,
    ShortText,
    SlugId,
    Utc,
    UuidPkMixin,
)

#: Shared ordering source for live-update catch-up. A single sequence across all
#: rooms is the point: a client that reconnects asks "everything after N" once,
#: not once per room.
EVENT_SEQUENCE = Sequence("room_state_event_sequence", metadata=Base.metadata)


class RoomStateEvent(Base, UuidPkMixin, IsDemoMixin):
    """One room changed state. Append-only.

    ``sequence`` is a monotonically increasing number shared by every event, so a
    reconnecting WebSocket client can pass ``last_event_id`` and be sent exactly
    what it missed (brief section 10.5). A database sequence is used rather than a
    timestamp because two events in the same microsecond must still have a
    strict order.
    """

    __tablename__ = "room_state_event"
    __table_args__ = (
        Index("ix_room_state_event_room_effective", "room_id", "effective_at"),
        Index("ix_room_state_event_sequence", "sequence", unique=True),
        Index("ix_room_state_event_effective_at", "effective_at"),
    )

    #: Global ordering for catch-up. Declared as an explicit database sequence
    #: so Alembic creates and drops it with the table.
    sequence: Mapped[int] = mapped_column(
        BigInteger,
        EVENT_SEQUENCE,
        server_default=EVENT_SEQUENCE.next_value(),
        nullable=False,
    )
    room_id: Mapped[SlugId] = mapped_column(ForeignKey("room.id", ondelete="CASCADE"), nullable=False)
    state: Mapped[RoomStateKind] = mapped_column(ROOM_STATE_KIND, nullable=False)
    previous_state: Mapped[RoomStateKind | None] = mapped_column(ROOM_STATE_KIND)
    #: "lesson" | "booking" | "event" | "maintenance" - what caused the state.
    kind: Mapped[ShortText | None] = mapped_column()
    confirmation: Mapped[ConfirmationState] = mapped_column(
        CONFIRMATION_STATE, nullable=False, server_default=text("'not_required'")
    )
    provenance: Mapped[Provenance] = mapped_column(PROVENANCE, nullable=False)
    out_of_service: Mapped[bool] = mapped_column(nullable=False, server_default=text("false"))

    #: When the state became true.
    effective_at: Mapped[Utc] = mapped_column(nullable=False)
    #: When we learned it.
    recorded_at: Mapped[Utc] = mapped_column(server_default=text("now()"), nullable=False)
    #: What triggered the recomputation: a meeting, booking, override or ticket.
    cause_ref: Mapped[str | None] = mapped_column(String(128))
    details: Mapped[dict[str, Any] | None] = mapped_column(JSONB)


class StateSnapshot(Base, UuidPkMixin, IsDemoMixin):
    """Periodic full-campus snapshot, so replay does not have to fold every event.

    Replaying a day from events alone means reading every transition since the
    beginning; a snapshot every N minutes bounds that work. Compaction policy is
    documented in ``docs/runbooks/``.
    """

    __tablename__ = "state_snapshot"
    __table_args__ = (Index("ix_state_snapshot_scope_at", "scope_type", "scope_id", "at"),)

    #: "campus" | "building"
    scope_type: Mapped[ShortText] = mapped_column(nullable=False)
    scope_id: Mapped[SlugId] = mapped_column(nullable=False)
    at: Mapped[Utc] = mapped_column(nullable=False)
    #: {room_id: {state, kind, confirmation, provenance, ...}}
    states: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    #: Rooms in ``lesson_now`` per building - the map's "N live" badge.
    live_counts: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    recorded_at: Mapped[Utc] = mapped_column(server_default=text("now()"), nullable=False)


class BusynessSnapshot(Base, UuidPkMixin, IsDemoMixin):
    """Periodic busyness reading per place, the input to hour-of-week profiles.

    Layer 1's "best time to go" is built from these, recomputed nightly. Until a
    place has enough of them the API must answer "not enough data yet" rather
    than inventing a profile (brief section 11).
    """

    __tablename__ = "busyness_snapshot"
    __table_args__ = (
        CheckConstraint("fraction >= 0.0", name="fraction_non_negative"),
        CheckConstraint("hour_of_week BETWEEN 0 AND 167", name="hour_of_week_in_range"),
        Index("ix_busyness_snapshot_place_at", "place_id", "at"),
        Index("ix_busyness_snapshot_place_how", "place_id", "hour_of_week"),
    )

    place_id: Mapped[SlugId] = mapped_column(nullable=False)
    at: Mapped[Utc] = mapped_column(nullable=False)
    #: 0 = Monday 00:00, matching the timetable source's week start.
    hour_of_week: Mapped[int] = mapped_column(Integer, nullable=False)
    fraction: Mapped[float] = mapped_column(nullable=False)
    provenance: Mapped[Provenance] = mapped_column(PROVENANCE, nullable=False)
    sample_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
