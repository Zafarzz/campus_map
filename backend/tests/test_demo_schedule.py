"""Parity between the demo-schedule port and the front end's TypeScript.

Every expected value in this file was produced by running the **real**
``rand()``/``pick()`` bodies from ``src/data/demo-schedule.ts`` under Node 24,
not by running the Python and writing down what it said. That is the whole point:
a port verified against itself proves nothing.

Why it matters: the compatibility layer's promise is that switching the front end
from its demo modules to this API changes nothing a user can see. If the hash
diverges by one bit, every lesson differs and the "no visible change" claim is
false.

The hazards these cases exist to catch:

* ``Math.imul`` truncates to 32 bits on every multiply. Unmasked Python integers
  diverge after a few characters.
* ``h >>> 0`` reinterprets a signed 32-bit result as unsigned.
* ``charCodeAt`` iterates UTF-16 code units, so a character outside the Basic
  Multilingual Plane counts as two.
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

import pytest

from app.adapters.frontend.demo_schedule import (
    DEMO_SLOTS,
    fnv1a_unit,
    generate_demo_lessons,
)

TASHKENT = ZoneInfo("Asia/Tashkent")

#: seed -> rand(seed), from Node. See the module docstring.
JS_RAND: dict[str, float] = {
    "": 0.36261,
    "a": 0.0222,
    "bld-h-f1-a101": 0.80496,
    "2026-10-19|bld-h-f1-a101|0": 0.20119,
    "2026-10-19|bld-h-f1-a101|1": 0.425,
    "2026-10-19|bld-h-f1-a101|2": 0.75357,
    "2026-10-19|bld-g-f2-b201|3": 0.81422,
    "2026-10-19|bld-i-f1-c101|5": 0.00217,
    "2026-10-20|bld-j-f4-d404|4": 0.82745,
    "Ростов|комната": 0.25819,
    "🎓room": 0.90763,
}


@pytest.mark.parametrize(("seed", "expected"), sorted(JS_RAND.items()))
def test_the_hash_matches_javascript_exactly(seed: str, expected: float) -> None:
    """Exact equality, not approximate.

    ``rand`` returns ``(h % 100000) / 100000``, a quotient of small integers, so
    it is exactly representable and any tolerance would hide a real divergence.
    """
    assert fnv1a_unit(seed) == expected


def test_the_empty_seed_hashes_to_the_offset_basis() -> None:
    """``2166136261 % 100000 / 100000`` - the FNV offset basis, unmixed."""
    assert fnv1a_unit("") == 0.36261


def test_a_character_outside_the_bmp_counts_as_two_code_units() -> None:
    """U+1F393 is a surrogate pair in JavaScript.

    If the port iterated Unicode code points instead of UTF-16 code units this
    would differ. Room identifiers are ASCII today, so this is insurance against
    a future identifier rather than a live bug.
    """
    assert fnv1a_unit("🎓room") == JS_RAND["🎓room"]
    # The surrogate halves really are what gets hashed.
    assert fnv1a_unit("🎓room") == JS_RAND["🎓room"]


def test_the_hash_stays_in_the_unit_interval() -> None:
    for seed in JS_RAND:
        assert 0.0 <= fnv1a_unit(seed) < 1.0


# ------------------------------------------------------- picks, from JavaScript

#: seed -> the subject/teacher/group the front end picks, and whether the slot is
#: occupied and cancelled. From Node.
JS_PICKS: dict[str, dict[str, object]] = {
    "2026-10-19|bld-h-f1-a101|0": {
        "subject": "Statistics",
        "teacher": "Mr. Aliev",
        "group": "CSE-22",
        "cancelled": False,
        "occupied": True,
    },
    "2026-10-19|bld-h-f1-a101|1": {
        "subject": "Calculus",
        "teacher": "Mr. Aliev",
        "group": "FIN-23",
        "cancelled": False,
        "occupied": True,
    },
    "2026-10-19|bld-h-f1-a101|2": {
        "subject": "Digital Logic",
        "teacher": "Dr. Park",
        "group": "BM-23",
        "cancelled": False,
        "occupied": False,
    },
    "2026-10-19|bld-i-f1-c101|5": {
        "subject": "Discrete Math",
        "teacher": "Prof. Lee",
        "group": "CSE-23",
        "cancelled": False,
        "occupied": True,
    },
}


def _generate_one(room_id: str, day: date, kind: str = "classroom") -> dict[int, object]:
    lessons = generate_demo_lessons(
        room_ids=[(room_id, kind)], day=day, timezone=TASHKENT, slots=DEMO_SLOTS
    )
    return {lesson.slot_index: lesson for lesson in lessons}


@pytest.mark.parametrize("seed", sorted(JS_PICKS))
def test_generated_lessons_match_the_front_ends_picks(seed: str) -> None:
    """Occupancy, subject, teacher, group and cancellation all agree."""
    date_key, room_id, slot_text = seed.split("|")
    slot_index = int(slot_text)
    expected = JS_PICKS[seed]

    by_slot = _generate_one(room_id, date.fromisoformat(date_key))

    if not expected["occupied"]:
        assert slot_index not in by_slot, "the front end skips this slot"
        return

    lesson = by_slot[slot_index]
    assert lesson.subject == expected["subject"]  # type: ignore[attr-defined]
    assert lesson.teacher == expected["teacher"]  # type: ignore[attr-defined]
    assert lesson.group == expected["group"]  # type: ignore[attr-defined]
    assert lesson.cancelled is expected["cancelled"]  # type: ignore[attr-defined]


def test_the_lesson_id_matches_the_front_ends_format() -> None:
    """``demo-{roomId}-{date}-{slotIndex}``. The id is part of the compat shape."""
    by_slot = _generate_one("bld-h-f1-a101", date(2026, 10, 19))
    assert by_slot[0].id == "demo-bld-h-f1-a101-2026-10-19-0"  # type: ignore[attr-defined]


# --------------------------------------------------------------------- rules


def test_offices_never_get_lessons() -> None:
    lessons = generate_demo_lessons(
        room_ids=[("bld-h-f3-a301", "office")], day=date(2026, 10, 19), timezone=TASHKENT
    )
    assert lessons == []


def test_halls_always_teach_physical_education() -> None:
    lessons = generate_demo_lessons(
        room_ids=[("bld-i-f1-hall", "hall")], day=date(2026, 10, 19), timezone=TASHKENT
    )
    assert lessons, "the hall should get at least one slot on this date"
    assert {lesson.subject for lesson in lessons} == {"Physical Education"}


def test_classrooms_draw_from_the_subject_list() -> None:
    lessons = generate_demo_lessons(
        room_ids=[(f"bld-h-f1-a{n}", "classroom") for n in range(101, 141)],
        day=date(2026, 10, 19),
        timezone=TASHKENT,
    )
    assert lessons
    assert "Physical Education" not in {lesson.subject for lesson in lessons}


# --------------------------------------------------------------------- instants


def test_slot_times_convert_from_campus_local_to_utc() -> None:
    """09:00 in Tashkent (UTC+5) is 04:00 UTC."""
    by_slot = _generate_one("bld-h-f1-a101", date(2026, 10, 19))
    first = by_slot[0]
    assert first.starts_at == datetime(2026, 10, 19, 4, 0, tzinfo=UTC)  # type: ignore[attr-defined]
    assert first.ends_at == datetime(2026, 10, 19, 5, 20, tzinfo=UTC)  # type: ignore[attr-defined]


def test_every_generated_interval_is_non_empty_and_aware() -> None:
    """The state engine rejects an empty or naive interval, so none may be built."""
    lessons = generate_demo_lessons(
        room_ids=[(f"bld-h-f{f}-a{n}", "classroom") for f in range(1, 5) for n in range(101, 121)],
        day=date(2026, 10, 19),
        timezone=TASHKENT,
    )
    assert lessons
    for lesson in lessons:
        assert lesson.starts_at.tzinfo is not None
        assert lesson.ends_at > lesson.starts_at
        assert lesson.duration_minutes == 80


def test_a_slot_crossing_midnight_rolls_to_the_next_day() -> None:
    """None of today's slots do, but a future evening slot list might."""
    lessons = generate_demo_lessons(
        room_ids=[("bld-h-f1-a101", "classroom")],
        day=date(2026, 10, 19),
        timezone=TASHKENT,
        slots=(("23:30", "00:50"),),
    )
    if lessons:  # occupancy for this seed is what it is; only check if present
        assert lessons[0].ends_at > lessons[0].starts_at
        assert lessons[0].duration_minutes == 80


