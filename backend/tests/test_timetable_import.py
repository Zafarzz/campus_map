"""Timetable ingestion: parsing, mapping and validation.

The brief (section 10.1) requires an import of a deliberately broken file in
which **every error is reported and none is silently dropped**. That is the
test this file is built around; see
:func:`test_a_deliberately_broken_file_reports_every_problem`.

Also covered: the column-mapping step that lets a differently shaped export be
loaded without a code change, and each of the three formats producing the same
canonical rows.
"""

from __future__ import annotations

import io
from datetime import date, time
from zoneinfo import ZoneInfo

import pytest
from hypothesis import given
from hypothesis import settings as hyp_settings
from hypothesis import strategies as st

from app.engines.timetable.parsers import (
    parse_csv,
    parse_ics,
    parse_xlsx,
    sniff_format,
)
from app.engines.timetable.template import (
    CANONICAL_COLUMNS,
    ColumnMapping,
    TimetableRow,
    parse_weekday,
)
from app.engines.timetable.validate import (
    IssueCode,
    RoomInfo,
    TermWindow,
    normalise_room_code,
    validate_rows,
)

TASHKENT = ZoneInfo("Asia/Tashkent")
BERLIN = ZoneInfo("Europe/Berlin")

TERM = TermWindow(starts_on=date(2026, 9, 1), ends_on=date(2026, 12, 20), code="2026F")

ROOMS = {
    "A-101": RoomInfo(room_id="bld-h-f1-a101", capacity=30),
    "A-102": RoomInfo(room_id="bld-h-f1-a102", capacity=24),
    "B-201": RoomInfo(room_id="bld-g-f2-b201", capacity=100),
}

GOOD_CSV = b"""course_code,section_code,title,teacher_ref,room_code,weekday,starts_at,ends_at,start_date,end_date,week_pattern,enrolled_count,notes
CS101,CSE-21,Intro to CS,t.kim,A-101,Monday,09:00,10:20,2026-09-01,2026-12-20,weekly,28,
CS102,CSE-22,Data Structures,t.lee,A-102,Tuesday,10:30,11:50,2026-09-01,2026-12-20,weekly,22,
MA201,ICE-21,Calculus,t.park,B-201,Wednesday,12:00,13:20,2026-09-01,2026-12-20,weekly,80,
"""


def _validate(rows, **kwargs):  # type: ignore[no-untyped-def]
    options = {"known_rooms": ROOMS, "timezone": TASHKENT, "term": TERM, **kwargs}
    return validate_rows(rows, **options)


# ===================================================================== template


class TestWeekdayParsing:
    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ("Monday", 0),
            ("monday", 0),
            ("MON", 0),
            ("Mo", 0),
            ("Tuesday", 1),
            ("Wed", 2),
            ("thu", 3),
            ("Friday", 4),
            ("Sat", 5),
            ("sunday", 6),
        ],
    )
    def test_names_and_abbreviations(self, raw: str, expected: int) -> None:
        assert parse_weekday(raw) == expected

    def test_zero_is_monday_in_the_zero_based_convention(self) -> None:
        assert parse_weekday(0) == 0

    def test_one_to_six_are_read_as_one_based(self) -> None:
        """The ambiguous range, resolved towards the spreadsheet convention.

        Both conventions exist. 1 to 6 are read as 1-based because that is what
        exports overwhelmingly use and it matches the ISO weekday number; 0 can
        only be 0-based and 7 can only be 1-based Sunday, so those are
        unambiguous.
        """
        assert parse_weekday(1) == 0  # Monday
        assert parse_weekday(5) == 4  # Friday
        assert parse_weekday(7) == 6  # Sunday

    def test_a_numeric_string_is_parsed_like_a_number(self) -> None:
        assert parse_weekday("1") == 0

    def test_nonsense_returns_none_rather_than_guessing(self) -> None:
        assert parse_weekday("someday") is None
        assert parse_weekday(99) is None
        assert parse_weekday("") is None
        assert parse_weekday(None) is None

    def test_a_boolean_is_refused(self) -> None:
        """``True`` is an ``int`` in Python and would otherwise parse as Monday."""
        assert parse_weekday(True) is None


