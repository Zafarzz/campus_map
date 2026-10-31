"""Tests for Layer 1: Crowds (brief section 11).

Covers:
* M/M/c Erlang C queueing formula (section 11.5):
  - exact reduction to M/M/1 when counters = 1,
  - monotonicity in arrival rate (longer queue as demand rises),
  - monotonicity in counter count (shorter queue with more counters),
  - class-end arrival surge and wait_band calibration,
  - always returns provenance = estimated.
* Hour-of-week "best time to go" profile (section 11.2):
  - median and 80th percentile when samples >= threshold,
  - fallback to schedule-based proxy when history is thin,
  - honest "not_enough_data" refusal when neither exists (never invent a profile).
* Class-change flows (section 11.3):
  - origin-destination trips in 5-minute bins,
  - conservation of total trip headcount,
  - small-cell suppression (< 10).
* Walking-time check (section 11.4):
  - centroid distances and floor penalties,
  - flags tight transitions where gap < required time.
* Reporter reliability update (section 11.1):
  - agreement increases reliability, disagreement decreases it.
* API endpoints:
  - GET /busyness, GET /busyness/{place_id}, POST /busyness/{place_id}/report,
  - GET /busyness/{place_id}/best-time, GET /busyness/{place_id}/queue,
  - GET /display/{place_id}, GET /busyness/flows, GET /busyness/walking-check.
"""

from __future__ import annotations

import itertools
import math
import uuid
from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.security import Role, create_access_token
from app.domain.base import CrowdLevel, PlaceKind, Provenance
from app.domain.people import AppUser
from app.engines.crowds import (
    FlowMeeting,
    ScheduledTransitionSlot,
    TimetableMeetingSlot,
    WalkingCheckConfig,
    calibrate_arrival_multiplier,
    canteen_arrival_rate,
    check_walking_transitions,
    compute_class_change_flows,
    compute_hourly_profile,
    compute_schedule_proxy_by_how,
    compute_timetable_place_prior,
    erlang_c_probability,
    mmc_queue_estimate,
    required_walking_seconds,
    update_reporter_reliability,
)
from app.services import crowd_service

TASHKENT = ZoneInfo("Asia/Tashkent")
NOW = datetime(2026, 10, 19, 10, 0, tzinfo=UTC)


# ---------------------------------------------------------------------------
# 11.5 Canteen queue M/M/c unit & property tests
# ---------------------------------------------------------------------------


class TestErlangCAndQueueFormulas:
    def test_reduction_to_mm1_when_single_counter(self) -> None:
        """When c = 1, Erlang C probability P(wait > 0) equals rho = lambda / mu."""
        lam = 2.0
        mu = 3.0
        rho = lam / mu
        c_prob = erlang_c_probability(1, lam, mu)
        assert math.isclose(c_prob, rho, rel_tol=1e-6)

        est = mmc_queue_estimate(
            arrival_rate_per_min=lam,
            counters=1,
            service_rate_per_counter_per_min=mu,
            arrival_multiplier=1.0,
        )
        expected_lq = (rho * rho) / (1.0 - rho)
        expected_wq = rho / (mu * (1.0 - rho))
        assert math.isclose(est.expected_queue_length, expected_lq, rel_tol=1e-4)
        assert math.isclose(est.expected_wait_minutes, expected_wq, rel_tol=1e-4)

    def test_wait_time_monotonically_increases_with_arrival_rate(self) -> None:
        """A busier canteen produces longer queues and longer wait times."""
        rates = [1.0, 2.0, 3.5, 5.0, 6.5, 7.5]
        waits = [
            mmc_queue_estimate(
                arrival_rate_per_min=r,
                counters=3,
                service_rate_per_counter_per_min=2.5,
            ).expected_wait_minutes
            for r in rates
        ]
        for w1, w2 in itertools.pairwise(waits):
            assert w2 >= w1

    def test_wait_time_monotonically_decreases_with_counters(self) -> None:
        """Opening another service counter reduces the waiting time."""
        counters = [1, 2, 3, 4, 5]
        waits = [
            mmc_queue_estimate(
                arrival_rate_per_min=2.0,
                counters=c,
                service_rate_per_counter_per_min=2.5,
            ).expected_wait_minutes
            for c in counters
        ]
        for w1, w2 in itertools.pairwise(waits):
            assert w2 <= w1

    def test_zero_arrival_rate_yields_zero_queue(self) -> None:
        est = mmc_queue_estimate(
            arrival_rate_per_min=0.0,
            counters=3,
            service_rate_per_counter_per_min=2.5,
        )
        assert est.expected_queue_length == 0.0
        assert est.expected_wait_minutes == 0.0
        assert est.provenance is Provenance.estimated

    def test_arrival_rate_pulse_from_ending_classes(self) -> None:
        base = 2.0
        waves = [(5.0, 50.0), (10.0, 30.0)]
        surged = canteen_arrival_rate(base, ending_waves=waves, capture_fraction=0.25)
        assert surged > base

    def test_multiplier_calibration_from_wait_bands(self) -> None:
        current = 1.0
        higher = calibrate_arrival_multiplier(
            current,
            ["over_20"],
            predicted_wait_minutes_at_unit_multiplier=5.0,
        )
        assert higher > current

        lower = calibrate_arrival_multiplier(
            current,
            ["under_5"],
            predicted_wait_minutes_at_unit_multiplier=15.0,
        )
        assert lower < current