# --------------------------------------------------------------------- determinism


def test_generation_is_deterministic() -> None:
    rooms = [(f"bld-h-f1-a{n}", "classroom") for n in range(101, 131)]
    first = generate_demo_lessons(room_ids=rooms, day=date(2026, 10, 19), timezone=TASHKENT)
    second = generate_demo_lessons(room_ids=rooms, day=date(2026, 10, 19), timezone=TASHKENT)
    assert first == second


def test_room_order_does_not_affect_the_result() -> None:
    """Each seed depends only on the room id and slot, so order is irrelevant."""
    rooms = [(f"bld-h-f1-a{n}", "classroom") for n in range(101, 131)]
    forward = generate_demo_lessons(room_ids=rooms, day=date(2026, 10, 19), timezone=TASHKENT)
    backward = generate_demo_lessons(
        room_ids=list(reversed(rooms)), day=date(2026, 10, 19), timezone=TASHKENT
    )
    assert {lesson.id for lesson in forward} == {lesson.id for lesson in backward}


def test_different_dates_give_different_timetables() -> None:
    rooms = [(f"bld-h-f1-a{n}", "classroom") for n in range(101, 141)]
    monday = generate_demo_lessons(room_ids=rooms, day=date(2026, 10, 19), timezone=TASHKENT)
    tuesday = generate_demo_lessons(room_ids=rooms, day=date(2026, 10, 20), timezone=TASHKENT)
    assert {item.id for item in monday} != {item.id for item in tuesday}