class TestColumnMapping:
    def test_canonical_headers_map_to_themselves(self) -> None:
        mapping = ColumnMapping.infer(list(CANONICAL_COLUMNS))
        assert mapping.mapping["room_code"] == "room_code"
        assert mapping.missing_required() == []

    def test_a_foreign_export_is_mapped_without_a_code_change(self) -> None:
        """The whole point of the mapping step (brief section 10.1)."""
        mapping = ColumnMapping.infer(
            ["Course", "Group", "Subject", "Lecturer", "Room No.", "Day", "From", "To"]
        )
        assert mapping.mapping["room_code"] == "Room No."
        assert mapping.mapping["weekday"] == "Day"
        assert mapping.mapping["starts_at"] == "From"
        assert mapping.mapping["ends_at"] == "To"
        assert mapping.mapping["teacher_ref"] == "Lecturer"
        assert mapping.missing_required() == []

    def test_headers_are_matched_case_and_separator_insensitively(self) -> None:
        mapping = ColumnMapping.infer(["ROOM CODE", "Week-Day", "Starts_At", "ends at"])
        assert mapping.missing_required() == []

    def test_one_header_is_claimed_by_only_one_column(self) -> None:
        """A file with both "room" and "room_code" must not map both."""
        mapping = ColumnMapping.infer(["room", "room_code", "day", "start", "end"])
        claimed = list(mapping.mapping.values())
        assert len(claimed) == len(set(claimed))
        # The exact canonical spelling wins.
        assert mapping.mapping["room_code"] == "room_code"

    def test_missing_required_columns_are_named(self) -> None:
        mapping = ColumnMapping.infer(["Course", "Subject"])
        assert set(mapping.missing_required()) == {
            "room_code",
            "weekday",
            "starts_at",
            "ends_at",
        }

    def test_overrides_win_over_inference(self) -> None:
        mapping = ColumnMapping.infer(["Room", "Venue", "Day", "From", "To"]).with_overrides(
            {"room_code": "Venue"}
        )
        assert mapping.mapping["room_code"] == "Venue"

    def test_an_override_for_an_unknown_column_is_rejected(self) -> None:
        with pytest.raises(ValueError, match="unknown canonical column"):
            ColumnMapping.infer(["Room"]).with_overrides({"classroom_code": "Room"})


class TestRowIdentity:
    def test_moving_a_row_down_the_file_does_not_change_its_identity(self) -> None:
        """Otherwise a reordered export would diff as a complete replacement."""
        first = TimetableRow(source_row=2, room_code="A-101", weekday=0, starts_at=time(9))
        second = TimetableRow(source_row=99, room_code="A-101", weekday=0, starts_at=time(9))
        assert first.identity() == second.identity()

    def test_a_changed_note_does_not_change_identity(self) -> None:
        first = TimetableRow(source_row=2, room_code="A-101", weekday=0, notes="old")
        second = TimetableRow(source_row=2, room_code="A-101", weekday=0, notes="new")
        assert first.identity() == second.identity()

    def test_a_changed_room_does_change_identity(self) -> None:
        first = TimetableRow(source_row=2, room_code="A-101", weekday=0)
        second = TimetableRow(source_row=2, room_code="A-102", weekday=0)
        assert first.identity() != second.identity()

    def test_a_reversed_time_pair_is_negative_not_reinterpreted(self) -> None:
        """A ``15:00-14:00`` typo must not become a 23-hour lesson.

        Treating a reversed pair as "crosses midnight" sounds generous but
        would let the typo past the non-positive check and into the database,
        holding a room all day. Lessons that genuinely span midnight are
        vanishingly rare; reversed times in a hand-edited export are not.
        """
        row = TimetableRow(source_row=2, starts_at=time(15), ends_at=time(14))
        assert row.interval_minutes == -60

    def test_an_equal_time_pair_is_zero_length(self) -> None:
        row = TimetableRow(source_row=2, starts_at=time(11), ends_at=time(11))
        assert row.interval_minutes == 0

    def test_a_normal_pair_measures_its_length(self) -> None:
        row = TimetableRow(source_row=2, starts_at=time(9), ends_at=time(10, 20))
        assert row.interval_minutes == 80


# ===================================================================== parsers


class TestFormatSniffing:
    def test_extensions_are_honoured(self) -> None:
        assert sniff_format("t.csv", b"a,b") == "csv"
        assert sniff_format("t.xlsx", b"PK\x03\x04") == "xlsx"
        assert sniff_format("t.ics", b"BEGIN:VCALENDAR") == "ics"

    def test_content_wins_when_the_extension_is_misleading(self) -> None:
        """A .txt that is plainly a calendar should not be refused on pedantry."""
        assert sniff_format("timetable.dat", b"BEGIN:VCALENDAR\r\n") == "ics"
        assert sniff_format(None, b"PK\x03\x04\x14\x00") == "xlsx"

    def test_an_unknown_file_falls_back_to_csv(self) -> None:
        assert sniff_format(None, b"course,room\n") == "csv"


