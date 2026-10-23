"""Booking engine and the exclusion constraint behind it.

The brief (section 10.4) names these: a concurrency test where 50 simultaneous
requests try to book the same slot and exactly one succeeds; a booking that
touches a lesson's boundary exactly (end equals start) is allowed; auto-release;
quota and approval rules; recurring-booking expiry.

The concurrency test is the important one, and it is why there is no SQLite
fallback anywhere in this project: the guarantee under test is a PostgreSQL
exclusion constraint on a ``tstzrange``, and a test that passed on SQLite would
be proving nothing about production.
"""

from __future__ import annotations

import asyncio
import itertools
import uuid
from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

import pytest
from httpx import AsyncClient
from hypothesis import given
from hypothesis import settings as hyp_settings
from hypothesis import strategies as st
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import Database
from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.domain.base import OccupancyKind, OccupancyStatus
from app.domain.booking import Blackout, Booking, Resource, ResourceOccupancy
from app.engines.booking import (
    BookingPolicy,
    RoomCandidate,
    Slot,
    ViolationCode,
    free_windows,
    propose_alternatives,
    rank_candidates,
    validate_request,
)
from app.services import booking_service
from app.services.booking_service import BookingRequest

TASHKENT = ZoneInfo("Asia/Tashkent")

NOW = datetime(2026, 10, 19, 6, 0, tzinfo=UTC)  # 11:00 local


def _slot(start_hour: int, end_hour: int, *, day: int = 19, minute: int = 0) -> Slot:
    """A slot in UTC, given whole hours.

    Built by adding hours to midnight rather than by constructing a datetime
    with ``hour=end_hour``, so ``_slot(0, 24)`` means a whole day instead of
    raising "hour must be in 0..23".
    """
    midnight = datetime(2026, 10, day, 0, minute, tzinfo=UTC)
    return Slot(
        starts_at=midnight + timedelta(hours=start_hour),
        ends_at=midnight + timedelta(hours=end_hour),
    )


# ===================================================================== pure engine
# No database: policy arithmetic, window maths and ranking.


class TestSlot:
    def test_touching_slots_do_not_overlap(self) -> None:
        """The brief's explicit case: a booking may start when a lesson ends.

        Half-open ``[start, end)``, matching the ``tstzrange`` bounds the
        constraint uses.
        """
        lesson = _slot(9, 11)
        booking = _slot(11, 13)
        assert not lesson.overlaps(booking)
        assert not booking.overlaps(lesson)

    def test_a_one_microsecond_intrusion_does_overlap(self) -> None:
        lesson = _slot(9, 11)
        booking = Slot(
            starts_at=lesson.ends_at - timedelta(microseconds=1),
            ends_at=lesson.ends_at + timedelta(hours=1),
        )
        assert lesson.overlaps(booking)

    def test_an_empty_slot_is_rejected(self) -> None:
        with pytest.raises(ValueError, match="non-empty"):
            Slot(starts_at=NOW, ends_at=NOW)

    def test_a_naive_slot_is_rejected(self) -> None:
        with pytest.raises(ValueError, match="timezone-aware"):
            Slot(
                starts_at=datetime(2026, 10, 19, 9),  # noqa: DTZ001
                ends_at=datetime(2026, 10, 19, 11),  # noqa: DTZ001
            )

    def test_buffers_widen_the_stored_period(self) -> None:
        """Buffers go into the stored range so the constraint enforces them."""
        widened = _slot(9, 11).with_buffers(setup=timedelta(minutes=10), cleanup=timedelta(minutes=5))
        assert widened.starts_at == datetime(2026, 10, 19, 8, 50, tzinfo=UTC)
        assert widened.ends_at == datetime(2026, 10, 19, 11, 5, tzinfo=UTC)


class TestPolicyParsing:
    def test_an_empty_policy_gives_documented_defaults(self) -> None:
        policy = BookingPolicy.from_json(None)
        assert policy.min_duration_minutes == 15
        assert policy.max_days_ahead == 14
        assert policy.checkin_grace_minutes == 15

    def test_unknown_keys_are_tolerated(self) -> None:
        """A policy written for a later phase must not break this one."""
        policy = BookingPolicy.from_json({"min_duration_minutes": 30, "future_feature": "x"})
        assert policy.min_duration_minutes == 30

    def test_a_malformed_value_is_an_error_not_a_default(self) -> None:
        """Falling back would make a resource behave unlike its configuration."""
        with pytest.raises(ValueError, match="must be an integer"):
            BookingPolicy.from_json({"min_duration_minutes": "half an hour"})

    def test_a_malformed_time_is_an_error(self) -> None:
        with pytest.raises(ValueError, match="must be an HH:MM time"):
            BookingPolicy.from_json({"opens_at": "morning"})

    def test_opening_hours_parse_from_strings(self) -> None:
        policy = BookingPolicy.from_json({"opens_at": "08:00", "closes_at": "18:30"})
        assert policy.opens_at == time(8, 0)
        assert policy.closes_at == time(18, 30)

    def test_a_single_prerequisite_may_be_a_bare_string(self) -> None:
        assert BookingPolicy.from_json({"prerequisites": "laser-safety"}).prerequisites == ("laser-safety",)

    def test_a_boolean_is_not_accepted_as_an_integer(self) -> None:
        """``True`` is an ``int`` in Python; accepting it would be a silent bug."""
        with pytest.raises(ValueError, match="must be an integer"):
            BookingPolicy.from_json({"min_duration_minutes": True})


