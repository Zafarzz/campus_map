"""The canonical import row, and mapping a foreign export onto it.

One template (brief section 10.1): course code, section, title, teacher
reference, room code, weekday, start and end time, start and end date or week
pattern, enrolled count, notes. Every parser produces :class:`TimetableRow`
instances, so validation, diffing and application never learn what format the
data arrived in.

The **column mapping** is why this module exists separately. A registrar's export
has whatever headers it has, in whatever language. Requiring a code change per
institution would make the importer useless, so a mapping is data: either
inferred from recognised header aliases or supplied by the caller as
``{"canonical_name": "Their Header"}``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, time

__all__ = [
    "CANONICAL_COLUMNS",
    "REQUIRED_COLUMNS",
    "WEEKDAY_NAMES",
    "ColumnMapping",
    "TimetableRow",
    "parse_weekday",
]

#: Canonical column names, in the order the template documents them.
CANONICAL_COLUMNS: tuple[str, ...] = (
    "course_code",
    "section_code",
    "title",
    "teacher_ref",
    "room_code",
    "weekday",
    "starts_at",
    "ends_at",
    "start_date",
    "end_date",
    "week_pattern",
    "enrolled_count",
    "notes",
)

#: The minimum a row needs to describe a meeting at all. Everything else is
#: optional and its absence is a warning at most.
REQUIRED_COLUMNS: frozenset[str] = frozenset({"room_code", "weekday", "starts_at", "ends_at"})

#: Header aliases, lowercased. Deliberately generous: an importer that refuses a
#: file because the column is called "Room No." instead of "room_code" has
#: failed at its only job.
_HEADER_ALIASES: dict[str, tuple[str, ...]] = {
    "course_code": ("course", "course code", "course_id", "subject code", "code"),
    "section_code": ("section", "group", "class", "cohort", "section code"),
    "title": ("subject", "course title", "name", "lesson", "title"),
    "teacher_ref": ("teacher", "lecturer", "instructor", "staff", "tutor"),
    "room_code": ("room", "classroom", "room no", "room no.", "venue", "location"),
    "weekday": ("day", "day of week", "weekday", "dow"),
    "starts_at": ("start", "start time", "from", "begin", "starts"),
    "ends_at": ("end", "end time", "to", "finish", "ends", "until"),
    "start_date": ("valid from", "from date", "start date", "first date"),
    "end_date": ("valid to", "to date", "end date", "last date", "until date"),
    "week_pattern": ("weeks", "week", "week pattern", "parity", "odd/even"),
    "enrolled_count": ("enrolled", "students", "size", "headcount", "capacity needed"),
    "notes": ("note", "notes", "comment", "remark"),
}

#: Weekday names accepted in the ``weekday`` column, Monday = 0.
WEEKDAY_NAMES: dict[str, int] = {}
for _index, _names in enumerate(
    (
        ("monday", "mon", "mo", "m"),
        ("tuesday", "tue", "tues", "tu"),
        ("wednesday", "wed", "we", "w"),
        ("thursday", "thursday", "thu", "thurs", "th"),
        ("friday", "fri", "fr", "f"),
        ("saturday", "sat", "sa"),
        ("sunday", "sun", "su"),
    )
):
    for _name in _names:
        WEEKDAY_NAMES[_name] = _index


def parse_weekday(raw: str | int | None) -> int | None:
    """Parse a weekday as Monday = 0, or return ``None`` if unrecognised.

    Accepts a name, an abbreviation, or a number. Numeric input is the ambiguous
    case: both 0-based (Monday = 0) and 1-based (Monday = 1) conventions exist in
    the wild. ``0`` can only be 0-based and ``7`` can only be 1-based Sunday;
    1 to 6 are read as **1-based**, because that is what spreadsheet exports
    overwhelmingly use and it is the convention the ISO weekday number follows.
    """
    if raw is None:
        return None
    if isinstance(raw, bool):  # bool is an int; refuse it explicitly
        return None
    if isinstance(raw, int):
        if raw == 0:
            return 0
        if 1 <= raw <= 7:
            return raw - 1
        return None

    text = str(raw).strip().lower()
    if not text:
        return None
    if text.isdigit():
        return parse_weekday(int(text))
    return WEEKDAY_NAMES.get(text)


@dataclass(frozen=True, slots=True)
class ColumnMapping:
    """Maps canonical names onto a file's actual headers.

    ``mapping`` is ``{canonical: header_in_file}``. Build one with
    :meth:`infer` and override anything it got wrong.
    """

    mapping: dict[str, str] = field(default_factory=dict)

    @classmethod
    def infer(cls, headers: list[str] | tuple[str, ...]) -> ColumnMapping:
        """Guess a mapping from the file's headers.

        Exact canonical names win; then a normalised match; then the alias
        table. A header is claimed by at most one canonical column, so a file
        with both "room" and "room_code" cannot map them to the same field.
        """
        resolved: dict[str, str] = {}
        claimed: set[str] = set()

        normalised = {header: _normalise(header) for header in headers}
        squashed = {header: _squash(header) for header in headers}

        # Pass 1: the exact canonical spelling, so a file that already uses the
        # template cannot be captured by an alias.
        for canonical in CANONICAL_COLUMNS:
            for header in headers:
                if header in claimed:
                    continue
                if normalised[header] == canonical:
                    resolved[canonical] = header
                    claimed.add(header)
                    break

        # Pass 2: separator- and case-insensitive. "Week-Day", "week day" and
        # "Starts_At" all reach their canonical column here.
        for canonical in CANONICAL_COLUMNS:
            if canonical in resolved:
                continue
            target = _squash(canonical)
            for header in headers:
                if header in claimed:
                    continue
                if squashed[header] == target:
                    resolved[canonical] = header
                    claimed.add(header)
                    break

        # Pass 3: the alias table, for headers that share no spelling with the
        # canonical name at all ("Lecturer", "Venue", "Room No.").
        for canonical in CANONICAL_COLUMNS:
            if canonical in resolved:
                continue
            aliases = _HEADER_ALIASES.get(canonical, ())
            squashed_aliases = {_squash(alias) for alias in aliases}
            for header in headers:
                if header in claimed:
                    continue
                if normalised[header] in aliases or squashed[header] in squashed_aliases:
                    resolved[canonical] = header
                    claimed.add(header)
                    break

        return cls(mapping=resolved)

    def with_overrides(self, overrides: dict[str, str] | None) -> ColumnMapping:
        """Apply caller-supplied corrections on top of an inferred mapping."""
        if not overrides:
            return self
        unknown = set(overrides) - set(CANONICAL_COLUMNS)
        if unknown:
            raise ValueError(
                f"unknown canonical column(s): {sorted(unknown)}. Valid names are {list(CANONICAL_COLUMNS)}"
            )
        return ColumnMapping(mapping={**self.mapping, **overrides})

    def missing_required(self) -> list[str]:
        """Required canonical columns this mapping does not cover."""
        return sorted(REQUIRED_COLUMNS - set(self.mapping))

    def get(self, row: dict[str, object], canonical: str) -> object | None:
        """Read a canonical field out of a raw row."""
        header = self.mapping.get(canonical)
        if header is None:
            return None
        return row.get(header)


def _normalise(value: str) -> str:
    """Lowercase, strip, and collapse separators to single spaces."""
    text = str(value).strip().lower()
    for char in ("-", ".", "/", "\\", "\t", "_"):
        text = text.replace(char, " ")
    while "  " in text:
        text = text.replace("  ", " ")
    return text.strip()


def _squash(value: str) -> str:
    """Normalise, then remove whitespace entirely.

    This is what makes "ROOM CODE", "Room-Code", "room_code" and "roomcode" one
    key. Done as a second comparison rather than as the only one so that pass 1
    can still honour an exact canonical header.
    """
    return _normalise(value).replace(" ", "")


@dataclass(frozen=True, slots=True)
class TimetableRow:
    """One canonical row: a weekly meeting pattern for one section in one room.

    ``source_row`` is the 1-based line number in the original file, kept so every
    issue in the report can point a human at the row that caused it. Without it
    a report saying "unknown room" is useless on a file with 3,000 lines.
    """

    source_row: int
    room_code: str | None = None
    weekday: int | None = None
    starts_at: time | None = None
    ends_at: time | None = None
    start_date: date | None = None
    end_date: date | None = None
    course_code: str | None = None
    section_code: str | None = None
    title: str | None = None
    teacher_ref: str | None = None
    #: Optional human-facing teacher display string for materialised meetings,
    #: kept separate so ``Section.teacher_ref`` can stay pseudonymous
    #: (``docs/privacy/timetable.md`` rule 2).
    teacher_label: str | None = None
    #: "weekly" | "odd" | "even", or a raw string the parser could not classify.
    week_pattern: str | None = None
    enrolled_count: int | None = None
    notes: str | None = None
    #: Issues raised while parsing *this* row, before validation proper.
    parse_errors: tuple[str, ...] = ()
    #: For ICS input: the master rule, carried through verbatim.
    rrule: str | None = None
    uid: str | None = None
    exdates: tuple[str, ...] = ()

    @property
    def interval_minutes(self) -> int | None:
        """Wall-clock length, which may be zero or negative.

        A reversed pair is **not** quietly reinterpreted as crossing midnight.
        That accommodation sounds generous and is actively harmful here: a
        ``15:00-14:00`` typo would become a 23-hour lesson, sail past the
        non-positive check, and land in the database holding a room all day.
        University lessons that genuinely span midnight are vanishingly rare,
        reversed times in a hand-edited export are common, so the ambiguity is
        resolved towards catching the typo and validation reports the row.
        """
        if self.starts_at is None or self.ends_at is None:
            return None
        start = self.starts_at.hour * 60 + self.starts_at.minute
        end = self.ends_at.hour * 60 + self.ends_at.minute
        return end - start

    @property
    def is_usable(self) -> bool:
        """True when the row has enough to become a meeting rule."""
        return (
            not self.parse_errors
            and self.room_code is not None
            and self.starts_at is not None
            and self.ends_at is not None
            and (self.weekday is not None or self.rrule is not None)
        )

    def identity(self) -> tuple[object, ...]:
        """Key used to diff one import against another.

        Deliberately excludes ``source_row`` and ``notes``: a row that moved
        down the file or gained a comment is the *same* meeting, and a diff that
        reported it as changed would bury the real changes in noise.
        """
        return (
            self.course_code,
            self.section_code,
            self.room_code,
            self.weekday,
            self.starts_at,
            self.ends_at,
            self.start_date,
            self.end_date,
            self.week_pattern,
        )

    def identity_key(self) -> str:
        """:meth:`identity` as one string, for storage and comparison.

        Stored on ``meeting_rule.source_identity`` at import time and compared
        against on the next dry run. It has to be *stored* rather than
        recomputed from the rule, because the row-to-rule mapping is lossy: the
        declared date window is folded into ``DTSTART``/``UNTIL`` with weekday
        anchoring applied, and a week parity becomes an ``INTERVAL``. A
        reconstructed key never matches, so every re-import would diff as
        "replace everything" instead of "unchanged".

        One string rather than nine columns because equality is the only
        operation needed, and a single indexed text comparison is both cheaper
        and immune to the column-order drift nine fields would invite.
        """
        return "|".join("" if part is None else str(part) for part in self.identity())
