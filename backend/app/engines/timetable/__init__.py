"""Timetable ingestion: get a real timetable in, and say what is wrong with it.

Three jobs, in three modules:

* :mod:`.template` - the canonical row shape and a **column mapping** step, so a
  differently shaped export can be mapped without code changes (brief
  section 10.1).
* :mod:`.parsers` - CSV, XLSX and ICS readers, each producing the same canonical
  rows so everything downstream is format-agnostic.
* :mod:`.validate` - the validation report and the diff against the current
  timetable.

The governing rule is that **nothing is silently dropped**. A row that cannot be
parsed, a room that does not exist, a class larger than its room, two lessons in
one place - all of them appear in the report. An importer that quietly skips bad
rows produces a timetable that looks fine and is wrong, which is worse than one
that refuses to load.

Applying a batch is :mod:`app.services.import_service`'s job, because it needs a
database; everything here is pure.
"""

from app.engines.timetable.template import (
    CANONICAL_COLUMNS,
    ColumnMapping,
    TimetableRow,
)
from app.engines.timetable.validate import (
    ImportReport,
    Issue,
    Severity,
    validate_rows,
)

__all__ = [
    "CANONICAL_COLUMNS",
    "ColumnMapping",
    "ImportReport",
    "Issue",
    "Severity",
    "TimetableRow",
    "validate_rows",
]
