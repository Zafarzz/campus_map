"""Layer 1: Crowds pure engine (brief section 11).

Covers:
1. **Place busyness & reporter reliability** (section 11.1): per-user
   reliability updates when a report agrees or disagrees with peers.
2. **Best time to go** (section 11.2): hour-of-week (0..167) median and 80th
   percentile profiles from ``busyness_snapshot`` history, schedule-based proxy
   fallback from nearby ending classes while history is thin, and honest
   ``"not_enough_data"`` refusal when neither exists.
3. **Class-change flows** (section 11.3): origin-destination building trips in
   5-minute bins weighted by ``enrolled * attendance_rate``, building entrance
   loads, conservation of trips, and small-cell suppression (default ``< 10``).
4. **Walking-time check** (section 11.4): straight-line building centroid
   distances (fallback until Phase 5 routing graph), walking speed (default
   1.2 m/s), and stair/floor penalties. Flags transitions where the timetable
   gap is shorter than the required walking time.
5. **Canteen queue estimate** (section 11.5): M/M/c (Erlang C) queueing model
   with arrival surges after class-end waves and calibration from crowd
   ``wait_band`` reports. Always labelled ``provenance = estimated``.

Nothing in this module performs database or network I/O.
"""

from __future__ import annotations

import itertools
import math
from collections import defaultdict
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import datetime, time, timedelta

import numpy as np

from app.domain.base import CrowdLevel, Provenance
from app.engines.evidence import DEFAULT_CROWD_FRACTIONS, crowd_level_for_fraction

__all__ = [
    "BUILDING_CENTROIDS_M",
    "DEFAULT_SMALL_CELL_MIN_COUNT",
    "DEFAULT_WALKING_SPEED_MPS",
    "WAIT_BAND_MINUTES",
    "BestTimeProfile",
    "CanteenQueueConfig",
    "CanteenQueueEstimate",
    "ClassChangeFlowResult",
    "CorridorFlowBin",
    "EntranceFlowBin",
    "FlowMeeting",
    "HourlyBucketProfile",
    "ScheduledTransitionSlot",
    "WalkingCheckConfig",
    "WalkingTransitionIssue",
    "building_distance_m",
    "calibrate_arrival_multiplier",
    "canteen_arrival_rate",
    "check_walking_transitions",
    "compute_class_change_flows",
    "compute_hourly_profile",
    "compute_schedule_proxy_by_how",
    "erlang_c_probability",
    "mmc_queue_estimate",
    "required_walking_seconds",
    "update_reporter_reliability",
]

#: Straight-line building centroids in metres (x_m, z_m), derived from the
#: repository's reference footprints (`src/data/reference-footprints.ts`,
#: `metersPerPixel = 0.3`). Used as the documented fallback distance source
#: until Phase 5 builds the indoor/outdoor routing graph (brief section 11.3).
BUILDING_CENTROIDS_M: dict[str, tuple[float, float]] = {
    "bld-a": (109.5, 29.0),  # Block N (Assembly Hall)
    "bld-b": (186.0, 45.0),  # Block E
    "bld-c": (129.0, 78.0),  # Block D
    "bld-d": (189.0, 96.8),  # Block F
    "bld-e": (99.6, 173.4),  # Sports Complex
    "bld-f": (85.0, 218.2),  # Auxiliary Building
    "bld-g": (179.9, 223.5),  # Block B
    "bld-h": (126.0, 247.5),  # Block A
    "bld-i": (177.0, 256.8),  # Block C
    "bld-j": (57.0, 274.5),  # Dormitory
}

#: Default walking speed in metres per second (brief section 11.4).
#: Documented assumption; configurable per check.
DEFAULT_WALKING_SPEED_MPS: float = 1.2

#: Minimum expected headcount for a flow bin to be shown unsuppressed
#: (brief sections 3.4 and 11.3).
DEFAULT_SMALL_CELL_MIN_COUNT: int = 10

#: Midpoint waiting times (minutes) for crowd-reported canteen wait bands.
WAIT_BAND_MINUTES: dict[str, float] = {
    "under_5": 2.5,
    "5_10": 7.5,
    "10_20": 15.0,
    "over_20": 25.0,
}


# ---------------------------------------------------------------------------
# 11.1 Per-user crowd-report reliability
# ---------------------------------------------------------------------------