class TestValidation:
    def test_a_reasonable_request_passes(self) -> None:
        assert validate_request(_slot(12, 13), BookingPolicy(), now=NOW, timezone=TASHKENT) == []

    def test_every_violation_is_reported_not_just_the_first(self) -> None:
        """One round trip should tell the user everything that is wrong."""
        policy = BookingPolicy(max_duration_minutes=60, max_days_ahead=1)
        violations = validate_request(_slot(9, 15, day=25), policy, now=NOW, timezone=TASHKENT)
        codes = {item.code for item in violations}
        assert ViolationCode.too_long in codes
        assert ViolationCode.too_far_ahead in codes

    def test_a_past_slot_is_refused(self) -> None:
        violations = validate_request(_slot(1, 2), BookingPolicy(), now=NOW, timezone=TASHKENT)
        assert ViolationCode.in_the_past in {item.code for item in violations}

    def test_a_too_short_slot_is_refused(self) -> None:
        policy = BookingPolicy(min_duration_minutes=30)
        violations = validate_request(
            Slot(starts_at=NOW + timedelta(hours=1), ends_at=NOW + timedelta(hours=1, minutes=10)),
            policy,
            now=NOW,
            timezone=TASHKENT,
        )
        assert ViolationCode.too_short in {item.code for item in violations}

    def test_an_unbookable_resource_is_refused(self) -> None:
        violations = validate_request(
            _slot(12, 13), BookingPolicy(), now=NOW, timezone=TASHKENT, is_bookable=False
        )
        assert ViolationCode.not_bookable in {item.code for item in violations}

    def test_the_quota_is_enforced(self) -> None:
        policy = BookingPolicy(max_active_per_user=2)
        violations = validate_request(_slot(12, 13), policy, now=NOW, timezone=TASHKENT, active_bookings=2)
        assert ViolationCode.quota_exceeded in {item.code for item in violations}

    def test_a_zero_quota_means_unlimited(self) -> None:
        policy = BookingPolicy(max_active_per_user=0)
        violations = validate_request(_slot(12, 13), policy, now=NOW, timezone=TASHKENT, active_bookings=99)
        assert ViolationCode.quota_exceeded not in {item.code for item in violations}

    def test_a_missing_prerequisite_is_explained(self) -> None:
        """The brief: reject and explain why (section 13.1)."""
        policy = BookingPolicy(prerequisites=("laser-safety", "biosafety"))
        violations = validate_request(
            _slot(12, 13),
            policy,
            now=NOW,
            timezone=TASHKENT,
            held_capabilities=frozenset({"laser-safety"}),
        )
        breach = next(item for item in violations if item.code is ViolationCode.missing_prerequisite)
        assert breach.details["missing"] == ["biosafety"]
        assert "biosafety" in breach.message

    def test_opening_hours_are_compared_in_campus_local_time(self) -> None:
        """ "The lab closes at 18:00" is a claim about local time.

        06:00-07:00 UTC is 11:00-12:00 in Tashkent, comfortably inside hours; the
        same instants would look like early morning if compared in UTC.
        """
        policy = BookingPolicy(opens_at=time(8, 0), closes_at=time(18, 0))
        assert validate_request(_slot(6, 7), policy, now=NOW, timezone=TASHKENT) == []

        # 14:00-15:00 UTC is 19:00-20:00 local: after closing.
        violations = validate_request(_slot(14, 15), policy, now=NOW, timezone=TASHKENT)
        assert ViolationCode.outside_opening_hours in {item.code for item in violations}

    def test_a_slot_ending_exactly_at_closing_time_is_allowed(self) -> None:
        """Closing at 18:00 means 17:00-18:00 is fine; the window is half-open."""
        policy = BookingPolicy(closes_at=time(18, 0))
        # 12:00-13:00 UTC == 17:00-18:00 local.
        assert validate_request(_slot(12, 13), policy, now=NOW, timezone=TASHKENT) == []

    def test_a_slot_spanning_a_closure_is_refused(self) -> None:
        policy = BookingPolicy(opens_at=time(8, 0), closes_at=time(18, 0), max_duration_minutes=2000)
        overnight = Slot(
            starts_at=datetime(2026, 10, 19, 12, 0, tzinfo=UTC),  # 17:00 local
            ends_at=datetime(2026, 10, 20, 4, 0, tzinfo=UTC),  # 09:00 local next day
        )
        violations = validate_request(overnight, policy, now=NOW, timezone=TASHKENT)
        assert ViolationCode.outside_opening_hours in {item.code for item in violations}

    def test_slot_alignment_is_enforced_on_local_time(self) -> None:
        policy = BookingPolicy(slot_granularity_minutes=30)
        # 06:00 UTC == 11:00 local: aligned.
        assert validate_request(_slot(6, 7), policy, now=NOW, timezone=TASHKENT) == []
        # 06:10 UTC == 11:10 local: not on a 30-minute boundary.
        misaligned = Slot(
            starts_at=datetime(2026, 10, 19, 6, 10, tzinfo=UTC),
            ends_at=datetime(2026, 10, 19, 7, 10, tzinfo=UTC),
        )
        violations = validate_request(misaligned, policy, now=NOW, timezone=TASHKENT)
        assert ViolationCode.not_aligned in {item.code for item in violations}

    def test_a_blackout_blocks_the_slot(self) -> None:
        violations = validate_request(
            _slot(12, 13),
            BookingPolicy(),
            now=NOW,
            timezone=TASHKENT,
            blackouts=(_slot(12, 14),),
        )
        assert ViolationCode.blacked_out in {item.code for item in violations}

    def test_a_blackout_that_only_touches_the_buffer_still_blocks(self) -> None:
        """Buffers are part of the period, so they are part of the conflict."""
        policy = BookingPolicy(cleanup_minutes=30)
        violations = validate_request(
            _slot(12, 13),
            policy,
            now=NOW,
            timezone=TASHKENT,
            blackouts=(_slot(13, 14),),
        )
        assert ViolationCode.blacked_out in {item.code for item in violations}


