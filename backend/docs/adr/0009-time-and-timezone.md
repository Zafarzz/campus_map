# ADR-0009: UTC in the database, campus timezone in the API, no assumed default

- **Status**: `accepted` — implemented in Phase 1
- **Date**: 2026-10-17
- **Affects**: `app/core/time.py`, `app/core/config.py`, `app/domain/`,
  `app/api/schemas/compat.py`
- **Related**: brief sections 7, 9, 24 Q1

## Context

The repository states a campus timezone **nowhere**. `src/data/demo-schedule.ts`
writes offset-naive local strings (`2026-10-17T09:00:00`) with the comment
"parsed as campus-local time", and `useNow`/`toLocalDateKey` use the **browser's**
local clock. The app therefore works correctly only while the viewer's zone equals
the campus's — invisible on campus, wrong for anyone travelling or testing
remotely.

The brief makes the timezone a required setting with no assumed default
(section 24 Q1) and requires DST transitions to be tested "even if the campus does
not use them, because the code must not assume that" (section 9).

The owner confirmed **Asia/Tashkent** (UTC+5, no DST) on 2026-10-17.

## Decision

1. **`CAMPUS_TZ` is required and has no default.** `Settings` refuses to start
   without it and validates it against the IANA database. Confirmed value is in
   `.env.example`, but the code contains no fallback — a missing timezone is a
   configuration error, not something to guess.
2. **Stored per campus**, on the `campus` row, not as a global. A second campus in
   another zone then needs no schema change.
3. **UTC everywhere in the database.** Every timestamp column is `timestamptz`;
   there is no naive timestamp column anywhere. The engine also pins
   `TIME ZONE 'UTC'` per connection so an accidental cast resolves to UTC rather
   than to whatever the server happens to be set to.
4. **`ensure_aware()` refuses a naive datetime unless told what to assume.**
   Silently treating naive input as UTC is how timezone bugs are born, and this
   project has two timestamp shapes in play.
5. **Two rendering paths, both explicit:**
   - clean API → offset-aware ISO instants;
   - compat API → `campus_local_naive()`, producing exactly the front end's
     offset-naive campus-local string, because that is what the browser's
     `new Date(...)` parses as local time.
6. **Day boundaries are computed from instants, not by adding 24 hours of wall
   clock.** `campus_day_bounds()` localises midnight and the next midnight and
   converts both. On a DST day a "day" is 23 or 25 hours.
7. **The Simulate slider is modelled explicitly.**
   `minutes_since_campus_midnight()` / `campus_instant_at_minutes()` convert
   between the front end's minutes-since-midnight and a UTC instant, so the clean
   API's `at` parameter and the slider are the same thing in two notations.
8. **DST is tested with Europe/Berlin**, not Asia/Tashkent. Tashkent has had no
   DST since 1991, so testing only with it would prove the helpers are correct for
   a fixed-offset zone and nothing more. `tests/test_time.py` asserts a 23-hour
   and a 25-hour day, plus a Hypothesis property that the UTC round trip is
   lossless on the *instant* (not the wall clock — during a fall-back the same
   wall clock happens twice).
9. **`DTZ` lint rules are enabled** in ruff, so naive-datetime misuse is caught at
   lint time rather than in review.

## Alternatives rejected

- **Default to `Asia/Tashkent` in code.** Tempting, and would have worked. Rejected
  because the brief forbids it and because a default makes the one deployment that
  is *not* in Tashkent silently wrong — the failure mode is bad data, not an error.
- **Store campus-local naive timestamps** to match the front end. Rejected: every
  aggregate across a DST boundary becomes ambiguous, and a second campus becomes
  impossible.
- **Store the offset alongside each timestamp.** Redundant: `timestamptz` plus the
  campus's IANA zone already determines the local rendering, and an offset does
  not survive a timezone rule change the way a zone name does.
- **Skip DST tests** because the campus has none. Rejected explicitly by the brief,
  and the Berlin tests did catch that a naive 24-hour implementation would be wrong.

## Consequences

- A deployment that forgets `CAMPUS_TZ` fails fast at startup. Intended.
- The compat layer's offset-naive output is correct only if the viewer's browser
  is in campus time — which is exactly as true as it is today. It is a property of
  the front end, not something this backend can fix from its side; fixing it means
  changing the front end to send and parse real instants, which is a proposal for
  the owner.
- `zoneinfo` needs the `tzdata` package on Windows; it is pulled in transitively
  and present in the container.
