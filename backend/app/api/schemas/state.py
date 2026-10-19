"""Clean-API schemas for room state.

Separate from ``schemas/compat.py`` on purpose. The compat models are frozen by
the front end's TypeScript; these are free to carry everything the brief asks
for - ``source``, ``confidence``, ``confirmation``, ``free_until`` - because no
existing client depends on their shape.

Instants here are **offset-aware ISO**, the opposite of the compat layer's
offset-naive campus-local strings. The clean API is for new clients, which should
never have to guess a timezone.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.domain.base import (
    ConfirmationState,
    OccupancyKind,
    Provenance,
    RoomStateKind,
)


class StateModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class OccurrenceOut(StateModel):
    """A lesson, booking, event or maintenance window."""

    ref: str | None = Field(default=None, description="Identifier of the underlying row.")
    kind: OccupancyKind
    starts_at: datetime
    ends_at: datetime
    cancelled: bool = False
    subject: str | None = None
    teacher_label: str | None = None
    group_label: str | None = None
    confirmation: ConfirmationState


class RoomStateOut(StateModel):
    """One room's state at one instant, with its provenance."""

    room_id: str
    building_id: str | None = None
    state: RoomStateKind
    kind: OccupancyKind | None = Field(
        default=None, description="What is causing the state, when something is."
    )
    out_of_service: bool = Field(
        default=False,
        description=(
            "A blocking maintenance ticket has taken the room out of use. An overlay on top "
            "of `state`, not a replacement for it: a room can be in a lesson and unusable."
        ),
    )
    confirmation: ConfirmationState = Field(
        description=(
            "Whether a human confirmed the occupancy is really happening. `unconfirmed` means "
            'nobody has checked in - it never means "empty".'
        )
    )
    free_until: datetime | None = Field(
        default=None,
        description="When the room stops being free. Null means nothing else is scheduled today.",
    )
    current: OccurrenceOut | None = None
    next: OccurrenceOut | None = None
    source: Provenance = Field(description="Provenance of this value (brief section 2.4).")
    confidence: Annotated[float, Field(ge=0.0, le=1.0)] = 1.0


class BuildingSummaryOut(StateModel):
    """Per-building roll-up for the map's side panel."""

    building_id: str
    room_count: int
    #: Rooms with a lesson in progress - the map's "N live" badge.
    live_count: int
    out_of_service_count: int
    counts: dict[RoomStateKind, int] = Field(
        description="Room count per state. Every state is present, zero included."
    )


class StateResponse(StateModel):
    """``GET /api/v1/state``.

    Live and Simulate are the same request: Live omits `at`, Simulate passes the
    slider's instant. There is one engine behind both.
    """

    at: datetime
    timezone: str = Field(description="IANA zone the campus-local day was computed in.")
    starts_soon_minutes: int
    mode: Literal["live", "simulate"] = Field(
        description="`live` when `at` was defaulted to now, `simulate` when the caller passed it."
    )
    rooms: list[RoomStateOut]
    buildings: list[BuildingSummaryOut]
    live_counts: dict[str, int] = Field(
        description='Rooms in `lesson_now` per building id - the "N live" badge.'
    )
    source: Provenance = Provenance.scheduled
    confidence: Annotated[float, Field(ge=0.0, le=1.0)] = 1.0


class TransitionOut(StateModel):
    room_id: str
    at: datetime


class TransitionsResponse(StateModel):
    """``GET /api/v1/state/transitions``: when each room next changes.

    Exposed because it is the REST fallback for clients that cannot hold a
    WebSocket open: poll this, sleep until the first instant, poll again. The
    scheduler uses the same data internally instead of polling every room
    (brief section 10.2).
    """

    at: datetime
    transitions: list[TransitionOut]
    truncated: bool = Field(description="True when more transitions exist beyond `limit`.")
