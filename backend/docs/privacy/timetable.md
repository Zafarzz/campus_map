# Timetable data and teachers' names

## What the source contains

The university publishes its timetable at <https://aut.edupage.org/timetable/>.
The JSON behind that page (see `../adr/0010-timetable-source-edupage.md`) includes
**75 teachers' real names**, 82 cohort codes, 145 subjects, 56 rooms and 666
weekly lesson placements. It contains no student names and no student-level
timetables.

## Why names are handled carefully even though they are public

The university published them itself, so collecting them is proportionate for the
purpose users expect: showing who teaches a class. "Public" is not the same as
"unrestricted", though — the risk is not disclosure, it is **re-identification by
aggregation**, which is exactly what an analytics layer is good at. A no-show
report grouped by teacher would turn a timetable into a performance review nobody
agreed to.

## Rules

1. **Snapshots are never committed.** `scripts/fetch_edupage_timetable.py` writes
   to `backend/data/snapshots/`, which is gitignored. A snapshot in git history
   cannot be withdrawn.
2. **`Section.teacher_ref` is a pseudonymous handle.** A display name lives on an
   `app_user` row only when that teacher actually has an account.
3. **Analytics never groups by teacher.** The brief is explicit (section 21.2): the
   no-show view is by course or department. Small-cell suppression applies on top.
4. **The teacher finder is opt-in and teacher-controlled** (brief section 12.4).
   Default visibility is off; students see a current status only, never a history.
5. **Test fixtures are anonymised.** Phase 2 will add a small fixture with
   synthetic names rather than a slice of the real export.
6. **Read-only, unauthenticated.** The importer calls the same endpoints the
   public page calls, with the `__gsh=00000000` value the page itself sends. No
   credential is involved and no login is performed. If EduPage ever requires
   one, the importer stops and asks rather than working around it.

## Retention

| Data | Kept | Why |
|---|---|---|
| `import_batch` + validation report | indefinitely | imports must be reversible and auditable |
| `meeting_rule`, `meeting` | life of the term, then archived | the time machine needs past states |
| Raw snapshots | until the import is applied, then deletable | they are an input, not a record |
| Teacher display names | only while the teacher has an account | deleted with the account |