def update_reporter_reliability(
    current_reliability: float,
    agreements: int,
    disagreements: int,
    *,
    agreed: bool,
    min_reliability: float = 0.10,
    max_reliability: float = 0.95,
) -> tuple[float, int, int]:
    """Update a user's crowd-report reliability score upon agreement/disagreement.

    Uses a Beta-posterior mean starting from pseudo-counts ``(alpha0=2.5,
    beta0=2.5)`` (mean 0.50), clamped to ``[min_reliability, max_reliability]``.
    """
    new_agreements = max(0, agreements) + (1 if agreed else 0)
    new_disagreements = max(0, disagreements) + (0 if agreed else 1)

    alpha = 2.5 + new_agreements
    beta = 2.5 + new_disagreements
    posterior = alpha / (alpha + beta)
    # Blend slightly with current_reliability if it was manually seeded.
    blended = 0.8 * posterior + 0.2 * current_reliability
    clamped = max(min_reliability, min(max_reliability, blended))
    return round(clamped, 4), new_agreements, new_disagreements


# ---------------------------------------------------------------------------
# 11.2 Best time to go (hour-of-week profiles)
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class HourlyBucketProfile:
    """Summary of one hour-of-week bucket (0 = Monday 00:00 .. 167 = Sunday 23:00)."""

    hour_of_week: int
    weekday: int
    hour: int
    median_fraction: float
    p80_fraction: float
    sample_count: int
    level: CrowdLevel


@dataclass(frozen=True, slots=True)
class BestTimeProfile:
    """Result of computing the 'best time to go' profile for a place."""

    place_id: str
    status: str  # "ok" | "schedule_proxy" | "not_enough_data"
    provenance: Provenance
    buckets: tuple[HourlyBucketProfile, ...]
    best_hours: tuple[int, ...]
    worst_hours: tuple[int, ...]
    min_samples_required: int
    total_samples: int
    note: str | None = None


def compute_hourly_profile(
    place_id: str,
    samples_by_how: Mapping[int, Sequence[float]],
    *,
    min_samples_per_bucket: int = 3,
    min_buckets: int = 1,
    schedule_proxy_by_how: dict[int, float] | None = None,
    crowd_fractions: dict[CrowdLevel, float] | None = None,
) -> BestTimeProfile:
    """Compute hour-of-week median and 80th-percentile busyness profiles.

    * When at least ``min_buckets`` hour-of-week buckets have
      ``>= min_samples_per_bucket`` observations, returns ``status="ok"`` with
      exact median and p80 values.
    * Otherwise, if ``schedule_proxy_by_how`` has non-empty schedule-derived
      expected fractions, falls back to ``status="schedule_proxy"`` with
      ``provenance=Provenance.scheduled``.
    * When neither history nor a schedule proxy is available, returns
      ``status="not_enough_data"`` and refuses to fabricate a profile
      (brief section 11.2).
    """
    fractions_map = crowd_fractions or DEFAULT_CROWD_FRACTIONS
    total_samples = sum(len(vals) for vals in samples_by_how.values())

    valid_buckets: list[HourlyBucketProfile] = []
    for how in sorted(samples_by_how):
        if not 0 <= how <= 167:
            continue
        vals = [float(v) for v in samples_by_how[how] if v >= 0.0]
        if len(vals) < min_samples_per_bucket:
            continue
        arr = np.asarray(vals, dtype=np.float64)
        median_val = float(np.percentile(arr, 50))
        p80_val = float(np.percentile(arr, 80))
        valid_buckets.append(
            HourlyBucketProfile(
                hour_of_week=how,
                weekday=how // 24,
                hour=how % 24,
                median_fraction=round(median_val, 4),
                p80_fraction=round(p80_val, 4),
                sample_count=len(vals),
                level=crowd_level_for_fraction(median_val, fractions_map),
            )
        )

    if len(valid_buckets) >= min_buckets:
        ranked = sorted(valid_buckets, key=lambda b: (b.median_fraction, b.p80_fraction, b.hour_of_week))
        best = tuple(b.hour_of_week for b in ranked[:3])
        worst = tuple(b.hour_of_week for b in reversed(ranked[-3:]))
        return BestTimeProfile(
            place_id=place_id,
            status="ok",
            provenance=Provenance.estimated,
            buckets=tuple(valid_buckets),
            best_hours=best,
            worst_hours=worst,
            min_samples_required=min_samples_per_bucket,
            total_samples=total_samples,
        )

    # Fallback: schedule-based proxy from meetings ending in nearby buildings.
    if schedule_proxy_by_how:
        proxy_buckets: list[HourlyBucketProfile] = []
        for how in sorted(schedule_proxy_by_how):
            if not 0 <= how <= 167:
                continue
            frac = max(0.0, float(schedule_proxy_by_how[how]))
            proxy_buckets.append(
                HourlyBucketProfile(
                    hour_of_week=how,
                    weekday=how // 24,
                    hour=how % 24,
                    median_fraction=round(frac, 4),
                    p80_fraction=round(min(1.0, frac * 1.25), 4),
                    sample_count=0,
                    level=crowd_level_for_fraction(frac, fractions_map),
                )
            )
        if proxy_buckets:
            ranked = sorted(proxy_buckets, key=lambda b: (b.median_fraction, b.hour_of_week))
            best = tuple(b.hour_of_week for b in ranked[:3])
            worst = tuple(b.hour_of_week for b in reversed(ranked[-3:]))
            return BestTimeProfile(
                place_id=place_id,
                status="schedule_proxy",
                provenance=Provenance.scheduled,
                buckets=tuple(proxy_buckets),
                best_hours=best,
                worst_hours=worst,
                min_samples_required=min_samples_per_bucket,
                total_samples=total_samples,
                note=(
                    "Historical snapshot count is below threshold; showing "
                    "schedule-based proxy from classes ending in nearby buildings."
                ),
            )

    return BestTimeProfile(
        place_id=place_id,
        status="not_enough_data",
        provenance=Provenance.estimated,
        buckets=(),
        best_hours=(),
        worst_hours=(),
        min_samples_required=min_samples_per_bucket,
        total_samples=total_samples,
        note="Not enough data yet to compute an hour-of-week profile for this place.",
    )