# ---------------------------------------------------------------------------
# 11.2 Best time to go profile tests
# ---------------------------------------------------------------------------


class TestBestTimeToGo:
    def test_computes_median_and_p80_when_history_sufficient(self) -> None:
        samples = {
            10: [0.10, 0.20, 0.30, 0.40, 0.50],
            11: [0.50, 0.60, 0.70, 0.80, 0.90],
        }
        res = compute_hourly_profile("place-library", samples, min_samples_per_bucket=3)
        assert res.status == "ok"
        assert res.provenance is Provenance.estimated
        assert len(res.buckets) == 2
        b10 = next(b for b in res.buckets if b.hour_of_week == 10)
        assert math.isclose(b10.median_fraction, 0.30, abs_tol=1e-3)
        assert b10.p80_fraction >= b10.median_fraction

    def test_falls_back_to_schedule_proxy_when_history_thin(self) -> None:
        samples = {10: [0.20]}  # only 1 sample (< 3)
        proxy = {10: 0.35, 11: 0.60}
        res = compute_hourly_profile(
            "place-canteen",
            samples,
            min_samples_per_bucket=3,
            schedule_proxy_by_how=proxy,
        )
        assert res.status == "schedule_proxy"
        assert res.provenance is Provenance.scheduled
        assert len(res.buckets) == 2

    def test_honest_not_enough_data_refusal(self) -> None:
        """When neither history nor schedule proxy has data, never invent a profile."""
        res = compute_hourly_profile(
            "place-gym",
            {},
            min_samples_per_bucket=3,
            schedule_proxy_by_how={},
        )
        assert res.status == "not_enough_data"
        assert res.buckets == ()
        assert res.best_hours == ()
        assert res.worst_hours == ()
        assert "not enough data" in (res.note or "").lower()

    def test_schedule_proxy_from_ending_meetings(self) -> None:
        ending = [
            (0, time(9, 50), "bld-h", 40.0),
            (0, time(10, 0), "bld-g", 30.0),
        ]
        proxy = compute_schedule_proxy_by_how(
            ending,
            capacity=100,
            nearby_building_ids=["bld-h", "bld-g"],
            capture_fraction=0.25,
        )
        how = 0 * 24 + 10  # Monday 10:00
        assert how in proxy
        assert proxy[how] > 0.0


# ---------------------------------------------------------------------------
# 11.3 Class-change flows & small-cell suppression
# ---------------------------------------------------------------------------