class TestFreeWindows:
    def test_gaps_between_occupancies_are_found(self) -> None:
        windows = free_windows([_slot(9, 11), _slot(14, 16)], within=_slot(8, 18))
        assert [(w.starts_at.hour, w.ends_at.hour) for w in windows] == [
            (8, 9),
            (11, 14),
            (16, 18),
        ]

    def test_overlapping_occupancies_are_merged_first(self) -> None:
        """A room held by a lesson and an overlapping event is one busy block."""
        windows = free_windows([_slot(9, 12), _slot(10, 14)], within=_slot(8, 18))
        assert [(w.starts_at.hour, w.ends_at.hour) for w in windows] == [(8, 9), (14, 18)]

    def test_unsorted_input_is_handled(self) -> None:
        windows = free_windows([_slot(14, 16), _slot(9, 11)], within=_slot(8, 18))
        assert len(windows) == 3

    def test_a_fully_booked_window_yields_nothing(self) -> None:
        assert free_windows([_slot(8, 18)], within=_slot(8, 18)) == []

    def test_an_empty_schedule_yields_the_whole_window(self) -> None:
        windows = free_windows([], within=_slot(8, 18))
        assert len(windows) == 1
        assert windows[0].minutes == 600

    def test_short_gaps_are_filtered_out(self) -> None:
        windows = free_windows([_slot(9, 11), _slot(14, 16)], within=_slot(8, 18), min_minutes=120)
        assert [(w.starts_at.hour, w.ends_at.hour) for w in windows] == [(11, 14), (16, 18)]

    def test_occupancies_outside_the_window_are_ignored(self) -> None:
        windows = free_windows([_slot(2, 4)], within=_slot(8, 18))
        assert len(windows) == 1


class TestAlternatives:
    def test_alternatives_keep_the_requested_duration(self) -> None:
        requested = _slot(10, 12)
        options = propose_alternatives([_slot(10, 12)], requested=requested, search_within=_slot(8, 18))
        assert options
        assert all(item.duration == requested.duration for item in options)

    def test_an_earlier_alternative_is_offered_when_it_is_nearest(self) -> None:
        """Only offering later slots would hide the nearest option."""
        requested = _slot(12, 13)
        options = propose_alternatives([_slot(12, 17)], requested=requested, search_within=_slot(8, 18))
        assert options[0].ends_at <= requested.starts_at

    def test_alternatives_never_overlap_what_is_booked(self) -> None:
        busy = [_slot(9, 11), _slot(12, 14)]
        options = propose_alternatives(busy, requested=_slot(12, 13), search_within=_slot(8, 18))
        for option in options:
            assert not any(option.overlaps(item) for item in busy)

    def test_a_fully_booked_day_offers_nothing(self) -> None:
        options = propose_alternatives([_slot(0, 23)], requested=_slot(10, 11), search_within=_slot(8, 18))
        assert options == []