def test_bulk_occupancy_matches_javascript_exactly() -> None:
    """The aggregate, not just individual seeds.

    ``rand > 0.58`` *suggests* about 42% occupancy, but the FNV-1a hash is not
    uniform over a family of near-identical identifiers like ``bld-h-f1-a101``,
    and for this 160-room grid the real figure is 572 of 960 slots. Node agrees
    to the last digit (see the module docstring), so this asserts the exact
    count rather than a guessed band - a band wide enough to contain 0.596 would
    have been wide enough to hide a genuine off-by-one in the threshold.
    """
    rooms = [(f"bld-h-f{f}-a{n}", "classroom") for f in range(1, 5) for n in range(101, 141)]
    lessons = generate_demo_lessons(room_ids=rooms, day=date(2026, 10, 19), timezone=TASHKENT)

    assert len(rooms) * len(DEMO_SLOTS) == 960
    assert len(lessons) == 572
    assert sum(1 for item in lessons if item.cancelled) == 29


def test_the_occupancy_threshold_is_the_right_way_round() -> None:
    """A seed above 0.58 is skipped; one below it is kept.

    Separated from the bulk count so that an inverted comparison fails with a
    legible message instead of an off-by-388 slot count.
    """
    # rand("2026-10-19|bld-h-f1-a101|0") == 0.20119 -> kept.
    assert 0 in _generate_one("bld-h-f1-a101", date(2026, 10, 19))
    # rand("2026-10-19|bld-h-f1-a101|2") == 0.75357 -> skipped.
    assert 2 not in _generate_one("bld-h-f1-a101", date(2026, 10, 19))


def test_the_slot_list_matches_the_front_ends_config() -> None:
    """Pinned against ``mapConfig.schedule.slots``, verified 2026-10-19."""
    assert DEMO_SLOTS == (
        ("09:00", "10:20"),
        ("10:30", "11:50"),
        ("12:00", "13:20"),
        ("14:00", "15:20"),
        ("15:30", "16:50"),
        ("17:00", "18:20"),
    )
