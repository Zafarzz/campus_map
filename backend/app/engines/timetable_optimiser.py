"""Pure curriculum-based course timetable optimiser engine (Phase 4 Layer 3 §13.4).

Formulates Curriculum-Based Course Timetabling (CB-CTT) using OR-Tools CP-SAT
(`ortools.sat.python.cp_model`) with integer weights, warm-starting via
``model.add_hint``, incremental mode (locking non-movable lectures), and full
before/after metrics and trade-off explanation.

Never mutates database rows directly — returns proposed placements and diffs for
the Scenario Engine (§6.2).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal
from uuid import UUID

from ortools.sat.python import cp_model

OptimiserStatus = Literal[
    "OPTIMAL",
    "FEASIBLE",
    "INFEASIBLE",
    "MODEL_INVALID",
    "UNKNOWN",
]


@dataclass(frozen=True)
class OptimiserRoomInput:
    """Candidate room for timetable scheduling."""

    space_id: UUID
    room_code: str
    building_id: UUID
    building_code: str
    capacity: int
    kind: str = "classroom"
    accessible: bool = True
    features: frozenset[str] = frozenset()
    unavailable_periods: frozenset[tuple[int, int]] = frozenset()  # (day, slot)


@dataclass(frozen=True)
class LectureInput:
    """Single lecture / meeting rule to be placed in (room, day, slot)."""

    lecture_id: UUID
    course_id: UUID
    course_code: str
    cohort_ids: frozenset[UUID]
    teacher_id: UUID | None
    expected_attendance: int
    required_room_kind: str | None = None
    required_features: frozenset[str] = frozenset()
    requires_step_free: bool = False
    min_working_days: int = 1
    # Current / baseline placement for warm-start and incremental diffing
    current_space_id: UUID | None = None
    current_day: int | None = None  # 0=Mon .. 4=Fri
    current_slot: int | None = None  # 0..slots_per_day-1
    # Incremental mode: if True, lecture must stay at its current (room, day, slot)
    locked: bool = False
    # Optional subset of (day, slot) periods when the teacher is unavailable
    teacher_unavailable_periods: frozenset[tuple[int, int]] = frozenset()


@dataclass(frozen=True)
class OptimiserWeights:
    """Integer weights for CB-CTT soft constraints."""

    capacity_waste_per_10_seats: int = 2
    capacity_overflow_per_seat: int = 50
    min_working_days_shortfall: int = 25
    isolated_lecture_penalty: int = 10
    room_stability_penalty: int = 12
    consecutive_walking_per_100m: int = 15
    building_consolidation_bonus: int = 5
    peak_day_load_penalty: int = 4
    incremental_move_penalty: int = 8


@dataclass(frozen=True)
class OptimiserConfig:
    """Configuration for a timetable optimisation run."""

    days: tuple[int, ...] = (0, 1, 2, 3, 4)  # Mon..Fri
    slots_per_day: int = 6
    low_demand_days: frozenset[int] = frozenset({4})  # Friday by default
    hard_capacity: bool = True
    incremental_mode: bool = False
    movable_lecture_ids: frozenset[UUID] | None = None
    blocked_space_ids: frozenset[UUID] = frozenset()
    max_time_seconds: float = 8.0
    num_workers: int = 1
    seed: int = 42
    weights: OptimiserWeights = field(default_factory=OptimiserWeights)


@dataclass(frozen=True)
class PlacementSlot:
    """Assigned (space_id, day, slot) for a single lecture."""

    lecture_id: UUID
    course_id: UUID
    course_code: str
    space_id: UUID
    room_code: str
    building_id: UUID
    building_code: str
    day: int
    slot: int
    moved: bool


@dataclass(frozen=True)
class ScenarioDiffItem:
    """Single change between baseline and proposed timetable."""

    lecture_id: UUID
    course_code: str
    change_kind: Literal["moved", "unchanged", "assigned"]
    before_space_id: UUID | None
    before_room_code: str | None
    before_day: int | None
    before_slot: int | None
    after_space_id: UUID
    after_room_code: str
    after_day: int
    after_slot: int
    reason: str


@dataclass(frozen=True)
class TimetableMetrics:
    """Aggregate quality metrics for a timetable state."""

    total_lectures: int
    hard_conflicts: int
    accessibility_violations: int
    capacity_overflow_seats: int
    wasted_seats: int
    avg_room_utilisation: float
    total_walking_metres: int
    isolated_lectures: int
    room_switches: int
    active_building_Periods: int
    moved_lectures: int


@dataclass(frozen=True)
class OptimiserResult:
    """Full output of the timetable optimiser."""

    feasible: bool
    status: OptimiserStatus
    placements: tuple[PlacementSlot, ...]
    diffs: tuple[ScenarioDiffItem, ...]
    before_metrics: TimetableMetrics
    after_metrics: TimetableMetrics
    summary: str
    tradeoffs: tuple[str, ...]


def compute_timetable_metrics(
    lectures: tuple[LectureInput, ...],
    rooms_by_id: dict[UUID, OptimiserRoomInput],
    placements_by_lecture: dict[UUID, tuple[UUID, int, int]],
    building_distances_m: dict[tuple[UUID, UUID], int],
) -> TimetableMetrics:
    """Evaluate deterministic quality metrics for any (lecture -> (space, day, slot)) map."""
    hard_conflicts = 0
    accessibility_violations = 0
    overflow_seats = 0
    wasted_seats = 0
    utilisations: list[float] = []
    moved_count = 0

    room_period_usage: dict[tuple[UUID, int, int], int] = {}
    teacher_period_usage: dict[tuple[UUID, int, int], int] = {}
    cohort_period_usage: dict[tuple[UUID, int, int], list[tuple[UUID, UUID]]] = {}
    course_rooms: dict[UUID, set[UUID]] = {}
    active_building_periods: set[tuple[UUID, int, int]] = set()

    for lec in lectures:
        placement = placements_by_lecture.get(lec.lecture_id)
        if placement is None:
            hard_conflicts += 1
            continue
        space_id, day, slot = placement
        room = rooms_by_id.get(space_id)
        if room is None:
            hard_conflicts += 1
            continue

        if (
            lec.current_space_id is not None
            and lec.current_day is not None
            and lec.current_slot is not None
            and (space_id, day, slot)
            != (lec.current_space_id, lec.current_day, lec.current_slot)
        ):
            moved_count += 1

        room_period_usage[(space_id, day, slot)] = (
            room_period_usage.get((space_id, day, slot), 0) + 1
        )
        if (day, slot) in room.unavailable_periods:
            hard_conflicts += 1

        if lec.teacher_id is not None:
            teacher_period_usage[(lec.teacher_id, day, slot)] = (
                teacher_period_usage.get((lec.teacher_id, day, slot), 0) + 1
            )
            if (day, slot) in lec.teacher_unavailable_periods:
                hard_conflicts += 1

        for cid in lec.cohort_ids:
            cohort_period_usage.setdefault((cid, day, slot), []).append(
                (lec.lecture_id, room.building_id)
            )

        if lec.requires_step_free and not room.accessible:
            accessibility_violations += 1

        if lec.expected_attendance > room.capacity:
            overflow_seats += lec.expected_attendance - room.capacity
        else:
            wasted_seats += room.capacity - lec.expected_attendance

        if room.capacity > 0:
            utilisations.append(min(1.0, lec.expected_attendance / room.capacity))

        course_rooms.setdefault(lec.course_id, set()).add(space_id)
        active_building_periods.add((room.building_id, day, slot))

    for count in room_period_usage.values():
        if count > 1:
            hard_conflicts += count - 1
    for count in teacher_period_usage.values():
        if count > 1:
            hard_conflicts += count - 1
    for entries in cohort_period_usage.values():
        if len(entries) > 1:
            hard_conflicts += len(entries) - 1

    # Walking distance & isolated lectures per cohort per day
    total_walking_m = 0
    isolated_lectures = 0
    all_cohorts = {cid for lec in lectures for cid in lec.cohort_ids}
    all_days = {
        day for (_, day, _) in placements_by_lecture.values()
    }
    for cid in sorted(all_cohorts, key=str):
        for day in sorted(all_days):
            day_slots = sorted(
                slot
                for (c_id, d, slot), entries in cohort_period_usage.items()
                if c_id == cid and d == day and entries
            )
            if len(day_slots) == 1:
                isolated_lectures += 1
            for idx in range(len(day_slots) - 1):
                s1 = day_slots[idx]
                s2 = day_slots[idx + 1]
                if s2 - s1 > 2:
                    isolated_lectures += 1
                if s2 - s1 == 1:
                    b1 = cohort_period_usage[(cid, day, s1)][0][1]
                    b2 = cohort_period_usage[(cid, day, s2)][0][1]
                    if b1 != b2:
                        dist = building_distances_m.get(
                            (b1, b2),
                            building_distances_m.get((b2, b1), 180),
                        )
                        total_walking_m += dist

    room_switches = sum(max(0, len(rset) - 1) for rset in course_rooms.values())
    avg_util = round(sum(utilisations) / len(utilisations), 4) if utilisations else 0.0

    return TimetableMetrics(
        total_lectures=len(lectures),
        hard_conflicts=hard_conflicts,
        accessibility_violations=accessibility_violations,
        capacity_overflow_seats=overflow_seats,
        wasted_seats=wasted_seats,
        avg_room_utilisation=avg_util,
        total_walking_metres=total_walking_m,
        isolated_lectures=isolated_lectures,
        room_switches=room_switches,
        active_building_Periods=len(active_building_periods),
        moved_lectures=moved_count,
    )


def _diagnose_timetable_infeasibility(
    lectures: tuple[LectureInput, ...],
    rooms: tuple[OptimiserRoomInput, ...],
    config: OptimiserConfig,
) -> str:
    """Produce an actionable plain-language diagnosis when CP-SAT proves INFEASIBLE."""
    usable_rooms = [r for r in rooms if r.space_id not in config.blocked_space_ids]
    if not usable_rooms:
        return "No unblocked candidate rooms are available for scheduling."

    total_slots = len(config.days) * config.slots_per_day * len(usable_rooms)
    if len(lectures) > total_slots:
        return (
            f"Total lectures ({len(lectures)}) exceed total room-period slots "
            f"({total_slots}) across {len(usable_rooms)} room(s)."
        )

    for lec in lectures:
        compatible = [
            r
            for r in usable_rooms
            if (not lec.requires_step_free or r.accessible)
            and (lec.required_room_kind is None or r.kind == lec.required_room_kind)
            and lec.required_features.issubset(r.features)
            and (not config.hard_capacity or r.capacity >= lec.expected_attendance)
        ]
        if not compatible:
            reasons: list[str] = []
            if lec.requires_step_free and not any(r.accessible for r in usable_rooms):
                reasons.append("requires a step-free accessible room")
            if lec.required_room_kind and not any(
                r.kind == lec.required_room_kind for r in usable_rooms
            ):
                reasons.append(f"requires room kind '{lec.required_room_kind}'")
            if lec.required_features:
                reasons.append(
                    f"requires features {sorted(lec.required_features)}"
                )
            if config.hard_capacity and not any(
                r.capacity >= lec.expected_attendance for r in usable_rooms
            ):
                reasons.append(
                    f"expected attendance ({lec.expected_attendance}) exceeds max room capacity "
                    f"({max((r.capacity for r in usable_rooms), default=0)})"
                )
            reason_str = ", ".join(reasons) or "incompatible room constraints"
            return (
                f"Course {lec.course_code} (lecture {lec.lecture_id}) has no compatible "
                f"room: {reason_str}."
            )

    return (
        "Schedule is infeasible due to overlapping teacher/cohort commitments or "
        "locked lectures occupying all compatible periods."
    )


def optimise_timetable(
    lectures: tuple[LectureInput, ...] | list[LectureInput],
    rooms: tuple[OptimiserRoomInput, ...] | list[OptimiserRoomInput],
    *,
    config: OptimiserConfig | None = None,
    building_distances_m: dict[tuple[UUID, UUID], int] | None = None,
) -> OptimiserResult:
    """Solve the Curriculum-Based Course Timetabling problem via OR-Tools CP-SAT."""
    cfg = config or OptimiserConfig()
    distances = building_distances_m or {}
    lecture_tuple = tuple(lectures)
    room_tuple = tuple(rooms)
    rooms_by_id = {r.space_id: r for r in room_tuple}

    # Baseline metrics from current placements
    baseline_map: dict[UUID, tuple[UUID, int, int]] = {}
    for lec in lecture_tuple:
        if (
            lec.current_space_id is not None
            and lec.current_day is not None
            and lec.current_slot is not None
        ):
            baseline_map[lec.lecture_id] = (
                lec.current_space_id,
                lec.current_day,
                lec.current_slot,
            )
    before_metrics = compute_timetable_metrics(
        lecture_tuple, rooms_by_id, baseline_map, distances
    )

    if not lecture_tuple:
        return OptimiserResult(
            feasible=True,
            status="OPTIMAL",
            placements=(),
            diffs=(),
            before_metrics=before_metrics,
            after_metrics=before_metrics,
            summary="No lectures to optimise.",
            tradeoffs=(),
        )

    usable_rooms = [
        r for r in room_tuple if r.space_id not in cfg.blocked_space_ids
    ]
    if not usable_rooms:
        diag = _diagnose_timetable_infeasibility(lecture_tuple, room_tuple, cfg)
        return OptimiserResult(
            feasible=False,
            status="INFEASIBLE",
            placements=(),
            diffs=(),
            before_metrics=before_metrics,
            after_metrics=before_metrics,
            summary=diag,
            tradeoffs=(diag,),
        )

    all_periods = [
        (d, s) for d in cfg.days for s in range(cfg.slots_per_day)
    ]

    model = cp_model.CpModel()
    # x[(lec_idx, room_idx, day, slot)] -> BoolVar
    x: dict[tuple[int, int, int, int], cp_model.IntVar] = {}

    for l_idx, lec in enumerate(lecture_tuple):
        is_fixed = lec.locked or (
            cfg.incremental_mode
            and cfg.movable_lecture_ids is not None
            and lec.lecture_id not in cfg.movable_lecture_ids
            and lec.current_space_id not in cfg.blocked_space_ids
            and lec.current_space_id is not None
            and lec.current_day is not None
            and lec.current_slot is not None
        )

        lec_vars: list[cp_model.IntVar] = []
        for r_idx, room in enumerate(usable_rooms):
            # Hard room compatibility checks
            if lec.requires_step_free and not room.accessible:
                continue
            if (
                lec.required_room_kind is not None
                and room.kind != lec.required_room_kind
            ):
                continue
            if not lec.required_features.issubset(room.features):
                continue
            if cfg.hard_capacity and room.capacity < lec.expected_attendance:
                continue

            for d, s in all_periods:
                if (d, s) in room.unavailable_periods:
                    continue
                if (d, s) in lec.teacher_unavailable_periods:
                    continue
                if is_fixed and (
                    room.space_id != lec.current_space_id
                    or d != lec.current_day
                    or s != lec.current_slot
                ):
                    continue

                var = model.new_bool_var(f"x_{l_idx}_{r_idx}_{d}_{s}")
                x[(l_idx, r_idx, d, s)] = var
                lec_vars.append(var)

                # Warm-start hint from current timetable
                if (
                    lec.current_space_id == room.space_id
                    and lec.current_day == d
                    and lec.current_slot == s
                ):
                    model.add_hint(var, 1)
                elif lec.current_space_id is not None:
                    model.add_hint(var, 0)

        if not lec_vars:
            diag = _diagnose_timetable_infeasibility(lecture_tuple, room_tuple, cfg)
            return OptimiserResult(
                feasible=False,
                status="INFEASIBLE",
                placements=(),
                diffs=(),
                before_metrics=before_metrics,
                after_metrics=before_metrics,
                summary=diag,
                tradeoffs=(diag,),
            )

        # Hard constraint 1: Every lecture is scheduled exactly once
        model.add_exactly_one(lec_vars)

    # Helper: period occupancy variable p_var[(l_idx, d, s)]
    p_var: dict[tuple[int, int, int], cp_model.IntVar] = {}
    for l_idx in range(len(lecture_tuple)):
        for d, s in all_periods:
            room_vars = [
                x[(l_idx, r_idx, d, s)]
                for r_idx in range(len(usable_rooms))
                if (l_idx, r_idx, d, s) in x
            ]
            if not room_vars:
                continue
            if len(room_vars) == 1:
                p_var[(l_idx, d, s)] = room_vars[0]
            else:
                pv = model.new_bool_var(f"p_{l_idx}_{d}_{s}")
                model.add(pv == sum(room_vars))
                p_var[(l_idx, d, s)] = pv

    # Hard constraint 2: At most one lecture per room per period
    for r_idx in range(len(usable_rooms)):
        for d, s in all_periods:
            slot_vars = [
                x[(l_idx, r_idx, d, s)]
                for l_idx in range(len(lecture_tuple))
                if (l_idx, r_idx, d, s) in x
            ]
            if len(slot_vars) > 1:
                model.add_at_most_one(slot_vars)

    # Hard constraint 3: Cohort / curriculum clash-free
    all_cohorts = sorted(
        {cid for lec in lecture_tuple for cid in lec.cohort_ids}, key=str
    )
    for cid in all_cohorts:
        cohort_lecs = [
            idx for idx, lec in enumerate(lecture_tuple) if cid in lec.cohort_ids
        ]
        for d, s in all_periods:
            c_vars = [
                p_var[(l_idx, d, s)]
                for l_idx in cohort_lecs
                if (l_idx, d, s) in p_var
            ]
            if len(c_vars) > 1:
                model.add_at_most_one(c_vars)

    # Hard constraint 4: Teacher clash-free
    all_teachers = sorted(
        {lec.teacher_id for lec in lecture_tuple if lec.teacher_id is not None},
        key=str,
    )
    for tid in all_teachers:
        teacher_lecs = [
            idx for idx, lec in enumerate(lecture_tuple) if lec.teacher_id == tid
        ]
        for d, s in all_periods:
            t_vars = [
                p_var[(l_idx, d, s)]
                for l_idx in teacher_lecs
                if (l_idx, d, s) in p_var
            ]
            if len(t_vars) > 1:
                model.add_at_most_one(t_vars)

    # Soft constraints (weighted integer objective)
    w = cfg.weights
    penalty_terms: list[cp_model.LinearExpr] = []

    # 1. Room capacity waste / overflow + peak day load + incremental move cost
    for (l_idx, r_idx, d, s), var in x.items():
        lec = lecture_tuple[l_idx]
        room = usable_rooms[r_idx]
        coeff = 0
        if room.capacity >= lec.expected_attendance:
            wasted = room.capacity - lec.expected_attendance
            coeff += (wasted // 10) * w.capacity_waste_per_10_seats
        else:
            overflow = lec.expected_attendance - room.capacity
            coeff += overflow * w.capacity_overflow_per_seat

        if d not in cfg.low_demand_days:
            coeff += w.peak_day_load_penalty

        if (
            lec.current_space_id is not None
            and lec.current_day is not None
            and lec.current_slot is not None
            and (room.space_id, d, s)
            != (lec.current_space_id, lec.current_day, lec.current_slot)
        ):
            coeff += w.incremental_move_penalty

        if coeff > 0:
            penalty_terms.append(var * coeff)

    # 2. Minimum working days per course
    courses_map: dict[UUID, list[int]] = {}
    for idx, lec in enumerate(lecture_tuple):
        courses_map.setdefault(lec.course_id, []).append(idx)

    for course_id, lec_indices in courses_map.items():
        target_days = max(
            1,
            min(
                len(cfg.days),
                max(lecture_tuple[i].min_working_days for i in lec_indices),
            ),
        )
        if len(lec_indices) > 1 and target_days > 1:
            day_indicators: list[cp_model.IntVar] = []
            for d in cfg.days:
                d_vars = [
                    p_var[(i, d, s)]
                    for i in lec_indices
                    for s in range(cfg.slots_per_day)
                    if (i, d, s) in p_var
                ]
                if not d_vars:
                    continue
                ind = model.new_bool_var(f"cday_{course_id}_{d}")
                model.add(sum(d_vars) >= ind)
                for dv in d_vars:
                    model.add(ind >= dv)
                day_indicators.append(ind)
            if day_indicators:
                shortfall = model.new_int_var(
                    0, target_days, f"shortfall_{course_id}"
                )
                model.add(shortfall >= target_days - sum(day_indicators))
                penalty_terms.append(shortfall * w.min_working_days_shortfall)

        # 3. Room stability: penalise using multiple distinct rooms for the same course
        if len(lec_indices) > 1:
            for r_idx in range(len(usable_rooms)):
                r_vars = [
                    x[(i, r_idx, d, s)]
                    for i in lec_indices
                    for d, s in all_periods
                    if (i, r_idx, d, s) in x
                ]
                if not r_vars:
                    continue
                used_r = model.new_bool_var(f"croom_{course_id}_{r_idx}")
                model.add(sum(r_vars) >= used_r)
                for rv in r_vars:
                    model.add(used_r >= rv)
                penalty_terms.append(used_r * w.room_stability_penalty)

    # 4. Walking distance between consecutive slots for the same cohort
    distinct_buildings = sorted(
        {r.building_id for r in usable_rooms}, key=str
    )
    if len(distinct_buildings) > 1 and w.consecutive_walking_per_100m > 0:
        for cid in all_cohorts:
            cohort_lecs = [
                idx for idx, lec in enumerate(lecture_tuple) if cid in lec.cohort_ids
            ]
            if len(cohort_lecs) < 2:
                continue
            for d in cfg.days:
                for s in range(cfg.slots_per_day - 1):
                    for b1 in distinct_buildings:
                        for b2 in distinct_buildings:
                            if b1 == b2:
                                continue
                            dist_m = distances.get(
                                (b1, b2), distances.get((b2, b1), 180)
                            )
                            walk_cost = max(
                                1,
                                (dist_m * w.consecutive_walking_per_100m) // 100,
                            )
                            b1_vars = [
                                x[(i, r_idx, d, s)]
                                for i in cohort_lecs
                                for r_idx, rm in enumerate(usable_rooms)
                                if rm.building_id == b1 and (i, r_idx, d, s) in x
                            ]
                            b2_vars = [
                                x[(i, r_idx, d, s + 1)]
                                for i in cohort_lecs
                                for r_idx, rm in enumerate(usable_rooms)
                                if rm.building_id == b2
                                and (i, r_idx, d, s + 1) in x
                            ]
                            if b1_vars and b2_vars:
                                trans = model.new_bool_var(
                                    f"walk_{cid}_{d}_{s}_{b1}_{b2}"
                                )
                                model.add(
                                    trans >= sum(b1_vars) + sum(b2_vars) - 1
                                )
                                penalty_terms.append(trans * walk_cost)

    if penalty_terms:
        model.minimize(sum(penalty_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(cfg.max_time_seconds)
    solver.parameters.num_search_workers = int(cfg.num_workers)
    solver.parameters.random_seed = int(cfg.seed)

    raw_status = solver.solve(model)

    if raw_status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        diag = _diagnose_timetable_infeasibility(lecture_tuple, room_tuple, cfg)
        mapped_status: OptimiserStatus = (
            "MODEL_INVALID"
            if raw_status == cp_model.MODEL_INVALID
            else ("UNKNOWN" if raw_status == cp_model.UNKNOWN else "INFEASIBLE")
        )
        return OptimiserResult(
            feasible=False,
            status=mapped_status,
            placements=(),
            diffs=(),
            before_metrics=before_metrics,
            after_metrics=before_metrics,
            summary=diag,
            tradeoffs=(diag,),
        )

    placements: list[PlacementSlot] = []
    diffs: list[ScenarioDiffItem] = []
    after_map: dict[UUID, tuple[UUID, int, int]] = {}

    for l_idx, lec in enumerate(lecture_tuple):
        chosen: tuple[OptimiserRoomInput, int, int] | None = None
        for r_idx, room in enumerate(usable_rooms):
            for d, s in all_periods:
                if (l_idx, r_idx, d, s) in x and solver.value(
                    x[(l_idx, r_idx, d, s)]
                ) == 1:
                    chosen = (room, d, s)
                    break
            if chosen is not None:
                break
        if chosen is None:
            continue

        room, d, s = chosen
        after_map[lec.lecture_id] = (room.space_id, d, s)
        was_assigned = (
            lec.current_space_id is not None
            and lec.current_day is not None
            and lec.current_slot is not None
        )
        moved = not was_assigned or (
            (room.space_id, d, s)
            != (lec.current_space_id, lec.current_day, lec.current_slot)
        )
        placements.append(
            PlacementSlot(
                lecture_id=lec.lecture_id,
                course_id=lec.course_id,
                course_code=lec.course_code,
                space_id=room.space_id,
                room_code=room.room_code,
                building_id=room.building_id,
                building_code=room.building_code,
                day=d,
                slot=s,
                moved=moved,
            )
        )

        before_room = (
            rooms_by_id.get(lec.current_space_id)
            if lec.current_space_id is not None
            else None
        )
        reason = "Kept existing slot"
        if not was_assigned:
            reason = "Initial schedule placement"
        elif moved:
            reasons: list[str] = []
            if lec.current_space_id in cfg.blocked_space_ids:
                reasons.append("evacuated blocked room")
            if (
                lec.requires_step_free
                and before_room is not None
                and not before_room.accessible
                and room.accessible
            ):
                reasons.append("moved to step-free accessible room")
            if (
                before_room is not None
                and before_room.capacity < lec.expected_attendance <= room.capacity
            ):
                reasons.append("resolved room capacity overflow")
            if not reasons:
                reasons.append("optimised compactness, walking distance, and utilisation")
            reason = "; ".join(reasons)

        diffs.append(
            ScenarioDiffItem(
                lecture_id=lec.lecture_id,
                course_code=lec.course_code,
                change_kind=(
                    "assigned"
                    if not was_assigned
                    else ("moved" if moved else "unchanged")
                ),
                before_space_id=lec.current_space_id,
                before_room_code=before_room.room_code if before_room else None,
                before_day=lec.current_day,
                before_slot=lec.current_slot,
                after_space_id=room.space_id,
                after_room_code=room.room_code,
                after_day=d,
                after_slot=s,
                reason=reason,
            )
        )

    after_metrics = compute_timetable_metrics(
        lecture_tuple, rooms_by_id, after_map, distances
    )
    tradeoffs: list[str] = []
    if before_metrics.accessibility_violations > after_metrics.accessibility_violations:
        tradeoffs.append(
            f"Eliminated {before_metrics.accessibility_violations - after_metrics.accessibility_violations} "
            f"step-free accessibility violation(s)."
        )
    if before_metrics.hard_conflicts > after_metrics.hard_conflicts:
        tradeoffs.append(
            f"Resolved {before_metrics.hard_conflicts - after_metrics.hard_conflicts} hard conflict(s)."
        )
    if after_metrics.total_walking_metres != before_metrics.total_walking_metres:
        delta_w = after_metrics.total_walking_metres - before_metrics.total_walking_metres
        direction = "Reduced" if delta_w < 0 else "Increased"
        tradeoffs.append(
            f"{direction} cohort inter-building walking distance by {abs(delta_w)} m."
        )
    if after_metrics.wasted_seats != before_metrics.wasted_seats:
        delta_s = after_metrics.wasted_seats - before_metrics.wasted_seats
        direction = "Reduced" if delta_s < 0 else "Increased"
        tradeoffs.append(f"{direction} wasted seat capacity by {abs(delta_s)} seat(s).")
    tradeoffs.append(
        f"Moved {after_metrics.moved_lectures} of {after_metrics.total_lectures} lecture(s)."
    )

    resolved_status: OptimiserStatus = (
        "OPTIMAL" if raw_status == cp_model.OPTIMAL else "FEASIBLE"
    )
    summary = (
        f"Timetable optimisation ({resolved_status}): "
        f"{after_metrics.moved_lectures} lecture(s) moved, "
        f"{after_metrics.hard_conflicts} conflicts, "
        f"{after_metrics.accessibility_violations} accessibility violations, "
        f"avg room utilisation {after_metrics.avg_room_utilisation:.1%}."
    )

    return OptimiserResult(
        feasible=True,
        status=resolved_status,
        placements=tuple(placements),
        diffs=tuple(diffs),
        before_metrics=before_metrics,
        after_metrics=after_metrics,
        summary=summary,
        tradeoffs=tuple(tradeoffs),
    )