class TestRanking:
    def test_the_smallest_room_that_fits_wins(self) -> None:
        """Putting four people in a lecture hall blocks it for a class."""
        ranked = rank_candidates(
            [
                RoomCandidate("hall", "bld-i", 200, None, 120),
                RoomCandidate("small", "bld-h", 20, None, 120),
                RoomCandidate("medium", "bld-h", 40, None, 120),
            ],
            min_capacity=15,
        )
        assert [item.room_id for item in ranked] == ["small", "medium", "hall"]

    def test_rooms_that_are_too_small_are_excluded(self) -> None:
        ranked = rank_candidates([RoomCandidate("tiny", "bld-h", 5, None, 120)], min_capacity=30)
        assert ranked == []

    def test_rooms_free_for_too_short_a_time_are_excluded(self) -> None:
        ranked = rank_candidates([RoomCandidate("busy", "bld-h", 40, None, 20)], free_for_minutes=60)
        assert ranked == []

    def test_distance_breaks_a_capacity_tie(self) -> None:
        ranked = rank_candidates(
            [
                RoomCandidate("far", "bld-j", 30, None, 120, distance_metres=400),
                RoomCandidate("near", "bld-h", 30, None, 120, distance_metres=50),
            ],
            min_capacity=20,
        )
        assert [item.room_id for item in ranked] == ["near", "far"]

    def test_the_longest_free_window_breaks_a_distance_tie(self) -> None:
        ranked = rank_candidates(
            [
                RoomCandidate("short", "bld-h", 30, None, 60, distance_metres=50),
                RoomCandidate("long", "bld-h", 30, None, 300, distance_metres=50),
            ],
            min_capacity=20,
        )
        assert [item.room_id for item in ranked] == ["long", "short"]

    def test_unknown_capacity_sorts_after_known_capacity(self) -> None:
        """An unknown is not evidence of a good fit."""
        ranked = rank_candidates(
            [
                RoomCandidate("unknown", "bld-a", None, None, 120),
                RoomCandidate("known", "bld-h", 30, None, 120),
            ]
        )
        assert [item.room_id for item in ranked] == ["known", "unknown"]

    def test_every_candidate_carries_a_reason(self) -> None:
        """The brief: return a short reason so users understand the ranking."""
        ranked = rank_candidates(
            [RoomCandidate("r", "bld-h", 30, None, 150, distance_metres=80, accessible=True)],
            min_capacity=30,
        )
        reason = ranked[0].reason
        assert "seats 30" in reason and "exact fit" in reason
        assert "2.5h" in reason
        assert "80 m away" in reason
        assert "step-free" in reason

    def test_an_explicit_reason_is_preserved(self) -> None:
        ranked = rank_candidates([RoomCandidate("r", "bld-h", 30, None, 60, reason="hand-picked")])
        assert ranked[0].reason == "hand-picked"


@hyp_settings(max_examples=100, deadline=None)
@given(
    blocks=st.lists(
        st.tuples(st.integers(min_value=0, max_value=20), st.integers(min_value=1, max_value=6)),
        max_size=6,
    )
)
def test_free_windows_never_overlap_each_other_or_the_busy_blocks(
    blocks: list[tuple[int, int]],
) -> None:
    """The complement of a set of intervals is disjoint from it, and from itself."""
    within = _slot(0, 24)
    occupied = [
        _slot(start, min(start + length, 24))
        for start, length in blocks
        if start < 24 and start + length > start and min(start + length, 24) > start
    ]
    windows = free_windows(occupied, within=within)

    for window in windows:
        assert not any(window.overlaps(item) for item in occupied)
    for first, second in itertools.pairwise(windows):
        assert first.ends_at <= second.starts_at


# ===================================================================== database
# The constraint, the race, and the lifecycle.


@pytest.fixture
async def resource(seeded_session: AsyncSession) -> Resource:
    """A bookable room resource with a permissive policy."""
    found = await seeded_session.execute(select(Resource).where(Resource.room_id == "bld-h-f1-a101"))
    existing = found.scalar_one_or_none()
    if existing is not None:
        return existing

    created = Resource(
        campus_id="ajou-tashkent",
        code="room:bld-h-f1-a101",
        name="A-101",
        kind="room",
        room_id="bld-h-f1-a101",
        capacity=30,
        policy={"min_duration_minutes": 15, "max_duration_minutes": 480, "max_days_ahead": 365},
        is_demo=True,
    )
    seeded_session.add(created)
    await seeded_session.flush()
    return created


