"""CSV, XLSX and ICS readers. All three produce the same canonical rows.

Every parser's contract is identical: take bytes, return
``(rows, file_level_errors)``. A row that cannot be parsed is returned **with its
errors attached** rather than dropped, so the report can point at it. That is the
rule the brief sets for a deliberately broken file: every error reported, none
silently dropped (section 10.1).

Format notes worth knowing:

* **CSV** - the delimiter is sniffed, because registrar exports are
  comma-separated in some locales and semicolon-separated in others, and a file
  read with the wrong delimiter parses as one giant column rather than failing.
* **XLSX** - read with ``openpyxl`` in read-only mode. Cells may already be typed
  (a time cell is a ``datetime.time``, not a string), so values are coerced
  rather than parsed from text.
* **ICS** - the only format that carries real recurrence. The ``RRULE``,
  ``UID`` and ``EXDATE``s are carried through verbatim to
  :mod:`app.engines.recurrence`; this parser does not expand anything.
"""

from __future__ import annotations

import csv
import io
from datetime import date, datetime, time, timedelta
from typing import Any

from app.engines.timetable.template import (
    ColumnMapping,
    TimetableRow,
    parse_weekday,
)

__all__ = [
    "ParseResult",
    "parse_csv",
    "parse_ics",
    "parse_xlsx",
    "sniff_format",
]

#: Time formats accepted in a ``starts_at``/``ends_at`` cell, in priority order.
_TIME_FORMATS = ("%H:%M", "%H:%M:%S", "%H.%M", "%I:%M %p", "%I:%M%p", "%H%M")

_WEEK_PATTERNS = {
    "weekly": "weekly",
    "every": "weekly",
    "all": "weekly",
    "odd": "odd",
    "o": "odd",
    "even": "even",
    "e": "even",
}


class ParseResult:
    """Rows plus file-level errors (a missing column, an unreadable file)."""

    def __init__(
        self,
        rows: list[TimetableRow] | None = None,
        errors: list[str] | None = None,
        mapping: ColumnMapping | None = None,
    ) -> None:
        self.rows = rows or []
        self.errors = errors or []
        self.mapping = mapping or ColumnMapping()

    @property
    def ok(self) -> bool:
        """No file-level errors. Individual rows may still have problems."""
        return not self.errors

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"ParseResult(rows={len(self.rows)}, errors={len(self.errors)})"


def sniff_format(filename: str | None, payload: bytes) -> str:
    """Guess the format from the name, falling back to the content.

    Content wins over an absent or misleading extension: a file called
    ``timetable.txt`` that begins ``BEGIN:VCALENDAR`` is an ICS file, and
    refusing it on the extension would be pedantry.
    """
    name = (filename or "").lower()
    if name.endswith((".xlsx", ".xlsm", ".xltx")):
        return "xlsx"
    if name.endswith(".ics"):
        return "ics"
    if name.endswith((".csv", ".tsv", ".txt")):
        return "csv"

    head = payload[:512].lstrip()
    if head.startswith(b"PK\x03\x04"):
        return "xlsx"  # any OOXML zip
    if b"BEGIN:VCALENDAR" in payload[:2048].upper():
        return "ics"
    return "csv"


# --------------------------------------------------------------------- CSV


