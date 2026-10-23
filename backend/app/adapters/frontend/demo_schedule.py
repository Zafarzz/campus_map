"""A faithful port of the front end's demo schedule generator.

``src/data/demo-schedule.ts`` invents a deterministic timetable from a hash of
``date|roomId|slotIndex``. Porting it exactly - rather than inventing a different
demo timetable - buys something specific: the backend can seed a schedule that is
**identical** to what the front end currently shows, so switching the
compatibility seam from demo data to the API is provably a no-op for the user.
:mod:`tests.test_demo_schedule` pins the parity with values taken from the
TypeScript.

The front end is read-only (brief section 0.2), so this is a port, not an import:
nothing here reads or writes the TypeScript file. Two details carry all the risk
of divergence:

* **``Math.imul``** multiplies as 32-bit *signed* integers and truncates. Python
  integers are unbounded, so every step is masked back to 32 bits.
* **``h >>> 0``** reinterprets the signed result as unsigned. In Python that is
  just the masked value, because the mask never produces a negative.

Everything generated here is marked ``is_demo = true`` and carries provenance
``demo``: the brief forbids mixing demo and real data in reports (section 3.5).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

__all__ = [
    "DEMO_SLOTS",
    "DemoLesson",
    "fnv1a_unit",
    "generate_demo_lessons",
]

#: ``mapConfig.schedule.slots`` in ``src/config/mapConfig.ts``, verified
#: 2026-10-19. The front end's own TODO says these are placeholders for the
#: university's real lesson slots; the real ones arrive through the importer.
DEMO_SLOTS: tuple[tuple[str, str], ...] = (
    ("09:00", "10:20"),
    ("10:30", "11:50"),
    ("12:00", "13:20"),
    ("14:00", "15:20"),
    ("15:30", "16:50"),
    ("17:00", "18:20"),
)

#: The three pick-lists, in the front end's exact order. Order is part of the
#: contract: ``pick()`` indexes into them, so reordering would change every
#: generated lesson while still looking plausible.
_SUBJECTS: tuple[str, ...] = (
    "Computer Science",
    "Calculus",
    "Linear Algebra",
    "Physics",
    "Data Structures",
    "English Academic Writing",
    "Korean Language",
    "Economics",
    "Statistics",
    "Operating Systems",
    "Databases",
    "Digital Logic",
    "Machine Learning",
    "Discrete Math",
)
_TEACHERS: tuple[str, ...] = (
    "Dr. Kim",
    "Prof. Lee",
    "Dr. Park",
    "Ms. Karimova",
    "Mr. Tashkentov",
    "Dr. Choi",
    "Prof. Rahimov",
    "Ms. Yusupova",
    "Dr. Jung",
    "Mr. Aliev",
)
_GROUPS: tuple[str, ...] = (
    "CSE-21",
    "CSE-22",
    "CSE-23",
    "ICE-21",
    "ICE-22",
    "BM-22",
    "BM-23",
    "ME-21",
    "FIN-23",
    "CIE-22",
)

#: ``rand(seed) > 0.58`` skips the slot, so a room is busy about 42% of the time.
_OCCUPANCY_THRESHOLD = 0.58
#: ``rand(seed|c) < 0.06`` cancels the lesson.
_CANCELLATION_THRESHOLD = 0.06

_FNV_OFFSET_BASIS = 2166136261
_FNV_PRIME = 16777619
_UINT32 = 0xFFFFFFFF


def fnv1a_unit(seed: str) -> float:
    """The front end's ``rand(seed)``: a deterministic value in ``[0, 1)``.

    FNV-1a over the UTF-16 code units of ``seed``, then ``(h % 100000) / 100000``.

    Two subtleties are load-bearing:

    * ``charCodeAt`` yields UTF-16 code units, not Unicode code points. For a
      character outside the Basic Multilingual Plane JavaScript iterates two
      surrogates where Python's ``ord`` would give one value. Room identifiers
      are ASCII, so this never bites in practice, but the port handles it rather
      than quietly disagreeing if a non-ASCII identifier ever appears.
    * ``Math.imul`` truncates to 32 bits on every multiplication. Skipping the
      mask would let the value grow without bound and diverge immediately.
    """
    h = _FNV_OFFSET_BASIS
    for code_unit in _utf16_code_units(seed):
        h ^= code_unit
        h = (h * _FNV_PRIME) & _UINT32
    return (h % 100_000) / 100_000


def _utf16_code_units(value: str) -> list[int]:
    """UTF-16 code units, matching JavaScript's ``charCodeAt`` iteration."""
    units: list[int] = []
    for char in value:
        point = ord(char)
        if point <= 0xFFFF:
            units.append(point)
        else:
            adjusted = point - 0x10000
            units.append(0xD800 + (adjusted >> 10))
            units.append(0xDC00 + (adjusted & 0x3FF))
    return units


