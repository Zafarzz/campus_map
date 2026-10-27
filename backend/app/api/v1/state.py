"""``GET /state`` and friends: room states as of any instant.

The endpoint the 3D map lives on. Live and Simulate are the *same* request -
Live omits ``at``, Simulate passes the slider's instant - because the brief
requires them to be answered identically (section 10.2) and the surest way to
guarantee that is to give them no separate code path.

``at`` is parsed strictly: an instant with no offset is rejected rather than
assumed to be campus-local or UTC. Guessing is how a Simulate query silently
lands five hours out on a UTC+5 campus. The compatibility layer, which must
accept the front end's naive strings, does that conversion explicitly in
``app.api.v1.compat``.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.state import (
    BuildingSummaryOut,
    OccurrenceOut,
    RoomStateOut,
    StateResponse,
    TransitionOut,
    TransitionsResponse,
)
from app.core.config import Settings, get_settings
from app.core.db import get_session
from app.core.errors import ValidationError
from app.core.time import now
from app.domain.base import Provenance
from app.engines.room_state import BuildingSummary, Interval, RoomState
from app.services import campus_service, state_service

router = APIRouter(tags=["state"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]

AtQuery = Annotated[
    str | None,
    Query(
        description=(
            "Instant to evaluate, ISO 8601 **with an offset** (`2026-10-19T10:45:00+05:00`) "
            "or UTC (`...Z`). Omit for Live. An instant without an offset is rejected: the "
            "server will not guess whether you meant campus-local or UTC."
        ),
        examples=["2026-10-19T10:45:00+05:00"],
    ),
]


def parse_at(raw: str | None) -> tuple[datetime, bool]:
    """Parse the ``at`` parameter. Returns ``(instant, is_simulated)``."""
    if raw is None or not raw.strip():
        return now(), False

    text = raw.strip()
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValidationError(
            f"Could not parse 'at' value {raw!r}. Use ISO 8601 with an offset, "
            "for example 2026-10-19T10:45:00+05:00.",
            code="invalid_at",
            details={"at": raw},
        ) from exc

    if parsed.tzinfo is None:
        raise ValidationError(
            f"'at' value {raw!r} has no UTC offset. Send an offset-aware instant "
            "(…+05:00 or …Z) so there is no ambiguity about which moment you mean.",
            code="naive_at",
            details={"at": raw},
        )
    return parsed, True


@router.get(
    "/state",
    response_model=StateResponse,
    summary="Room states as of any instant, with per-building live counts",
    description=(
        "Powers the 3D map. Omit `at` for Live; pass the slider's instant for Simulate.\n\n"
        "Every room is returned, including rooms with nothing scheduled - a room with no "
        "lessons is `free`, and omitting it would make the map lose the room rather than "
        "show it as available.\n\n"
        "`out_of_service` is an **overlay**: a room can be `lesson_now` and out of service "
        "at the same time, and the two facts are reported separately so the map's colours "
        "stay keyed on `state` alone."
    ),
    responses={404: {"description": "No such building, or no campus seeded."}},
)
async def get_state(
    session: SessionDep,
    settings: SettingsDep,
    at: AtQuery = None,
    building: Annotated[str | None, Query(description="Limit to one building id, e.g. `bld-h`.")] = None,
    starts_soon_minutes: Annotated[
        int | None,
        Query(
            ge=0,
            le=240,
            description=(
                "Override the 'starts soon' window. Defaults to the clean-API value "
                "(15); the compatibility layer uses 60 to match the front end."
            ),
        ),
    ] = None,
) -> StateResponse:
    instant, simulated = parse_at(at)
    campus = await campus_service.get_default_campus(session)
    timezone = ZoneInfo(campus.timezone)
    options = state_service.resolve_options(settings, timezone, starts_soon_minutes=starts_soon_minutes)

    if building is not None:
        result = await state_service.state_for_building(
            session, building, instant, timezone=timezone, options=options
        )
    else:
        result = await state_service.state_for_campus(session, instant, timezone=timezone, options=options)

    return StateResponse(
        at=instant,
        timezone=campus.timezone,
        starts_soon_minutes=options.starts_soon_minutes,
        mode="simulate" if simulated else "live",
        rooms=[_room_out(item) for item in result.states],
        buildings=[_summary_out(item) for item in result.summaries.values()],
        live_counts=result.live_counts,
        # Layer 0 state is derived from the timetable and bookings: a plan, not a
        # measurement. Attendance evidence upgrades this per room in Phase 4.
        source=Provenance.scheduled,
        confidence=1.0,
    )


@router.get(
    "/state/transitions",
    response_model=TransitionsResponse,
    summary="When each room next changes state",
    description=(
        "The REST fallback for `WS /ws/v1/stream` (brief section 8): poll this, sleep until "
        "the first instant, poll again. The transition scheduler uses the same computation "
        "internally so it can set one timer per room instead of polling every room every "
        "second.\n\n"
        "Local midnight always appears as a transition, because that is when "
        "`done_for_today` lapses back to `free` and nothing on the timetable marks it."
    ),
)
async def get_transitions(
    session: SessionDep,
    settings: SettingsDep,
    at: AtQuery = None,
    limit: Annotated[int, Query(ge=1, le=5000)] = 500,
) -> TransitionsResponse:
    instant, _ = parse_at(at)
    campus = await campus_service.get_default_campus(session)
    timezone = ZoneInfo(campus.timezone)
    options = state_service.resolve_options(settings, timezone)

    pairs = await state_service.upcoming_transitions(
        session, instant, timezone=timezone, options=options, limit=limit + 1
    )
    truncated = len(pairs) > limit

    return TransitionsResponse(
        at=instant,
        transitions=[TransitionOut(room_id=room_id, at=when) for room_id, when in pairs[:limit]],
        truncated=truncated,
    )


@router.get(
    "/rooms/{room_id}/state",
    response_model=RoomStateOut,
    summary="One room's state as of any instant",
    responses={404: {"description": "No such room."}},
)
async def get_room_state(
    room_id: str,
    session: SessionDep,
    settings: SettingsDep,
    at: AtQuery = None,
    starts_soon_minutes: Annotated[int | None, Query(ge=0, le=240)] = None,
) -> RoomStateOut:
    instant, _ = parse_at(at)
    campus = await campus_service.get_default_campus(session)
    timezone = ZoneInfo(campus.timezone)
    options = state_service.resolve_options(settings, timezone, starts_soon_minutes=starts_soon_minutes)

    # Resolve legacy aliases the same way /rooms/{id} does, so a caller holding
    # an old identifier gets the same answer from both endpoints.
    room = await campus_service.get_room(session, room_id)
    state = await state_service.state_for_room(session, room.id, instant, timezone=timezone, options=options)
    return _room_out(state)


# --------------------------------------------------------------------- mapping


def _room_out(state: RoomState) -> RoomStateOut:
    return RoomStateOut(
        room_id=state.room_id,
        building_id=state.building_id,
        state=state.state,
        kind=state.kind,
        out_of_service=state.out_of_service,
        confirmation=state.confirmation,
        free_until=state.free_until,
        current=_occurrence_out(state.current),
        next=_occurrence_out(state.next),
        source=state.provenance,
        confidence=state.confidence,
    )


def _occurrence_out(interval: Interval | None) -> OccurrenceOut | None:
    if interval is None:
        return None
    return OccurrenceOut(
        ref=interval.ref,
        kind=interval.kind,
        starts_at=interval.starts_at,
        ends_at=interval.ends_at,
        cancelled=interval.cancelled,
        subject=interval.subject,
        teacher_label=interval.teacher_label,
        group_label=interval.group_label,
        confirmation=interval.confirmation,
    )


def _summary_out(summary: BuildingSummary) -> BuildingSummaryOut:
    return BuildingSummaryOut(
        building_id=summary.building_id,
        room_count=summary.room_count,
        live_count=summary.live_count,
        out_of_service_count=summary.out_of_service_count,
        counts=summary.counts,
    )