async def test_a_booking_is_created_and_confirmed(seeded_session: AsyncSession, resource: Resource) -> None:
    result = await booking_service.create_booking(
        seeded_session,
        BookingRequest(resource_id=resource.id, slot=_slot(12, 13)),
        timezone=TASHKENT,
        now=NOW,
    )
    assert result.booking.status is OccupancyStatus.confirmed
    assert result.awaiting_approval is False
    assert result.occupancy.kind is OccupancyKind.booking


async def test_an_overlapping_booking_is_a_409_with_alternatives(
    seeded_session: AsyncSession, resource: Resource
) -> None:
    """The brief requires the next available slots in the conflict response."""
    await booking_service.create_booking(
        seeded_session,
        BookingRequest(resource_id=resource.id, slot=_slot(12, 14)),
        timezone=TASHKENT,
        now=NOW,
    )

    with pytest.raises(ConflictError) as caught:
        await booking_service.create_booking(
            seeded_session,
            BookingRequest(resource_id=resource.id, slot=_slot(13, 15)),
            timezone=TASHKENT,
            now=NOW,
        )

    details = caught.value.details
    assert caught.value.code == "slot_taken"
    assert details["alternatives"], "a conflict must offer alternatives"
    for option in details["alternatives"]:
        assert "starts_at" in option and "starts_at_local" in option


async def test_a_booking_touching_a_lessons_boundary_is_allowed(
    seeded_session: AsyncSession, resource: Resource
) -> None:
    """The brief's explicit case: end equals start is not a conflict.

    Written straight into ``resource_occupancy`` as a lesson, which is how the
    timetable holds a room, then booked immediately afterwards.
    """
    from sqlalchemy.dialects.postgresql import Range

    lesson = _slot(9, 11)
    seeded_session.add(
        ResourceOccupancy(
            resource_id=resource.id,
            period=Range(lesson.starts_at, lesson.ends_at, bounds="[)"),
            kind=OccupancyKind.lesson,
            status=OccupancyStatus.confirmed,
            is_demo=True,
        )
    )
    await seeded_session.flush()

    result = await booking_service.create_booking(
        seeded_session,
        BookingRequest(resource_id=resource.id, slot=_slot(11, 12)),
        timezone=TASHKENT,
        now=NOW,
    )
    assert result.booking.status is OccupancyStatus.confirmed


async def test_a_booking_cannot_land_on_top_of_a_lesson(
    seeded_session: AsyncSession, resource: Resource
) -> None:
    """One table, one constraint: that is why lessons and bookings share it."""
    from sqlalchemy.dialects.postgresql import Range

    seeded_session.add(
        ResourceOccupancy(
            resource_id=resource.id,
            period=Range(
                datetime(2026, 10, 19, 9, tzinfo=UTC),
                datetime(2026, 10, 19, 11, tzinfo=UTC),
                bounds="[)",
            ),
            kind=OccupancyKind.lesson,
            status=OccupancyStatus.confirmed,
            is_demo=True,
        )
    )
    await seeded_session.flush()

    with pytest.raises(ConflictError):
        await booking_service.create_booking(
            seeded_session,
            BookingRequest(resource_id=resource.id, slot=_slot(10, 12)),
            timezone=TASHKENT,
            now=NOW,
        )


async def test_buffers_are_enforced_by_the_constraint(
    seeded_session: AsyncSession, resource: Resource
) -> None:
    """Back-to-back bookings are refused when a cleanup buffer applies."""
    resource.policy = {**(resource.policy or {}), "cleanup_minutes": 30}
    await seeded_session.flush()

    await booking_service.create_booking(
        seeded_session,
        BookingRequest(resource_id=resource.id, slot=_slot(12, 13)),
        timezone=TASHKENT,
        now=NOW,
    )
    with pytest.raises(ConflictError):
        await booking_service.create_booking(
            seeded_session,
            BookingRequest(resource_id=resource.id, slot=_slot(13, 14)),
            timezone=TASHKENT,
            now=NOW,
        )


async def test_a_cancelled_booking_frees_its_slot_immediately(
    seeded_session: AsyncSession, resource: Resource
) -> None:
    """Only pending and confirmed rows participate in the constraint."""
    first = await booking_service.create_booking(
        seeded_session,
        BookingRequest(resource_id=resource.id, slot=_slot(12, 13)),
        timezone=TASHKENT,
        now=NOW,
    )
    await booking_service.cancel_booking(seeded_session, first.booking.id, now=NOW)

    second = await booking_service.create_booking(
        seeded_session,
        BookingRequest(resource_id=resource.id, slot=_slot(12, 13)),
        timezone=TASHKENT,
        now=NOW,
    )
    assert second.booking.status is OccupancyStatus.confirmed

    # The cancelled row is kept, not deleted: history must stay intact.
    kept = await seeded_session.scalar(
        select(func.count(ResourceOccupancy.id)).where(ResourceOccupancy.status == OccupancyStatus.cancelled)
    )
    assert kept == 1