def compute_schedule_proxy_by_how(
    ending_meetings: Sequence[tuple[int, time, str, float]],
    *,
    capacity: int | None,
    nearby_building_ids: Sequence[str] | None = None,
    capture_fraction: float = 0.25,
) -> dict[int, float]:
    """Build a schedule-based proxy profile from meetings ending near a venue.

    Each item in ``ending_meetings`` is ``(weekday, ends_at_local_time,
    building_id, expected_attendees)``. Meetings ending in the 15 minutes
    before an hour (e.g. 09:45..10:00) or first 15 minutes of the hour
    contribute ``expected_attendees * capture_fraction / capacity`` to that
    hour-of-week bucket (brief section 11.2).
    """
    if not capacity or capacity <= 0 or not ending_meetings:
        return {}

    allowed = set(nearby_building_ids) if nearby_building_ids else None
    demand_by_how: dict[int, float] = defaultdict(float)

    for weekday, ends_at, building_id, expected_attendees in ending_meetings:
        if not 0 <= weekday <= 6 or expected_attendees <= 0:
            continue
        if allowed is not None and building_id not in allowed:
            continue
        end_min = ends_at.hour * 60 + ends_at.minute
        # If a class ends in the last 15 minutes of hour H-1 (e.g. 09:45..09:59),
        # its wave hits hour H (10:00). Otherwise it contributes to its own hour.
        target_hour = (ends_at.hour + 1) % 24 if (end_min % 60) >= 45 else ends_at.hour
        target_weekday = (weekday + 1) % 7 if (ends_at.hour == 23 and (end_min % 60) >= 45) else weekday
        how = target_weekday * 24 + target_hour
        demand_by_how[how] += expected_attendees * capture_fraction

    return {how: min(1.5, round(demand / capacity, 4)) for how, demand in demand_by_how.items() if demand > 0}


# ---------------------------------------------------------------------------
# 11.3 Class-change flows & small-cell suppression
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class FlowMeeting:
    """One scheduled meeting used to build class-change trips."""

    cohort_key: str
    building_id: str
    room_id: str
    starts_at: datetime
    ends_at: datetime
    enrolled: int
    attendance_rate: float = 0.6
    floor_level: int = 1


