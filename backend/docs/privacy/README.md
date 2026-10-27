# Privacy

Privacy by design (brief section 3.4): collect the minimum, use pseudonymous
identifiers, never track individuals' locations, publish only aggregates with
small-count suppression, and make anything that could reveal a person's
whereabouts opt-in.

This folder records **what each field is for and how long it is kept**. It is
written per phase, as data starts to exist — not as a one-off at the end.

## Status after Phase 1

The database holds **no personal data about students** yet. What exists:

| Table | Personal data | Purpose | Retention |
|---|---|---|---|
| `campus`, `building`, `floor`, `room`, `room_alias`, `connector` | none | the map's spatial data | life of the project |
| `app_user` | optional email and display name | sign-in; 6 local development accounts today | deleted on request; dev accounts are `is_demo` |
| `user_role` | none (a role grant) | access control | with the user |
| `consent` | none beyond the user id | proof of opt-in for sensitive features | kept after revocation, as the record *that* consent was given and withdrawn |
| `audit_log` | pseudonymous actor id | accountability for privileged actions | append-only; retention set in Phase 8 |
| `seed_run` | none | reproducibility of the seed | life of the project |

The other 27 tables are created but empty; their fields are documented as each
layer fills them.

## Decisions already encoded in the schema

- **Primary keys for people are opaque UUIDs.** `Section.teacher_ref` and
  `AppUser.external_ref` are pseudonymous handles, never a raw student number.
- **Access tokens carry no identifying claims** — subject, roles, expiry, nothing
  else. A leaked token reveals nothing about a person. Asserted by
  `tests/test_security.py::test_token_contains_no_identifying_information`.
- **`crowd_report` has no location columns.** Not nullable-and-unused: absent.
  The brief forbids asking for or storing a reporter's position, so there is
  nowhere to put one even by accident.
- **`attendance_record.device_ref` is a hash**, and a mismatch sends the record
  to `pending_review` rather than rejecting it — a soft signal must not lock a
  real student out of a real class.
- **`consent` is a table, not a boolean.** "Opt-in" has to be a row somewhere or
  it is just a promise. Grants and revocations are both kept.
- **`audit_log` has no `updated_at`** and no mixin that would let it be rewritten.
  An audit trail that can be edited is not an audit trail.

## Configurable assumptions

| Setting | Default | Why |
|---|---|---|
| `SMALL_CELL_MIN_COUNT` | 10 | Suppression threshold for any aggregate that could identify individuals. The right number varies by institution (commonly 5–10); the brief asks for 10 as the documented default for student-attribute aggregates. |
| Attendance prior mean | 0.6 | An **assumption**, not a measurement. Attendance is learned per section/weekday/hour via a Beta-Binomial posterior (`attendance_rate`); published measurements range from ~22% on Fridays to ~65% on Mondays at one university, so a single global rate would be fiction. |

## Still to document (later phases)

Student timetables and enrolment (Phase 2), attendance records (Phase 4), crowd
reports (Phase 3), tickets and photos with EXIF stripping (Phase 4), muster and
break-glass access (Phase 5), visitor passes with automatic deletion (Phase 7).

Also outstanding: **user data export and deletion endpoints** (brief section 9).
Phase 8, with the hardening work.

## Open question for the owner

Which law or policy applies, and what retention periods are required? The default
assumed so far is section-level data only, no student-level timetables, with
retention set per table as each layer lands. Confirmation would let these numbers
stop being assumptions.