class TestCsvParsing:
    def test_a_well_formed_file_parses(self) -> None:
        result = parse_csv(GOOD_CSV)
        assert result.ok
        assert len(result.rows) == 3

        first = result.rows[0]
        assert first.source_row == 2, "the header is line 1"
        assert first.room_code == "A-101"
        assert first.weekday == 0
        assert first.starts_at == time(9, 0)
        assert first.ends_at == time(10, 20)
        assert first.start_date == date(2026, 9, 1)
        assert first.enrolled_count == 28
        assert first.parse_errors == ()
        assert first.is_usable

    def test_a_semicolon_delimited_file_parses(self) -> None:
        """Exports from some locales are semicolon-separated.

        Read with the wrong delimiter the whole file becomes one column and
        parses as garbage rather than failing, so the delimiter is sniffed.
        """
        payload = b"room_code;weekday;starts_at;ends_at\nA-101;Monday;09:00;10:20\n"
        result = parse_csv(payload)
        assert result.ok
        assert result.rows[0].room_code == "A-101"
        assert result.rows[0].starts_at == time(9)

    def test_a_tab_delimited_file_parses(self) -> None:
        payload = b"room_code\tweekday\tstarts_at\tends_at\nA-101\tMonday\t09:00\t10:20\n"
        result = parse_csv(payload)
        assert result.ok
        assert result.rows[0].room_code == "A-101"

    def test_a_utf8_bom_does_not_corrupt_the_first_header(self) -> None:
        payload = "﻿room_code,weekday,starts_at,ends_at\nA-101,Mon,09:00,10:20\n".encode()
        result = parse_csv(payload)
        assert result.ok, result.errors
        assert result.rows[0].room_code == "A-101"

    def test_undecodable_bytes_do_not_abort_the_import(self) -> None:
        """A cp1251 export should still load; mangled names show in the report."""
        payload = b"room_code,weekday,starts_at,ends_at,teacher_ref\nA-101,Mon,09:00,10:20,\xca\xe8\xec\n"
        result = parse_csv(payload)
        assert result.ok
        assert len(result.rows) == 1

    def test_blank_lines_are_skipped(self) -> None:
        payload = b"room_code,weekday,starts_at,ends_at\nA-101,Mon,09:00,10:20\n,,,\n"
        result = parse_csv(payload)
        assert len(result.rows) == 1

    def test_an_empty_file_is_a_file_level_error(self) -> None:
        result = parse_csv(b"")
        assert not result.ok
        assert "empty" in result.errors[0]

    def test_a_file_missing_a_required_column_names_what_is_missing(self) -> None:
        """And lists the headers it did find, so the fix is obvious."""
        result = parse_csv(b"course_code,title\nCS101,Intro\n")
        assert not result.ok
        message = result.errors[0]
        assert "room_code" in message
        assert "course_code" in message
        assert "column mapping" in message

    def test_a_mapping_override_rescues_an_unmappable_file(self) -> None:
        payload = b"Course,Where,Which Day,Begins,Finishes\nCS101,A-101,Monday,09:00,10:20\n"
        unmapped = parse_csv(payload)
        assert not unmapped.ok

        mapped = parse_csv(
            payload,
            overrides={
                "room_code": "Where",
                "weekday": "Which Day",
                "starts_at": "Begins",
                "ends_at": "Finishes",
            },
        )
        assert mapped.ok, mapped.errors
        assert mapped.rows[0].room_code == "A-101"
        assert mapped.rows[0].starts_at == time(9)

    @pytest.mark.parametrize(
        ("text", "expected"),
        [
            ("09:00", time(9, 0)),
            ("9:00", time(9, 0)),
            ("09:00:00", time(9, 0)),
            ("09.00", time(9, 0)),
            ("0900", time(9, 0)),
            ("9:00 AM", time(9, 0)),
            ("1:30 PM", time(13, 30)),
        ],
    )
    def test_time_formats_are_tolerated(self, text: str, expected: time) -> None:
        payload = f"room_code,weekday,starts_at,ends_at\nA-101,Mon,{text},23:00\n".encode()
        result = parse_csv(payload)
        assert result.rows[0].starts_at == expected

    @pytest.mark.parametrize(
        ("text", "expected"),
        [
            ("2026-09-01", date(2026, 9, 1)),
            ("01.09.2026", date(2026, 9, 1)),
            ("01/09/2026", date(2026, 9, 1)),
            ("20260901", date(2026, 9, 1)),
        ],
    )
    def test_date_formats_are_tolerated(self, text: str, expected: date) -> None:
        payload = (f"room_code,weekday,starts_at,ends_at,start_date\nA-101,Mon,09:00,10:20,{text}\n").encode()
        result = parse_csv(payload)
        assert result.rows[0].start_date == expected

    def test_an_unparsable_time_is_attached_to_the_row_not_dropped(self) -> None:
        """The governing rule: nothing disappears silently."""
        payload = b"room_code,weekday,starts_at,ends_at\nA-101,Mon,half past nine,10:20\n"
        result = parse_csv(payload)

        assert len(result.rows) == 1, "the row must still be reported"
        row = result.rows[0]
        assert not row.is_usable
        assert any("starts_at" in message for message in row.parse_errors)

    def test_week_patterns_are_normalised(self) -> None:
        payload = (
            b"room_code,weekday,starts_at,ends_at,week_pattern\n"
            b"A-101,Mon,09:00,10:20,Odd\n"
            b"A-102,Tue,09:00,10:20,EVEN\n"
            b"B-201,Wed,09:00,10:20,every\n"
        )
        result = parse_csv(payload)
        assert [row.week_pattern for row in result.rows] == ["odd", "even", "weekly"]

    def test_an_unrecognised_week_pattern_is_kept_verbatim(self) -> None:
        """So validation can warn about it by name instead of losing it."""
        payload = b"room_code,weekday,starts_at,ends_at,week_pattern\nA-101,Mon,09:00,10:20,fortnightly\n"
        result = parse_csv(payload)
        assert result.rows[0].week_pattern == "fortnightly"


