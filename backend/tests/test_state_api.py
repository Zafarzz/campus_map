"""``/state`` and the compatibility endpoints, against a real PostgreSQL.

These are the tests that would catch a regression the pure-engine tests cannot:
a wrong query window, a day boundary computed in UTC, a compat timestamp that
grew an offset, or a route shadowed by a path parameter.

The seeded fixture generates a demo timetable with parity to the front end's
own generator, so assertions can be made about *specific* rooms and instants
rather than only about shapes.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.frontend.demo_schedule import generate_demo_lessons
from app.core.config import get_settings
from app.domain.base import RoomStateKind
from app.engines.room_state import StateOptions
from app.services import schedule_service, state_service

TASHKENT = ZoneInfo("Asia/Tashkent")

#: A Monday, so the weekday-only demo schedule covers it.
SEED_START = date(2026, 10, 19)
#: One day is all these tests query, and the fixture has to **commit** (the
#: endpoints open their own sessions), so it is re-seeded per test. Generating a
#: fortnight here cost minutes of suite time for rows nothing read.
SEED_DAYS = 1

#: 10:45 local - the front end's ``defaultSimulatedMinutes``. Mid-lesson for the
#: second slot (10:30-11:50).
AT_LOCAL = "2026-10-19T10:45:00"
AT_AWARE = "2026-10-19T10:45:00+05:00"
AT_INSTANT = datetime(2026, 10, 19, 5, 45, tzinfo=UTC)


@pytest.fixture
async def scheduled_client(seeded_client: AsyncClient, clean_database) -> AsyncClient:  # type: ignore[no-untyped-def]
    """A client whose database has both the campus and a demo timetable.

    Commits, like ``seeded_client``, because the endpoints open their own
    sessions and would not see uncommitted rows.
    """
    from app.services.demo_schedule_service import seed_demo_schedule

    async with clean_database.sessionmaker() as session:
        await seed_demo_schedule(
            session,
            campus_id="ajou-tashkent",
            timezone=TASHKENT,
            start_day=SEED_START,
            days=SEED_DAYS,
        )
        await session.commit()
    return seeded_client


@pytest.fixture
async def scheduled_session(seeded_session: AsyncSession) -> AsyncSession:
    """A rolled-back session with campus + timetable, for service-level tests."""
    from app.services.demo_schedule_service import seed_demo_schedule

    await seed_demo_schedule(
        seeded_session,
        campus_id="ajou-tashkent",
        timezone=TASHKENT,
        start_day=SEED_START,
        days=SEED_DAYS,
    )
    await seeded_session.flush()
    return seeded_session


# --------------------------------------------------------------------- /state


async def test_state_returns_every_room_including_free_ones(scheduled_client: AsyncClient) -> None:
    """A room with nothing scheduled is `free`, never absent.

    Omitting it would make the map lose the room rather than show it available.
    """
    response = await scheduled_client.get("/api/v1/state", params={"at": AT_AWARE})
    assert response.status_code == 200
    body = response.json()

    assert len(body["rooms"]) == 101, "all seeded rooms must be present"
    assert {item["state"] for item in body["rooms"]} <= {kind.value for kind in RoomStateKind}
    assert body["mode"] == "simulate"
    assert body["timezone"] == "Asia/Tashkent"


async def test_live_mode_is_reported_when_at_is_omitted(scheduled_client: AsyncClient) -> None:
    response = await scheduled_client.get("/api/v1/state")
    assert response.status_code == 200
    assert response.json()["mode"] == "live"


async def test_state_carries_provenance_and_confidence(scheduled_client: AsyncClient) -> None:
    """The brief requires both on every computed value (section 8)."""
    body = (await scheduled_client.get("/api/v1/state", params={"at": AT_AWARE})).json()

    assert body["source"] == "scheduled"
    assert 0.0 <= body["confidence"] <= 1.0
    for room in body["rooms"]:
        assert room["source"] in {"scheduled", "confirmed", "reported", "estimated"}
        assert 0.0 <= room["confidence"] <= 1.0


async def test_a_scheduled_lesson_is_unconfirmed_not_empty(scheduled_client: AsyncClient) -> None:
    """Absence of evidence is not evidence of absence (brief section 10.3).

    Nobody has checked in to a seeded lesson, so every one of them must report
    ``unconfirmed`` - never a claim that the room is empty.
    """
    body = (await scheduled_client.get("/api/v1/state", params={"at": AT_AWARE})).json()
    live = [item for item in body["rooms"] if item["state"] == "lesson_now"]

    assert live, "the demo timetable should have lessons at 10:45"
    assert all(item["confirmation"] == "unconfirmed" for item in live)


async def test_state_can_be_scoped_to_one_building(scheduled_client: AsyncClient) -> None:
    body = (await scheduled_client.get("/api/v1/state", params={"at": AT_AWARE, "building": "bld-h"})).json()

    assert {item["building_id"] for item in body["rooms"]} == {"bld-h"}
    assert set(body["live_counts"]) == {"bld-h"}
    assert len(body["buildings"]) == 1


async def test_an_unknown_building_is_404(scheduled_client: AsyncClient) -> None:
    response = await scheduled_client.get("/api/v1/state", params={"building": "bld-nope"})
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "building_not_found"


async def test_live_counts_equal_the_number_of_lesson_now_rooms(
    scheduled_client: AsyncClient,
) -> None:
    """The map's "N live" badge must agree with the room list it sits beside."""
    body = (await scheduled_client.get("/api/v1/state", params={"at": AT_AWARE})).json()

    counted: dict[str, int] = {}
    for room in body["rooms"]:
        if room["state"] == "lesson_now":
            counted[room["building_id"]] = counted.get(room["building_id"], 0) + 1

    for building_id, live in body["live_counts"].items():
        assert live == counted.get(building_id, 0), building_id