def parse_csv(
    payload: bytes,
    *,
    overrides: dict[str, str] | None = None,
    encoding: str = "utf-8",
) -> ParseResult:
    """Parse a delimited text export."""
    try:
        text = payload.decode(encoding)
    except UnicodeDecodeError:
        # Registrar exports from Windows tooling are often cp1251/latin-1.
        # Falling back is better than refusing the file; the replacement
        # characters show up in the report if a name is mangled.
        text = payload.decode("utf-8", errors="replace")

    # A UTF-8 BOM would otherwise become part of the first header's name.
    text = text.lstrip("﻿")
    if not text.strip():
        return ParseResult(errors=["the file is empty"])

    try:
        dialect = csv.Sniffer().sniff(text[:4096], delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel

    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    headers = reader.fieldnames
    if not headers:
        return ParseResult(errors=["the file has no header row"])

    mapping = ColumnMapping.infer(list(headers)).with_overrides(overrides)
    missing = mapping.missing_required()
    if missing:
        return ParseResult(
            errors=[
                f"could not find a column for {missing}. Headers in the file: "
                f"{list(headers)}. Supply a column mapping to resolve this."
            ],
            mapping=mapping,
        )

    rows: list[TimetableRow] = []
    # +2: the header is line 1 and DictReader starts after it.
    for offset, raw in enumerate(reader, start=2):
        if not any(str(value or "").strip() for value in raw.values()):
            continue  # blank line
        rows.append(_row_from_mapping(dict(raw), mapping, source_row=offset))

    return ParseResult(rows=rows, mapping=mapping)


# --------------------------------------------------------------------- XLSX


def parse_xlsx(
    payload: bytes,
    *,
    overrides: dict[str, str] | None = None,
    sheet: str | None = None,
) -> ParseResult:
    """Parse an Excel export, reading the first sheet unless told otherwise."""
    try:
        from openpyxl import load_workbook
    except ImportError:  # pragma: no cover - openpyxl is a hard dependency
        return ParseResult(errors=["openpyxl is not installed, so XLSX cannot be read"])

    try:
        workbook = load_workbook(io.BytesIO(payload), read_only=True, data_only=True, keep_links=False)
    except Exception as exc:
        return ParseResult(errors=[f"could not read the workbook: {exc}"])

    try:
        if sheet is not None:
            if sheet not in workbook.sheetnames:
                return ParseResult(errors=[f"no sheet named {sheet!r}; found {workbook.sheetnames}"])
            # ``workbook[name]`` may be a chartsheet, which has no rows at all.
            # ``worksheets`` is the data-bearing subset, so look the name up
            # there rather than casting the problem away.
            matches = [item for item in workbook.worksheets if item.title == sheet]
            if not matches:
                return ParseResult(errors=[f"sheet {sheet!r} holds no cells (it is probably a chart sheet)"])
            worksheet = matches[0]
        else:
            worksheet = workbook.worksheets[0]

        grid = [tuple(row) for row in worksheet.iter_rows(values_only=True)]
    finally:
        workbook.close()

    if not grid:
        return ParseResult(errors=["the first sheet is empty"])

    header_row = [("" if cell is None else str(cell).strip()) for cell in grid[0]]
    if not any(header_row):
        return ParseResult(errors=["the first row is blank, so there are no headers"])

    mapping = ColumnMapping.infer(header_row).with_overrides(overrides)
    missing = mapping.missing_required()
    if missing:
        return ParseResult(
            errors=[
                f"could not find a column for {missing}. Headers in the sheet: "
                f"{header_row}. Supply a column mapping to resolve this."
            ],
            mapping=mapping,
        )

    rows: list[TimetableRow] = []
    for offset, values in enumerate(grid[1:], start=2):
        if not any(value is not None and str(value).strip() for value in values):
            continue
        raw: dict[str, object] = {
            header: values[index] if index < len(values) else None
            for index, header in enumerate(header_row)
            if header
        }
        rows.append(_row_from_mapping(raw, mapping, source_row=offset))

    return ParseResult(rows=rows, mapping=mapping)


# --------------------------------------------------------------------- ICS


def parse_ics(payload: bytes) -> ParseResult:
    """Parse an iCalendar feed.

    The only input format that carries real recurrence, so the ``RRULE``,
    ``UID`` and ``EXDATE``s are preserved verbatim rather than being flattened
    into a weekday pattern. Expansion is :mod:`app.engines.recurrence`'s job and
    happens later, in the event's own timezone.
    """
    try:
        from icalendar import Calendar
    except ImportError:  # pragma: no cover - icalendar is a hard dependency
        return ParseResult(errors=["icalendar is not installed, so ICS cannot be read"])

    try:
        calendar = Calendar.from_ical(payload)
    except Exception as exc:
        return ParseResult(errors=[f"could not parse the calendar: {exc}"])

    rows: list[TimetableRow] = []
    for index, component in enumerate(calendar.walk("VEVENT"), start=1):
        errors: list[str] = []

        start = _ics_datetime(component.get("DTSTART"))
        end = _ics_datetime(component.get("DTEND"))
        if start is None:
            errors.append("VEVENT has no usable DTSTART")
        if end is None:
            duration = component.get("DURATION")
            if duration is not None and start is not None:
                try:
                    end = start + duration.dt
                except Exception:
                    errors.append("VEVENT has neither a usable DTEND nor DURATION")
            else:
                errors.append("VEVENT has neither DTEND nor DURATION")

        rrule_value = component.get("RRULE")
        rrule_text: str | None = None
        if rrule_value is not None:
            try:
                rrule_text = rrule_value.to_ical().decode("utf-8")
            except Exception:
                errors.append("RRULE could not be read")

        rows.append(
            TimetableRow(
                source_row=index,
                room_code=_ics_text(component.get("LOCATION")),
                weekday=start.weekday() if start is not None else None,
                starts_at=start.time() if start is not None else None,
                ends_at=end.time() if end is not None else None,
                start_date=start.date() if start is not None else None,
                end_date=_ics_until(rrule_value) if rrule_value is not None else None,
                title=_ics_text(component.get("SUMMARY")),
                course_code=_ics_text(component.get("CATEGORIES")),
                teacher_ref=_ics_text(component.get("ORGANIZER")),
                notes=_ics_text(component.get("DESCRIPTION")),
                rrule=rrule_text,
                uid=_ics_text(component.get("UID")),
                exdates=_ics_exdates(component),
                parse_errors=tuple(errors),
            )
        )

    if not rows:
        return ParseResult(errors=["the calendar contains no VEVENT components"])
    return ParseResult(rows=rows)


def _ics_datetime(value: Any) -> datetime | None:
    """Pull a datetime out of an icalendar property.

    A DATE-valued DTSTART (an all-day event) is not a lesson time, so it is
    returned as midnight and the duration check elsewhere will flag it rather
    than this function inventing a plausible hour.
    """
    if value is None:
        return None
    raw = getattr(value, "dt", None)
    if isinstance(raw, datetime):
        return raw
    if isinstance(raw, date):
        return datetime.combine(raw, time.min)
    return None


def _ics_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if text.upper().startswith("MAILTO:"):
        text = text[len("MAILTO:") :]
    return text or None


def _ics_until(rrule_value: Any) -> date | None:
    """The ``UNTIL`` of an RRULE, as a local date, if it has one."""
    try:
        until = rrule_value.get("UNTIL")
    except Exception:
        return None
    if not until:
        return None
    first = until[0] if isinstance(until, list) else until
    if isinstance(first, datetime):
        return first.date()
    if isinstance(first, date):
        return first
    return None


def _ics_exdates(component: Any) -> tuple[str, ...]:
    """Every EXDATE on a component, as ISO strings.

    ``EXDATE`` may appear several times, and each occurrence may hold a list, so
    both shapes are flattened. Kept as strings because
    :class:`~app.engines.recurrence.RecurrenceSpec` accepts them and decides
    whether each one names an instant or a whole local day.
    """
    raw = component.get("EXDATE")
    if raw is None:
        return ()
    groups = raw if isinstance(raw, list) else [raw]

    out: list[str] = []
    for group in groups:
        for item in getattr(group, "dts", []) or []:
            value = getattr(item, "dt", None)
            if isinstance(value, datetime):
                out.append(value.replace(tzinfo=None).isoformat())
            elif isinstance(value, date):
                out.append(value.isoformat())
    return tuple(out)


# --------------------------------------------------------------------- shared


def _row_from_mapping(raw: dict[str, object], mapping: ColumnMapping, *, source_row: int) -> TimetableRow:
    """Coerce one raw row into the canonical shape, collecting parse errors."""
    errors: list[str] = []

    def text(field: str) -> str | None:
        value = mapping.get(raw, field)
        if value is None:
            return None
        cleaned = str(value).strip()
        return cleaned or None

    starts_at, start_error = _coerce_time(mapping.get(raw, "starts_at"), "starts_at")
    ends_at, end_error = _coerce_time(mapping.get(raw, "ends_at"), "ends_at")
    errors.extend(item for item in (start_error, end_error) if item)

    weekday_raw = mapping.get(raw, "weekday")
    weekday = parse_weekday(weekday_raw if isinstance(weekday_raw, int) else text("weekday"))
    if weekday is None and weekday_raw not in (None, ""):
        errors.append(f"weekday {weekday_raw!r} is not a recognised day")

    start_date, start_date_error = _coerce_date(mapping.get(raw, "start_date"), "start_date")
    end_date, end_date_error = _coerce_date(mapping.get(raw, "end_date"), "end_date")
    errors.extend(item for item in (start_date_error, end_date_error) if item)

    enrolled, enrolled_error = _coerce_int(mapping.get(raw, "enrolled_count"))
    if enrolled_error:
        errors.append(enrolled_error)

    if text("room_code") is None:
        errors.append("room_code is empty")

    return TimetableRow(
        source_row=source_row,
        room_code=text("room_code"),
        weekday=weekday,
        starts_at=starts_at,
        ends_at=ends_at,
        start_date=start_date,
        end_date=end_date,
        course_code=text("course_code"),
        section_code=text("section_code"),
        title=text("title"),
        teacher_ref=text("teacher_ref"),
        week_pattern=_coerce_week_pattern(text("week_pattern")),
        enrolled_count=enrolled,
        notes=text("notes"),
        parse_errors=tuple(errors),
    )


def _coerce_time(value: object, field: str) -> tuple[time | None, str | None]:
    """Coerce a cell to a ``time``. XLSX cells may already be typed."""
    if value is None or (isinstance(value, str) and not value.strip()):
        return None, f"{field} is empty"
    if isinstance(value, time):
        return value, None
    if isinstance(value, datetime):
        return value.time(), None
    if isinstance(value, timedelta):
        # Excel sometimes stores a bare time as a duration since midnight.
        total = int(value.total_seconds())
        return time(hour=(total // 3600) % 24, minute=(total % 3600) // 60), None

    text = str(value).strip()
    for fmt in _TIME_FORMATS:
        try:
            return datetime.strptime(text, fmt).time(), None  # noqa: DTZ007 - a wall clock, by design
        except ValueError:
            continue
    # A decimal Excel serial: 0.5 is noon.
    try:
        fraction = float(text)
        if 0.0 <= fraction < 1.0:
            minutes = round(fraction * 24 * 60)
            return time(hour=minutes // 60, minute=minutes % 60), None
    except ValueError:
        pass
    return None, f"{field} {value!r} is not a recognised time"


def _coerce_date(value: object, field: str) -> tuple[date | None, str | None]:
    """Coerce a cell to a ``date``. Absent is fine; unparsable is not."""
    if value is None or (isinstance(value, str) and not value.strip()):
        return None, None
    if isinstance(value, datetime):
        return value.date(), None
    if isinstance(value, date):
        return value, None

    text = str(value).strip()
    for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y", "%m/%d/%Y", "%Y%m%d"):
        try:
            return datetime.strptime(text, fmt).date(), None  # noqa: DTZ007 - a calendar date
        except ValueError:
            continue
    return None, f"{field} {value!r} is not a recognised date"


def _coerce_int(value: object) -> tuple[int | None, str | None]:
    if value is None or (isinstance(value, str) and not value.strip()):
        return None, None
    if isinstance(value, bool):
        return None, f"enrolled_count {value!r} is not a number"
    if isinstance(value, int):
        return (value, None) if value >= 0 else (None, "enrolled_count is negative")
    if isinstance(value, float):
        return (int(value), None) if value >= 0 else (None, "enrolled_count is negative")

    text = str(value).strip()
    try:
        parsed = int(float(text))
    except ValueError:
        return None, f"enrolled_count {value!r} is not a number"
    return (parsed, None) if parsed >= 0 else (None, "enrolled_count is negative")


def _coerce_week_pattern(value: str | None) -> str | None:
    """Normalise a week-parity column to ``weekly``/``odd``/``even``.

    An unrecognised value is returned **unchanged** rather than discarded, so
    validation can warn about it by name instead of the information vanishing.
    """
    if value is None:
        return None
    key = value.strip().lower()
    return _WEEK_PATTERNS.get(key, value.strip())