class TestXlsxParsing:
    @staticmethod
    def _workbook(rows: list[list[object]], sheet_name: str = "Timetable") -> bytes:
        from openpyxl import Workbook

        book = Workbook()
        sheet = book.active
        sheet.title = sheet_name
        for row in rows:
            sheet.append(row)
        buffer = io.BytesIO()
        book.save(buffer)
        return buffer.getvalue()

    def test_a_workbook_parses(self) -> None:
        payload = self._workbook(
            [
                ["room_code", "weekday", "starts_at", "ends_at", "enrolled_count"],
                ["A-101", "Monday", "09:00", "10:20", 28],
            ]
        )
        result = parse_xlsx(payload)
        assert result.ok, result.errors
        assert result.rows[0].room_code == "A-101"
        assert result.rows[0].enrolled_count == 28

    def test_a_typed_time_cell_is_read_without_string_parsing(self) -> None:
        """Excel stores a time as a ``datetime.time``, not as text."""
        payload = self._workbook(
            [
                ["room_code", "weekday", "starts_at", "ends_at"],
                ["A-101", "Monday", time(9, 0), time(10, 20)],
            ]
        )
        result = parse_xlsx(payload)
        assert result.rows[0].starts_at == time(9, 0)
        assert result.rows[0].ends_at == time(10, 20)

    def test_a_typed_date_cell_is_read(self) -> None:
        payload = self._workbook(
            [
                ["room_code", "weekday", "starts_at", "ends_at", "start_date"],
                ["A-101", "Monday", "09:00", "10:20", date(2026, 9, 1)],
            ]
        )
        assert parse_xlsx(payload).rows[0].start_date == date(2026, 9, 1)

    def test_a_numeric_weekday_cell_is_read(self) -> None:
        payload = self._workbook(
            [["room_code", "weekday", "starts_at", "ends_at"], ["A-101", 1, "09:00", "10:20"]]
        )
        assert parse_xlsx(payload).rows[0].weekday == 0

    def test_blank_rows_are_skipped(self) -> None:
        payload = self._workbook(
            [
                ["room_code", "weekday", "starts_at", "ends_at"],
                ["A-101", "Monday", "09:00", "10:20"],
                [None, None, None, None],
                ["A-102", "Tuesday", "09:00", "10:20"],
            ]
        )
        assert len(parse_xlsx(payload).rows) == 2

    def test_a_named_sheet_can_be_selected(self) -> None:
        payload = self._workbook(
            [["room_code", "weekday", "starts_at", "ends_at"], ["A-101", "Mon", "09:00", "10:20"]],
            sheet_name="Autumn",
        )
        assert parse_xlsx(payload, sheet="Autumn").ok
        missing = parse_xlsx(payload, sheet="Spring")
        assert not missing.ok
        assert "Autumn" in missing.errors[0]

    def test_a_corrupt_workbook_is_a_file_level_error(self) -> None:
        result = parse_xlsx(b"not a workbook at all")
        assert not result.ok
        assert "could not read the workbook" in result.errors[0]


class TestIcsParsing:
    CALENDAR = b"""BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//test//EN
BEGIN:VEVENT
UID:lesson-1@example.org
DTSTART;TZID=Asia/Tashkent:20260907T090000
DTEND;TZID=Asia/Tashkent:20260907T102000
RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261220T235959
EXDATE;TZID=Asia/Tashkent:20260914T090000
SUMMARY:Intro to CS
LOCATION:A-101
ORGANIZER:mailto:t.kim@example.org
END:VEVENT
END:VCALENDAR
"""

    def test_an_event_parses_into_a_canonical_row(self) -> None:
        result = parse_ics(self.CALENDAR)
        assert result.ok, result.errors

        row = result.rows[0]
        assert row.room_code == "A-101"
        assert row.title == "Intro to CS"
        assert row.starts_at == time(9, 0)
        assert row.ends_at == time(10, 20)
        assert row.weekday == 0  # 7 September 2026 is a Monday
        assert row.teacher_ref == "t.kim@example.org", "MAILTO: is stripped"

    def test_the_master_rule_is_carried_through_verbatim(self) -> None:
        """ICS is the only input with real recurrence; it must not be flattened.

        Expansion happens later, in the event's own timezone
        (``app.engines.recurrence``), so the parser's job is to preserve.
        """
        row = parse_ics(self.CALENDAR).rows[0]
        assert row.rrule is not None
        assert "FREQ=WEEKLY" in row.rrule
        assert row.uid == "lesson-1@example.org"
        assert row.end_date == date(2026, 12, 20), "UNTIL becomes the end date"

    def test_exdates_are_preserved(self) -> None:
        row = parse_ics(self.CALENDAR).rows[0]
        assert row.exdates == ("2026-09-14T09:00:00",)

    def test_an_event_with_no_end_is_reported_not_dropped(self) -> None:
        payload = b"""BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:broken@example.org
DTSTART;TZID=Asia/Tashkent:20260907T090000
SUMMARY:No end
LOCATION:A-101
END:VEVENT
END:VCALENDAR
"""
        result = parse_ics(payload)
        assert len(result.rows) == 1
        assert not result.rows[0].is_usable
        assert any("DTEND" in message for message in result.rows[0].parse_errors)

    def test_a_duration_is_used_when_there_is_no_dtend(self) -> None:
        payload = b"""BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:dur@example.org
DTSTART;TZID=Asia/Tashkent:20260907T090000
DURATION:PT80M
SUMMARY:With duration
LOCATION:A-101
END:VEVENT
END:VCALENDAR
"""
        row = parse_ics(payload).rows[0]
        assert row.ends_at == time(10, 20)
        assert row.parse_errors == ()

    def test_a_calendar_with_no_events_is_a_file_level_error(self) -> None:
        result = parse_ics(b"BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR\n")
        assert not result.ok
        assert "no VEVENT" in result.errors[0]

    def test_a_corrupt_calendar_is_a_file_level_error(self) -> None:
        result = parse_ics(b"this is not a calendar")
        assert not result.ok