async def test_the_building_summary_counts_add_up_to_the_room_count(
    scheduled_client: AsyncClient,
) -> None:
    body = (await scheduled_client.get("/api/v1/state", params={"at": AT_AWARE})).json()
    for summary in body["buildings"]:
        assert sum(summary["counts"].values()) == summary["room_count"]


async def test_every_state_key_is_present_even_at_zero(scheduled_client: AsyncClient) -> None:
    """A client can render a full legend without special-casing a missing key."""
    body = (await scheduled_client.get("/api/v1/state", params={"at": AT_AWARE})).json()
    expected = {kind.value for kind in RoomStateKind}
    for summary in body["buildings"]:
        assert set(summary["counts"]) == expected


# --------------------------------------------------------------------- `at` parsing


async def test_a_naive_at_is_rejected_by_the_clean_api(scheduled_client: AsyncClient) -> None:
    """The clean API refuses to guess a timezone.

    Accepting a naive instant would silently answer about a moment five hours
    away on a UTC+5 campus. The compat layer accepts it because that *is* its
    contract; this endpoint does not.
    """
    response = await scheduled_client.get("/api/v1/state", params={"at": AT_LOCAL})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "naive_at"


async def test_an_unparsable_at_is_rejected_with_its_value(scheduled_client: AsyncClient) -> None:
    response = await scheduled_client.get("/api/v1/state", params={"at": "next tuesday"})
    assert response.status_code == 422
    body = response.json()["error"]
    assert body["code"] == "invalid_at"
    assert body["details"]["at"] == "next tuesday"


async def test_a_utc_z_suffix_is_accepted(scheduled_client: AsyncClient) -> None:
    response = await scheduled_client.get("/api/v1/state", params={"at": "2026-10-19T05:45:00Z"})
    assert response.status_code == 200


async def test_the_same_instant_in_two_spellings_gives_the_same_answer(
    scheduled_client: AsyncClient,
) -> None:
    """``10:45+05:00`` and ``05:45Z`` are the same moment."""
    local = (await scheduled_client.get("/api/v1/state", params={"at": AT_AWARE})).json()
    utc = (await scheduled_client.get("/api/v1/state", params={"at": "2026-10-19T05:45:00Z"})).json()

    assert {(r["room_id"], r["state"]) for r in local["rooms"]} == {
        (r["room_id"], r["state"]) for r in utc["rooms"]
    }