class TestClassChangeFlows:
    def test_trip_conservation_and_entrance_conservation(self) -> None:
        """Conservation law: corridor sum equals total trips; entrance sum equals 2 * total trips."""
        base_t = datetime(2026, 10, 19, 9, 0, tzinfo=UTC)
        meetings = [
            FlowMeeting(
                cohort_key="CSE-21",
                building_id="bld-h",
                room_id="bld-h-f1-a101",
                starts_at=base_t,
                ends_at=base_t + timedelta(minutes=80),
                enrolled=30,
                attendance_rate=0.6,
            ),
            FlowMeeting(
                cohort_key="CSE-21",
                building_id="bld-g",
                room_id="bld-g-f2-b201",
                starts_at=base_t + timedelta(minutes=90),
                ends_at=base_t + timedelta(minutes=170),
                enrolled=30,
                attendance_rate=0.6,
            ),
        ]
        res = compute_class_change_flows(meetings, small_cell_min_count=5)
        expected_weight = 30 * 0.6  # 18.0

        assert math.isclose(res.total_raw_trips_headcount, expected_weight, rel_tol=1e-4)
        corridor_sum = sum(b.raw_headcount for b in res.corridor_bins)
        assert math.isclose(corridor_sum, expected_weight, rel_tol=1e-4)

        dep_sum = sum(b.departures for b in res.entrance_bins)
        arr_sum = sum(b.arrivals for b in res.entrance_bins)
        assert math.isclose(dep_sum, expected_weight, rel_tol=1e-4)
        assert math.isclose(arr_sum, expected_weight, rel_tol=1e-4)

    def test_small_cell_suppression(self) -> None:
        """Bins with headcount < small_cell_min_count must be suppressed."""
        base_t = datetime(2026, 10, 19, 9, 0, tzinfo=UTC)
        meetings = [
            FlowMeeting(
                cohort_key="SMALL-GROUP",
                building_id="bld-h",
                room_id="bld-h-f1-a101",
                starts_at=base_t,
                ends_at=base_t + timedelta(minutes=80),
                enrolled=8,
                attendance_rate=0.5,  # 4.0 students < 10
            ),
            FlowMeeting(
                cohort_key="SMALL-GROUP",
                building_id="bld-g",
                room_id="bld-g-f2-b201",
                starts_at=base_t + timedelta(minutes=90),
                ends_at=base_t + timedelta(minutes=170),
                enrolled=8,
                attendance_rate=0.5,
            ),
        ]
        res = compute_class_change_flows(meetings, small_cell_min_count=10)
        assert len(res.corridor_bins) == 1
        bin_entry = res.corridor_bins[0]
        assert bin_entry.suppressed is True
        assert bin_entry.displayed_headcount is None
        assert bin_entry.raw_headcount == 4.0


# ---------------------------------------------------------------------------
# 11.4 Walking-time check tests
# ---------------------------------------------------------------------------


class TestWalkingTimeCheck:
    def test_distance_and_floor_penalties(self) -> None:
        cfg = WalkingCheckConfig(walking_speed_mps=1.2, seconds_per_floor=15.0)
        req_sec, dist_m = required_walking_seconds(
            "bld-h", "bld-b", from_floor_level=2, to_floor_level=3, config=cfg
        )
        assert dist_m > 0.0
        # Floors down from 2 to 1 (1) + up from 1 to 3 (2) = 3 floors * 15s = 45s + 30s buffer
        assert req_sec > (dist_m / 1.2) + 70.0

    def test_flags_tight_transition(self) -> None:
        slots = [
            ScheduledTransitionSlot(
                subject_kind="teacher",
                subject_id="t.kim",
                weekday=0,
                starts_at=time(9, 0),
                ends_at=time(10, 20),
                room_id="bld-h-f2-a201",
                building_id="bld-h",
                floor_level=2,
                source_row=2,
            ),
            ScheduledTransitionSlot(
                subject_kind="teacher",
                subject_id="t.kim",
                weekday=0,
                starts_at=time(10, 22),  # 2 minute gap = 120s
                ends_at=time(11, 40),
                room_id="bld-b-f3-b301",
                building_id="bld-b",
                floor_level=3,
                source_row=3,
            ),
        ]
        issues = check_walking_transitions(slots)
        assert len(issues) == 1
        issue = issues[0]
        assert issue.subject_id == "t.kim"
        assert issue.gap_seconds == 120.0
        assert issue.required_seconds > 120.0


# ---------------------------------------------------------------------------
# 11.1 Reporter reliability updates
# ---------------------------------------------------------------------------