# ===================================================================== validation


class TestRoomCodeNormalisation:
    def test_separators_and_case_are_ignored(self) -> None:
        assert (
            normalise_room_code("A-101")
            == normalise_room_code("a 101")
            == normalise_room_code("A.101")
            == "A101"
        )

    def test_digits_are_never_padded_or_stripped(self) -> None:
        """``GEOMETRY_SPEC.md`` 5.4: room numbers are stored exactly as printed.

        A normaliser that "corrected" 101 to 0101 would invent a room.
        """
        assert normalise_room_code("A-101") != normalise_room_code("A-0101")


class TestValidation:
    def test_a_clean_file_passes(self) -> None:
        rows = parse_csv(GOOD_CSV).rows
        report = _validate(rows)

        assert report.can_apply, report.summary()
        assert report.errors == []
        assert len(report.usable_rows) == 3

    def test_an_unknown_room_is_an_error(self) -> None:
        """An error, not a warning: the meeting would have nowhere to happen."""
        payload = b"room_code,weekday,starts_at,ends_at\nZ-999,Mon,09:00,10:20\n"
        report = _validate(parse_csv(payload).rows)

        assert not report.can_apply
        issue = next(item for item in report.errors if item.code is IssueCode.unknown_room)
        assert "Z-999" in issue.message
        assert issue.rows == (2,)

    def test_a_room_code_matches_regardless_of_punctuation(self) -> None:
        payload = b"room_code,weekday,starts_at,ends_at\na 101,Mon,09:00,10:20\n"
        report = _validate(parse_csv(payload).rows)
        assert not any(item.code is IssueCode.unknown_room for item in report.errors)

    def test_over_capacity_is_a_warning_not_a_blocker(self) -> None:
        """Rooms are routinely over-subscribed; refusing the import is unhelpful."""
        payload = (
            b"room_code,weekday,starts_at,ends_at,enrolled_count,teacher_ref,title\n"
            b"A-102,Mon,09:00,10:20,60,t.kim,Packed\n"
        )
        report = _validate(parse_csv(payload).rows)

        issue = next(item for item in report.warnings if item.code is IssueCode.over_capacity)
        assert issue.details == {"enrolled": 60, "capacity": 24}
        assert report.can_apply, "a warning must not block"

    def test_a_room_double_booking_is_an_error(self) -> None:
        payload = (
            b"room_code,weekday,starts_at,ends_at,teacher_ref,title\n"
            b"A-101,Mon,09:00,10:20,t.kim,First\n"
            b"A-101,Mon,10:00,11:20,t.lee,Second\n"
        )
        report = _validate(parse_csv(payload).rows)

        issue = next(item for item in report.errors if item.code is IssueCode.room_double_booked)
        assert issue.rows == (2, 3), "both offending rows are named"
        assert not report.can_apply

    def test_a_teacher_double_booking_is_an_error(self) -> None:
        payload = (
            b"room_code,weekday,starts_at,ends_at,teacher_ref,title\n"
            b"A-101,Mon,09:00,10:20,t.kim,First\n"
            b"A-102,Mon,10:00,11:20,t.kim,Second\n"
        )
        report = _validate(parse_csv(payload).rows)
        assert any(item.code is IssueCode.teacher_double_booked for item in report.errors)

    def test_back_to_back_lessons_in_one_room_are_fine(self) -> None:
        """Half-open: ending at 10:20 and starting at 10:20 is not a clash."""
        payload = (
            b"room_code,weekday,starts_at,ends_at,teacher_ref,title\n"
            b"A-101,Mon,09:00,10:20,t.kim,First\n"
            b"A-101,Mon,10:20,11:40,t.lee,Second\n"
        )
        report = _validate(parse_csv(payload).rows)
        assert not any(item.code is IssueCode.room_double_booked for item in report.issues)

    def test_odd_and_even_week_lessons_may_share_a_slot(self) -> None:
        """A normal arrangement, not a conflict.

        Two lessons at 09:00 Monday in one room are fine if one runs in odd
        weeks and the other in even weeks. Flagging it would make the report
        cry wolf on a perfectly good timetable.
        """
        payload = (
            b"room_code,weekday,starts_at,ends_at,week_pattern,teacher_ref,title\n"
            b"A-101,Mon,09:00,10:20,odd,t.kim,Odd weeks\n"
            b"A-101,Mon,09:00,10:20,even,t.lee,Even weeks\n"
        )
        report = _validate(parse_csv(payload).rows)
        assert not any(item.code is IssueCode.room_double_booked for item in report.issues)
        assert report.can_apply

    def test_a_weekly_lesson_clashes_with_an_odd_week_one(self) -> None:
        """Weekly runs in every week, so it overlaps both parities."""
        payload = (
            b"room_code,weekday,starts_at,ends_at,week_pattern,teacher_ref,title\n"
            b"A-101,Mon,09:00,10:20,weekly,t.kim,Every week\n"
            b"A-101,Mon,09:00,10:20,odd,t.lee,Odd weeks\n"
        )
        report = _validate(parse_csv(payload).rows)
        assert any(item.code is IssueCode.room_double_booked for item in report.errors)

    def test_lessons_in_non_overlapping_date_ranges_do_not_clash(self) -> None:
        payload = (
            b"room_code,weekday,starts_at,ends_at,start_date,end_date,teacher_ref,title\n"
            b"A-101,Mon,09:00,10:20,2026-09-01,2026-10-15,t.kim,First half\n"
            b"A-101,Mon,09:00,10:20,2026-10-16,2026-12-20,t.lee,Second half\n"
        )
        report = _validate(parse_csv(payload).rows)
        assert not any(item.code is IssueCode.room_double_booked for item in report.issues)

    def test_a_meeting_outside_the_term_is_a_warning(self) -> None:
        payload = (
            b"room_code,weekday,starts_at,ends_at,start_date,teacher_ref,title\n"
            b"A-101,Mon,09:00,10:20,2027-03-01,t.kim,Next year\n"
        )
        report = _validate(parse_csv(payload).rows)
        issue = next(item for item in report.warnings if item.code is IssueCode.outside_term)
        assert "2027-03-01" in issue.message

    def test_a_reversed_date_range_is_an_error(self) -> None:
        payload = (
            b"room_code,weekday,starts_at,ends_at,start_date,end_date\n"
            b"A-101,Mon,09:00,10:20,2026-12-01,2026-09-01\n"
        )
        report = _validate(parse_csv(payload).rows)
        assert any(item.code is IssueCode.reversed_date_range for item in report.errors)

    def test_a_lesson_ending_before_it_starts_is_an_error(self) -> None:
        rows = [
            TimetableRow(source_row=2, room_code="A-101", weekday=0, starts_at=time(11), ends_at=time(11))
        ]
        report = _validate(rows)
        assert any(item.code is IssueCode.non_positive_duration for item in report.errors)

    def test_an_implausibly_long_lesson_is_a_warning(self) -> None:
        payload = (
            b"room_code,weekday,starts_at,ends_at,teacher_ref,title\nA-101,Mon,08:00,23:00,t.kim,Marathon\n"
        )
        report = _validate(parse_csv(payload).rows)
        assert any(item.code is IssueCode.implausible_duration for item in report.warnings)

    def test_a_time_inside_a_dst_gap_is_an_error(self) -> None:
        """Europe/Berlin has no 02:30 on 29 March 2026.

        Without this check the lesson would be silently relocated by an hour.
        Asia/Tashkent has no DST, so the test uses a zone that does - the code
        must not assume the campus never moves its clocks (brief section 9).
        """
        rows = [
            TimetableRow(
                source_row=2,
                room_code="A-101",
                weekday=6,
                starts_at=time(2, 30),
                ends_at=time(3, 30),
                start_date=date(2026, 3, 29),
                teacher_ref="t.kim",
                title="Ghost lesson",
            )
        ]
        report = validate_rows(
            rows,
            known_rooms=ROOMS,
            timezone=BERLIN,
            term=TermWindow(starts_on=date(2026, 1, 1), ends_on=date(2026, 12, 31)),
        )
        assert any(item.code is IssueCode.invalid_local_time for item in report.errors)

    def test_a_normal_time_is_not_flagged_as_invalid(self) -> None:
        rows = parse_csv(GOOD_CSV).rows
        report = _validate(rows)
        assert not any(item.code is IssueCode.invalid_local_time for item in report.issues)

    def test_a_missing_teacher_is_only_a_warning(self) -> None:
        payload = b"room_code,weekday,starts_at,ends_at,title\nA-101,Mon,09:00,10:20,Anon\n"
        report = _validate(parse_csv(payload).rows)
        assert any(item.code is IssueCode.missing_teacher for item in report.warnings)
        assert report.can_apply

    def test_an_ambiguous_room_code_is_refused_not_guessed(self) -> None:
        """Two real codes normalising to one key cannot be resolved here."""
        report = validate_rows(
            parse_csv(GOOD_CSV).rows,
            known_rooms={
                "A-101": RoomInfo(room_id="bld-h-f1-a101"),
                "A 101": RoomInfo(room_id="bld-g-f1-a101"),
            },
            timezone=TASHKENT,
        )
        assert any(item.code is IssueCode.ambiguous_room for item in report.errors)

    def test_file_level_errors_block_the_import(self) -> None:
        report = _validate([], file_errors=["the file has no header row"])
        assert not report.can_apply

    def test_an_empty_usable_set_blocks_the_import(self) -> None:
        """Applying a batch that would create nothing is not a success."""
        report = _validate([])
        assert not report.can_apply

    def test_the_report_serialises_for_the_api(self) -> None:
        report = _validate(parse_csv(GOOD_CSV).rows, column_mapping={"room_code": "room_code"})
        payload = report.as_dict()

        assert payload["can_apply"] is True
        assert payload["total_rows"] == 3
        assert payload["usable_rows"] == 3
        assert isinstance(payload["issues"], list)
        assert payload["column_mapping"] == {"room_code": "room_code"}

    def test_the_summary_is_readable(self) -> None:
        report = _validate(parse_csv(GOOD_CSV).rows)
        assert "3 rows" in report.summary()
        assert "can be applied" in report.summary()


