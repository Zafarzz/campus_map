"""EduPage (aSc Timetables) ``regularttGetData`` JSON reader.

Reads the public JSON payload served by ``https://aut.edupage.org/timetable/``
(ADR-0010) and emits the same canonical :class:`TimetableRow` objects as the
CSV, XLSX and ICS readers.

Privacy invariant (``docs/privacy/timetable.md``):

* ``TimetableRow.teacher_ref`` receives a deterministic pseudonymous handle
  (``edupage:<hash>``) so ``Section.teacher_ref`` never stores a real name in
  analytics-facing tables, while still grouping a teacher's lessons for
  conflict and walking-transition checks.
* ``TimetableRow.teacher_label`` carries the published display string for the
  room card on the 3D map.
"""

from __future__ import annotations

import hashlib
import json
from datetime import time
from typing import Any

from app.engines.timetable.parsers import ParseResult
from app.engines.timetable.template import ColumnMapping, TimetableRow
from app.engines.timetable.validate import normalise_room_code

__all__ = [
    "EDUPAGE_ROOM_ALIASES",
    "extract_edupage_catalog",
    "parse_edupage",
    "pseudonymise_teacher",
    "resolve_edupage_room_code",
]

#: Explicit room-code bridge between EduPage's ``classrooms.short`` labels and
#: the canonical ``Room.number`` values in ``src/data/`` / ``campus.room``.
#: Keyed by :func:`normalise_room_code` so spacing and punctuation variants
#: (e.g. ``"F-DS_101_2 "``) resolve deterministically.
EDUPAGE_ROOM_ALIASES: dict[str, str] = {
    "CCONFERENCEHAL": "C-conF",
    "CCONFERENCEHALL": "C-conF",
    "CSPORTHAL": "SC101",
    "CSPORTHALL": "SC101",
    "EDS1011": "E-102",
    "EDS1012": "E-105",
    "EDS1013": "E-101",
    "EDS1014": "E-103",
    "FDS1011": "F-102",
    "FDS1012": "F-103",
    "E201": "E-205",
}


def resolve_edupage_room_code(raw_code: str) -> str:
    """Translate an EduPage classroom ``short`` code into a campus room number."""
    cleaned = raw_code.strip()
    if not cleaned:
        return ""
    key = normalise_room_code(cleaned)
    return EDUPAGE_ROOM_ALIASES.get(key, cleaned)


def pseudonymise_teacher(raw_name: str) -> str:
    """Return a deterministic pseudonymous token for one teacher string."""
    normalised = " ".join(raw_name.strip().lower().split())
    digest = hashlib.sha256(f"edupage-teacher:{normalised}".encode()).hexdigest()[:12]
    return digest


def _parse_hhmm(raw: object) -> time | None:
    text = str(raw or "").strip()
    if not text:
        return None
    parts = text.split(":")
    if len(parts) not in (2, 3):
        return None
    try:
        hour = int(parts[0])
        minute = int(parts[1])
        second = int(parts[2]) if len(parts) == 3 else 0
        return time(hour, minute, second)
    except ValueError:
        return None


def _safe_short_code(raw: str, *, limit: int = 60) -> str:
    cleaned = raw.strip()
    if len(cleaned) <= limit:
        return cleaned
    suffix = hashlib.sha256(cleaned.encode("utf-8")).hexdigest()[:6]
    return f"{cleaned[: limit - 7].rstrip()}#{suffix}"


def _parse_weeks_mask(raw: object) -> str | None:
    bits = str(raw or "").strip()
    if not bits or set(bits) == {"1"}:
        return "weekly"
    if bits == "10":
        return "odd"
    if bits == "01":
        return "even"
    return "weekly"


def _extract_tables(data: Any) -> dict[str, list[dict[str, Any]]] | None:
    if not isinstance(data, dict):
        return None
    accessor = data.get("r", {}).get("dbiAccessorRes") if isinstance(data.get("r"), dict) else None
    tables_raw = accessor.get("tables") if isinstance(accessor, dict) else data.get("tables")
    if not isinstance(tables_raw, list):
        return None
    tables: dict[str, list[dict[str, Any]]] = {}
    for item in tables_raw:
        if isinstance(item, dict) and isinstance(item.get("id"), str):
            rows = item.get("data_rows", [])
            if isinstance(rows, list):
                tables[item["id"]] = [r for r in rows if isinstance(r, dict)]
    return tables


