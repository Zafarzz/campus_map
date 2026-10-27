"""Compatibility schemas: the front end's TypeScript types, exactly.

These models exist to satisfy ``src/domain/campus/types.ts`` and
``src/domain/schedule/types.ts`` without any change to the front end. The rules
(``docs/adr/0006-compatibility-layer.md``):

1. **No renamed fields, no reordered enums, no new required fields.** A compat
   response must type-check against the current front-end interfaces as they are
   today.
2. **Optional fields are omitted, not null.** The front end uses ``name?:
   string``; emitting ``"name": null`` would type-check but render "null" in the
   UI, so unset fields are excluded from the JSON entirely.
3. **Provenance and confidence ride alongside.** The brief requires them on every
   computed value, but adding them to a field the front end reads would change
   its shape. They go in sibling ``_meta`` fields that the front end ignores -
   the same additive principle ADR-007 uses for the render model.
4. **Timestamps are offset-naive campus-local**, matching
   ``src/data/demo-schedule.ts``, because ``new Date("2026-10-17T09:00:00")``
   parses that as local time in the browser.
"""

from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field

RoomKindLiteral = Literal["classroom", "lab", "office", "hall", "other"]
ProvenanceLiteral = Literal["confirmed", "demo"]
RoomStatusLiteral = Literal["AVAILABLE", "CURRENT", "UPCOMING", "FINISHED", "CANCELLED"]


class CompatModel(BaseModel):
    """Base that omits unset optional fields so ``name?`` stays absent."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class CompatRoom(CompatModel):
    """Mirrors ``Room`` in ``src/domain/campus/types.ts``."""

    id: str
    number: str
    name: str | None = None
    kind: RoomKindLiteral
    capacity: int | None = None
    provenance: ProvenanceLiteral


class CompatFloor(CompatModel):
    """Mirrors ``Floor``. ``level`` 1 is the ground floor."""

    id: str
    level: int
    name: str
    rooms: list[CompatRoom]


class CompatBuilding(CompatModel):
    """Mirrors ``Building``.

    ``appearance`` is typed ``any`` in the front end and is unset in all current
    data. It is passed through untouched and never invented (ADR-015).
    """

    id: str
    name: str
    shortName: str
    description: str | None = None
    floors: list[CompatFloor]
    provenance: ProvenanceLiteral
    appearancePreset: str | None = None
    appearance: dict[str, Any] | None = None


class CompatCampus(CompatModel):
    """Mirrors ``Campus``: exactly what ``loadCampus()`` resolves to today.

    Drop-in replacement for ``src/services/campus/campusService.ts``.
    """

    id: str
    name: str
    buildings: list[CompatBuilding]


class CompatLesson(CompatModel):
    """Mirrors ``Lesson`` in ``src/domain/schedule/types.ts``.

    ``startsAt``/``endsAt`` are offset-naive campus-local, e.g.
    ``2026-10-17T09:00:00`` - see the module docstring.
    """

    id: str
    roomId: str
    subject: str
    teacher: str | None = None
    group: str | None = None
    startsAt: str
    endsAt: str
    cancelled: bool | None = None


class CompatRoomScheduleState(CompatModel):
    """Mirrors ``RoomScheduleState``."""

    status: RoomStatusLiteral
    current: CompatLesson | None = None
    next: CompatLesson | None = None
    lessons: list[CompatLesson]


class CompatMeta(CompatModel):
    """Sibling metadata the front end ignores.

    The brief requires provenance and confidence on every computed value; this
    is how they travel without altering a field the map reads.
    """

    source: str = Field(description="scheduled | confirmed | reported | estimated | forecast | demo")
    confidence: Annotated[float, Field(ge=0.0, le=1.0)] = 1.0
    is_demo: bool = False
    generated_at: str = Field(description="UTC instant this response was computed")
    note: str | None = None


class CompatCampusResponse(CompatModel):
    """``GET /api/v1/compat/campus``.

    The front end would read ``.campus``; the extra keys are additive and safe
    to ignore. A caller that wants the bare ``Campus`` object can request
    ``?bare=true``.
    """

    campus: CompatCampus
    meta: CompatMeta


class CompatRoomStatesResponse(CompatModel):
    """``GET /api/v1/compat/room-states``: ``Record<roomId, RoomScheduleState>``."""

    at: str
    upcomingWindowMinutes: int
    states: dict[str, CompatRoomScheduleState]
    meta: CompatMeta


class CompatLessonsResponse(CompatModel):
    """``GET /api/v1/compat/lessons?date=YYYY-MM-DD``."""

    date: str
    lessons: list[CompatLesson]
    meta: CompatMeta


class CompatLiveCountsResponse(CompatModel):
    """``GET /api/v1/compat/live-counts``: the map's "N live" badge per building."""

    at: str
    counts: dict[str, int]
    meta: CompatMeta