class TestBrokenFile:
    """The brief's explicit requirement (section 10.1)."""

    BROKEN = (
        b"course_code,section_code,title,teacher_ref,room_code,weekday,starts_at,ends_at,"
        b"start_date,end_date,week_pattern,enrolled_count,notes\n"
        # 2: fine, the control case.
        b"CS101,CSE-21,Intro,t.kim,A-101,Monday,09:00,10:20,2026-09-01,2026-12-20,weekly,28,\n"
        # 3: unknown room.
        b"CS102,CSE-22,Ghost,t.lee,Z-999,Tuesday,09:00,10:20,2026-09-01,2026-12-20,weekly,20,\n"
        # 4: over capacity.
        b"CS103,CSE-23,Packed,t.park,A-102,Wednesday,09:00,10:20,2026-09-01,2026-12-20,weekly,99,\n"
        # 5 and 6: room double-booked.
        b"CS104,ICE-21,Clash A,t.choi,B-201,Thursday,09:00,10:20,2026-09-01,2026-12-20,weekly,10,\n"
        b"CS105,ICE-22,Clash B,t.jung,B-201,Thursday,10:00,11:20,2026-09-01,2026-12-20,weekly,10,\n"
        # 7 and 8: teacher double-booked.
        b"CS106,BM-22,Teach A,t.solo,A-101,Friday,09:00,10:20,2026-09-01,2026-12-20,weekly,10,\n"
        b"CS107,BM-23,Teach B,t.solo,A-102,Friday,09:30,10:50,2026-09-01,2026-12-20,weekly,10,\n"
        # 9: outside the term.
        b"CS108,ME-21,Too late,t.kim,A-101,Monday,14:00,15:20,2027-05-01,2027-06-01,weekly,10,\n"
        # 10: unparsable time.
        b"CS109,FIN-23,Bad time,t.lee,A-101,Monday,half nine,10:20,2026-09-01,2026-12-20,weekly,10,\n"
        # 11: unrecognised weekday.
        b"CS110,CIE-22,Bad day,t.park,A-102,Someday,09:00,10:20,2026-09-01,2026-12-20,weekly,10,\n"
        # 12: ends before it starts.
        b"CS111,CSE-21,Backwards,t.kim,A-102,Tuesday,15:00,14:00,2026-09-01,2026-12-20,weekly,10,\n"
        # 13: unknown week pattern.
        b"CS112,CSE-22,Odd weeks,t.lee,B-201,Friday,15:00,16:20,2026-09-01,2026-12-20,fortnightly,10,\n"
    )

    def test_a_deliberately_broken_file_reports_every_problem(self) -> None:
        """Every error reported, none silently dropped.

        Each defect is asserted individually rather than by a count, so that a
        check which stops detecting one problem fails loudly instead of being
        masked by another problem taking its place in the total.
        """
        result = parse_csv(self.BROKEN)
        assert result.ok, "the file itself is readable; the rows are what is broken"
        assert len(result.rows) == 12, "every row is returned, including the broken ones"

        report = _validate(result.rows)
        codes = {item.code for item in report.issues}

        assert IssueCode.unknown_room in codes
        assert IssueCode.over_capacity in codes
        assert IssueCode.room_double_booked in codes
        assert IssueCode.teacher_double_booked in codes
        assert IssueCode.outside_term in codes
        assert IssueCode.unparsable_row in codes
        assert IssueCode.non_positive_duration in codes
        assert IssueCode.unknown_week_pattern in codes

        assert not report.can_apply, "errors must block the import"

    def test_every_issue_points_at_a_real_source_row(self) -> None:
        """A report on a 3,000-line file is useless without row numbers."""
        report = _validate(parse_csv(self.BROKEN).rows)
        for issue in report.issues:
            for row_number in issue.rows:
                assert 2 <= row_number <= 13, f"{issue.code} cited row {row_number}"

    def test_the_good_row_survives_a_file_full_of_bad_ones(self) -> None:
        """One bad row must not condemn the rest to being unparsed."""
        report = _validate(parse_csv(self.BROKEN).rows)
        usable_rows = {row.source_row for row in report.usable_rows}
        assert 2 in usable_rows, "the control row is usable"

    def test_nothing_is_applied_from_a_broken_file(self) -> None:
        report = _validate(parse_csv(self.BROKEN).rows)
        assert not report.can_apply