# --------------------------------------------------------------------- windows


async def test_the_starts_soon_window_can_be_overridden(scheduled_client: AsyncClient) -> None:
    """15 by default, 60 for compat parity, overridable per request."""
    narrow = (
        await scheduled_client.get("/api/v1/state", params={"at": AT_AWARE, "starts_soon_minutes": 1})
    ).json()
    wide = (
        await scheduled_client.get("/api/v1/state", params={"at": AT_AWARE, "starts_soon_minutes": 240})
    ).json()

    assert narrow["starts_soon_minutes"] == 1
    assert wide["starts_soon_minutes"] == 240

    def soon(body: dict) -> int:  # type: ignore[type-arg]
        return sum(1 for item in body["rooms"] if item["state"] == "starts_soon")

    # A wider window can only ever classify more rooms as "starts soon".
    assert soon(wide) >= soon(narrow)


async def test_an_out_of_range_window_is_rejected(scheduled_client: AsyncClient) -> None:
    response = await scheduled_client.get(
        "/api/v1/state", params={"at": AT_AWARE, "starts_soon_minutes": 999}
    )
    assert response.status_code == 422


# --------------------------------------------------------------------- one room


async def test_a_single_room_state_matches_the_bulk_answer(
    scheduled_client: AsyncClient,
) -> None:
    """Two endpoints, one engine: they cannot be allowed to disagree."""
    bulk = (await scheduled_client.get("/api/v1/state", params={"at": AT_AWARE})).json()
    sample = next(item for item in bulk["rooms"] if item["state"] == "lesson_now")

    single = (
        await scheduled_client.get(f"/api/v1/rooms/{sample['room_id']}/state", params={"at": AT_AWARE})
    ).json()
    assert single == sample


async def test_the_room_state_route_is_not_shadowed_by_the_room_route(
    scheduled_client: AsyncClient,
) -> None:
    """``/rooms/{id}/state`` must not be captured by ``/rooms/{id}``."""
    response = await scheduled_client.get("/api/v1/rooms/bld-h-f1-a101/state")
    assert response.status_code == 200
    assert "state" in response.json()


async def test_a_legacy_room_id_resolves_for_state_too(scheduled_client: AsyncClient) -> None:
    """The same alias handling as ``/rooms/{id}``, so old links keep working."""
    response = await scheduled_client.get("/api/v1/rooms/bld-h-f1-r1/state", params={"at": AT_AWARE})
    # Either it resolves, or it is an honest 404/409 - never a wrong room.
    assert response.status_code in {200, 404, 409}
    if response.status_code == 200:
        assert response.json()["room_id"].startswith("bld-h-f1-")


async def test_an_unknown_room_state_is_404(scheduled_client: AsyncClient) -> None:
    response = await scheduled_client.get("/api/v1/rooms/not-a-room/state")
    assert response.status_code == 404


# --------------------------------------------------------------------- transitions


async def test_transitions_are_in_the_future_and_sorted(scheduled_client: AsyncClient) -> None:
    """Compared as instants, not as strings.

    ``at`` echoes the caller's ``+05:00`` spelling while the transitions
    serialise as UTC, so a lexicographic comparison of the two would be
    meaningless even when the data is right.
    """
    body = (await scheduled_client.get("/api/v1/state/transitions", params={"at": AT_AWARE})).json()

    asked = datetime.fromisoformat(body["at"])
    instants = [datetime.fromisoformat(item["at"]) for item in body["transitions"]]

    assert instants, "every room transitions at least at local midnight"
    assert instants == sorted(instants)
    assert all(item > asked for item in instants)


