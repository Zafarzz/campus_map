"""Projection of the domain onto the front end's exact shapes.

Thin by design: it calls :mod:`app.services.campus_service` and reshapes the
result. No queries of its own, no rules of its own. If the compat layer ever
needs a rule the clean API does not have, that is a signal the rule belongs in
the service, not here.
"""

from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from app.api.schemas.compat import (
    CompatBuilding,
    CompatCampus,
    CompatFloor,
    CompatLesson,
    CompatMeta,
    CompatRoom,
    CompatRoomScheduleState,
)
from app.core.time import campus_local_naive, now
from app.domain.academic import Meeting
from app.domain.base import RoomStatusCompat
from app.domain.spatial import Building, Room
from app.engines.room_state import Interval, RoomState
from app.services.campus_service import CampusTree


def room_to_compat(room: Room) -> CompatRoom:
    """``Room`` -> the front end's ``Room``.

    Optional fields are left unset so they are omitted from the JSON rather
    than serialised as ``null``: the front end's type is ``name?: string``, and
    a literal null would render as the string "null" in the room card.
    """
    return CompatRoom(
        id=room.id,
        number=room.number,
        name=room.name,
        kind=room.room_kind.value,
        capacity=room.capacity,
        provenance=room.provenance.value,
    )


def building_to_compat(building: Building) -> CompatBuilding:
    return CompatBuilding(
        id=building.id,
        name=building.name,
        shortName=building.short_name,
        description=building.description,
        provenance=building.provenance.value,
        appearancePreset=building.appearance_preset,
        appearance=building.appearance,
        floors=[
            CompatFloor(
                id=floor.id,
                level=floor.level,
                name=floor.name,
                rooms=[room_to_compat(room) for room in floor.rooms],
            )
            for floor in building.floors
        ],
    )


def campus_to_compat(tree: CampusTree) -> CompatCampus:
    """``CampusTree`` -> the front end's ``Campus``.

    Building order is the front end's ``knownBuildings`` order, preserved
    through ``Building.sort_order``, because the Buildings panel renders the
    array as it comes.

    Connectors are deliberately absent: ADR-020 makes them geometry, not
    business data, and the front end reads them from
    ``CampusGeometry.connectors``, not from ``Campus``.
    """
    return CompatCampus(
        id=tree.campus.id,
        name=tree.campus.name,
        buildings=[building_to_compat(building) for building in tree.buildings],
    )


def meta_for_campus(tree: CampusTree) -> CompatMeta:
    """Provenance envelope for a campus response.

    The campus structure and the CAD-derived rooms are official data, so the
    source is ``confirmed``. ``is_demo`` is true only if *any* seeded room is a
    generated placeholder, which 18 of the 101 rooms currently are - the brief
    forbids presenting demo data as real, including by omission.
    """
    rooms = tree.rooms
    demo_rooms = sum(1 for room in rooms if room.is_demo)
    note = None
    if demo_rooms:
        note = (
            f"{demo_rooms} of {len(rooms)} rooms are generated placeholders "
            "(provenance 'demo') for buildings with no official floor plan."
        )
    return CompatMeta(
        source="confirmed",
        confidence=1.0,
        is_demo=demo_rooms > 0,
        generated_at=now().isoformat(),
        note=note,
    )


# --------------------------------------------------------------------- schedule


def meeting_to_compat(meeting: Meeting, timezone: ZoneInfo) -> CompatLesson:
    """``Meeting`` -> the front end's ``Lesson``.

    The timestamps are the subtle part. ``src/data/demo-schedule.ts`` writes
    ``2026-10-19T09:00:00`` with **no offset**, and the browser's
    ``new Date(...)`` parses that as *local* time. Emitting an offset-aware
    instant instead would still parse, but it would shift every lesson by the
    viewer's offset from the campus - so the compat layer converts back to
    offset-naive campus-local and the clean API keeps the real instants.

    ``cancelled`` is only emitted when true. The front-end type is
    ``cancelled?: boolean``, and sending ``false`` everywhere would double the
    payload's noise for no gain.
    """
    return CompatLesson(
        id=_lesson_id(meeting),
        roomId=meeting.room_id or "",
        subject=meeting.subject or "Lesson",
        teacher=meeting.teacher_label,
        group=meeting.group_label,
        startsAt=campus_local_naive(meeting.starts_at, timezone),
        endsAt=campus_local_naive(meeting.ends_at, timezone),
        cancelled=True if meeting.cancelled else None,
    )


