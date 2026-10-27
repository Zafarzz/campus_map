"""Re-derive the front end's campus inventory, read-only.

The front end builds its room list in code, not in a data file:
``src/data/demo-campus.ts`` resolves each ``(building, level)`` pair through five
branches in order, and three of those branches mint **order-dependent**
identifiers (``bld-a-f1-r1``). Those identifiers are the contract between the map
and this database, so the seeder cannot invent its own - it has to reproduce the
same five branches exactly.

This module does that: it reads the three source files, parses their literals,
and re-implements ``buildRoomsForFloor`` branch for branch. The result is hashed
and committed as a fixture, and a drift test fails if the front end changes - at
which point a human decides whether the seed should follow.

Read-only, always: every file is opened with ``read_text``. There is no write
path in this module.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from app.adapters.frontend.js_literal import JsLiteralError, find_export

#: Branch 1's fallback when a CAD plan omits capacity (``demo-campus.ts:37``).
DEFAULT_CAPACITY = 30
#: Branch 5 emits exactly this many placeholders per floor (``demo-campus.ts:79``).
PLACEHOLDERS_PER_FLOOR = 2
#: Branch 3 rewrites a level-2 room number onto a higher floor.
LEVEL2_NUMBER_PREFIX = re.compile(r"^[A-Z]-2")

VALID_ROOM_KINDS = frozenset({"classroom", "lab", "office", "hall", "other"})
VALID_PROVENANCE = frozenset({"confirmed", "demo"})


@dataclass(frozen=True, slots=True)
class ExtractedRoom:
    id: str
    number: str
    kind: str
    provenance: str
    name: str | None = None
    capacity: int | None = None
    #: Former identifier from the plan's ``legacyId``. Not unique across rooms.
    legacy_ids: tuple[str, ...] = ()
    #: Which of the five branches produced this room, for the seed report.
    source_branch: int = 0


@dataclass(frozen=True, slots=True)
class ExtractedFloor:
    id: str
    level: int
    name: str
    rooms: tuple[ExtractedRoom, ...]


@dataclass(frozen=True, slots=True)
class ExtractedBuilding:
    id: str
    name: str
    short_name: str
    description: str | None
    floor_count: int
    provenance: str
    floors: tuple[ExtractedFloor, ...]
    #: Position in the front end's ``knownBuildings`` array, which is the order
    #: the Buildings panel renders. Preserved so the compat response matches.
    sort_order: int = 0


@dataclass(frozen=True, slots=True)
class ExtractedConnector:
    id: str
    kind: str
    building_ids: tuple[str, str]


@dataclass
class FrontendInventory:
    """Everything the seeder needs, plus the warnings a human should see."""

    campus_id: str
    campus_name: str
    buildings: list[ExtractedBuilding] = field(default_factory=list)
    connectors: list[ExtractedConnector] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    source_files: dict[str, str] = field(default_factory=dict)

    @property
    def room_count(self) -> int:
        return sum(len(floor.rooms) for b in self.buildings for floor in b.floors)

    @property
    def demo_room_count(self) -> int:
        return sum(
            1 for b in self.buildings for floor in b.floors for r in floor.rooms if r.provenance == "demo"
        )

    def ambiguous_aliases(self) -> dict[str, list[str]]:
        """Legacy IDs claimed by more than one room.

        Known real case: ``bld-h-f2-r7`` is the ``legacyId`` of both ``A-207``
        and ``A-208`` in ``src/data/floor-plans/index.ts``.
        """
        owners: dict[str, list[str]] = {}
        for building in self.buildings:
            for floor in building.floors:
                for room in floor.rooms:
                    for alias in room.legacy_ids:
                        owners.setdefault(alias, []).append(room.id)
        return {alias: rooms for alias, rooms in owners.items() if len(rooms) > 1}

    def to_dict(self) -> dict[str, Any]:
        return {
            "campus": {"id": self.campus_id, "name": self.campus_name},
            "buildings": [asdict(b) for b in self.buildings],
            "connectors": [asdict(c) for c in self.connectors],
            "source_files": self.source_files,
            "warnings": self.warnings,
            "summary": {
                "buildings": len(self.buildings),
                "floors": sum(len(b.floors) for b in self.buildings),
                "rooms": self.room_count,
                "demo_rooms": self.demo_room_count,
                "ambiguous_aliases": self.ambiguous_aliases(),
            },
        }

    def content_hash(self) -> str:
        """Hash of the structural content, excluding warnings and file hashes.

        Used to detect genuine drift in the campus data rather than an unrelated
        edit elsewhere in the same file.
        """
        payload = {
            "campus": {"id": self.campus_id, "name": self.campus_name},
            "buildings": [asdict(b) for b in self.buildings],
            "connectors": [asdict(c) for c in self.connectors],
        }
        encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
        return hashlib.sha256(encoded).hexdigest()


def _read(path: Path) -> str:
    if not path.is_file():
        raise FileNotFoundError(
            f"front-end source not found: {path}. Point FRONTEND_SRC_DIR at the repository's src/ directory."
        )
    return path.read_text(encoding="utf-8")


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def extract_inventory(src_dir: Path) -> FrontendInventory:
    """Build the inventory from ``src/`` without writing anything."""
    structure_path = src_dir / "data" / "campus-structure.ts"
    demo_path = src_dir / "data" / "demo-campus.ts"
    plans_path = src_dir / "data" / "floor-plans" / "index.ts"
    footprints_path = src_dir / "data" / "reference-footprints.ts"

    structure_src = _read(structure_path)
    demo_src = _read(demo_path)
    plans_src = _read(plans_path)
    footprints_src = _read(footprints_path)

    campus_info = find_export(structure_src, "campusInfo")
    known_buildings = find_export(structure_src, "knownBuildings")
    known_rooms = find_export(demo_src, "knownRooms")
    special_rooms = find_export(demo_src, "specialRooms")
    confirmed_plans = find_export(plans_src, "confirmedFloorPlans")

    try:
        connectors_px = find_export(footprints_src, "connectorsPx")
    except JsLiteralError:
        connectors_px = []

    inventory = FrontendInventory(
        campus_id=str(campus_info["id"]),
        campus_name=str(campus_info["name"]),
        source_files={
            "campus-structure.ts": _sha256(structure_src),
            "demo-campus.ts": _sha256(demo_src),
            "floor-plans/index.ts": _sha256(plans_src),
            "reference-footprints.ts": _sha256(footprints_src),
        },
    )

    plans_by_key: dict[tuple[str, int], dict[str, Any]] = {}
    for plan in confirmed_plans:
        key = (str(plan["buildingId"]), int(plan["level"]))
        if key in plans_by_key:
            inventory.warnings.append(
                f"duplicate confirmed floor plan for {key[0]} level {key[1]}; "
                "the front end's Array.find() uses the first, so this one is ignored"
            )
            continue
        plans_by_key[key] = plan

    for order, structure in enumerate(known_buildings):
        building_id = str(structure["id"])
        short_name = str(structure["shortName"])
        floor_count = int(structure["floorCount"])

        floors: list[ExtractedFloor] = []
        for level in range(1, floor_count + 1):
            rooms, branch = _rooms_for_floor(
                building_id=building_id,
                short_name=short_name,
                level=level,
                plans_by_key=plans_by_key,
                special_rooms=special_rooms,
                known_rooms=known_rooms,
                warnings=inventory.warnings,
            )
            floors.append(
                ExtractedFloor(
                    id=f"{building_id}-f{level}",
                    level=level,
                    name=f"Floor {level}",
                    rooms=tuple(rooms),
                )
            )
            if branch in {3, 4, 5}:
                inventory.warnings.append(
                    f"{building_id}-f{level}: identifiers come from branch {branch} of "
                    "demo-campus.ts and are index-based, so they shift if the front end's "
                    "array order changes (GEOMETRY_SPEC.md 1.6 marks this format unstable)"
                )

        inventory.buildings.append(
            ExtractedBuilding(
                id=building_id,
                name=str(structure["name"]),
                short_name=short_name,
                description=_opt_str(structure.get("description")),
                floor_count=floor_count,
                # buildBuilding() hard-codes 'confirmed' (demo-campus.ts:103).
                provenance="confirmed",
                floors=tuple(floors),
                sort_order=order,
            )
        )

    known_building_ids = {b.id for b in inventory.buildings}
    for connector in connectors_px:
        ids = [str(item) for item in connector["buildingIds"]]
        if len(ids) != 2:
            inventory.warnings.append(
                f"connector {connector.get('id')!r} does not link exactly two buildings"
            )
            continue
        missing = [i for i in ids if i not in known_building_ids]
        if missing:
            # Real case: connectors reference buildings that are not in
            # knownBuildings, so they have geometry but no business data.
            inventory.warnings.append(
                f"connector {connector.get('id')!r} references building(s) {missing} that are "
                "absent from knownBuildings; not seeded"
            )
            continue
        inventory.connectors.append(
            ExtractedConnector(
                id=str(connector["id"]),
                kind=str(connector.get("kind", "enclosed-corridor")),
                building_ids=(ids[0], ids[1]),
            )
        )

    _validate(inventory)
    return inventory


def _rooms_for_floor(
    *,
    building_id: str,
    short_name: str,
    level: int,
    plans_by_key: dict[tuple[str, int], dict[str, Any]],
    special_rooms: dict[str, Any],
    known_rooms: dict[str, Any],
    warnings: list[str],
) -> tuple[list[ExtractedRoom], int]:
    """Mirror ``buildRoomsForFloor`` in ``src/data/demo-campus.ts``, branch for branch."""

    # Branch 1: an official CAD floor plan wins.
    plan = plans_by_key.get((building_id, level))
    if plan is not None:
        rooms = []
        for room in plan["rooms"]:
            legacy = room.get("legacyId")
            rooms.append(
                ExtractedRoom(
                    id=str(room["id"]),
                    number=str(room["number"]),
                    name=_opt_str(room.get("name")),
                    kind=str(room["kind"]),
                    capacity=int(room.get("capacity") or DEFAULT_CAPACITY),
                    provenance=str(room.get("provenance") or "confirmed"),
                    legacy_ids=(str(legacy),) if legacy else (),
                    source_branch=1,
                )
            )
        return rooms, 1

    # Branch 2: explicitly named special rooms, ground floor only.
    if level == 1 and building_id in special_rooms:
        rooms = [
            ExtractedRoom(
                id=str(room["id"]),
                number=str(room["number"]),
                name=_opt_str(room.get("name")),
                kind=str(room["kind"]),
                capacity=_opt_int(room.get("capacity")),
                provenance="confirmed",
                source_branch=2,
            )
            for room in special_rooms[building_id]
        ]
        return rooms, 2

    # Branch 3: replicate the level-2 plan onto levels above 2.
    level2 = plans_by_key.get((building_id, 2))
    if level2 is not None and level > 2:
        rooms = []
        for index, room in enumerate(level2["rooms"]):
            number = LEVEL2_NUMBER_PREFIX.sub(f"{short_name}-{level}", str(room["number"]), count=1)
            rooms.append(
                ExtractedRoom(
                    id=f"{building_id}-f{level}-r{index + 1}",
                    number=number,
                    name=_opt_str(room.get("name")),
                    kind=str(room["kind"]),
                    capacity=int(room.get("capacity") or DEFAULT_CAPACITY),
                    provenance="confirmed",
                    source_branch=3,
                )
            )
        return rooms, 3

    # Branch 4: room numbers known from the schedule, filtered to this level.
    block_rooms = [str(item) for item in known_rooms.get(short_name, [])]
    floor_rooms = [r for r in block_rooms if f"-{level}0" in r or f"-{level}1" in r]
    if floor_rooms:
        rooms = [
            ExtractedRoom(
                id=f"{building_id}-f{level}-r{index + 1}",
                number=number,
                kind="classroom",
                capacity=DEFAULT_CAPACITY,
                provenance="confirmed",
                source_branch=4,
            )
            for index, number in enumerate(floor_rooms)
        ]
        return rooms, 4

    # Branch 5: two generated placeholders.
    rooms = [
        ExtractedRoom(
            id=f"{building_id}-f{level}-r{index + 1}",
            number=f"{short_name}{level}{index + 1:02d}",
            kind="classroom",
            capacity=DEFAULT_CAPACITY,
            provenance="demo",
            source_branch=5,
        )
        for index in range(PLACEHOLDERS_PER_FLOOR)
    ]
    return rooms, 5


def _validate(inventory: FrontendInventory) -> None:
    """Fail on anything that would corrupt the seed; warn on the rest."""
    problems: list[str] = []
    seen_room_ids: dict[str, str] = {}

    for building in inventory.buildings:
        if len(building.floors) != building.floor_count:
            problems.append(
                f"{building.id}: floorCount {building.floor_count} but {len(building.floors)} floors built"
            )
        numbers_in_building: dict[str, str] = {}
        for floor in building.floors:
            for room in floor.rooms:
                if room.kind not in VALID_ROOM_KINDS:
                    problems.append(f"{room.id}: unknown RoomKind {room.kind!r}")
                if room.provenance not in VALID_PROVENANCE:
                    problems.append(f"{room.id}: unknown provenance {room.provenance!r}")
                if room.id in seen_room_ids:
                    problems.append(
                        f"duplicate room id {room.id!r} (also in {seen_room_ids[room.id]}). "
                        "Room ids must be unique campus-wide: they are the API contract."
                    )
                seen_room_ids[room.id] = floor.id
                # V-ROOM-1 in GEOMETRY_SPEC.md 7: a room number is unique per
                # building. A clash is the front end's to fix, so warn.
                if room.number in numbers_in_building:
                    inventory.warnings.append(
                        f"{building.id}: room number {room.number!r} used by both "
                        f"{numbers_in_building[room.number]} and {room.id}"
                    )
                numbers_in_building[room.number] = room.id

    for alias, owners in inventory.ambiguous_aliases().items():
        inventory.warnings.append(
            f"legacy id {alias!r} is claimed by {len(owners)} rooms ({', '.join(sorted(owners))}); "
            "it is stored for all of them and resolving it will raise AmbiguousAliasError"
        )

    if problems:
        raise ValueError("front-end inventory failed validation:\n  - " + "\n  - ".join(problems))


def _opt_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value)
    return text or None


def _opt_int(value: Any) -> int | None:
    return None if value is None else int(value)