async def test_approval_required_produces_a_pending_booking(
    seeded_session: AsyncSession, resource: Resource
) -> None:
    resource.requires_approval = True
    await seeded_session.flush()

    result = await booking_service.create_booking(
        seeded_session,
        BookingRequest(resource_id=resource.id, slot=_slot(12, 13)),
        timezone=TASHKENT,
        now=NOW,
    )
    assert result.booking.status is OccupancyStatus.pending
    assert result.awaiting_approval is True


async def test_a_pending_booking_still_holds_the_slot(
    seeded_session: AsyncSession, resource: Resource
) -> None:
    """``pending`` is inside the constraint's WHERE clause for exactly this."""
    resource.requires_approval = True
    await seeded_session.flush()

    await booking_service.create_booking(
        seeded_session,
        BookingRequest(resource_id=resource.id, slot=_slot(12, 13)),
        timezone=TASHKENT,
        now=NOW,
    )
    with pytest.raises(ConflictError):
        await booking_service.create_booking(
            seeded_session,
            BookingRequest(resource_id=resource.id, slot=_slot(12, 13)),
            timezone=TASHKENT,
            now=NOW,
        )


async def test_a_policy_violation_is_a_422_listing_every_breach(
    seeded_session: AsyncSession, resource: Resource
) -> None:
    resource.policy = {"max_duration_minutes": 60, "max_days_ahead": 1}
    await seeded_session.flush()

    with pytest.raises(ValidationError) as caught:
        await booking_service.create_booking(
            seeded_session,
            BookingRequest(resource_id=resource.id, slot=_slot(9, 15, day=25)),
            timezone=TASHKENT,
            now=NOW,
        )

    codes = {item["code"] for item in caught.value.details["violations"]}
    assert "too_long" in codes
    assert "too_far_ahead" in codes


async def test_an_invalid_stored_policy_refuses_the_booking(
    seeded_session: AsyncSession, resource: Resource
) -> None:
    """An operator error must not silently become default behaviour."""
    resource.policy = {"min_duration_minutes": "thirty"}
    await seeded_session.flush()

    with pytest.raises(ValidationError) as caught:
        await booking_service.create_booking(
            seeded_session,
            BookingRequest(resource_id=resource.id, slot=_slot(12, 13)),
            timezone=TASHKENT,
            now=NOW,
        )
    assert caught.value.code == "invalid_resource_policy"


async def test_an_unknown_resource_is_404(seeded_session: AsyncSession) -> None:
    with pytest.raises(NotFoundError):
        await booking_service.create_booking(
            seeded_session,
            BookingRequest(resource_id=uuid.uuid4(), slot=_slot(12, 13)),
            timezone=TASHKENT,
            now=NOW,
        )


async def test_a_blackout_blocks_a_booking(seeded_session: AsyncSession, resource: Resource) -> None:
    seeded_session.add(
        Blackout(
            resource_id=resource.id,
            starts_at=datetime(2026, 10, 19, 12, tzinfo=UTC),
            ends_at=datetime(2026, 10, 19, 14, tzinfo=UTC),
            reason="deep clean",
        )
    )
    await seeded_session.flush()

    with pytest.raises(ValidationError) as caught:
        await booking_service.create_booking(
            seeded_session,
            BookingRequest(resource_id=resource.id, slot=_slot(12, 13)),
            timezone=TASHKENT,
            now=NOW,
        )
    codes = {item["code"] for item in caught.value.details["violations"]}
    assert "blacked_out" in codes


# --------------------------------------------------------------------- check-in


async def test_check_in_inside_the_window_succeeds(seeded_session: AsyncSession, resource: Resource) -> None:
    result = await booking_service.create_booking(
        seeded_session,
        BookingRequest(resource_id=resource.id, slot=_slot(12, 13)),
        timezone=TASHKENT,
        now=NOW,
    )
    at = datetime(2026, 10, 19, 12, 5, tzinfo=UTC)
    booking = await booking_service.check_in(seeded_session, result.booking.id, now=at)
    assert booking.checked_in_at == at


async def test_check_in_is_idempotent(seeded_session: AsyncSession, resource: Resource) -> None:
    """A second tap is not an error."""
    result = await booking_service.create_booking(
        seeded_session,
        BookingRequest(resource_id=resource.id, slot=_slot(12, 13)),
        timezone=TASHKENT,
        now=NOW,
    )
    first_at = datetime(2026, 10, 19, 12, 5, tzinfo=UTC)
    await booking_service.check_in(seeded_session, result.booking.id, now=first_at)
    again = await booking_service.check_in(
        seeded_session, result.booking.id, now=first_at + timedelta(minutes=2)
    )
    assert again.checked_in_at == first_at


