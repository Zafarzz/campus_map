"""Clean API for spatial data: the 3D scene's source of truth for *what exists*.

Geometry is not served here - ADR-003 keeps ``CampusGeometry`` as the front
end's render contract and ADR-013 keeps geometry authoring in files under git.
These endpoints answer "which buildings, floors and rooms exist, and what are
they like", keyed by the identifiers the map already uses.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.campus import (
    BuildingDetailOut,
    BuildingOut,
    CampusDetailOut,
    ConnectorOut,
    FloorOut,
    RoomListOut,
    RoomOut,
)
from app.core.db import get_session
from app.services import campus_service

router = APIRouter(tags=["campus"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]


@router.get(
    "/campus",
    response_model=CampusDetailOut,
    summary="The campus, its buildings and its inter-building connectors",
)
async def get_campus(session: SessionDep) -> CampusDetailOut:
    tree = await campus_service.load_campus_tree(session)
    return CampusDetailOut(
        id=tree.campus.id,
        name=tree.campus.name,
        timezone=tree.campus.timezone,
        is_demo=tree.campus.is_demo,
        building_count=len(tree.buildings),
        buildings=[BuildingOut.model_validate(b) for b in tree.buildings],
        connectors=[
            ConnectorOut(
                id=c.id,
                kind=c.kind,
                building_ids=[c.building_a_id, c.building_b_id],
            )
            for c in tree.connectors
        ],
    )


@router.get(
    "/buildings",
    response_model=list[BuildingOut],
    summary="All buildings, in the order the map's Buildings panel renders them",
)
async def list_buildings(session: SessionDep) -> list[BuildingOut]:
    buildings = await campus_service.list_buildings(session)
    return [BuildingOut.model_validate(b) for b in buildings]


@router.get(
    "/buildings/{building_id}",
    response_model=BuildingDetailOut,
    summary="One building and its floors",
    responses={404: {"description": "No such building."}},
)
async def get_building(building_id: str, session: SessionDep) -> BuildingDetailOut:
    building = await campus_service.get_building(session, building_id)
    counts = await campus_service.count_rooms_per_floor(session, building_id)
    return BuildingDetailOut(
        **BuildingOut.model_validate(building).model_dump(),
        floors=[
            FloorOut(
                id=floor.id,
                level=floor.level,
                name=floor.name,
                is_demo=floor.is_demo,
                room_count=counts.get(floor.id, 0),
            )
            for floor in building.floors
        ],
    )


@router.get(
    "/buildings/{building_id}/rooms",
    response_model=RoomListOut,
    summary="Every room in a building, ordered by floor",
    responses={404: {"description": "No such building."}},
)
async def list_building_rooms(
    building_id: str,
    session: SessionDep,
    include_out_of_service: Annotated[
        bool,
        Query(description="Include rooms a blocking maintenance ticket has taken out of service."),
    ] = True,
) -> RoomListOut:
    rooms = await campus_service.list_building_rooms(
        session, building_id, include_out_of_service=include_out_of_service
    )
    return RoomListOut(
        building_id=building_id,
        rooms=[RoomOut.model_validate(r) for r in rooms],
        total=len(rooms),
    )


@router.get(
    "/rooms/{room_id}",
    response_model=RoomOut,
    summary="One room, resolving legacy identifiers",
    description=(
        "Accepts a current room id, or a legacy id from the front end's `legacyIds` table. "
        "A legacy id that matches several rooms returns 409 rather than guessing: the front "
        "end's legacy ids are not unique, and `bld-h-f2-r7` genuinely belongs to two rooms."
    ),
    responses={
        404: {"description": "No such room."},
        409: {"description": "The legacy identifier is ambiguous."},
    },
)
async def get_room(room_id: str, session: SessionDep) -> RoomOut:
    room = await campus_service.get_room(session, room_id)
    return RoomOut.model_validate(room)
