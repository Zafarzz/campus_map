"""Layer 1: Crowds service (brief section 11).

Connects :mod:`app.engines.crowds` and :mod:`app.engines.evidence` to PostgreSQL:
* Place busyness estimation & crowd report submission (section 11.1).
* Hour-of-week "best time to go" profiles with schedule proxy fallback and
  honest ``"not_enough_data"`` refusal (section 11.2).
* Class-change flow aggregation with small-cell suppression (section 11.3).
* Walking-time transition checker across the timetable (section 11.4).
* Canteen queue estimation via M/M/c Erlang C + crowd ``wait_band`` calibration
  (section 11.5).
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.domain.academic import Meeting, MeetingRule, Section
from app.domain.base import CrowdLevel, PlaceKind, Provenance, SignalType
from app.domain.evidence import (
    AttendanceRate,
    CrowdReport,
    OccupancyEstimate,
    ReporterReliability,
    Signal,
)
from app.domain.history import BusynessSnapshot
from app.domain.spatial import Building, Campus, Floor, Place, Room
from app.engines.crowds import (
    DEFAULT_SMALL_CELL_MIN_COUNT,
    DEFAULT_WALKING_SPEED_MPS,
    WAIT_BAND_MINUTES,
    BestTimeProfile,
    CanteenQueueEstimate,
    ClassChangeFlowResult,
    FlowMeeting,
    ScheduledTransitionSlot,
    TimetableMeetingSlot,
    WalkingCheckConfig,
    WalkingTransitionIssue,
    calibrate_arrival_multiplier,
    canteen_arrival_rate,
    check_walking_transitions,
    compute_class_change_flows,
    compute_hourly_profile,
    compute_schedule_proxy_by_how,
    compute_timetable_place_prior,
    mmc_queue_estimate,
    update_reporter_reliability,
)
from app.engines.evidence import (
    DEFAULT_CROWD_FRACTIONS,
    DEFAULT_PRIOR_MEAN,
    EstimatorConfig,
    SignalInput,
    crowd_level_for_fraction,
    estimate_occupancy,
    fraction_for_crowd_level,
)

__all__ = [
    "DEFAULT_CAMPUS_PLACES",
    "PlaceBusynessView",
    "ensure_default_places",
    "get_best_time_to_go",
    "get_canteen_queue_estimate",
    "get_class_change_flows",
    "get_place_busyness",
    "get_walking_transitions_report",
    "list_places_busyness",
    "record_busyness_snapshots",
    "submit_place_report",
]

#: Ordered crowd levels for checking agreement distance between two reports.
_LEVEL_ORDER: dict[CrowdLevel, int] = {
    CrowdLevel.empty: 0,
    CrowdLevel.quiet: 1,
    CrowdLevel.moderate: 2,
    CrowdLevel.busy: 3,
    CrowdLevel.full: 4,
}

#: Default campus venues seeded for Layer 1 (brief section 11).
DEFAULT_CAMPUS_PLACES: tuple[dict[str, Any], ...] = (
    {
        "id": "place-library",
        "building_id": "bld-h",
        "name": "Central Campus Library",
        "kind": PlaceKind.library,
        "capacity": 160,
        "nearby_building_ids": ["bld-d", "bld-c", "bld-b", "bld-h", "bld-g", "bld-i"],
        "config": {
            "floor_id": "bld-d-f1",
            "room_id": "bld-d-f1-f101",
            "tau_minutes": 15,
            "min_reports_for_reported": 3,
            "crowd_fractions": {
                "empty": 0.02,
                "quiet": 0.25,
                "moderate": 0.55,
                "busy": 0.80,
                "full": 0.98,
            },
        },
    },
    {
        "id": "place-canteen",
        "building_id": "bld-i",
        "name": "Main Student Canteen",
        "kind": PlaceKind.canteen,
        "capacity": 200,
        "nearby_building_ids": ["bld-h", "bld-g", "bld-i", "bld-e", "bld-f"],
        "config": {
            "floor_id": "bld-i-f1",
            "room_id": "room-canteen",
            "tau_minutes": 10,
            "min_reports_for_reported": 3,
            "counters": 3,
            "service_rate_per_counter_per_min": 2.5,
            "base_arrival_rate_per_min": 3.0,
            "arrival_multiplier": 1.0,
            "capture_fraction": 0.25,
        },
    },
    {
        "id": "place-gym",
        "building_id": "bld-e",
        "name": "Campus Fitness Gym",
        "kind": PlaceKind.gym,
        "capacity": 60,
        "nearby_building_ids": ["bld-e", "bld-j"],
        "config": {
            "floor_id": "bld-e-f1",
            "room_id": "bld-e-f1-r1",
            "tau_minutes": 15,
            "min_reports_for_reported": 3,
        },
    },
    {
        "id": "place-sports-hall",
        "building_id": "bld-e",
        "name": "Main Sports Hall",
        "kind": PlaceKind.sports_hall,
        "capacity": 120,
        "nearby_building_ids": ["bld-e", "bld-f"],
        "config": {
            "floor_id": "bld-e-f1",
            "room_id": "bld-e-f1-r1",
            "tau_minutes": 15,
            "min_reports_for_reported": 3,
        },
    },
    {
        "id": "place-study-a",
        "building_id": "bld-h",
        "name": "Block A Open Study Lounge",
        "kind": PlaceKind.study_area,
        "capacity": 48,
        "nearby_building_ids": ["bld-h", "bld-g"],
        "config": {
            "floor_id": "bld-h-f1",
            "room_id": "bld-h-f1-a105",
            "tau_minutes": 12,
            "min_reports_for_reported": 2,
        },
    },
    {
        "id": "place-corridor-main",
        "building_id": "bld-g",
        "name": "Block B-C Enclosed Connector Corridor",
        "kind": PlaceKind.corridor,
        "capacity": 150,
        "nearby_building_ids": ["bld-g", "bld-i", "bld-h"],
        "config": {
            "floor_id": "bld-g-f1",
            "room_id": "bld-g-f1-lobby",
            "tau_minutes": 8,
            "min_reports_for_reported": 3,
        },
    },
)


@dataclass(frozen=True, slots=True)
class PlaceBusynessView:
    """Computed busyness reading for one campus place."""

    place_id: str
    name: str
    kind: PlaceKind
    building_id: str | None
    capacity: int | None
    level: CrowdLevel
    percentage_of_capacity: float
    fraction: float
    headcount_likely: int | None
    headcount_low: int | None
    headcount_high: int | None
    provenance: Provenance
    confidence: float
    fresh_reports_count: int
    at: datetime
    inputs: tuple[dict[str, object], ...]
    note: str | None = None
    floor_id: str | None = None
    room_id: str | None = None


async def ensure_default_places(
    session: AsyncSession,
    *,
    campus_id: str = "ajou-tashkent",
    is_demo: bool = True,
) -> list[Place]:
    """Ensure canonical campus places exist so busyness endpoints work immediately."""
    campus = await session.get(Campus, campus_id)
    if campus is None:
        return []

    existing_buildings = set(
        (await session.execute(select(Building.id).where(Building.campus_id == campus_id))).scalars().all()
    )

    places: list[Place] = []
    for spec in DEFAULT_CAMPUS_PLACES:
        place = await session.get(Place, spec["id"])
        bld_id = spec["building_id"] if spec["building_id"] in existing_buildings else None
        if place is None:
            place = Place(
                id=spec["id"],
                campus_id=campus_id,
                building_id=bld_id,
                name=spec["name"],
                kind=spec["kind"],
                capacity=spec["capacity"],
                nearby_building_ids=list(spec["nearby_building_ids"]),
                config=dict(spec["config"]),
                is_active=True,
                is_demo=is_demo,
            )
            session.add(place)
        else:
            if bld_id is not None and place.building_id != bld_id:
                place.building_id = bld_id
            if list(place.nearby_building_ids or []) != list(spec["nearby_building_ids"]):
                place.nearby_building_ids = list(spec["nearby_building_ids"])
            merged_cfg = {**dict(spec["config"]), **dict(place.config or {})}
            for nav_key in ("floor_id", "room_id"):
                if nav_key in spec["config"]:
                    merged_cfg[nav_key] = spec["config"][nav_key]
            if merged_cfg != (place.config or {}):
                place.config = merged_cfg
        places.append(place)
    await session.flush()
    return places


def _estimator_config_for_place(place: Place) -> EstimatorConfig:
    cfg = place.config or {}
    tau_min = float(cfg.get("tau_minutes", 10.0))
    min_rep = int(cfg.get("min_reports_for_reported", 3))
    raw_fractions = cfg.get("crowd_fractions")
    fractions = dict(DEFAULT_CROWD_FRACTIONS)
    if isinstance(raw_fractions, dict):
        for k, v in raw_fractions.items():
            try:
                fractions[CrowdLevel(k)] = float(v)
            except (ValueError, TypeError):
                continue
    return EstimatorConfig(
        prior_weight=1.0,
        tau=timedelta(minutes=max(1.0, tau_min)),
        min_reports_for_reported=max(1, min_rep),
        crowd_fractions=fractions,
    )


def _hour_of_week(at: datetime, tz: ZoneInfo) -> int:
    local = at.astimezone(tz)
    return local.weekday() * 24 + local.hour


async def _load_day_timetable_slots(
    session: AsyncSession,
    at: datetime,
    tz: ZoneInfo,
) -> list[TimetableMeetingSlot]:
    """Load all non-cancelled scheduled meetings on the campus local day of ``at``."""
    local_dt = at.astimezone(tz)
    day_start = datetime(local_dt.year, local_dt.month, local_dt.day, 0, 0, tzinfo=tz)
    day_end = day_start + timedelta(days=1)

    stmt = (
        select(
            Meeting.starts_at,
            Meeting.ends_at,
            Meeting.group_label,
            Floor.building_id,
            Section.enrolled_count,
            Section.cohort,
            Room.capacity,
        )
        .join(Room, Room.id == Meeting.room_id)
        .join(Floor, Floor.id == Room.floor_id)
        .outerjoin(MeetingRule, MeetingRule.id == Meeting.rule_id)
        .outerjoin(Section, Section.id == MeetingRule.section_id)
        .where(
            Meeting.cancelled.is_(False),
            Meeting.starts_at < day_end,
            Meeting.ends_at > day_start,
        )
    )
    rows = (await session.execute(stmt)).all()
    slots: list[TimetableMeetingSlot] = []
    for starts_at, ends_at, group_label, bld_id, enrolled, cohort, room_cap in rows:
        grp = group_label or cohort or None
        tokens = [t.strip() for t in (grp or "").split(",") if t.strip()]
        num_groups = max(1, len(tokens))
        if enrolled is not None and enrolled > 0:
            expected = float(enrolled) * DEFAULT_PRIOR_MEAN
        else:
            expected = max(14.0, min(float(room_cap or 36) * 0.70, 18.0 * num_groups))
        slots.append(
            TimetableMeetingSlot(
                starts_at=starts_at,
                ends_at=ends_at,
                building_id=bld_id,
                group_label=grp,
                expected_students=round(expected, 2),
            )
        )
    return slots


async def _prior_fraction_for_place(
    session: AsyncSession,
    place: Place,
    at: datetime,
    tz: ZoneInfo,
) -> float | None:
    """Compute a prior fraction for ``place`` at ``at`` from timetable + history."""
    if not place.capacity or place.capacity <= 0:
        return None
    day_slots = await _load_day_timetable_slots(session, at, tz)
    tt_prior = compute_timetable_place_prior(
        kind=place.kind,
        capacity=place.capacity,
        at=at,
        day_meetings=day_slots,
        building_id=place.building_id,
        nearby_building_ids=place.nearby_building_ids,
        timezone=tz,
    )
    how = _hour_of_week(at, tz)
    snapshots = (
        (
            await session.execute(
                select(BusynessSnapshot.fraction)
                .where(
                    BusynessSnapshot.place_id == place.id,
                    BusynessSnapshot.hour_of_week == how,
                    BusynessSnapshot.is_demo.is_(False),
                )
                .order_by(BusynessSnapshot.at.desc())
                .limit(20)
            )
        )
        .scalars()
        .all()
    )
    if day_slots:
        if tt_prior.on_campus_students <= 0.0 and tt_prior.fraction == 0.0:
            return 0.0
        if len(snapshots) >= 3:
            sorted_vals = sorted(float(x) for x in snapshots)
            snap_median = sorted_vals[len(sorted_vals) // 2]
            return round(0.80 * tt_prior.fraction + 0.20 * snap_median, 4)
        return tt_prior.fraction

    if len(snapshots) >= 3:
        sorted_vals = sorted(float(x) for x in snapshots)
        return sorted_vals[len(sorted_vals) // 2]
    return 0.0


async def _legacy_prior_fraction_unused(
    session: AsyncSession,
    place: Place,
    at: datetime,
    tz: ZoneInfo,
) -> float | None:
    how = _hour_of_week(at, tz)
    snapshots = (
        (
            await session.execute(
                select(BusynessSnapshot.fraction)
                .where(
                    BusynessSnapshot.place_id == place.id,
                    BusynessSnapshot.hour_of_week == how,
                )
                .order_by(BusynessSnapshot.at.desc())
                .limit(20)
            )
        )
        .scalars()
        .all()
    )
    if len(snapshots) >= 3:
        sorted_vals = sorted(float(x) for x in snapshots)
        mid = len(sorted_vals) // 2
        return sorted_vals[mid]

    # Fall back to schedule-based proxy from classes ending in the surrounding window.
    if not place.capacity or place.capacity <= 0:
        return None
    win_start = at - timedelta(minutes=30)
    win_end = at + timedelta(minutes=15)
    stmt = (
        select(Meeting.ends_at, Floor.building_id, Section.enrolled_count)
        .join(Room, Room.id == Meeting.room_id)
        .join(Floor, Floor.id == Room.floor_id)
        .outerjoin(MeetingRule, MeetingRule.id == Meeting.rule_id)
        .outerjoin(Section, Section.id == MeetingRule.section_id)
        .where(
            Meeting.cancelled.is_(False),
            Meeting.ends_at >= win_start,
            Meeting.ends_at <= win_end,
        )
    )
    if place.nearby_building_ids:
        stmt = stmt.where(Floor.building_id.in_(place.nearby_building_ids))

    rows = (await session.execute(stmt)).all()
    if not rows:
        return None

    total_expected = 0.0
    for _ends_at, _bld_id, enrolled in rows:
        count = enrolled if (enrolled is not None and enrolled > 0) else 25
        total_expected += count * DEFAULT_PRIOR_MEAN * 0.25

    return min(1.0, round(total_expected / place.capacity, 4))


async def get_place_busyness(
    session: AsyncSession,
    place_id: str,
    *,
    at: datetime | None = None,
    timezone: ZoneInfo | None = None,
) -> PlaceBusynessView:
    """Compute current or historical busyness for one campus place."""
    instant = at or datetime.now(UTC)
    tz = timezone or ZoneInfo("Asia/Tashkent")

    place = await session.get(Place, place_id)
    if place is None:
        await ensure_default_places(session)
        place = await session.get(Place, place_id)
    if place is None:
        raise NotFoundError(f"Place {place_id!r} does not exist.", code="place_not_found")

    est_cfg = _estimator_config_for_place(place)
    prior_fraction = await _prior_fraction_for_place(session, place, instant, tz)

    lookback = instant - (est_cfg.tau * 3)
    raw_signals = (
        (
            await session.execute(
                select(Signal)
                .where(
                    Signal.subject_type == "place",
                    Signal.subject_id == place.id,
                    Signal.observed_at >= lookback,
                    Signal.observed_at <= instant,
                )
                .order_by(Signal.observed_at.desc())
            )
        )
        .scalars()
        .all()
    )

    signal_inputs = [
        SignalInput(
            signal_type=row.signal_type,
            value=float(row.value or 0.0),
            observed_at=row.observed_at,
            reliability=row.reliability,
            expires_at=row.expires_at,
            count=row.count,
            ref=str(row.id),
        )
        for row in raw_signals
        if row.value is not None
    ]

    estimate = estimate_occupancy(
        at=instant,
        capacity=place.capacity,
        prior_fraction=prior_fraction,
        signals=signal_inputs,
        config=est_cfg,
    )

    fresh_reports_count = sum(
        1 for item in signal_inputs if item.is_fresh(instant) and item.signal_type is SignalType.crowd_report
    )
    level = estimate.level or crowd_level_for_fraction(estimate.fraction, est_cfg.crowd_fractions)
    pct = round(min(100.0, max(0.0, estimate.fraction * 100.0)), 1)

    cfg = place.config or {}
    raw_floor_id = cfg.get("floor_id")
    raw_room_id = cfg.get("room_id")
    return PlaceBusynessView(
        place_id=place.id,
        name=place.name,
        kind=place.kind,
        building_id=place.building_id,
        capacity=place.capacity,
        level=level,
        percentage_of_capacity=pct,
        fraction=round(estimate.fraction, 4),
        headcount_likely=estimate.headcount_likely,
        headcount_low=estimate.headcount_low,
        headcount_high=estimate.headcount_high,
        provenance=estimate.provenance,
        confidence=round(estimate.confidence, 4),
        fresh_reports_count=fresh_reports_count,
        at=instant,
        inputs=estimate.inputs,
        note=estimate.note,
        floor_id=str(raw_floor_id) if raw_floor_id else None,
        room_id=str(raw_room_id) if raw_room_id else None,
    )


async def list_places_busyness(
    session: AsyncSession,
    *,
    campus_id: str = "ajou-tashkent",
    kind: PlaceKind | None = None,
    building_id: str | None = None,
    at: datetime | None = None,
    timezone: ZoneInfo | None = None,
) -> list[PlaceBusynessView]:
    """List busyness views for all active places on the campus."""
    await ensure_default_places(session, campus_id=campus_id)
    stmt = select(Place).where(
        Place.campus_id == campus_id,
        Place.is_active.is_(True),
    )
    if kind is not None:
        stmt = stmt.where(Place.kind == kind)
    if building_id is not None:
        stmt = stmt.where(Place.building_id == building_id)
    stmt = stmt.order_by(Place.id)

    places = (await session.execute(stmt)).scalars().all()
    views: list[PlaceBusynessView] = []
    for place in places:
        views.append(await get_place_busyness(session, place.id, at=at, timezone=timezone))
    return views


async def submit_place_report(
    session: AsyncSession,
    *,
    place_id: str,
    user_id: uuid.UUID,
    level: CrowdLevel,
    wait_band: str | None = None,
    at: datetime | None = None,
    bucket_minutes: int = 5,
    timezone: ZoneInfo | None = None,
) -> PlaceBusynessView:
    """Record a one-tap crowd report for ``place_id`` and return updated busyness.

    Enforces:
    * Authenticated user only (``user_id`` required).
    * One report per user per place per ``bucket_minutes`` window.
    * Never asks for or stores reporter location (brief sections 3.4, 11.1).
    * Updates per-user reliability when peers have reported in the recent window.
    """
    if wait_band is not None and wait_band not in WAIT_BAND_MINUTES:
        raise ValidationError(
            f"Unsupported wait_band {wait_band!r}; allowed: {sorted(WAIT_BAND_MINUTES)}",
            code="invalid_wait_band",
        )

    instant = at or datetime.now(UTC)
    place = await session.get(Place, place_id)
    if place is None:
        await ensure_default_places(session)
        place = await session.get(Place, place_id)
    if place is None:
        raise NotFoundError(f"Place {place_id!r} does not exist.", code="place_not_found")

    bucket = int(instant.timestamp() // (max(1, bucket_minutes) * 60))

    # Check if this user already submitted a report for this place in the current bucket.
    dup = (
        await session.execute(
            select(CrowdReport.id).where(
                CrowdReport.user_id == user_id,
                CrowdReport.subject_type == "place",
                CrowdReport.subject_id == place_id,
                CrowdReport.bucket_minute == bucket,
            )
        )
    ).scalar_one_or_none()
    if dup is not None:
        raise ConflictError(
            "You have already submitted a crowd report for this place in the current window.",
            code="duplicate_crowd_report",
        )

    est_cfg = _estimator_config_for_place(place)
    rel_row = await session.get(ReporterReliability, user_id)
    if rel_row is None:
        rel_row = ReporterReliability(
            user_id=user_id,
            reliability=0.5,
            agreements=0,
            disagreements=0,
        )
        session.add(rel_row)
        await session.flush()

    # Check peer reports in the last tau window to update reporter reliability.
    peer_cutoff = instant - est_cfg.tau
    peer_reports = (
        (
            await session.execute(
                select(CrowdReport).where(
                    CrowdReport.subject_type == "place",
                    CrowdReport.subject_id == place_id,
                    CrowdReport.user_id != user_id,
                    CrowdReport.created_at >= peer_cutoff,
                )
            )
        )
        .scalars()
        .all()
    )

    if peer_reports:
        my_idx = _LEVEL_ORDER[level]
        peer_mean = sum(_LEVEL_ORDER[r.level] for r in peer_reports) / len(peer_reports)
        agreed = abs(my_idx - peer_mean) <= 1.0
        new_rel, new_agr, new_dis = update_reporter_reliability(
            rel_row.reliability,
            rel_row.agreements,
            rel_row.disagreements,
            agreed=agreed,
        )
        rel_row.reliability = new_rel
        rel_row.agreements = new_agr
        rel_row.disagreements = new_dis

    frac = fraction_for_crowd_level(level, est_cfg.crowd_fractions)
    signal = Signal(
        signal_type=SignalType.crowd_report,
        subject_type="place",
        subject_id=place.id,
        value=frac,
        reliability=rel_row.reliability,
        provenance=Provenance.reported,
        observed_at=instant,
        expires_at=instant + (est_cfg.tau * 2),
        payload={"level": level.value, **({"wait_band": wait_band} if wait_band else {})},
    )
    session.add(signal)
    await session.flush()

    report = CrowdReport(
        user_id=user_id,
        subject_type="place",
        subject_id=place.id,
        level=level,
        bucket_minute=bucket,
        wait_band=wait_band,
        signal_id=signal.id,
    )
    session.add(report)
    try:
        await session.flush()
    except IntegrityError as exc:
        raise ConflictError(
            "You have already submitted a crowd report for this place in the current window.",
            code="duplicate_crowd_report",
        ) from exc

    # If this is a canteen and wait_band was supplied, calibrate arrival_multiplier.
    if place.kind is PlaceKind.canteen and wait_band is not None:
        cfg = dict(place.config or {})
        counters = int(cfg.get("counters", 3))
        mu = float(cfg.get("service_rate_per_counter_per_min", 2.5))
        base_lam = float(cfg.get("base_arrival_rate_per_min", 3.0))
        cur_mult = float(cfg.get("arrival_multiplier", 1.0))
        unit_est = mmc_queue_estimate(
            arrival_rate_per_min=base_lam,
            counters=counters,
            service_rate_per_counter_per_min=mu,
            arrival_multiplier=1.0,
        )
        new_mult = calibrate_arrival_multiplier(
            cur_mult,
            [wait_band],
            predicted_wait_minutes_at_unit_multiplier=max(1.0, unit_est.expected_wait_minutes),
        )
        cfg["arrival_multiplier"] = new_mult
        place.config = cfg
        await session.flush()

    view = await get_place_busyness(session, place.id, at=instant, timezone=timezone)
    session.add(
        OccupancyEstimate(
            subject_type="place",
            subject_id=place.id,
            at=instant,
            fraction=view.fraction,
            headcount_low=view.headcount_low,
            headcount_likely=view.headcount_likely,
            headcount_high=view.headcount_high,
            confidence=view.confidence,
            provenance=view.provenance,
            inputs={"signals": list(view.inputs)},
        )
    )
    await session.flush()
    return view


async def get_best_time_to_go(
    session: AsyncSession,
    place_id: str,
    *,
    min_samples_per_bucket: int = 3,
    min_buckets: int = 1,
    timezone: ZoneInfo | None = None,
) -> BestTimeProfile:
    """Compute the hour-of-week profile for ``place_id`` (brief section 11.2)."""
    tz = timezone or ZoneInfo("Asia/Tashkent")
    place = await session.get(Place, place_id)
    if place is None:
        await ensure_default_places(session)
        place = await session.get(Place, place_id)
    if place is None:
        raise NotFoundError(f"Place {place_id!r} does not exist.", code="place_not_found")

    rows = (
        await session.execute(
            select(BusynessSnapshot.hour_of_week, BusynessSnapshot.fraction).where(
                BusynessSnapshot.place_id == place.id
            )
        )
    ).all()

    samples_by_how: dict[int, list[float]] = defaultdict(list)
    for how, frac in rows:
        samples_by_how[int(how)].append(float(frac))

    # Build schedule-based proxy from MeetingRule / Meeting in nearby buildings.
    proxy_by_how: dict[int, float] = {}
    if place.capacity and place.capacity > 0:
        stmt = (
            select(
                Meeting.ends_at,
                Floor.building_id,
                Section.enrolled_count,
            )
            .join(Room, Room.id == Meeting.room_id)
            .join(Floor, Floor.id == Room.floor_id)
            .outerjoin(MeetingRule, MeetingRule.id == Meeting.rule_id)
            .outerjoin(Section, Section.id == MeetingRule.section_id)
            .where(Meeting.cancelled.is_(False))
            .limit(500)
        )
        if place.nearby_building_ids:
            stmt = stmt.where(Floor.building_id.in_(place.nearby_building_ids))

        meeting_rows = (await session.execute(stmt)).all()
        # Deduplicate by (weekday, local_end_time, building_id) so recurring
        # weeks do not multiply a single weekly slot's headcount.
        seen_slots: dict[tuple[int, time, str], float] = {}
        for ends_at, bld_id, enrolled in meeting_rows:
            local_end = ends_at.astimezone(tz)
            wd = local_end.weekday()
            t_end = time(local_end.hour, local_end.minute)
            expected = float(enrolled if (enrolled is not None and enrolled > 0) else 25) * DEFAULT_PRIOR_MEAN
            seen_slots[(wd, t_end, bld_id)] = max(seen_slots.get((wd, t_end, bld_id), 0.0), expected)

        ending_meetings = [(wd, t_end, bld_id, exp) for (wd, t_end, bld_id), exp in seen_slots.items()]
        proxy_by_how = compute_schedule_proxy_by_how(
            ending_meetings,
            capacity=place.capacity,
            nearby_building_ids=place.nearby_building_ids,
        )

    est_cfg = _estimator_config_for_place(place)
    return compute_hourly_profile(
        place.id,
        samples_by_how,
        min_samples_per_bucket=min_samples_per_bucket,
        min_buckets=min_buckets,
        schedule_proxy_by_how=proxy_by_how,
        crowd_fractions=est_cfg.crowd_fractions,
    )


async def record_busyness_snapshots(
    session: AsyncSession,
    *,
    at: datetime | None = None,
    campus_id: str = "ajou-tashkent",
    timezone: ZoneInfo | None = None,
) -> list[BusynessSnapshot]:
    """Snapshot current busyness for all active places (nightly/periodic job)."""
    instant = at or datetime.now(UTC)
    tz = timezone or ZoneInfo("Asia/Tashkent")
    how = _hour_of_week(instant, tz)

    views = await list_places_busyness(session, campus_id=campus_id, at=instant, timezone=tz)
    snapshots: list[BusynessSnapshot] = []
    for v in views:
        snap = BusynessSnapshot(
            place_id=v.place_id,
            at=instant,
            hour_of_week=how,
            fraction=v.fraction,
            provenance=v.provenance,
            sample_count=v.fresh_reports_count,
            is_demo=(v.provenance is Provenance.demo),
        )
        session.add(snap)
        snapshots.append(snap)
    await session.flush()
    return snapshots


async def get_class_change_flows(
    session: AsyncSession,
    *,
    window_start: datetime,
    window_end: datetime,
    max_gap_minutes: int = 30,
    small_cell_min_count: int = DEFAULT_SMALL_CELL_MIN_COUNT,
) -> ClassChangeFlowResult:
    """Compute class-change corridor & entrance flows for ``[window_start, window_end]``."""
    pad = timedelta(minutes=max_gap_minutes + 90)
    stmt = (
        select(
            Meeting.id,
            Meeting.room_id,
            Meeting.starts_at,
            Meeting.ends_at,
            Meeting.group_label,
            Meeting.subject,
            Floor.building_id,
            Floor.level,
            Section.id.label("section_id"),
            Section.code.label("section_code"),
            Section.cohort,
            Section.enrolled_count,
            Room.capacity,
        )
        .join(Room, Room.id == Meeting.room_id)
        .join(Floor, Floor.id == Room.floor_id)
        .outerjoin(MeetingRule, MeetingRule.id == Meeting.rule_id)
        .outerjoin(Section, Section.id == MeetingRule.section_id)
        .where(
            Meeting.cancelled.is_(False),
            Meeting.starts_at <= window_end + pad,
            Meeting.ends_at >= window_start - pad,
        )
    )
    rows = (await session.execute(stmt)).all()

    # Load learned attendance rates if any exist.
    rate_rows = (await session.execute(select(AttendanceRate))).scalars().all()
    rates_by_sec: dict[uuid.UUID, float] = {r.section_id: r.mean for r in rate_rows}

    flow_meetings: list[FlowMeeting] = []
    for row in rows:
        cohort_key = (
            row.cohort
            or row.group_label
            or row.section_code
            or (str(row.section_id) if row.section_id else None)
            or row.subject
        )
        if not cohort_key or not row.room_id:
            continue
        enrolled = row.enrolled_count
        if enrolled is None or enrolled <= 0:
            # Fallback to 60% of room capacity or 24 when demo schedule omits enrolled_count.
            enrolled = max(12, int((row.capacity or 40) * 0.6))
        att_rate = (
            rates_by_sec.get(row.section_id, DEFAULT_PRIOR_MEAN) if row.section_id else DEFAULT_PRIOR_MEAN
        )
        flow_meetings.append(
            FlowMeeting(
                cohort_key=str(cohort_key),
                building_id=row.building_id,
                room_id=row.room_id,
                starts_at=row.starts_at,
                ends_at=row.ends_at,
                enrolled=int(enrolled),
                attendance_rate=float(att_rate),
                floor_level=int(row.level),
            )
        )

    result = compute_class_change_flows(
        flow_meetings,
        max_gap_minutes=max_gap_minutes,
        small_cell_min_count=small_cell_min_count,
    )
    # Filter bins to those falling within [window_start, window_end].
    corridor_filtered = tuple(
        b for b in result.corridor_bins if b.bin_end > window_start and b.bin_start < window_end
    )
    entrance_filtered = tuple(
        b for b in result.entrance_bins if b.bin_end > window_start and b.bin_start < window_end
    )
    total_raw = round(sum(b.raw_headcount for b in corridor_filtered), 4)
    return ClassChangeFlowResult(
        corridor_bins=corridor_filtered,
        entrance_bins=entrance_filtered,
        total_raw_trips_headcount=total_raw,
        small_cell_min_count=small_cell_min_count,
    )


async def get_walking_transitions_report(
    session: AsyncSession,
    *,
    campus_id: str = "ajou-tashkent",
    walking_speed_mps: float = DEFAULT_WALKING_SPEED_MPS,
    timezone: ZoneInfo | None = None,
) -> list[WalkingTransitionIssue]:
    """Check all timetable meetings on ``campus_id`` for tight walking transitions."""
    tz = timezone or ZoneInfo("Asia/Tashkent")
    stmt = (
        select(
            Meeting.room_id,
            Meeting.starts_at,
            Meeting.ends_at,
            Meeting.teacher_label,
            Meeting.group_label,
            Floor.building_id,
            Floor.level,
            Section.code.label("section_code"),
            Section.cohort,
            Section.teacher_ref,
        )
        .join(Room, Room.id == Meeting.room_id)
        .join(Floor, Floor.id == Room.floor_id)
        .join(Building, Building.id == Floor.building_id)
        .outerjoin(MeetingRule, MeetingRule.id == Meeting.rule_id)
        .outerjoin(Section, Section.id == MeetingRule.section_id)
        .where(
            Building.campus_id == campus_id,
            Meeting.cancelled.is_(False),
        )
        .limit(1500)
    )
    rows = (await session.execute(stmt)).all()

    slots: list[ScheduledTransitionSlot] = []
    seen: set[tuple[str, str, int, time, time, str]] = set()

    for row in rows:
        if not row.room_id:
            continue
        local_start = row.starts_at.astimezone(tz)
        local_end = row.ends_at.astimezone(tz)
        wd = local_start.weekday()
        s_t = time(local_start.hour, local_start.minute)
        e_t = time(local_end.hour, local_end.minute)
        if e_t <= s_t:
            continue

        teacher = row.teacher_ref or row.teacher_label
        if teacher:
            key = ("teacher", str(teacher), wd, s_t, e_t, row.room_id)
            if key not in seen:
                seen.add(key)
                slots.append(
                    ScheduledTransitionSlot(
                        subject_kind="teacher",
                        subject_id=str(teacher),
                        weekday=wd,
                        starts_at=s_t,
                        ends_at=e_t,
                        room_id=row.room_id,
                        building_id=row.building_id,
                        floor_level=int(row.level),
                    )
                )

        cohort = row.cohort or row.group_label or row.section_code
        if cohort:
            key = ("cohort", str(cohort), wd, s_t, e_t, row.room_id)
            if key not in seen:
                seen.add(key)
                slots.append(
                    ScheduledTransitionSlot(
                        subject_kind="cohort",
                        subject_id=str(cohort),
                        weekday=wd,
                        starts_at=s_t,
                        ends_at=e_t,
                        room_id=row.room_id,
                        building_id=row.building_id,
                        floor_level=int(row.level),
                    )
                )

    cfg = WalkingCheckConfig(walking_speed_mps=walking_speed_mps)
    return check_walking_transitions(slots, config=cfg)


async def get_canteen_queue_estimate(
    session: AsyncSession,
    place_id: str = "place-canteen",
    *,
    at: datetime | None = None,
) -> CanteenQueueEstimate:
    """Compute the M/M/c queue estimate for a canteen place (brief section 11.5)."""
    instant = at or datetime.now(UTC)
    place = await session.get(Place, place_id)
    if place is None:
        await ensure_default_places(session)
        place = await session.get(Place, place_id)
    if place is None:
        raise NotFoundError(f"Place {place_id!r} does not exist.", code="place_not_found")

    cfg = place.config or {}
    counters = int(cfg.get("counters", 3))
    mu = float(cfg.get("service_rate_per_counter_per_min", 2.5))
    base_lam = float(cfg.get("base_arrival_rate_per_min", 3.0))
    multiplier = float(cfg.get("arrival_multiplier", 1.0))
    capture = float(cfg.get("capture_fraction", 0.25))

    # Find classes that ended in the last 30 minutes in nearby buildings.
    lookback = instant - timedelta(minutes=30)
    stmt = (
        select(Meeting.ends_at, Section.enrolled_count, Room.capacity)
        .join(Room, Room.id == Meeting.room_id)
        .join(Floor, Floor.id == Room.floor_id)
        .outerjoin(MeetingRule, MeetingRule.id == Meeting.rule_id)
        .outerjoin(Section, Section.id == MeetingRule.section_id)
        .where(
            Meeting.cancelled.is_(False),
            Meeting.ends_at >= lookback,
            Meeting.ends_at <= instant,
        )
    )
    if place.nearby_building_ids:
        stmt = stmt.where(Floor.building_id.in_(place.nearby_building_ids))

    rows = (await session.execute(stmt)).all()
    ending_waves: list[tuple[float, float]] = []
    for ends_at, enrolled, cap in rows:
        mins_since = (instant - ends_at).total_seconds() / 60.0
        headcount = float(
            enrolled if (enrolled is not None and enrolled > 0) else max(15, int((cap or 40) * 0.6))
        )
        ending_waves.append((mins_since, headcount * DEFAULT_PRIOR_MEAN))

    arrival_rate = canteen_arrival_rate(
        base_lam,
        ending_waves=ending_waves,
        capture_fraction=capture,
    )

    # Check recent crowd reports with wait_band in the last 30 minutes.
    wait_reports = (
        (
            await session.execute(
                select(CrowdReport.wait_band).where(
                    CrowdReport.subject_type == "place",
                    CrowdReport.subject_id == place.id,
                    CrowdReport.wait_band.is_not(None),
                    CrowdReport.created_at >= lookback,
                    CrowdReport.created_at <= instant,
                )
            )
        )
        .scalars()
        .all()
    )
    valid_bands = [b for b in wait_reports if b is not None]

    if valid_bands:
        unit_est = mmc_queue_estimate(
            arrival_rate_per_min=arrival_rate,
            counters=counters,
            service_rate_per_counter_per_min=mu,
            arrival_multiplier=1.0,
        )
        multiplier = calibrate_arrival_multiplier(
            multiplier,
            valid_bands,
            predicted_wait_minutes_at_unit_multiplier=max(1.0, unit_est.expected_wait_minutes),
        )

    return mmc_queue_estimate(
        arrival_rate_per_min=arrival_rate,
        counters=counters,
        service_rate_per_counter_per_min=mu,
        arrival_multiplier=multiplier,
        calibrated_reports_count=len(valid_bands),
    )