async def test_check_in_too_early_is_refused(seeded_session: AsyncSession, resource: Resource) -> None:
    """Checking in an hour early is not claiming the room."""
    result = await booking_service.create_booking(
        seeded_session,
        BookingRequest(resource_id=resource.id, slot=_slot(12, 13)),
        timezone=TASHKENT,
        now=NOW,
    )
    with pytest.raises(ValidationError) as caught:
        await booking_service.check_in(
            seeded_session, result.booking.id, now=datetime(2026, 10, 19, 10, tzinfo=UTC)
        )
    assert caught.value.code == "checkin_not_open"


async def test_check_in_after_the_grace_period_is_refused(
    seeded_session: AsyncSession, resource: Resource
) -> None:
    result = await booking_service.create_booking(
        seeded_session,
        BookingRequest(resource_id=resource.id, slot=_slot(12, 13)),
        timezone=TASHKENT,
        now=NOW,
    )
    with pytest.raises(ValidationError) as caught:
        await booking_service.check_in(
            seeded_session, result.booking.id, now=datetime(2026, 10, 19, 12, 30, tzinfo=UTC)
        )
    assert caught.value.code == "checkin_window_closed"


async def test_check_in_to_a_cancelled_booking_is_refused(
    seeded_session: AsyncSession, resource: Resource
) -> None:
    result = await booking_service.create_booking(
        seeded_session,
        BookingRequest(resource_id=resource.id, slot=_slot(12, 13)),
        timezone=TASHKENT,
        now=NOW,
    )
    await booking_service.cancel_booking(seeded_session, result.booking.id, now=NOW)
    with pytest.raises(ValidationError) as caught:
        await booking_service.check_in(
            seeded_session, result.booking.id, now=datetime(2026, 10, 19, 12, 5, tzinfo=UTC)
        )
    assert caught.value.code == "booking_not_active"


# --------------------------------------------------------------------- auto-release


async def test_an_unclaimed_booking_is_auto_released(
    seeded_session: AsyncSession, resource: Resource
) -> None:
    result = await booking_service.create_booking(
        seeded_session,
        BookingRequest(resource_id=resource.id, slot=_slot(12, 14)),
        timezone=TASHKENT,
        now=NOW,
    )
    # Default grace is 15 minutes; sweep at 12:20.
    released = await booking_service.release_expired(
        seeded_session, now=datetime(2026, 10, 19, 12, 20, tzinfo=UTC)
    )
    assert [item.id for item in released] == [result.booking.id]
    assert result.booking.status is OccupancyStatus.released


async def test_a_released_slot_can_be_rebooked(seeded_session: AsyncSession, resource: Resource) -> None:
    await booking_service.create_booking(
        seeded_session,
        BookingRequest(resource_id=resource.id, slot=_slot(12, 14)),
        timezone=TASHKENT,
        now=NOW,
    )
    sweep_at = datetime(2026, 10, 19, 12, 20, tzinfo=UTC)
    await booking_service.release_expired(seeded_session, now=sweep_at)

    again = await booking_service.create_booking(
        seeded_session,
        BookingRequest(resource_id=resource.id, slot=_slot(13, 14)),
        timezone=TASHKENT,
        now=sweep_at,
    )
    assert again.booking.status is OccupancyStatus.confirmed


async def test_a_checked_in_booking_is_not_released(seeded_session: AsyncSession, resource: Resource) -> None:
    result = await booking_service.create_booking(
        seeded_session,
        BookingRequest(resource_id=resource.id, slot=_slot(12, 14)),
        timezone=TASHKENT,
        now=NOW,
    )
    await booking_service.check_in(
        seeded_session, result.booking.id, now=datetime(2026, 10, 19, 12, 5, tzinfo=UTC)
    )
    released = await booking_service.release_expired(
        seeded_session, now=datetime(2026, 10, 19, 12, 20, tzinfo=UTC)
    )
    assert released == []


async def test_a_booking_inside_its_grace_period_is_not_released(
    seeded_session: AsyncSession, resource: Resource
) -> None:
    await booking_service.create_booking(
        seeded_session,
        BookingRequest(resource_id=resource.id, slot=_slot(12, 14)),
        timezone=TASHKENT,
        now=NOW,
    )
    released = await booking_service.release_expired(
        seeded_session, now=datetime(2026, 10, 19, 12, 10, tzinfo=UTC)
    )
    assert released == []