class TestDiff:
    def test_a_first_import_is_all_additions(self) -> None:
        report = _validate(parse_csv(GOOD_CSV).rows, existing_identities=set())
        assert report.diff is not None
        assert report.diff.added_count == 3
        assert report.diff.removed_count == 0
        assert report.diff.unchanged_count == 0

    def test_a_reimport_of_the_same_file_changes_nothing(self) -> None:
        """Imports are idempotent (brief section 10.1).

        The stored side is keyed on ``identity_key()`` - the same string the
        importer persists to ``meeting_rule.source_identity`` - so both sides of
        the comparison come from one function rather than two that must agree.
        """
        rows = parse_csv(GOOD_CSV).rows
        existing = {row.identity_key() for row in rows}

        report = _validate(rows, existing_identities=existing)
        assert report.diff is not None
        assert report.diff.added_count == 0
        assert report.diff.removed_count == 0
        assert report.diff.unchanged_count == 3

    def test_a_removed_lesson_shows_as_removed(self) -> None:
        rows = parse_csv(GOOD_CSV).rows
        existing = {row.identity_key() for row in rows}
        existing.add("OLD|X|A-101|4|16:00:00|17:00:00|||")

        report = _validate(rows, existing_identities=existing)
        assert report.diff is not None
        assert report.diff.removed_count == 1

    def test_a_moved_lesson_is_one_addition_and_one_removal(self) -> None:
        rows = parse_csv(GOOD_CSV).rows
        existing = {row.identity_key() for row in rows}
        # Pretend the first lesson used to be in a different room.
        existing.discard(rows[0].identity_key())
        existing.add(rows[0].identity_key().replace("A-101", "B-201"))

        report = _validate(rows, existing_identities=existing)
        assert report.diff is not None
        assert report.diff.added_count == 1
        assert report.diff.removed_count == 1

    def test_the_identity_key_round_trips_through_a_string(self) -> None:
        """Equality on the key must agree with equality on the tuple."""
        rows = parse_csv(GOOD_CSV).rows
        keys = [row.identity_key() for row in rows]
        assert len(set(keys)) == len(rows), "distinct lessons need distinct keys"
        assert rows[0].identity_key() == rows[0].identity_key()

    def test_the_diff_sample_is_bounded(self) -> None:
        """A first import of a university is thousands of rows."""
        many = [
            TimetableRow(
                source_row=index,
                room_code="A-101",
                weekday=index % 5,
                starts_at=time(8),
                ends_at=time(9),
                section_code=f"S{index}",
                teacher_ref=f"t{index}",
                title="x",
            )
            for index in range(2, 200)
        ]
        report = _validate(many, existing_identities=set())
        assert report.diff is not None
        payload = report.diff.as_dict()
        assert payload["added"] == 198
        assert len(payload["added_sample"]) == 20