def _pick(options: tuple[str, ...], seed: str) -> str:
    """The front end's ``pick()``: index by ``floor(rand(seed) * len)``."""
    return options[int(fnv1a_unit(seed) * len(options))]


@dataclass(frozen=True, slots=True)
class DemoLesson:
    """One generated lesson.

    ``starts_at``/``ends_at`` are **UTC instants**, converted from the front
    end's offset-naive campus-local strings. The naive strings are what the
    compatibility layer must emit back, and that conversion lives in
    ``app.core.time``; storing instants here keeps the database rule (UTC
    everywhere) unbroken.
    """

    id: str
    room_id: str
    subject: str
    teacher: str
    group: str
    starts_at: datetime
    ends_at: datetime
    cancelled: bool
    slot_index: int

    @property
    def duration_minutes(self) -> int:
        return int((self.ends_at - self.starts_at).total_seconds() // 60)


def generate_demo_lessons(
    *,
    room_ids: list[tuple[str, str]] | tuple[tuple[str, str], ...],
    day: date,
    timezone: ZoneInfo,
    slots: tuple[tuple[str, str], ...] = DEMO_SLOTS,
) -> list[DemoLesson]:
    """Generate one campus-local day of demo lessons.

    ``room_ids`` is a sequence of ``(room_id, room_kind)`` pairs. Offices are
    skipped and halls always get "Physical Education", exactly as the front end
    does - the ``kind`` is needed for both rules, which is why it is passed in
    rather than looked up.

    Iteration order does not affect any individual lesson (every seed is built
    from the room id and slot index alone), so the caller may pass rooms in any
    order and still get the same set back.
    """
    date_key = day.isoformat()
    lessons: list[DemoLesson] = []

    for room_id, room_kind in room_ids:
        if room_kind == "office":
            continue
        for slot_index, (start_text, end_text) in enumerate(slots):
            seed = f"{date_key}|{room_id}|{slot_index}"
            if fnv1a_unit(seed) > _OCCUPANCY_THRESHOLD:
                continue

            subject = "Physical Education" if room_kind == "hall" else _pick(_SUBJECTS, f"{seed}|s")
            starts_at, ends_at = _slot_instants(day, start_text, end_text, timezone)
            lessons.append(
                DemoLesson(
                    id=f"demo-{room_id}-{date_key}-{slot_index}",
                    room_id=room_id,
                    subject=subject,
                    teacher=_pick(_TEACHERS, f"{seed}|t"),
                    group=_pick(_GROUPS, f"{seed}|g"),
                    starts_at=starts_at,
                    ends_at=ends_at,
                    cancelled=fnv1a_unit(f"{seed}|c") < _CANCELLATION_THRESHOLD,
                    slot_index=slot_index,
                )
            )

    lessons.sort(key=lambda item: (item.starts_at, item.room_id))
    return lessons


def _slot_instants(
    day: date, start_text: str, end_text: str, timezone: ZoneInfo
) -> tuple[datetime, datetime]:
    """Convert a ``HH:MM`` slot pair into UTC instants.

    A slot whose end is not after its start is read as crossing midnight and
    rolled to the next day. None of the current slots do, but a future slot list
    with an evening block that runs past midnight would otherwise produce an
    empty interval that the state engine rightly refuses.
    """
    start_time = time.fromisoformat(start_text)
    end_time = time.fromisoformat(end_text)

    start_local = datetime.combine(day, start_time).replace(tzinfo=timezone)
    end_day = day if end_time > start_time else day + timedelta(days=1)
    end_local = datetime.combine(end_day, end_time).replace(tzinfo=timezone)

    return start_local.astimezone(ZoneInfo("UTC")), end_local.astimezone(ZoneInfo("UTC"))