@dataclass(frozen=True, slots=True)
class CorridorFlowBin:
    """Aggregated flow between two buildings in a 5-minute bin."""

    origin_building_id: str
    destination_building_id: str
    bin_start: datetime
    bin_end: datetime
    distance_m: float
    raw_headcount: float
    displayed_headcount: int | None
    suppressed: bool
    trip_count: int


@dataclass(frozen=True, slots=True)
class EntranceFlowBin:
    """Aggregated entrance load (departures + arrivals) for one building in a 5-minute bin."""

    building_id: str
    bin_start: datetime
    bin_end: datetime
    departures: float
    arrivals: float
    raw_total: float
    displayed_total: int | None
    suppressed: bool


@dataclass(frozen=True, slots=True)
class ClassChangeFlowResult:
    """Complete class-change flow output for a time window."""

    corridor_bins: tuple[CorridorFlowBin, ...]
    entrance_bins: tuple[EntranceFlowBin, ...]
    total_raw_trips_headcount: float
    small_cell_min_count: int
    provenance: Provenance = Provenance.estimated


def building_distance_m(
    building_a_id: str,
    building_b_id: str,
    *,
    centroids: dict[str, tuple[float, float]] | None = None,
) -> float:
    """Straight-line distance in metres between two buildings.

    Returns 0.0 when ``building_a_id == building_b_id``. Falls back to 120.0 m
    when a building ID is not in the centroid table.
    """
    if building_a_id == building_b_id:
        return 0.0
    table = centroids or BUILDING_CENTROIDS_M
    pt_a = table.get(building_a_id)
    pt_b = table.get(building_b_id)
    if pt_a is None or pt_b is None:
        return 120.0
    return round(math.hypot(pt_a[0] - pt_b[0], pt_a[1] - pt_b[1]), 2)