def interval_to_compat_lesson(
    interval: Interval, room_id: str, timezone: ZoneInfo
) -> CompatLesson:
    """An engine :class:`Interval` -> the front end's ``Lesson``.

    Used for the ``current``/``next`` fields of a room state, where the engine
    has already selected the occurrence and re-querying the meeting row would be
    a second round trip for data we hold.

    A booking or event is rendered as a ``Lesson`` because that is the only shape
    the front end's ``RoomScheduleState`` has. The ``kind`` is not lost - the
    clean API reports it - but the compat contract cannot carry it without
    changing a type the front end already compiles against.
    """
    return CompatLesson(
        id=interval.ref or f"{room_id}-{int(interval.starts_at.timestamp())}",
        roomId=room_id,
        subject=interval.subject or _subject_for_kind(interval),
        teacher=interval.teacher_label,
        group=interval.group_label,
        startsAt=campus_local_naive(interval.starts_at, timezone),
        endsAt=campus_local_naive(interval.ends_at, timezone),
        cancelled=True if interval.cancelled else None,
    )


def _subject_for_kind(interval: Interval) -> str:
    """A readable label for an occupancy that has no subject.

    Bookings, events and maintenance windows have no "subject", but the front
    end's ``Lesson.subject`` is required, so it gets something honest rather
    than an empty string that would render as a blank room card.
    """
    return {
        "booking": "Booked",
        "event": "Event",
        "maintenance": "Maintenance",
        "blackout": "Unavailable",
    }.get(interval.kind.value, "Lesson")


def _lesson_id(meeting: Meeting) -> str:
    """Stable lesson id.

    Demo meetings seeded from the front end's generator keep that generator's
    id format so the two are directly comparable; anything else falls back to
    the row's UUID.
    """
    return str(meeting.id)


def room_state_to_compat(
    state: RoomState,
    lessons: list[CompatLesson],
    timezone: ZoneInfo,
) -> CompatRoomScheduleState:
    """``RoomState`` -> the front end's ``RoomScheduleState``.

    The status spelling is the front end's SCREAMING_CASE
    (``AVAILABLE``/``CURRENT``/``UPCOMING``/``FINISHED``/``CANCELLED``), mapped
    from the clean states by :meth:`RoomStatusCompat.from_clean`. The map's
    colours are keyed on these strings, so the mapping is a contract and lives in
    one place rather than being re-derived per endpoint.

    ``out_of_service`` has **no representation here**. The front end has no field
    for it, and overloading ``CANCELLED`` would paint a working room purple. It
    is reported on the clean API and in the response's ``meta.note`` instead -
    one of the places where the compat layer is deliberately lossy rather than
    creatively wrong.
    """
    return CompatRoomScheduleState(
        status=RoomStatusCompat.from_clean(state.state).value,
        current=(
            interval_to_compat_lesson(state.current, state.room_id, timezone)
            if state.current is not None
            else None
        ),
        next=(
            interval_to_compat_lesson(state.next, state.room_id, timezone)
            if state.next is not None
            else None
        ),
        lessons=lessons,
    )


def meta_for_states(
    states: list[RoomState],
    *,
    at: datetime,
    any_demo: bool,
) -> CompatMeta:
    """Provenance envelope for a room-state response.

    ``source`` is ``demo`` while the timetable behind it is generated, and
    ``confirmed`` once a real import is in place. It is never silently
    ``confirmed`` for demo data: the brief forbids presenting demo data as real
    (section 3.5), and a client that renders a "live" badge deserves to know
    which it is looking at.
    """
    out_of_service = sum(1 for item in states if item.out_of_service)
    notes: list[str] = []
    if any_demo:
        notes.append(
            "The timetable behind these states is generated demo data "
            "(parity with src/data/demo-schedule.ts), not the university's real timetable."
        )
    if out_of_service:
        notes.append(
            f"{out_of_service} room(s) are out of service for maintenance. The front end's "
            "RoomStatus has no field for that, so it is visible only on /api/v1/state."
        )
    return CompatMeta(
        source="demo" if any_demo else "confirmed",
        confidence=1.0,
        is_demo=any_demo,
        generated_at=now().isoformat(),
        note=" ".join(notes) or None,
    )