class TestReporterReliability:
    def test_agreement_increases_reliability(self) -> None:
        rel, agr, dis = update_reporter_reliability(0.5, 0, 0, agreed=True)
        assert rel > 0.5
        assert agr == 1
        assert dis == 0

    def test_disagreement_decreases_reliability(self) -> None:
        rel, agr, dis = update_reporter_reliability(0.5, 0, 0, agreed=False)
        assert rel < 0.5
        assert agr == 0
        assert dis == 1


class TestTimetablePlacePrior:
    def test_break_window_surges_corridor_and_canteen_vs_mid_lecture(self) -> None:
        """During a 15-min break (09:45-10:00), corridor & canteen surge compared to mid-lecture (09:10)."""
        meetings = [
            TimetableMeetingSlot(
                starts_at=datetime(2026, 10, 26, 8, 30, tzinfo=TASHKENT),
                ends_at=datetime(2026, 10, 26, 9, 45, tzinfo=TASHKENT),
                building_id="bld-g",
                group_label="A25A, A25B",
                expected_students=45.0,
            ),
            TimetableMeetingSlot(
                starts_at=datetime(2026, 10, 26, 10, 0, tzinfo=TASHKENT),
                ends_at=datetime(2026, 10, 26, 11, 15, tzinfo=TASHKENT),
                building_id="bld-g",
                group_label="A25A, A25B",
                expected_students=45.0,
            ),
        ]
        mid_lecture = datetime(2026, 10, 26, 9, 10, tzinfo=TASHKENT)
        break_time = datetime(2026, 10, 26, 9, 52, tzinfo=TASHKENT)

        corridor_mid = compute_timetable_place_prior(
            kind=PlaceKind.corridor,
            capacity=150,
            at=mid_lecture,
            day_meetings=meetings,
            building_id="bld-g",
            nearby_building_ids=["bld-g", "bld-h", "bld-i"],
            timezone=TASHKENT,
        )
        corridor_break = compute_timetable_place_prior(
            kind=PlaceKind.corridor,
            capacity=150,
            at=break_time,
            day_meetings=meetings,
            building_id="bld-g",
            nearby_building_ids=["bld-g", "bld-h", "bld-i"],
            timezone=TASHKENT,
        )
        assert corridor_break.in_break_window is True
        assert corridor_mid.in_break_window is False
        assert corridor_break.fraction > corridor_mid.fraction

        canteen_mid = compute_timetable_place_prior(
            kind=PlaceKind.canteen,
            capacity=200,
            at=mid_lecture,
            day_meetings=meetings,
            building_id="bld-i",
            nearby_building_ids=["bld-i", "bld-g", "bld-h"],
            timezone=TASHKENT,
        )
        canteen_break = compute_timetable_place_prior(
            kind=PlaceKind.canteen,
            capacity=200,
            at=break_time,
            day_meetings=meetings,
            building_id="bld-i",
            nearby_building_ids=["bld-i", "bld-g", "bld-h"],
            timezone=TASHKENT,
        )
        assert canteen_break.fraction > canteen_mid.fraction

    def test_open_class_gap_boosts_study_lounge_and_library(self) -> None:
        """Group I25D with 08:30-09:45 and 11:30-12:45 has an open class at 10:30 that boosts lounge/library."""
        without_open_class = [
            TimetableMeetingSlot(
                starts_at=datetime(2026, 10, 26, 10, 0, tzinfo=TASHKENT),
                ends_at=datetime(2026, 10, 26, 11, 15, tzinfo=TASHKENT),
                building_id="bld-h",
                group_label="B25A",
                expected_students=22.0,
            ),
        ]
        with_i25d_open_class = [
            *without_open_class,
            TimetableMeetingSlot(
                starts_at=datetime(2026, 10, 26, 8, 30, tzinfo=TASHKENT),
                ends_at=datetime(2026, 10, 26, 9, 45, tzinfo=TASHKENT),
                building_id="bld-h",
                group_label="I25D",
                expected_students=24.0,
            ),
            TimetableMeetingSlot(
                starts_at=datetime(2026, 10, 26, 11, 30, tzinfo=TASHKENT),
                ends_at=datetime(2026, 10, 26, 12, 45, tzinfo=TASHKENT),
                building_id="bld-h",
                group_label="I25D",
                expected_students=24.0,
            ),
        ]
        at_10_30 = datetime(2026, 10, 26, 10, 30, tzinfo=TASHKENT)

        lounge_base = compute_timetable_place_prior(
            kind=PlaceKind.study_area,
            capacity=48,
            at=at_10_30,
            day_meetings=without_open_class,
            building_id="bld-h",
            nearby_building_ids=["bld-h", "bld-g"],
            timezone=TASHKENT,
        )
        lounge_open = compute_timetable_place_prior(
            kind=PlaceKind.study_area,
            capacity=48,
            at=at_10_30,
            day_meetings=with_i25d_open_class,
            building_id="bld-h",
            nearby_building_ids=["bld-h", "bld-g"],
            timezone=TASHKENT,
        )
        assert lounge_open.open_class_groups_count >= 1
        assert lounge_open.fraction > lounge_base.fraction

        lib_base = compute_timetable_place_prior(
            kind=PlaceKind.library,
            capacity=160,
            at=at_10_30,
            day_meetings=without_open_class,
            building_id="bld-d",
            timezone=TASHKENT,
        )
        lib_open = compute_timetable_place_prior(
            kind=PlaceKind.library,
            capacity=160,
            at=at_10_30,
            day_meetings=with_i25d_open_class,
            building_id="bld-d",
            timezone=TASHKENT,
        )
        assert lib_open.fraction > lib_base.fraction

    def test_morning_heavy_schedule_reduces_afternoon_crowd(self) -> None:
        """When almost all classes are in the morning, afternoon crowd is lower than on a full afternoon day."""
        morning_slots = [
            TimetableMeetingSlot(
                starts_at=datetime(2026, 10, 29, 8, 30, tzinfo=TASHKENT),
                ends_at=datetime(2026, 10, 29, 9, 45, tzinfo=TASHKENT),
                building_id="bld-h",
                group_label=f"M{i}",
                expected_students=24.0,
            )
            for i in range(8)
        ]
        light_afternoon_day = [
            *morning_slots,
            TimetableMeetingSlot(
                starts_at=datetime(2026, 10, 29, 13, 30, tzinfo=TASHKENT),
                ends_at=datetime(2026, 10, 29, 14, 45, tzinfo=TASHKENT),
                building_id="bld-h",
                group_label="AFT1",
                expected_students=20.0,
            ),
        ]
        busy_afternoon_day = [
            *morning_slots,
            *[
                TimetableMeetingSlot(
                    starts_at=datetime(2026, 10, 29, 13, 30, tzinfo=TASHKENT),
                    ends_at=datetime(2026, 10, 29, 14, 45, tzinfo=TASHKENT),
                    building_id="bld-h",
                    group_label=f"AFT{i}",
                    expected_students=24.0,
                )
                for i in range(7)
            ],
            *[
                TimetableMeetingSlot(
                    starts_at=datetime(2026, 10, 29, 15, 0, tzinfo=TASHKENT),
                    ends_at=datetime(2026, 10, 29, 16, 15, tzinfo=TASHKENT),
                    building_id="bld-h",
                    group_label=f"LATE{i}",
                    expected_students=24.0,
                )
                for i in range(5)
            ],
        ]
        at_15_15 = datetime(2026, 10, 29, 15, 15, tzinfo=TASHKENT)
        light_res = compute_timetable_place_prior(
            kind=PlaceKind.library,
            capacity=160,
            at=at_15_15,
            day_meetings=light_afternoon_day,
            building_id="bld-d",
            timezone=TASHKENT,
        )
        busy_res = compute_timetable_place_prior(
            kind=PlaceKind.library,
            capacity=160,
            at=at_15_15,
            day_meetings=busy_afternoon_day,
            building_id="bld-d",
            timezone=TASHKENT,
        )
        assert light_res.afternoon_share < busy_res.afternoon_share
        assert light_res.fraction < busy_res.fraction