def _floor_to_5min(dt: datetime) -> datetime:
    minute_bin = (dt.minute // 5) * 5
    return dt.replace(minute=minute_bin, second=0, microsecond=0)


def compute_class_change_flows(
    meetings: Sequence[FlowMeeting],
    *,
    max_gap_minutes: int = 30,
    small_cell_min_count: int = DEFAULT_SMALL_CELL_MIN_COUNT,
    centroids: dict[str, tuple[float, float]] | None = None,
) -> ClassChangeFlowResult:
    """Build origin-destination trips between consecutive meetings of each cohort.

    Consecutive meetings of the same ``cohort_key`` separated by
    ``0 <= gap <= max_gap_minutes`` in different buildings generate a trip of
    weight ``enrolled * attendance_rate`` in the 5-minute bin of ``m1.ends_at``.

    Conservation law:
    * ``sum(c.raw_headcount for c in corridor_bins) == total_raw_trips_headcount``
    * ``sum(e.departures for e in entrance_bins) == total_raw_trips_headcount``
    * ``sum(e.arrivals for e in entrance_bins) == total_raw_trips_headcount``
    """
    by_cohort: dict[str, list[FlowMeeting]] = defaultdict(list)
    for m in meetings:
        if m.enrolled > 0 and m.attendance_rate > 0:
            by_cohort[m.cohort_key].append(m)

    corridor_raw: dict[tuple[str, str, datetime], float] = defaultdict(float)
    corridor_trips: dict[tuple[str, str, datetime], int] = defaultdict(int)
    entrance_dep: dict[tuple[str, datetime], float] = defaultdict(float)
    entrance_arr: dict[tuple[str, datetime], float] = defaultdict(float)

    total_headcount = 0.0
    max_gap = timedelta(minutes=max_gap_minutes)

    for cohort_meetings in by_cohort.values():
        ordered = sorted(cohort_meetings, key=lambda item: (item.starts_at, item.ends_at))
        for first, second in itertools.pairwise(ordered):
            gap = second.starts_at - first.ends_at
            if gap < timedelta(0) or gap > max_gap:
                continue
            if first.building_id == second.building_id:
                continue

            weight = float(first.enrolled) * float(first.attendance_rate)
            if weight <= 0:
                continue

            bin_start = _floor_to_5min(first.ends_at)
            key = (first.building_id, second.building_id, bin_start)
            corridor_raw[key] += weight
            corridor_trips[key] += 1
            entrance_dep[(first.building_id, bin_start)] += weight
            entrance_arr[(second.building_id, bin_start)] += weight
            total_headcount += weight

    corridor_bins: list[CorridorFlowBin] = []
    for (orig, dest, bin_start), raw in sorted(
        corridor_raw.items(), key=lambda item: (item[0][2], item[0][0], item[0][1])
    ):
        suppressed = raw < small_cell_min_count
        corridor_bins.append(
            CorridorFlowBin(
                origin_building_id=orig,
                destination_building_id=dest,
                bin_start=bin_start,
                bin_end=bin_start + timedelta(minutes=5),
                distance_m=building_distance_m(orig, dest, centroids=centroids),
                raw_headcount=round(raw, 4),
                displayed_headcount=None if suppressed else round(raw),
                suppressed=suppressed,
                trip_count=corridor_trips[(orig, dest, bin_start)],
            )
        )

    entrance_keys = sorted(
        set(entrance_dep.keys()) | set(entrance_arr.keys()),
        key=lambda item: (item[1], item[0]),
    )
    entrance_bins: list[EntranceFlowBin] = []
    for bld_id, bin_start in entrance_keys:
        dep = entrance_dep.get((bld_id, bin_start), 0.0)
        arr = entrance_arr.get((bld_id, bin_start), 0.0)
        tot = dep + arr
        suppressed = tot < small_cell_min_count
        entrance_bins.append(
            EntranceFlowBin(
                building_id=bld_id,
                bin_start=bin_start,
                bin_end=bin_start + timedelta(minutes=5),
                departures=round(dep, 4),
                arrivals=round(arr, 4),
                raw_total=round(tot, 4),
                displayed_total=None if suppressed else round(tot),
                suppressed=suppressed,
            )
        )

    return ClassChangeFlowResult(
        corridor_bins=tuple(corridor_bins),
        entrance_bins=tuple(entrance_bins),
        total_raw_trips_headcount=round(total_headcount, 4),
        small_cell_min_count=small_cell_min_count,
    )


# ---------------------------------------------------------------------------
# 11.4 Walking-time check
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class WalkingCheckConfig:
    """Configurable assumptions for the walking-time checker (brief section 11.4)."""

    walking_speed_mps: float = DEFAULT_WALKING_SPEED_MPS
    seconds_per_floor: float = 15.0
    building_change_buffer_seconds: float = 30.0
    same_building_base_distance_m: float = 25.0
    max_transition_gap_minutes: int = 30

    def __post_init__(self) -> None:
        if self.walking_speed_mps <= 0:
            raise ValueError("walking_speed_mps must be positive")
        if self.seconds_per_floor < 0:
            raise ValueError("seconds_per_floor must not be negative")


@dataclass(frozen=True, slots=True)
class WalkingTransitionIssue:
    """A pair of consecutive meetings whose gap is shorter than required walking time."""

    subject_kind: str  # "cohort" | "teacher"
    subject_id: str
    weekday: int
    from_room_id: str
    to_room_id: str
    from_building_id: str
    to_building_id: str
    ends_at: str
    starts_at: str
    gap_seconds: float
    required_seconds: float
    distance_m: float
    floor_delta: int
    source_rows: tuple[int, ...] = ()


def required_walking_seconds(
    from_building_id: str,
    to_building_id: str,
    *,
    from_floor_level: int = 1,
    to_floor_level: int = 1,
    config: WalkingCheckConfig | None = None,
    centroids: dict[str, tuple[float, float]] | None = None,
) -> tuple[float, float]:
    """Compute ``(required_seconds, distance_m)`` between two locations.

    For different buildings, the vertical penalty is descending to ground floor
    (level 1) in ``from_building_id`` plus ascending from ground floor to
    ``to_floor_level`` in ``to_building_id``. For the same building, it is
    ``abs(to_floor_level - from_floor_level)``.
    """
    cfg = config or WalkingCheckConfig()
    if from_building_id == to_building_id:
        dist = cfg.same_building_base_distance_m
        floors = abs(to_floor_level - from_floor_level)
        req = (dist / cfg.walking_speed_mps) + floors * cfg.seconds_per_floor
        return round(req, 1), round(dist, 2)

    dist = building_distance_m(from_building_id, to_building_id, centroids=centroids)
    floors_down = abs(from_floor_level - 1)
    floors_up = abs(to_floor_level - 1)
    req = (
        (dist / cfg.walking_speed_mps)
        + (floors_down + floors_up) * cfg.seconds_per_floor
        + cfg.building_change_buffer_seconds
    )
    return round(req, 1), round(dist, 2)


@dataclass(frozen=True, slots=True)
class ScheduledTransitionSlot:
    """Input slot for :func:`check_walking_transitions`."""

    subject_kind: str  # "cohort" | "teacher"
    subject_id: str
    weekday: int
    starts_at: time
    ends_at: time
    room_id: str
    building_id: str
    floor_level: int = 1
    week_pattern: str = "weekly"
    source_row: int | None = None


def _time_to_seconds(t: time) -> float:
    return float(t.hour * 3600 + t.minute * 60 + t.second)


def check_walking_transitions(
    slots: Sequence[ScheduledTransitionSlot],
    *,
    config: WalkingCheckConfig | None = None,
    centroids: dict[str, tuple[float, float]] | None = None,
) -> list[WalkingTransitionIssue]:
    """Find consecutive meetings where the break is shorter than walking time."""
    cfg = config or WalkingCheckConfig()
    max_gap_sec = cfg.max_transition_gap_minutes * 60.0

    grouped: dict[tuple[str, str, int], list[ScheduledTransitionSlot]] = defaultdict(list)
    for slot in slots:
        grouped[(slot.subject_kind, slot.subject_id, slot.weekday)].append(slot)

    issues: list[WalkingTransitionIssue] = []
    seen_pairs: set[tuple[str, str, int, str, str, str, str]] = set()

    for (subject_kind, subject_id, weekday), group in sorted(grouped.items()):
        ordered = sorted(group, key=lambda s: (_time_to_seconds(s.starts_at), _time_to_seconds(s.ends_at)))
        for idx, first in enumerate(ordered):
            for second in ordered[idx + 1 :]:
                # Only compare compatible week patterns (odd vs even do not occur on the same day).
                if (
                    first.week_pattern in {"odd", "even"}
                    and second.week_pattern in {"odd", "even"}
                    and first.week_pattern != second.week_pattern
                ):
                    continue
                if first.room_id == second.room_id:
                    continue

                gap_sec = _time_to_seconds(second.starts_at) - _time_to_seconds(first.ends_at)
                if gap_sec < 0 or gap_sec > max_gap_sec:
                    continue

                req_sec, dist_m = required_walking_seconds(
                    first.building_id,
                    second.building_id,
                    from_floor_level=first.floor_level,
                    to_floor_level=second.floor_level,
                    config=cfg,
                    centroids=centroids,
                )
                if gap_sec < req_sec:
                    dedup_key = (
                        subject_kind,
                        subject_id,
                        weekday,
                        first.room_id,
                        second.room_id,
                        first.ends_at.isoformat(),
                        second.starts_at.isoformat(),
                    )
                    if dedup_key in seen_pairs:
                        continue
                    seen_pairs.add(dedup_key)
                    rows = tuple(r for r in (first.source_row, second.source_row) if r is not None)
                    floor_delta = (
                        abs(second.floor_level - first.floor_level)
                        if first.building_id == second.building_id
                        else abs(first.floor_level - 1) + abs(second.floor_level - 1)
                    )
                    issues.append(
                        WalkingTransitionIssue(
                            subject_kind=subject_kind,
                            subject_id=subject_id,
                            weekday=weekday,
                            from_room_id=first.room_id,
                            to_room_id=second.room_id,
                            from_building_id=first.building_id,
                            to_building_id=second.building_id,
                            ends_at=first.ends_at.isoformat(),
                            starts_at=second.starts_at.isoformat(),
                            gap_seconds=round(gap_sec, 1),
                            required_seconds=req_sec,
                            distance_m=dist_m,
                            floor_delta=floor_delta,
                            source_rows=rows,
                        )
                    )

    return issues


# ---------------------------------------------------------------------------
# 11.5 Canteen queue estimate (M/M/c Erlang C)
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class CanteenQueueConfig:
    """Parameters of a canteen's multi-server queue (brief section 11.5)."""

    counters: int = 3
    service_rate_per_counter_per_min: float = 2.5
    base_arrival_rate_per_min: float = 3.0
    arrival_multiplier: float = 1.0
    capture_fraction: float = 0.25
    surge_window_minutes: float = 15.0

    def __post_init__(self) -> None:
        if self.counters < 1:
            raise ValueError("counters must be >= 1")
        if self.service_rate_per_counter_per_min <= 0:
            raise ValueError("service_rate_per_counter_per_min must be positive")
        if self.base_arrival_rate_per_min < 0:
            raise ValueError("base_arrival_rate_per_min must not be negative")
        if self.arrival_multiplier <= 0:
            raise ValueError("arrival_multiplier must be positive")


@dataclass(frozen=True, slots=True)
class CanteenQueueEstimate:
    """Output of the M/M/c canteen queue estimator (brief section 11.5)."""

    counters: int
    effective_arrival_rate_per_min: float
    service_rate_per_counter_per_min: float
    utilization_rho: float
    probability_of_waiting: float
    expected_queue_length: float
    expected_wait_minutes: float
    wait_minutes_low: float
    wait_minutes_high: float
    saturated: bool
    provenance: Provenance = Provenance.estimated
    confidence: float = 0.65
    assumptions: dict[str, object] = field(default_factory=dict)


def erlang_c_probability(counters: int, arrival_rate: float, service_rate_per_counter: float) -> float:
    """Erlang C probability ``P(wait > 0)`` for an M/M/c queue.

    When ``counters == 1`` and ``rho = arrival_rate / service_rate < 1``, this
    reduces identically to the M/M/1 formula ``P(wait > 0) = rho``.
    When ``rho >= 1``, returns ``1.0``.
    """
    if counters < 1:
        raise ValueError("counters must be >= 1")
    if service_rate_per_counter <= 0:
        raise ValueError("service_rate_per_counter must be positive")
    if arrival_rate <= 0:
        return 0.0

    a = arrival_rate / service_rate_per_counter  # offered load in Erlangs
    rho = a / counters
    if rho >= 1.0:
        return 1.0

    if counters == 1:
        return rho

    sum_terms = sum((a**k) / math.factorial(k) for k in range(counters))
    last_term = ((a**counters) / math.factorial(counters)) * (1.0 / (1.0 - rho))
    p0 = 1.0 / (sum_terms + last_term)
    return last_term * p0


def mmc_queue_estimate(
    *,
    arrival_rate_per_min: float,
    counters: int = 3,
    service_rate_per_counter_per_min: float = 2.5,
    arrival_multiplier: float = 1.0,
    surge_window_minutes: float = 15.0,
    calibrated_reports_count: int = 0,
) -> CanteenQueueEstimate:
    """Compute M/M/c expected queue length and waiting time in minutes.

    Properties guaranteed (and tested in ``tests/test_crowds.py``):
    1. Strictly non-decreasing in ``arrival_rate_per_min``.
    2. Strictly non-increasing in ``counters`` (for positive arrival rate).
    3. Exact reduction to M/M/1 when ``counters == 1`` (``L_q = rho^2 / (1 - rho)``,
       ``W_q = rho / (mu * (1 - rho))``).
    4. Always returns ``provenance = Provenance.estimated``.
    """
    if counters < 1:
        raise ValueError("counters must be >= 1")
    if service_rate_per_counter_per_min <= 0:
        raise ValueError("service_rate_per_counter_per_min must be positive")
    if arrival_rate_per_min < 0:
        raise ValueError("arrival_rate_per_min must not be negative")
    if arrival_multiplier <= 0:
        raise ValueError("arrival_multiplier must be positive")

    lam = arrival_rate_per_min * arrival_multiplier
    mu = service_rate_per_counter_per_min
    capacity_rate = counters * mu
    rho = lam / capacity_rate if capacity_rate > 0 else 0.0

    if lam <= 0.0:
        return CanteenQueueEstimate(
            counters=counters,
            effective_arrival_rate_per_min=0.0,
            service_rate_per_counter_per_min=mu,
            utilization_rho=0.0,
            probability_of_waiting=0.0,
            expected_queue_length=0.0,
            expected_wait_minutes=0.0,
            wait_minutes_low=0.0,
            wait_minutes_high=0.0,
            saturated=False,
            provenance=Provenance.estimated,
            confidence=0.60,
            assumptions={
                "model": "M/M/c (Erlang C)",
                "counters": counters,
                "service_rate_per_counter_per_min": mu,
                "arrival_multiplier": arrival_multiplier,
            },
        )

    saturated = rho >= 0.98
    if not saturated:
        c_prob = erlang_c_probability(counters, lam, mu)
        lq = c_prob * (rho / (1.0 - rho))
        wq = lq / lam
    else:
        # In a temporary class-end surge where arrival rate approaches or exceeds
        # service capacity, steady-state M/M/c diverges; combine the high-load
        # boundary (rho=0.98) with deterministic fluid backlog accumulation over
        # the finite surge window so wait time remains finite and strictly
        # monotonic in arrival rate and counter count.
        rho_cap = 0.98
        lam_cap = rho_cap * capacity_rate
        c_prob = 1.0
        lq_base = erlang_c_probability(counters, lam_cap, mu) * (rho_cap / (1.0 - rho_cap))
        wq_base = lq_base / lam_cap
        excess_rate = max(0.0, lam - lam_cap)
        fluid_backlog = excess_rate * (surge_window_minutes * 0.5)
        lq = lq_base + fluid_backlog
        wq = wq_base + (fluid_backlog / capacity_rate)

    confidence = min(0.85, 0.55 + 0.08 * min(calibrated_reports_count, 4))
    spread = max(0.5, wq * (1.0 - confidence * 0.5))
    wait_low = max(0.0, wq - spread)
    wait_high = wq + spread

    return CanteenQueueEstimate(
        counters=counters,
        effective_arrival_rate_per_min=round(lam, 4),
        service_rate_per_counter_per_min=round(mu, 4),
        utilization_rho=round(rho, 4),
        probability_of_waiting=round(c_prob, 4),
        expected_queue_length=round(lq, 4),
        expected_wait_minutes=round(wq, 4),
        wait_minutes_low=round(wait_low, 2),
        wait_minutes_high=round(wait_high, 2),
        saturated=saturated,
        provenance=Provenance.estimated,
        confidence=round(confidence, 4),
        assumptions={
            "model": "M/M/c (Erlang C)",
            "counters": counters,
            "service_rate_per_counter_per_min": mu,
            "arrival_multiplier": round(arrival_multiplier, 4),
            "calibrated_reports_count": calibrated_reports_count,
        },
    )


def canteen_arrival_rate(
    base_rate_per_min: float,
    *,
    ending_waves: Sequence[tuple[float, float]] = (),
    capture_fraction: float = 0.25,
    surge_decay_minutes: float = 12.0,
) -> float:
    """Compute instantaneous arrival rate (students/min) from base + class-end waves.

    Each item in ``ending_waves`` is ``(minutes_since_class_end, expected_attendees)``
    for classes that ended recently in nearby buildings ( ``0 <= minutes_since <= 30`` ).
    """
    rate = max(0.0, base_rate_per_min)
    if surge_decay_minutes <= 0:
        return rate
    for minutes_since, attendees in ending_waves:
        if minutes_since < 0 or minutes_since > 30 or attendees <= 0:
            continue
        # Exponentially decaying pulse whose integral over [0, inf) is
        # capture_fraction * attendees.
        pulse = (capture_fraction * attendees / surge_decay_minutes) * math.exp(
            -minutes_since / surge_decay_minutes
        )
        rate += pulse
    return round(rate, 4)


def calibrate_arrival_multiplier(
    current_multiplier: float,
    wait_bands: Sequence[str],
    *,
    predicted_wait_minutes_at_unit_multiplier: float,
    min_multiplier: float = 0.4,
    max_multiplier: float = 2.5,
) -> float:
    """Calibrate the arrival-rate multiplier from fresh crowd ``wait_band`` reports."""
    valid_waits = [WAIT_BAND_MINUTES[b] for b in wait_bands if b in WAIT_BAND_MINUTES]
    if not valid_waits:
        return current_multiplier
    observed_mean = sum(valid_waits) / len(valid_waits)
    baseline = max(1.0, predicted_wait_minutes_at_unit_multiplier)
    target_ratio = math.sqrt(max(0.1, observed_mean / baseline))
    blended = 0.5 * current_multiplier + 0.5 * target_ratio
    return round(max(min_multiplier, min(max_multiplier, blended)), 4)