async def test_transitions_report_truncation(scheduled_client: AsyncClient) -> None:
    body = (
        await scheduled_client.get("/api/v1/state/transitions", params={"at": AT_AWARE, "limit": 3})
    ).json()

    assert len(body["transitions"]) == 3
    assert body["truncated"] is True


# --------------------------------------------------------------------- compat


async def test_compat_room_states_uses_the_front_ends_spelling(
    scheduled_client: AsyncClient,
) -> None:
    response = await scheduled_client.get("/api/v1/compat/room-states", params={"at": AT_LOCAL})
    assert response.status_code == 200
    body = response.json()

    assert body["upcomingWindowMinutes"] == 60, "must match src/config/mapConfig.ts"
    assert body["at"] == AT_LOCAL, "echoed back in the front end's naive spelling"
    assert set(body["states"]) and all(
        state["status"] in {"AVAILABLE", "CURRENT", "UPCOMING", "FINISHED", "CANCELLED"}
        for state in body["states"].values()
    )


async def test_compat_accepts_the_front_ends_naive_instant(
    scheduled_client: AsyncClient,
) -> None:
    """Unlike the clean API. ``src/hooks/useNow.ts`` emits no offset."""
    response = await scheduled_client.get("/api/v1/compat/room-states", params={"at": AT_LOCAL})
    assert response.status_code == 200


async def test_compat_timestamps_are_offset_naive_campus_local(
    scheduled_client: AsyncClient,
) -> None:
    """The single most important compat invariant.

    ``new Date("2026-10-19T10:30:00")`` parses as *local* time in the browser.
    An offset-aware instant would still parse but would shift every lesson by
    the viewer's offset from the campus.
    """
    body = (await scheduled_client.get("/api/v1/compat/room-states", params={"at": AT_LOCAL})).json()

    checked = 0
    for state in body["states"].values():
        for lesson in [state.get("current"), state.get("next"), *state["lessons"]]:
            if lesson is None:
                continue
            for field in ("startsAt", "endsAt"):
                value = lesson[field]
                assert "+" not in value and not value.endswith("Z"), value
                # Parses as a naive timestamp.
                assert datetime.fromisoformat(value).tzinfo is None
                checked += 1
    assert checked > 0


async def test_compat_omits_cancelled_when_false(scheduled_client: AsyncClient) -> None:
    """The front-end type is ``cancelled?: boolean``.

    Sending ``false`` everywhere would type-check but double the payload noise.
    """
    body = (await scheduled_client.get("/api/v1/compat/lessons", params={"date": "2026-10-19"})).json()

    assert body["lessons"], "the demo timetable should cover this date"
    cancelled = [item for item in body["lessons"] if "cancelled" in item]
    not_cancelled = [item for item in body["lessons"] if "cancelled" not in item]
    assert not_cancelled, "most lessons are not cancelled, so the key should be absent"
    assert all(item["cancelled"] is True for item in cancelled)


async def test_compat_labels_demo_data_as_demo(scheduled_client: AsyncClient) -> None:
    """Never present generated data as real (brief section 3.5)."""
    response = await scheduled_client.get("/api/v1/compat/room-states", params={"at": AT_LOCAL})
    body = response.json()

    assert body["meta"]["is_demo"] is True
    assert body["meta"]["source"] == "demo"
    assert "demo" in (body["meta"]["note"] or "").lower()
    assert response.headers["x-campus-is-demo"] == "true"
    assert response.headers["x-campus-source"] == "demo"


async def test_compat_live_counts_match_compat_room_states(
    scheduled_client: AsyncClient,
) -> None:
    """Both use the 60-minute window, so they cannot disagree about "live"."""
    states = (await scheduled_client.get("/api/v1/compat/room-states", params={"at": AT_LOCAL})).json()
    counts = (await scheduled_client.get("/api/v1/compat/live-counts", params={"at": AT_LOCAL})).json()

    current = sum(1 for item in states["states"].values() if item["status"] == "CURRENT")
    assert sum(counts["counts"].values()) == current


