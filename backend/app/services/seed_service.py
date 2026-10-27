"""Seeding the campus from the front end's own data.

Why not invent a campus? Because the identifiers are the contract. The map's
rooms are ``bld-h-f1-a102`` and friends; if the database used different ids the
front end could never switch from its static modules to this API without a
rename, which is exactly what the brief forbids (section 0.1 step 5, section 9).

The seeder is **idempotent**: running it twice leaves the same rows, updating
anything the front end changed and removing rooms it deleted. That matters
because it is the normal way to pick up a front-end change, not a one-shot
bootstrap.

``is_demo`` mirrors the front end's own ``provenance``: 18 of the 101 rooms are
generated placeholders for buildings with no official floor plan, and those are
flagged. The remaining 83 come from the CAD drawings in ``Campus map (3).pdf``
and are real, so flagging them as demo would be its own kind of dishonesty.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.frontend.campus_extract import FrontendInventory
from app.core.logging import get_logger
from app.domain.base import DataProvenance, RoomKind
from app.domain.platform import SeedRun
from app.domain.spatial import Building, Campus, Connector, Floor, Room, RoomAlias

log = get_logger(__name__)


@dataclass
class SeedResult:
    """What the run did, in numbers a phase report can quote."""

    campus_id: str
    inventory_hash: str
    created: dict[str, int] = field(default_factory=dict)
    updated: dict[str, int] = field(default_factory=dict)
    deleted: dict[str, int] = field(default_factory=dict)
    totals: dict[str, int] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)

    def summary(self) -> str:
        def fmt(label: str, data: dict[str, int]) -> str:
            if not data:
                return f"  {label:<9} -"
            parts = ", ".join(f"{k}={v}" for k, v in sorted(data.items()) if v)
            return f"  {label:<9} {parts or '-'}"

        lines = [
            f"campus    {self.campus_id}",
            f"hash      {self.inventory_hash[:16]}",
            fmt("created", self.created),
            fmt("updated", self.updated),
            fmt("deleted", self.deleted),
            fmt("totals", self.totals),
        ]
        if self.warnings:
            lines.append(f"  warnings  {len(self.warnings)}")
        return "\n".join(lines)


async def seed_campus(
    session: AsyncSession,
    inventory: FrontendInventory,
    *,
    timezone: str,
    random_seed: int,
) -> SeedResult:
    """Load (or refresh) the campus, idempotently.

    Takes the session rather than creating one so that tests can run it inside a
    transaction they roll back.
    """
    result = SeedResult(
        campus_id=inventory.campus_id,
        inventory_hash=inventory.content_hash(),
        warnings=list(inventory.warnings),
    )

    campus = await _upsert_campus(session, inventory, timezone=timezone, result=result)
    await session.flush()

    wanted_building_ids: set[str] = set()
    wanted_floor_ids: set[str] = set()
    wanted_room_ids: set[str] = set()

    for extracted in inventory.buildings:
        wanted_building_ids.add(extracted.id)
        building = await session.get(Building, extracted.id)
        if building is None:
            building = Building(id=extracted.id, campus_id=campus.id)
            session.add(building)
            _bump(result.created, "buildings")
        else:
            _bump(result.updated, "buildings")

        building.campus_id = campus.id
        building.name = extracted.name
        building.short_name = extracted.short_name
        building.description = extracted.description
        building.floor_count = extracted.floor_count
        building.provenance = DataProvenance(extracted.provenance)
        building.sort_order = extracted.sort_order
        # A building is demo only if every one of its rooms is. bld-a and bld-j
        # have no official plan at all; the rest have real CAD data.
        all_rooms = [room for floor in extracted.floors for room in floor.rooms]
        building.is_demo = bool(all_rooms) and all(r.provenance == "demo" for r in all_rooms)

        for extracted_floor in extracted.floors:
            wanted_floor_ids.add(extracted_floor.id)
            floor = await session.get(Floor, extracted_floor.id)
            if floor is None:
                floor = Floor(id=extracted_floor.id, building_id=building.id)
                session.add(floor)
                _bump(result.created, "floors")
            else:
                _bump(result.updated, "floors")

            floor.building_id = building.id
            floor.level = extracted_floor.level
            floor.name = extracted_floor.name
            floor.is_demo = bool(extracted_floor.rooms) and all(
                r.provenance == "demo" for r in extracted_floor.rooms
            )

            for position, extracted_room in enumerate(extracted_floor.rooms):
                wanted_room_ids.add(extracted_room.id)
                room = await session.get(Room, extracted_room.id)
                if room is None:
                    room = Room(id=extracted_room.id, floor_id=floor.id)
                    session.add(room)
                    _bump(result.created, "rooms")
                else:
                    _bump(result.updated, "rooms")

                room.floor_id = floor.id
                room.number = extracted_room.number
                room.name = extracted_room.name
                room.room_kind = RoomKind(extracted_room.kind)
                room.capacity = extracted_room.capacity
                room.provenance = DataProvenance(extracted_room.provenance)
                room.is_demo = extracted_room.provenance == "demo"
                room.sort_order = position

                await _sync_aliases(session, room, extracted_room.legacy_ids, result)

    await session.flush()
    await _remove_stale(
        session,
        campus_id=campus.id,
        wanted_building_ids=wanted_building_ids,
        wanted_floor_ids=wanted_floor_ids,
        wanted_room_ids=wanted_room_ids,
        result=result,
    )
    await _sync_connectors(session, campus, inventory, wanted_building_ids, result)

    await session.flush()
    result.totals = await _totals(session, campus.id)

    session.add(
        SeedRun(
            source="frontend:src/data",
            inventory_hash=result.inventory_hash,
            random_seed=random_seed,
            counts={
                "created": result.created,
                "updated": result.updated,
                "deleted": result.deleted,
                "totals": result.totals,
            },
            warnings=result.warnings,
        )
    )
    return result


async def _upsert_campus(
    session: AsyncSession,
    inventory: FrontendInventory,
    *,
    timezone: str,
    result: SeedResult,
) -> Campus:
    campus = await session.get(Campus, inventory.campus_id)
    if campus is None:
        campus = Campus(id=inventory.campus_id)
        session.add(campus)
        _bump(result.created, "campus")
    else:
        _bump(result.updated, "campus")
    campus.name = inventory.campus_name
    campus.timezone = timezone
    # The university is real; only some of its room data is placeholder.
    campus.is_demo = False
    return campus


async def _sync_aliases(
    session: AsyncSession,
    room: Room,
    legacy_ids: tuple[str, ...],
    result: SeedResult,
) -> None:
    """Replace this room's aliases with exactly ``legacy_ids``.

    Many-to-many by design: the same legacy id may belong to several rooms
    (``bld-h-f2-r7``), so this must not assume one owner per alias.
    """
    existing_result = await session.execute(select(RoomAlias).where(RoomAlias.room_id == room.id))
    existing = {alias.alias: alias for alias in existing_result.scalars().all()}

    for legacy in legacy_ids:
        if legacy in existing:
            existing.pop(legacy)
            continue
        session.add(
            RoomAlias(
                alias=legacy,
                room_id=room.id,
                source="src/data/floor-plans/index.ts legacyId",
            )
        )
        _bump(result.created, "room_aliases")

    for stale in existing.values():
        await session.delete(stale)
        _bump(result.deleted, "room_aliases")


async def _remove_stale(
    session: AsyncSession,
    *,
    campus_id: str,
    wanted_building_ids: set[str],
    wanted_floor_ids: set[str],
    wanted_room_ids: set[str],
    result: SeedResult,
) -> None:
    """Delete rows the front end no longer has.

    Deliberately scoped to this campus and ordered rooms -> floors -> buildings.
    A room the front end dropped is not data loss: ``GEOMETRY_SPEC.md`` section 5.3
    says a demo room absent from the plan is removed and reported, which is what
    the seed report does.
    """
    stale_rooms = await session.execute(
        select(Room.id)
        .join(Floor, Floor.id == Room.floor_id)
        .join(Building, Building.id == Floor.building_id)
        .where(Building.campus_id == campus_id, Room.id.notin_(wanted_room_ids or {""}))
    )
    room_ids = list(stale_rooms.scalars().all())
    if room_ids:
        await session.execute(delete(RoomAlias).where(RoomAlias.room_id.in_(room_ids)))
        await session.execute(delete(Room).where(Room.id.in_(room_ids)))
        result.deleted["rooms"] = len(room_ids)
        result.warnings.append(
            f"removed {len(room_ids)} room(s) no longer present in the front-end data: "
            + ", ".join(sorted(room_ids)[:20])
            + (" ..." if len(room_ids) > 20 else "")
        )

    stale_floors = await session.execute(
        select(Floor.id)
        .join(Building, Building.id == Floor.building_id)
        .where(Building.campus_id == campus_id, Floor.id.notin_(wanted_floor_ids or {""}))
    )
    floor_ids = list(stale_floors.scalars().all())
    if floor_ids:
        await session.execute(delete(Floor).where(Floor.id.in_(floor_ids)))
        result.deleted["floors"] = len(floor_ids)

    stale_buildings = await session.execute(
        select(Building.id).where(
            Building.campus_id == campus_id,
            Building.id.notin_(wanted_building_ids or {""}),
        )
    )
    building_ids = list(stale_buildings.scalars().all())
    if building_ids:
        await session.execute(delete(Building).where(Building.id.in_(building_ids)))
        result.deleted["buildings"] = len(building_ids)


async def _sync_connectors(
    session: AsyncSession,
    campus: Campus,
    inventory: FrontendInventory,
    known_building_ids: set[str],
    result: SeedResult,
) -> None:
    wanted: set[str] = set()
    for extracted in inventory.connectors:
        a, b = extracted.building_ids
        if a not in known_building_ids or b not in known_building_ids:
            # The extractor already warned; skip rather than violate the FK.
            continue
        wanted.add(extracted.id)
        connector = await session.get(Connector, extracted.id)
        if connector is None:
            connector = Connector(id=extracted.id, campus_id=campus.id)
            session.add(connector)
            _bump(result.created, "connectors")
        else:
            _bump(result.updated, "connectors")
        connector.campus_id = campus.id
        connector.kind = extracted.kind
        connector.building_a_id = a
        connector.building_b_id = b
        connector.is_demo = False

    stale = await session.execute(
        select(Connector.id).where(Connector.campus_id == campus.id, Connector.id.notin_(wanted or {""}))
    )
    stale_ids = list(stale.scalars().all())
    if stale_ids:
        await session.execute(delete(Connector).where(Connector.id.in_(stale_ids)))
        result.deleted["connectors"] = len(stale_ids)


async def _totals(session: AsyncSession, campus_id: str) -> dict[str, int]:
    from sqlalchemy import func

    from app.services.campus_service import campus_counts

    counts = await campus_counts(session, campus_id)
    counts["room_aliases"] = int(
        await session.scalar(
            select(func.count())
            .select_from(RoomAlias)
            .join(Room, Room.id == RoomAlias.room_id)
            .join(Floor, Floor.id == Room.floor_id)
            .join(Building, Building.id == Floor.building_id)
            .where(Building.campus_id == campus_id)
        )
        or 0
    )
    counts["connectors"] = int(
        await session.scalar(
            select(func.count()).select_from(Connector).where(Connector.campus_id == campus_id)
        )
        or 0
    )
    return counts


def _bump(counter: dict[str, int], key: str) -> None:
    counter[key] = counter.get(key, 0) + 1