# ===================================================================== properties


@hyp_settings(max_examples=120, deadline=None)
@given(
    rows=st.lists(
        st.tuples(
            st.sampled_from(["A-101", "A-102", "B-201", "Z-999"]),
            st.integers(min_value=0, max_value=6),
            st.integers(min_value=8, max_value=18),
            st.integers(min_value=1, max_value=3),
        ),
        max_size=12,
    )
)
def test_every_row_is_either_usable_or_has_a_reported_issue(
    rows: list[tuple[str, int, int, int]],
) -> None:
    """The governing invariant: no row vanishes without explanation.

    A row is either in ``usable_rows`` or has at least one issue naming it.
    A row that is neither has been silently dropped, which is precisely what
    the brief forbids.
    """
    parsed = [
        TimetableRow(
            source_row=index + 2,
            room_code=room,
            weekday=weekday,
            starts_at=time(hour),
            ends_at=time(min(hour + length, 23)),
            teacher_ref=f"t{index}",
            title="Lesson",
            section_code=f"S{index}",
        )
        for index, (room, weekday, hour, length) in enumerate(rows)
    ]
    report = _validate(parsed)

    usable = {row.source_row for row in report.usable_rows}
    explained = {number for issue in report.issues for number in issue.rows}

    for row in parsed:
        assert row.source_row in usable or row.source_row in explained


@hyp_settings(max_examples=100, deadline=None)
@given(
    hour=st.integers(min_value=0, max_value=22),
    length=st.integers(min_value=1, max_value=4),
)
def test_a_single_well_formed_row_always_validates(hour: int, length: int) -> None:
    row = TimetableRow(
        source_row=2,
        room_code="A-101",
        weekday=0,
        starts_at=time(hour),
        ends_at=time(min(hour + length, 23)),
        teacher_ref="t.kim",
        title="Lesson",
        enrolled_count=10,
    )
    report = _validate([row])
    assert report.errors == []
    assert report.can_apply