# ---------------------------------------------------------------------------
# API Integration tests
# ---------------------------------------------------------------------------


@pytest.mark.db
async def test_ensure_default_places_and_list_busyness(
    seeded_session: AsyncSession,
) -> None:
    places = await crowd_service.ensure_default_places(seeded_session)
    assert len(places) >= 5

    views = await crowd_service.list_places_busyness(seeded_session, at=NOW)
    assert len(views) >= 5
    lib = next(v for v in views if v.place_id == "place-library")
    assert lib.capacity == 160
    assert lib.percentage_of_capacity >= 0.0
    assert lib.provenance in {Provenance.estimated, Provenance.scheduled, Provenance.demo}


@pytest.mark.db
async def test_submit_crowd_report_and_rate_limit(
    seeded_session: AsyncSession,
) -> None:
    places = await crowd_service.ensure_default_places(seeded_session)
    place = places[0]
    user_id = uuid.uuid4()
    user = AppUser(
        id=user_id,
        external_ref=f"sub:{user_id}",
        is_active=True,
        locale="en",
    )
    seeded_session.add(user)
    await seeded_session.flush()

    view = await crowd_service.submit_place_report(
        seeded_session,
        place_id=place.id,
        user_id=user_id,
        level=CrowdLevel.busy,
        at=NOW,
        bucket_minutes=5,
    )
    assert view.place_id == place.id

    # Duplicate report in the same 5-minute bucket should raise ConflictError
    with pytest.raises(Exception) as exc:
        await crowd_service.submit_place_report(
            seeded_session,
            place_id=place.id,
            user_id=user_id,
            level=CrowdLevel.full,
            at=NOW + timedelta(seconds=30),
            bucket_minutes=5,
        )
    assert "duplicate" in str(exc.value).lower() or "already" in str(exc.value).lower()


