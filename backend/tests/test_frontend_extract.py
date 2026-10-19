"""The read-only front-end extractor, and the drift guard.

Two jobs:

1. Prove the literal parser handles what the front end actually contains, and
   refuses what it must not guess at.
2. Pin the extracted inventory. The seeded identifiers are the contract between
   the map and this API, so a front-end change has to be a visible, deliberate
   event - not something that quietly reshapes the database on the next seed.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.adapters.frontend.campus_extract import extract_inventory
from app.adapters.frontend.js_literal import JsLiteralError, find_export, parse_js_literal, strip_comments
from scripts.extract_frontend_campus import DEFAULT_SNAPSHOT

# --------------------------------------------------------------------- parser


def test_parses_an_object_with_unquoted_keys_and_single_quotes() -> None:
    assert parse_js_literal("{ id: 'bld-h', floors: 2 }") == {"id": "bld-h", "floors": 2}


def test_parses_trailing_commas() -> None:
    assert parse_js_literal("[1, 2, 3,]") == [1, 2, 3]
    assert parse_js_literal("{a: 1, b: 2,}") == {"a": 1, "b": 2}


def test_strips_both_comment_styles_without_touching_strings() -> None:
    source = """
    {
      // a line comment with 'quotes' and {braces}
      id: 'bld-h', /* inline */
      note: 'keep // this and /* this */ intact',
    }
    """
    parsed = parse_js_literal(source)
    assert parsed["id"] == "bld-h"
    assert parsed["note"] == "keep // this and /* this */ intact"


def test_strip_comments_preserves_length_so_positions_stay_usable() -> None:
    source = "{a: 1} // tail"
    assert len(strip_comments(source)) == len(source)


def test_parses_nested_arrays_and_floats() -> None:
    parsed = parse_js_literal("{ uSpan: [0.08, 0.23], vSpan: [0.04, 0.45] }")
    assert parsed["uSpan"] == [0.08, 0.23]


def test_parses_escapes_and_unicode() -> None:
    assert parse_js_literal(r"{ s: 'Jarqo\'rg\'on' }")["s"] == "Jarqo'rg'on"
    assert parse_js_literal(r"{ s: 'é' }")["s"] == "é"


def test_booleans_and_null() -> None:
    assert parse_js_literal("{a: true, b: false, c: null, d: undefined}") == {
        "a": True,
        "b": False,
        "c": None,
        "d": None,
    }


def test_refuses_to_evaluate_an_expression() -> None:
    """A computed value must fail loudly, not be guessed.

    If the front end ever changes `capacity: 30` to `capacity: BASE * 2`, a
    permissive parser would seed a wrong number silently.
    """
    with pytest.raises(JsLiteralError, match="not a literal value"):
        parse_js_literal("{ capacity: DEFAULT_CAPACITY }")


def test_refuses_template_interpolation() -> None:
    with pytest.raises(JsLiteralError, match="not a literal"):
        parse_js_literal("{ id: `${buildingId}-f1` }")


def test_refuses_spread_and_computed_keys() -> None:
    with pytest.raises(JsLiteralError):
        parse_js_literal("{ ...base, id: 'x' }")
    with pytest.raises(JsLiteralError, match="computed keys"):
        parse_js_literal("{ [key]: 'x' }")


def test_find_export_skips_a_type_annotation() -> None:
    source = """
    export type Other = { id: string };
    export const knownBuildings: BuildingStructure[] = [
      { id: 'bld-a', floorCount: 4 },
    ];
    """
    assert find_export(source, "knownBuildings") == [{"id": "bld-a", "floorCount": 4}]


def test_find_export_ignores_a_same_named_mention_elsewhere() -> None:
    source = """
    // knownBuildings is documented here
    const other = knownBuildings.length;
    export const knownBuildings = [{ id: 'bld-a' }];
    """
    assert find_export(source, "knownBuildings") == [{"id": "bld-a"}]


def test_find_export_raises_for_a_missing_name() -> None:
    with pytest.raises(JsLiteralError, match="no declaration"):
        find_export("export const other = 1;", "knownBuildings")


# --------------------------------------------------------------------- inventory


@pytest.fixture(scope="module")
def inventory(frontend_src: Path):  # type: ignore[no-untyped-def]
    return extract_inventory(frontend_src)


def test_campus_identity_matches_the_front_end(inventory) -> None:  # type: ignore[no-untyped-def]
    assert inventory.campus_id == "ajou-tashkent"
    assert inventory.campus_name == "Ajou University in Tashkent"


def test_building_id_to_block_letter_mapping(inventory) -> None:  # type: ignore[no-untyped-def]
    """`bld-a` is NOT Block A. Getting this wrong mislabels the whole map.

    Source: docs/PDF_INVENTORY.md section 3, which resolved open question Q3.
    """
    expected = {
        "bld-a": "N",
        "bld-b": "E",
        "bld-c": "D",
        "bld-d": "F",
        "bld-g": "B",
        "bld-h": "A",
        "bld-i": "C",
        "bld-j": "Dorm",
    }
    assert {b.id: b.short_name for b in inventory.buildings} == expected


def test_floor_counts_match_the_official_inventory(inventory) -> None:  # type: ignore[no-untyped-def]
    """Block A is 2 floors, not 4 - the brief's section 2.1 screenshot was wrong."""
    counts = {b.id: b.floor_count for b in inventory.buildings}
    assert counts["bld-h"] == 2  # Block A
    assert counts["bld-c"] == 2  # Block D
    assert counts["bld-d"] == 2  # Block F
    assert counts["bld-g"] == 4  # Block B
    assert counts["bld-b"] == 4  # Block E
    assert counts["bld-j"] == 4  # Dormitory