async def test_a_lesson_is_never_auto_released(seeded_session: AsyncSession, resource: Resource) -> None:
    """The brief: official lessons are never auto-cancelled by default.

    Guaranteed structurally rather than by a flag - the sweeper queries the
    ``booking`` table, and a lesson has no row there for it to find.
    """
    from sqlalchemy.dialects.postgresql import Range

    seeded_session.add(
        ResourceOccupancy(
            resource_id=resource.id,
            period=Range(
                datetime(2026, 10, 19, 12, tzinfo=UTC),
                datetime(2026, 10, 19, 14, tzinfo=UTC),
                bounds="[)",
            ),
            kind=OccupancyKind.lesson,
            status=OccupancyStatus.confirmed,
            is_demo=True,
        )
    )
    await seeded_session.flush()

    released = await booking_service.release_expired(
        seeded_session, now=datetime(2026, 10, 19, 13, tzinfo=UTC)
    )
    assert released == []

    still_held = await seeded_session.scalar(
        select(func.count(ResourceOccupancy.id)).where(
            ResourceOccupancy.kind == OccupancyKind.lesson,
            ResourceOccupancy.status == OccupancyStatus.confirmed,
        )
    )
    assert still_held == 1


# --------------------------------------------------------------------- concurrency


async def test_fifty_concurrent_requests_for_one_slot_produce_exactly_one_winner(
    clean_database: Database,
    seeded_client: AsyncClient,
) -> None:
    """The brief's headline concurrency requirement (section 10.4).

    Each racer gets its **own session and its own transaction**, because that is
    the only arrangement that exercises the real guarantee: concurrent
    transactions competing for one range. Sharing a session would serialise them
    in Python and the test would pass without proving anything.

    The application-level availability check cannot be what makes this pass -
    all 50 run it before any of them commits, so all 50 see a free slot. The
    single winner is the exclusion constraint's doing.
    """
    racers = 50
    slot = _slot(12, 13)

    async with clean_database.sessionmaker() as setup:
        resource = Resource(
            campus_id="ajou-tashkent",
            code="room:race",
            name="Race Room",
            kind="room",
            capacity=10,
            policy={"max_days_ahead": 365},
            is_demo=True,
        )
        setup.add(resource)
        await setup.commit()
        resource_id = resource.id

    async def attempt(index: int) -> str:
        async with clean_database.sessionmaker() as session:
            try:
                await booking_service.create_booking(
                    session,
                    BookingRequest(
                        resource_id=resource_id,
                        slot=slot,
                        purpose=f"racer-{index}",
                    ),
                    timezone=TASHKENT,
                    now=NOW,
                )
                await session.commit()
                return "won"
            except ConflictError:
                await session.rollback()
                return "lost"
            except Exception as exc:  # pragma: no cover - surfaced by the assert
                await session.rollback()
                return f"error:{type(exc).__name__}:{exc}"

    outcomes = await asyncio.gather(*(attempt(index) for index in range(racers)))

    errors = [item for item in outcomes if item.startswith("error:")]
    assert errors == [], f"unexpected failures: {errors[:3]}"
    assert outcomes.count("won") == 1, f"expected exactly one winner, got {outcomes.count('won')}"
    assert outcomes.count("lost") == racers - 1

    # And the database agrees: one occupancy holds the slot.
    async with clean_database.sessionmaker() as check:
        held = await check.scalar(
            select(func.count(ResourceOccupancy.id)).where(
                ResourceOccupancy.resource_id == resource_id,
                ResourceOccupancy.status.in_((OccupancyStatus.pending, OccupancyStatus.confirmed)),
            )
        )
        bookings = await check.scalar(
            select(func.count(Booking.id)).where(Booking.resource_id == resource_id)
        )
    assert held == 1
    assert bookings == 1, "a losing racer must not leave an orphaned booking row"


async def test_concurrent_requests_for_adjacent_slots_all_succeed(
    clean_database: Database,
    seeded_client: AsyncClient,
) -> None:
    """The constraint must not serialise bookings that do not actually conflict."""
    async with clean_database.sessionmaker() as setup:
        resource = Resource(
            campus_id="ajou-tashkent",
            code="room:adjacent",
            name="Adjacent Room",
            kind="room",
            capacity=10,
            policy={"max_days_ahead": 365, "min_duration_minutes": 15},
            is_demo=True,
        )
        setup.add(resource)
        await setup.commit()
        resource_id = resource.id

    async def attempt(hour: int) -> str:
        async with clean_database.sessionmaker() as session:
            try:
                await booking_service.create_booking(
                    session,
                    BookingRequest(resource_id=resource_id, slot=_slot(hour, hour + 1)),
                    timezone=TASHKENT,
                    now=NOW,
                )
                await session.commit()
                return "won"
            except ConflictError:
                await session.rollback()
                return "lost"

    outcomes = await asyncio.gather(*(attempt(hour) for hour in range(8, 18)))
    assert outcomes.count("won") == 10