@pytest.mark.db
async def test_busyness_api_endpoints(
    seeded_client: AsyncClient,
    settings: Settings,
) -> None:
    token = create_access_token(str(uuid.uuid4()), [Role.student], settings=settings)
    headers = {"Authorization": f"Bearer {token}"}

    prefix = "/api/v1"

    # 1. GET /busyness
    r_list = await seeded_client.get(f"{prefix}/busyness")
    assert r_list.status_code == 200
    data = r_list.json()
    assert "places" in data
    assert len(data["places"]) >= 5

    # 2. GET /busyness/place-canteen
    r_place = await seeded_client.get(f"{prefix}/busyness/place-canteen")
    assert r_place.status_code == 200
    p_data = r_place.json()
    assert p_data["place_id"] == "place-canteen"
    assert "percentage_of_capacity" in p_data

    # 3. POST /busyness/place-canteen/report
    r_report = await seeded_client.post(
        f"{prefix}/busyness/place-canteen/report",
        headers=headers,
        json={"level": "busy", "wait_band": "5_10"},
    )
    assert r_report.status_code == 201

    # 4. GET /busyness/place-canteen/best-time
    r_bt = await seeded_client.get(f"{prefix}/busyness/place-canteen/best-time")
    assert r_bt.status_code == 200
    assert "status" in r_bt.json()

    # 5. GET /busyness/place-canteen/queue
    r_q = await seeded_client.get(f"{prefix}/busyness/place-canteen/queue")
    assert r_q.status_code == 200
    q_data = r_q.json()
    assert "expected_wait_minutes" in q_data
    assert "counters" in q_data

    # 6. GET /display/place-canteen
    r_disp = await seeded_client.get(f"{prefix}/display/place-canteen")
    assert r_disp.status_code == 200
    disp_data = r_disp.json()
    assert disp_data["place_id"] == "place-canteen"
    assert "level" in disp_data

    # 7. GET /busyness/flows
    r_flows = await seeded_client.get(f"{prefix}/busyness/flows")
    assert r_flows.status_code == 200
    flows_data = r_flows.json()
    assert "corridor_bins" in flows_data
    assert "entrance_bins" in flows_data

    # 8. GET /busyness/walking-check
    r_walk = await seeded_client.get(f"{prefix}/busyness/walking-check")
    assert r_walk.status_code == 200
    walk_data = r_walk.json()
    assert "issues" in walk_data
