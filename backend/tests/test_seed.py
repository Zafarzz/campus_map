"""Seeding: fidelity to the front end, and idempotency."""

from __future__ import annotations

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.frontend.campus_extract import extract_inventory
from app.core.config import get_settings
from app.domain.spatial import Building, Campus, Connector, Floor, Room, RoomAlias
from app.services.seed_service import seed_campus

pytestmark = pytest.mark.db


async def test_seed_loads_the_whole_campus(seeded_session: AsyncSession) -> None:
    assert await seeded_session.scalar(select(func.count()).select_from(Campus)) == 1
    assert await seeded_session.scalar(select(func.count()).select_from(Building)) == 8
    assert await seeded_session.scalar(select(func.count()).select_from(Floor)) == 24
    assert await seeded_session.scalar(select(func.count()).select_from(Room)) == 101
    assert await seeded_session.scalar(select(func.count()).select_from(Connector)) == 2


async def test_seeded_ids_are_the_front_ends_ids(seeded_session: AsyncSession) -> None:
    """The whole point of the seeder. These ids are the API contract."""
    for room_id, number in (
        ("bld-h-f1-a102", "A-102"),
        ("bld-h-f2-a208", "A-208"),
        ("bld-c-f1-d101", "D-101"),
        ("bld-b-f1-e101", "E-101"),
        ("bld-g-f1-lobby", "B-Lobby"),
        ("room-c-conf", "C-conF"),
        ("room-canteen", "Canteen"),
    ):
        room = await seeded_session.get(Room, room_id)
        assert room is not None, f"{room_id} was not seeded"
        assert room.number == number


async def test_campus_timezone_is_stored_on_the_row(seeded_session: AsyncSession) -> None:
    """Per-campus, not global, so a second campus needs no schema change."""
    campus = await seeded_session.get(Campus, "ajou-tashkent")
    assert campus is not None
    assert campus.timezone == "Asia/Tashkent"
    assert campus.is_demo is False


async def test_demo_flag_mirrors_the_front_ends_provenance(seeded_session: AsyncSession) -> None:
    """18 generated placeholders are flagged; 83 CAD-derived rooms are not.

    Flagging the real CAD rooms as demo would be its own dishonesty, and the
    front end renders a "Demo room" tag from exactly this distinction.
    """
    demo = await seeded_session.scalar(select(func.count()).select_from(Room).where(Room.is_demo.is_(True)))
    assert demo == 18

    placeholder = await seeded_session.get(Room, "bld-a-f1-r1")
    assert placeholder is not None and placeholder.is_demo is True

    confirmed = await seeded_session.get(Room, "bld-h-f1-a102")
    assert confirmed is not None and confirmed.is_demo is False


async def test_buildings_without_any_plan_are_marked_demo(seeded_session: AsyncSession) -> None:
    for building_id in ("bld-a", "bld-j"):
        building = await seeded_session.get(Building, building_id)
        assert building is not None and building.is_demo is True
    for building_id in ("bld-h", "bld-c"):
        building = await seeded_session.get(Building, building_id)
        assert building is not None and building.is_demo is False


async def test_block_letters_are_stored_not_derived(seeded_session: AsyncSession) -> None:
    """`bld-a` is the North Building; Block A is `bld-h`."""
    north = await seeded_session.get(Building, "bld-a")
    block_a = await seeded_session.get(Building, "bld-h")
    assert north is not None and north.short_name == "N"
    assert block_a is not None and block_a.short_name == "A"


async def test_legacy_aliases_are_seeded(seeded_session: AsyncSession) -> None:
    owners = await seeded_session.scalars(select(RoomAlias.room_id).where(RoomAlias.alias == "bld-h-f1-r1"))
    assert list(owners.all()) == ["bld-h-f1-a102"]


async def test_the_ambiguous_alias_is_stored_for_both_rooms(seeded_session: AsyncSession) -> None:
    """Storing both is what lets resolution raise instead of guessing."""
    owners = await seeded_session.scalars(select(RoomAlias.room_id).where(RoomAlias.alias == "bld-h-f2-r7"))
    assert set(owners.all()) == {"bld-h-f2-a207", "bld-h-f2-a208"}


async def test_connectors_link_known_buildings_only(seeded_session: AsyncSession) -> None:
    connectors = (await seeded_session.scalars(select(Connector))).all()
    building_ids = set((await seeded_session.scalars(select(Building.id))).all())
    for connector in connectors:
        assert connector.building_a_id in building_ids
        assert connector.building_b_id in building_ids
        assert connector.building_a_id != connector.building_b_id


async def test_room_order_within_a_floor_is_preserved(seeded_session: AsyncSession) -> None:
    """The front end renders rooms in array order, so sort_order must match."""
    rooms = (
        await seeded_session.scalars(
            select(Room).where(Room.floor_id == "bld-h-f1").order_by(Room.sort_order)
        )
    ).all()
    assert [r.number for r in rooms][:4] == ["A-107", "A-105", "A-103", "A-101"]


async def test_seeding_twice_changes_nothing(session: AsyncSession) -> None:
    """Idempotency: the normal way to pick up a front-end change is to re-run."""
    inventory = extract_inventory(get_settings().frontend_src_path)

    first = await seed_campus(session, inventory, timezone="Asia/Tashkent", random_seed=1)
    await session.flush()
    assert first.created["rooms"] == 101
    assert not first.deleted

    second = await seed_campus(session, inventory, timezone="Asia/Tashkent", random_seed=1)
    await session.flush()
    assert "rooms" not in second.created
    assert second.updated["rooms"] == 101
    assert not second.deleted
    assert second.totals == first.totals


async def test_seed_removes_rooms_the_front_end_dropped(session: AsyncSession) -> None:
    """A removed demo room is reported, not silently kept.

    GEOMETRY_SPEC.md section 5.3: a demo room absent from the plan is deleted and
    listed in the import report.
    """
    inventory = extract_inventory(get_settings().frontend_src_path)
    await seed_campus(session, inventory, timezone="Asia/Tashkent", random_seed=1)
    await session.flush()

    # Drop one floor's rooms from the inventory and re-seed.
    building = next(b for b in inventory.buildings if b.id == "bld-a")
    trimmed_floor = building.floors[0]
    removed_ids = {room.id for room in trimmed_floor.rooms}
    object.__setattr__(trimmed_floor, "rooms", ())

    result = await seed_campus(session, inventory, timezone="Asia/Tashkent", random_seed=1)
    await session.flush()

    assert result.deleted.get("rooms") == len(removed_ids)
    assert any("no longer present" in w for w in result.warnings)
    for room_id in removed_ids:
        assert await session.get(Room, room_id) is None


async def test_seed_records_a_run_with_the_inventory_hash(seeded_session: AsyncSession) -> None:
    """So a later run can tell whether the front end actually changed."""
    from app.domain.platform import SeedRun

    run = await seeded_session.scalar(select(SeedRun).order_by(SeedRun.at.desc()))
    assert run is not None
    assert len(run.inventory_hash) == 64
    assert run.counts is not None
    assert run.counts["totals"]["rooms"] == 101