async def test_compat_live_counts_include_every_building(
    scheduled_client: AsyncClient,
) -> None:
    """Zero included, so the badge needs no missing-key branch."""
    counts = (await scheduled_client.get("/api/v1/compat/live-counts", params={"at": AT_LOCAL})).json()[
        "counts"
    ]
    campus = (await scheduled_client.get("/api/v1/compat/campus/bare")).json()

    assert set(counts) == {building["id"] for building in campus["buildings"]}


async def test_compat_lessons_covers_the_campus_local_day(
    scheduled_client: AsyncClient,
) -> None:
    """For Asia/Tashkent the day runs 19:00 UTC the previous day to 19:00 UTC."""
    body = (await scheduled_client.get("/api/v1/compat/lessons", params={"date": "2026-10-19"})).json()

    assert body["date"] == "2026-10-19"
    assert body["lessons"]
    for lesson in body["lessons"]:
        assert lesson["startsAt"].startswith("2026-10-19")


async def test_compat_lessons_is_empty_for_a_day_with_no_timetable(
    scheduled_client: AsyncClient,
) -> None:
    """Empty, not an error: "no lessons that day" is a real answer."""
    body = (await scheduled_client.get("/api/v1/compat/lessons", params={"date": "2030-01-01"})).json()
    assert body["lessons"] == []