def parse_edupage(payload: bytes) -> ParseResult:
    """Parse an EduPage ``regularttGetData`` JSON payload into canonical rows."""
    try:
        decoded = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        return ParseResult(errors=[f"could not parse EduPage JSON: {exc}"])

    tables = _extract_tables(decoded)
    if tables is None:
        return ParseResult(errors=["JSON payload does not contain EduPage dbiAccessorRes tables"])

    periods_by_num: dict[str, tuple[time | None, time | None]] = {}
    for p in tables.get("periods", []):
        key = str(p.get("period") or p.get("id") or "").strip()
        if key:
            periods_by_num[key] = (_parse_hhmm(p.get("starttime")), _parse_hhmm(p.get("endtime")))

    if not periods_by_num:
        return ParseResult(errors=["EduPage payload contains no periods table"])

    cards = tables.get("cards", [])
    if not cards:
        return ParseResult(errors=["EduPage payload contains no placed lesson cards"])

    lessons = {str(item.get("id")): item for item in tables.get("lessons", []) if item.get("id") is not None}
    subjects = {
        str(item.get("id")): item for item in tables.get("subjects", []) if item.get("id") is not None
    }
    classes = {str(item.get("id")): item for item in tables.get("classes", []) if item.get("id") is not None}
    classrooms = {
        str(item.get("id")): item for item in tables.get("classrooms", []) if item.get("id") is not None
    }
    teachers = {
        str(item.get("id")): item for item in tables.get("teachers", []) if item.get("id") is not None
    }

    rows: list[TimetableRow] = []
    source_row = 0

    for card in cards:
        source_row += 1
        row_errors: list[str] = []

        lesson_id = str(card.get("lessonid") or "")
        lesson = lessons.get(lesson_id)
        if lesson is None:
            rows.append(
                TimetableRow(
                    source_row=source_row,
                    parse_errors=(f"card {card.get('id')!r} references missing lesson {lesson_id!r}",),
                )
            )
            continue

        period_raw = str(card.get("period") or "").strip()
        try:
            start_period_num = int(period_raw)
        except ValueError:
            start_period_num = -1
            row_errors.append(f"invalid start period {period_raw!r}")

        try:
            duration_periods = max(1, int(lesson.get("durationperiods") or 1))
        except (TypeError, ValueError):
            duration_periods = 1

        starts_at: time | None = None
        ends_at: time | None = None
        if start_period_num >= 0:
            end_period_num = start_period_num + duration_periods - 1
            start_pair = periods_by_num.get(str(start_period_num))
            end_pair = periods_by_num.get(str(end_period_num))
            if start_pair is None or start_pair[0] is None:
                row_errors.append(f"unknown start period {start_period_num!r}")
            else:
                starts_at = start_pair[0]
            if end_pair is None or end_pair[1] is None:
                row_errors.append(f"unknown end period {end_period_num!r}")
            else:
                ends_at = end_pair[1]

        days_bits = str(card.get("days") or "").strip()
        weekdays = [idx for idx, bit in enumerate(days_bits) if bit == "1" and idx < 7]
        if not weekdays:
            row_errors.append(f"card {card.get('id')!r} has no active weekday in days={days_bits!r}")
            weekdays = [-1]

        classroom_ids = [str(cid) for cid in (card.get("classroomids") or []) if cid is not None]
        resolved_rooms: list[str | None] = []
        if not classroom_ids:
            row_errors.append(f"card {card.get('id')!r} has no classroom assigned")
            resolved_rooms = [None]
        else:
            for cid in classroom_ids:
                c_obj = classrooms.get(cid)
                if c_obj is None:
                    row_errors.append(f"card {card.get('id')!r} references unknown classroom id {cid!r}")
                    resolved_rooms.append(None)
                else:
                    raw_short = str(c_obj.get("short") or c_obj.get("name") or "").strip()
                    resolved = resolve_edupage_room_code(raw_short)
                    if not resolved:
                        row_errors.append(f"classroom {cid!r} has an empty code")
                        resolved_rooms.append(None)
                    else:
                        resolved_rooms.append(resolved)

        subject_obj = subjects.get(str(lesson.get("subjectid") or ""))
        title: str | None = None
        course_code: str | None = None
        if subject_obj is not None:
            raw_title = str(subject_obj.get("name") or subject_obj.get("short") or "").strip()
            raw_code = str(subject_obj.get("short") or raw_title).strip()
            title = raw_title[:300] if raw_title else None
            course_code = _safe_short_code(raw_code) if raw_code else None

        class_shorts = [
            str(classes[str(cid)].get("short") or classes[str(cid)].get("name") or "").strip()
            for cid in (lesson.get("classids") or [])
            if str(cid) in classes
        ]
        class_shorts = [item for item in class_shorts if item]
        section_code = _safe_short_code(", ".join(class_shorts)) if class_shorts else None

        teacher_shorts = [
            str(teachers[str(tid)].get("short") or "").strip()
            for tid in (lesson.get("teacherids") or [])
            if str(tid) in teachers
        ]
        teacher_shorts = [item for item in teacher_shorts if item]
        teacher_ref: str | None = None
        teacher_label: str | None = None
        if teacher_shorts:
            handles = sorted({pseudonymise_teacher(name) for name in teacher_shorts})
            teacher_ref = ("edupage:" + ",".join(handles))[:128]
            teacher_label = ", ".join(teacher_shorts)[:200]

        week_pattern = _parse_weeks_mask(card.get("weeks"))

        for wd in weekdays:
            for room_code in resolved_rooms:
                rows.append(
                    TimetableRow(
                        source_row=source_row,
                        room_code=room_code,
                        weekday=wd if wd >= 0 else None,
                        starts_at=starts_at,
                        ends_at=ends_at,
                        course_code=course_code,
                        section_code=section_code,
                        title=title,
                        teacher_ref=teacher_ref,
                        teacher_label=teacher_label,
                        week_pattern=week_pattern,
                        uid=f"edupage-card-{card.get('id')}-{wd}-{room_code or 'noroom'}"[:256],
                        parse_errors=tuple(row_errors),
                    )
                )

    mapping = ColumnMapping(
        mapping={
            "course_code": "subjects.short",
            "section_code": "classes.short",
            "title": "subjects.name",
            "teacher_ref": "teachers.id (pseudonymised)",
            "room_code": "classrooms.short",
            "weekday": "cards.days",
            "starts_at": "periods.starttime",
            "ends_at": "periods.endtime",
        }
    )
    return ParseResult(rows=rows, mapping=mapping)


def extract_edupage_catalog(payload: bytes) -> dict[str, list[str]]:
    """Extract full published lists of subjects, professors, and groups from EduPage JSON.

    During exam weeks (e.g. TT #163), some professors, subjects, or cohorts in
    the university roster have zero placed exam cards. Exposing the published
    catalog lets search distinguish a real professor/subject/group with no
    session on the selected day from a misspelled query.
    """
    try:
        decoded = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return {"subjects": [], "professors": [], "groups": []}

    tables = _extract_tables(decoded)
    if tables is None:
        return {"subjects": [], "professors": [], "groups": []}

    subjects = sorted(
        {
            str(item.get("name") or item.get("short") or "").strip()
            for item in tables.get("subjects", [])
            if str(item.get("name") or item.get("short") or "").strip()
        }
    )
    professors = sorted(
        {
            str(item.get("short") or "").strip()
            for item in tables.get("teachers", [])
            if str(item.get("short") or "").strip()
        }
    )
    groups = sorted(
        {
            str(item.get("short") or item.get("name") or "").strip()
            for item in tables.get("classes", [])
            if str(item.get("short") or item.get("name") or "").strip()
        }
    )
    return {
        "subjects": subjects,
        "professors": professors,
        "groups": groups,
    }
