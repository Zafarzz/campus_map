"""Reading the campus.

One service, two projections: the clean API and the compatibility layer both
call these functions, so the map and ``/api/v1/campus`` can never disagree about
what rooms exist.

Query shape matters here. The campus tree is 8 buildings / 24 floors / 101 rooms
today, and the front end wants all of it in one call, so
:func:`load_campus_tree` fetches it with eager loading rather than lazily walking
relationships - which on an async session would raise anyway.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import AmbiguousAliasError, NotFoundError
from app.domain.spatial import Building, Campus, Connector, Floor, Room, RoomAlias


@dataclass(frozen=True, slots=True)
class CampusTree:
    """A whole campus, eagerly loaded and ordered the way the map renders it."""

    campus: Campus
    buildings: list[Building]
    connectors: list[Connector]

    @property
    def rooms(self) -> list[Room]:
        return [room for building in self.buildings for floor in building.floors for room in floor.rooms]


async def get_default_campus(session: AsyncSession) -> Campus:
    """The single campus this deployment serves.

    The schema supports several (``timezone`` lives on the row for exactly that
    reason), but there is one today, so "the campus" is well defined. If a
    second is ever added this is the one function that has to change.
    """
    result = await session.execute(select(Campus).order_by(Campus.id).limit(1))
    campus = result.scalar_one_or_none()
    if campus is None:
        raise NotFoundError(
            "No campus has been seeded yet. Run 'make seed' to load the campus from the front-end data.",
            code="campus_not_seeded",
        )
    return campus


async def load_campus_tree(session: AsyncSession, campus_id: str | None = None) -> CampusTree:
    """Load campus, buildings, floors and rooms in one round trip."""
    campus = await _get_campus_by_id(session, campus_id) if campus_id else await get_default_campus(session)

    buildings_result = await session.execute(
        select(Building)
        .where(Building.campus_id == campus.id)
        .order_by(Building.sort_order, Building.id)
        .options(selectinload(Building.floors).selectinload(Floor.rooms))
    )
    buildings = list(buildings_result.scalars().all())

    # Floors and rooms are ordered by the relationship's order_by, but make the
    # room ordering explicit here too: the front end renders them in list order
    # and a stable order makes responses diffable.
    for building in buildings:
        building.floors.sort(key=lambda f: f.level)
        for floor in building.floors:
            floor.rooms.sort(key=lambda r: (r.sort_order, r.id))

    connectors_result = await session.execute(
        select(Connector).where(Connector.campus_id == campus.id).order_by(Connector.id)
    )

    return CampusTree(
        campus=campus,
        buildings=buildings,
        connectors=list(connectors_result.scalars().all()),
    )


async def _get_campus_by_id(session: AsyncSession, campus_id: str) -> Campus:
    campus = await session.get(Campus, campus_id)
    if campus is None:
        raise NotFoundError(f"Campus {campus_id!r} does not exist.", code="campus_not_found")
    return campus


async def list_buildings(session: AsyncSession, campus_id: str | None = None) -> list[Building]:
    campus = await _get_campus_by_id(session, campus_id) if campus_id else await get_default_campus(session)
    result = await session.execute(
        select(Building).where(Building.campus_id == campus.id).order_by(Building.sort_order, Building.id)
    )
    return list(result.scalars().all())


async def get_building(session: AsyncSession, building_id: str) -> Building:
    result = await session.execute(
        select(Building).where(Building.id == building_id).options(selectinload(Building.floors))
    )
    building = result.scalar_one_or_none()
    if building is None:
        raise NotFoundError(f"Building {building_id!r} does not exist.", code="building_not_found")
    building.floors.sort(key=lambda f: f.level)
    return building


async def count_rooms_per_floor(session: AsyncSession, building_id: str) -> dict[str, int]:
    result = await session.execute(
        select(Room.floor_id, func.count(Room.id))
        .join(Floor, Floor.id == Room.floor_id)
        .where(Floor.building_id == building_id)
        .group_by(Room.floor_id)
    )
    return dict(result.all())


async def list_building_rooms(
    session: AsyncSession,
    building_id: str,
    *,
    include_out_of_service: bool = True,
) -> list[Room]:
    """Every room in a building, ordered by floor then position."""
    await get_building(session, building_id)  # 404 before returning an empty list

    stmt = (
        select(Room)
        .join(Floor, Floor.id == Room.floor_id)
        .where(Floor.building_id == building_id)
        .order_by(Floor.level, Room.sort_order, Room.id)
    )
    if not include_out_of_service:
        stmt = stmt.where(Room.out_of_service.is_(False))

    result = await session.execute(stmt)
    return list(result.scalars().all())


async def get_room(session: AsyncSession, room_id: str) -> Room:
    """Fetch a room by its current ID, falling back to legacy aliases.

    Resolution order is deliberate: a current ID always wins, so a legacy alias
    can never shadow a real room. An alias that maps to several rooms raises
    rather than guessing - the front end's ``legacyId`` values are not unique
    (``bld-h-f2-r7`` belongs to both ``A-207`` and ``A-208``), and picking one
    would silently return the wrong room.
    """
    room = await session.get(Room, room_id)
    if room is not None:
        return room

    alias_result = await session.execute(
        select(RoomAlias.room_id).where(RoomAlias.alias == room_id).order_by(RoomAlias.room_id)
    )
    candidates = list(alias_result.scalars().all())

    if not candidates:
        raise NotFoundError(f"Room {room_id!r} does not exist.", code="room_not_found")
    if len(candidates) > 1:
        raise AmbiguousAliasError(
            f"Legacy room id {room_id!r} matches {len(candidates)} rooms, so it cannot be resolved.",
            details={"alias": room_id, "candidates": candidates},
        )

    resolved = await session.get(Room, candidates[0])
    if resolved is None:  # pragma: no cover - foreign key makes this unreachable
        raise NotFoundError(f"Room {room_id!r} does not exist.", code="room_not_found")
    return resolved


async def campus_counts(session: AsyncSession, campus_id: str) -> dict[str, int]:
    """Row counts for the readiness probe and the seed report."""
    buildings = await session.scalar(select(func.count(Building.id)).where(Building.campus_id == campus_id))
    floors = await session.scalar(
        select(func.count(Floor.id))
        .join(Building, Building.id == Floor.building_id)
        .where(Building.campus_id == campus_id)
    )
    rooms = await session.scalar(
        select(func.count(Room.id))
        .join(Floor, Floor.id == Room.floor_id)
        .join(Building, Building.id == Floor.building_id)
        .where(Building.campus_id == campus_id)
    )
    demo_rooms = await session.scalar(
        select(func.count(Room.id))
        .join(Floor, Floor.id == Room.floor_id)
        .join(Building, Building.id == Floor.building_id)
        .where(Building.campus_id == campus_id, Room.is_demo.is_(True))
    )
    return {
        "buildings": int(buildings or 0),
        "floors": int(floors or 0),
        "rooms": int(rooms or 0),
        "demo_rooms": int(demo_rooms or 0),
    }