async def test_compat_rejects_an_unparsable_at(scheduled_client: AsyncClient) -> None:
    response = await scheduled_client.get("/api/v1/compat/room-states", params={"at": "whenever"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_at"


async def test_compat_status_mapping_agrees_with_the_clean_api(
    scheduled_client: AsyncClient,
) -> None:
    """The two layers must describe the same world in two vocabularies."""
    mapping = {
        "free": "AVAILABLE",
        "lesson_now": "CURRENT",
        "starts_soon": "UPCOMING",
        "done_for_today": "FINISHED",
        "cancelled": "CANCELLED",
    }
    clean = (
        await scheduled_client.get("/api/v1/state", params={"at": AT_AWARE, "starts_soon_minutes": 60})
    ).json()
    compat = (await scheduled_client.get("/api/v1/compat/room-states", params={"at": AT_LOCAL})).json()

    for room in clean["rooms"]:
        expected = mapping[room["state"]]
        assert compat["states"][room["room_id"]]["status"] == expected, room["room_id"]


# --------------------------------------------------------------------- service level


async def test_the_state_service_matches_the_generator_room_by_room(
    scheduled_session: AsyncSession,
) -> None:
    """Close the loop: generator -> database -> engine.

    Re-derives the expected lessons from the front end's generator and checks
    that the engine's verdict for each room follows from them. A bug anywhere in
    seeding, querying or evaluating shows up here.
    """
    from app.services import campus_service

    tree = await campus_service.load_campus_tree(scheduled_session)
    pairs = [(room.id, room.room_kind.value) for room in tree.rooms]

    expected = generate_demo_lessons(room_ids=pairs, day=SEED_START, timezone=TASHKENT)
    by_room: dict[str, list] = {}  # type: ignore[type-arg]
    for lesson in expected:
        by_room.setdefault(lesson.room_id, []).append(lesson)

    options = StateOptions(starts_soon_minutes=15, timezone=TASHKENT)
    result = await state_service.state_for_campus(
        scheduled_session, AT_INSTANT, timezone=TASHKENT, options=options
    )

    assert result.states
    for state in result.states:
        active = [
            lesson
            for lesson in by_room.get(state.room_id, [])
            if lesson.starts_at <= AT_INSTANT < lesson.ends_at
        ]
        live = [lesson for lesson in active if not lesson.cancelled]
        if live:
            assert state.state is RoomStateKind.lesson_now, state.room_id
        elif active:
            assert state.state is RoomStateKind.cancelled, state.room_id


async def test_lessons_for_day_uses_campus_local_bounds(
    scheduled_session: AsyncSession,
) -> None:
    """A UTC-midnight boundary would shift the day by five hours."""
    lessons = await schedule_service.lessons_for_day(scheduled_session, day=SEED_START, timezone=TASHKENT)
    assert lessons
    for meeting in lessons:
        assert meeting.starts_at.astimezone(TASHKENT).date() == SEED_START


async def test_day_is_demo_reports_generated_data(scheduled_session: AsyncSession) -> None:
    assert await schedule_service.day_is_demo(scheduled_session, day=SEED_START, timezone=TASHKENT) is True
    assert (
        await schedule_service.day_is_demo(scheduled_session, day=date(2030, 1, 1), timezone=TASHKENT)
        is False
    )


async def test_reseeding_the_schedule_does_not_duplicate(
    scheduled_session: AsyncSession,
) -> None:
    """Idempotent, so re-running after a front-end change refreshes in place."""
    from app.services.demo_schedule_service import seed_demo_schedule

    before = len(await schedule_service.lessons_for_day(scheduled_session, day=SEED_START, timezone=TASHKENT))
    await seed_demo_schedule(
        scheduled_session,
        campus_id="ajou-tashkent",
        timezone=TASHKENT,
        start_day=SEED_START,
        days=SEED_DAYS,
    )
    await scheduled_session.flush()
    after = len(await schedule_service.lessons_for_day(scheduled_session, day=SEED_START, timezone=TASHKENT))
    assert after == before


async def test_a_cancelled_lesson_holds_no_occupancy(
    scheduled_session: AsyncSession,
) -> None:
    """A cancelled slot is genuinely free and must stay bookable.

    Writing an occupancy row for it would make the exclusion constraint refuse a
    booking for a room that nobody is using.
    """
    from sqlalchemy import func, select

    from app.domain.academic import Meeting
    from app.domain.booking import ResourceOccupancy

    cancelled = await scheduled_session.scalar(
        select(func.count(Meeting.id)).where(Meeting.is_demo.is_(True), Meeting.cancelled.is_(True))
    )
    assert cancelled and cancelled > 0

    held = await scheduled_session.scalar(
        select(func.count(ResourceOccupancy.id))
        .join(Meeting, Meeting.id == ResourceOccupancy.meeting_id)
        .where(Meeting.cancelled.is_(True))
    )
    assert held == 0


async def test_weekends_are_skipped_but_weekdays_are_not(
    seeded_session: AsyncSession,
) -> None:
    """The generator would happily invent Saturday lessons; a university does not.

    Seeds a full week itself rather than relying on the one-day fixture, because
    "Saturday is empty" proves nothing if Saturday was never in the generated
    window. The generator is also asked directly, so the test distinguishes
    "deliberately skipped" from "there was nothing to skip".
    """
    from app.services import campus_service
    from app.services.demo_schedule_service import seed_demo_schedule

    await seed_demo_schedule(
        seeded_session,
        campus_id="ajou-tashkent",
        timezone=TASHKENT,
        start_day=SEED_START,
        days=7,
    )
    await seeded_session.flush()

    saturday = SEED_START + timedelta(days=5)
    assert saturday.weekday() == 5

    # The generator *does* produce lessons for that date, so the emptiness below
    # is the seeder's weekday rule and not an absence of candidates.
    tree = await campus_service.load_campus_tree(seeded_session)
    pairs = [(room.id, room.room_kind.value) for room in tree.rooms]
    assert generate_demo_lessons(room_ids=pairs, day=saturday, timezone=TASHKENT)

    assert await schedule_service.lessons_for_day(seeded_session, day=saturday, timezone=TASHKENT) == []
    assert await schedule_service.lessons_for_day(seeded_session, day=SEED_START, timezone=TASHKENT)


async def test_the_compat_window_default_comes_from_settings() -> None:
    """60, matching the front end - not the brief's clean-API 15."""
    settings = get_settings()
    options = state_service.resolve_options(settings, TASHKENT, compat=True)
    assert options.starts_soon_minutes == settings.compat_upcoming_window_minutes == 60

    clean = state_service.resolve_options(settings, TASHKENT)
    assert clean.starts_soon_minutes == settings.starts_soon_minutes == 15