def test_every_building_has_exactly_its_declared_floors(inventory) -> None:  # type: ignore[no-untyped-def]
    for building in inventory.buildings:
        assert len(building.floors) == building.floor_count
        assert [f.level for f in building.floors] == list(range(1, building.floor_count + 1))


def test_room_ids_are_unique_campus_wide(inventory) -> None:  # type: ignore[no-untyped-def]
    ids = [r.id for b in inventory.buildings for f in b.floors for r in f.rooms]
    assert len(ids) == len(set(ids))


def test_confirmed_cad_rooms_keep_their_stable_ids(inventory) -> None:  # type: ignore[no-untyped-def]
    """Branch 1 ids follow ADR-008's `${floorId}-${slug(number)}` form."""
    rooms = {r.id: r for b in inventory.buildings for f in b.floors for r in f.rooms}
    assert rooms["bld-h-f1-a102"].number == "A-102"
    assert rooms["bld-h-f1-a102"].capacity == 36
    assert rooms["bld-h-f1-a105"].name == "Library (Reading Hall)"
    assert rooms["bld-h-f1-a105"].kind == "hall"
    assert rooms["room-c-conf"].number == "C-conF"


def test_demo_placeholders_are_flagged_as_demo(inventory) -> None:  # type: ignore[no-untyped-def]
    """Buildings with no official plan get generated rooms, marked `demo`."""
    rooms = {r.id: r for b in inventory.buildings for f in b.floors for r in f.rooms}
    assert rooms["bld-a-f1-r1"].provenance == "demo"
    assert rooms["bld-j-f1-r1"].provenance == "demo"
    # ...while CAD-derived rooms are not.
    assert rooms["bld-h-f1-a102"].provenance == "confirmed"


def test_the_known_ambiguous_legacy_alias_is_detected(inventory) -> None:  # type: ignore[no-untyped-def]
    """`bld-h-f2-r7` is the legacyId of BOTH A-207 and A-208.

    Real data, at src/data/floor-plans/index.ts lines 81 and 86. The extractor
    must surface it rather than silently dropping one room.
    """
    ambiguous = inventory.ambiguous_aliases()
    assert "bld-h-f2-r7" in ambiguous
    assert set(ambiguous["bld-h-f2-r7"]) == {"bld-h-f2-a207", "bld-h-f2-a208"}
    assert any("bld-h-f2-r7" in w for w in inventory.warnings)


def test_connectors_are_extracted(inventory) -> None:  # type: ignore[no-untyped-def]
    """ADR-020: Block B and Block A each join Block C under cover."""
    by_id = {c.id: c for c in inventory.connectors}
    assert set(by_id) == {"conn-bld-g-bld-i", "conn-bld-h-bld-i"}
    assert by_id["conn-bld-g-bld-i"].building_ids == ("bld-g", "bld-i")
    assert all(c.kind == "enclosed-corridor" for c in inventory.connectors)


def test_extraction_is_deterministic(frontend_src: Path) -> None:
    """Same input, same hash. A seeder that is not reproducible is not a seeder."""
    assert extract_inventory(frontend_src).content_hash() == extract_inventory(frontend_src).content_hash()


def test_committed_snapshot_matches_the_front_end(inventory) -> None:  # type: ignore[no-untyped-def]
    """Drift guard.

    If this fails, the front end's campus data changed. That is not necessarily
    wrong - but the ids are the API contract, so a human decides whether the
    backend follows. Review the diff, then run `make extract` and re-seed.
    """
    if not DEFAULT_SNAPSHOT.exists():
        pytest.skip("no committed snapshot yet; run scripts/extract_frontend_campus.py")
    committed = json.loads(DEFAULT_SNAPSHOT.read_text(encoding="utf-8"))
    assert committed["content_hash"] == inventory.content_hash(), (
        "front-end campus data has drifted from backend/data/frontend_campus_inventory.json"
    )


def test_snapshot_records_the_expected_totals(inventory) -> None:  # type: ignore[no-untyped-def]
    """Pins the numbers the Phase 1 report quotes."""
    assert len(inventory.buildings) == 8
    assert sum(len(b.floors) for b in inventory.buildings) == 24
    assert inventory.room_count == 101
    assert inventory.demo_room_count == 18
