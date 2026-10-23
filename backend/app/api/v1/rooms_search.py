"""``GET /rooms/search``: the free-room finder.

Ranked by fit, with a **reason** on every result (brief section 10.4), because
an ordering a user cannot explain is one they will not trust. The priority is
smallest room that fits, then shortest walking distance, then longest free
window.

Walking distance is not available yet - the routing graph is Phase 5 - so
``near`` is accepted, documented as partially implemented, and the distance term
simply does not contribute until the graph exists. That is stated in the
response rather than faked with straight-line metres, which would look like a
real walking distance and mislead anyone comparing two candidates.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Annotated, Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.state import parse_at
from app.core.config import Settings, get_settings
from app.core.db import get_session
from app.domain.base import RoomStateKind
from app.engines.booking import RoomCandidate, rank_candidates
from app.engines.room_state import StateOptions
from app.services import campus_service, state_service

router = APIRouter(tags=["rooms"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


@router.get(
    "/rooms/search",
    summary="Find a free room, ranked by fit",
    description=(
        "Returns rooms that are free at `at` and stay free for at least `free_for` minutes, "
        "ranked smallest-that-fits, then nearest, then longest-free. Every result carries a "
        "`reason` explaining its position.\n\n"
        "Rooms taken out of service by a maintenance ticket are excluded, even when their "
        "timetable state is `free` (brief section 10.2, rule 6).\n\n"
        "**`near` is accepted but inert until Phase 5.** Walking distance needs the routing "
        "graph; until it exists the distance term does not contribute, and the response says "
        "so in `notes` rather than substituting straight-line metres that would look like a "
        "real walking distance."
    ),
    responses={404: {"description": "No campus seeded, or an unknown building."}},
)
async def search_rooms(
    session: SessionDep,
    settings: SettingsDep,
    at: Annotated[
        str | None,
        Query(description="ISO instant with an offset. Omit for now."),
    ] = None,
    free_for: Annotated[
        int,
        Query(ge=0, le=1440, description="Minutes the room must stay free from `at`."),
    ] = 60,
    min_capacity: Annotated[int | None, Query(ge=1, description="Smallest acceptable capacity.")] = None,
    features: Annotated[
        str | None,
        Query(description="Comma-separated feature keys the room must have, e.g. `projector`."),
    ] = None,
    accessible: Annotated[
        bool | None,
        Query(
            description=(
                "Require step-free access. Note that `null` in the data means **not "
                "assessed**, which is not the same as inaccessible, so unassessed rooms are "
                "excluded from a request for accessible rooms rather than assumed either way."
            )
        ),
    ] = None,
    building: Annotated[str | None, Query(description="Limit to one building id.")] = None,
    near: Annotated[
        str | None,
        Query(description="Room id to measure walking distance from. Inert until Phase 5."),
    ] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 10,
) -> dict[str, Any]:
    instant, _ = parse_at(at)
    campus = await campus_service.get_default_campus(session)
    timezone = ZoneInfo(campus.timezone)

    # The free-room question is "is it free now and for the next N minutes",
    # which the starts_soon window has no bearing on - a room that is free but
    # has a lesson in 10 minutes is still free *now*, and `free_for` is what
    # decides whether that is good enough. So the window is pinned to 0 to keep
    # it from reclassifying such rooms as starts_soon and hiding them.
    options = StateOptions(starts_soon_minutes=0, timezone=timezone)

    if building is not None:
        result = await state_service.state_for_building(
            session, building, instant, timezone=timezone, options=options
        )
    else:
        result = await state_service.state_for_campus(session, instant, timezone=timezone, options=options)

    rooms = (
        {room.id: room for room in await campus_service.list_building_rooms(session, building)}
        if building
        else {room.id: room for room in (await campus_service.load_campus_tree(session)).rooms}
    )

    wanted_features = {item.strip() for item in features.split(",") if item.strip()} if features else set()

    candidates: list[RoomCandidate] = []
    for state in result.states:
        if state.state is not RoomStateKind.free or state.out_of_service:
            continue

        room = rooms.get(state.room_id)
        if room is None:
            continue

        if accessible is True and room.accessible is not True:
            continue
        if wanted_features and not _has_features(room.features, wanted_features):
            continue

        free_minutes = _free_minutes(state.free_until, instant)
        if free_for and free_minutes < free_for:
            continue

        candidates.append(
            RoomCandidate(
                room_id=room.id,
                building_id=state.building_id,
                capacity=room.capacity,
                free_until=state.free_until,
                free_minutes=free_minutes,
                distance_metres=None,  # Phase 5.
                features=tuple(sorted(_feature_keys(room.features))),
                accessible=room.accessible,
            )
        )

    ranked = rank_candidates(candidates, min_capacity=min_capacity, free_for_minutes=free_for)[:limit]

    notes: list[str] = []
    if near is not None:
        # Verify the origin exists so a typo is an error rather than silence.
        await campus_service.get_room(session, near)
        notes.append(
            "Walking distance is not yet available: the routing graph arrives in Phase 5, "
            "so `near` did not affect this ranking."
        )
    if accessible is True:
        notes.append(
            "Rooms whose step-free access has not been assessed are excluded, because an "
            "unassessed room is not the same as an accessible one."
        )

    return {
        "at": instant.isoformat(),
        "criteria": {
            "free_for_minutes": free_for,
            "min_capacity": min_capacity,
            "features": sorted(wanted_features),
            "accessible": accessible,
            "building": building,
            "near": near,
        },
        "total_free": len(candidates),
        "returned": len(ranked),
        "rooms": [
            {
                "room_id": item.room_id,
                "building_id": item.building_id,
                "capacity": item.capacity,
                "free_until": item.free_until.isoformat() if item.free_until else None,
                "free_minutes": item.free_minutes,
                "features": list(item.features),
                "accessible": item.accessible,
                "reason": item.reason,
            }
            for item in ranked
        ],
        "notes": notes,
        "source": "scheduled",
        "confidence": 1.0,
    }


def _free_minutes(free_until: object, instant: object) -> int:
    """How long the room stays free.

    ``free_until is None`` means nothing else is scheduled today, which is the
    *longest* possible window, not the shortest. Treating it as zero would hide
    exactly the rooms a user most wants.
    """
    from datetime import datetime

    if not isinstance(instant, datetime):  # pragma: no cover - typed callers only
        return 0
    if free_until is None:
        remaining = timedelta(hours=24)
    elif isinstance(free_until, datetime):
        remaining = free_until - instant
    else:  # pragma: no cover
        return 0
    return max(0, int(remaining.total_seconds() // 60))


def _feature_keys(features: dict[str, Any] | None) -> set[str]:
    """Feature keys a room actually has.

    ``{"projector": true, "sink": false}`` has one feature, not two: a key whose
    value is false records an absence and must not satisfy a filter for it.
    """
    if not features:
        return set()
    return {key for key, value in features.items() if value}


def _has_features(features: dict[str, Any] | None, wanted: set[str]) -> bool:
    return wanted <= _feature_keys(features)
