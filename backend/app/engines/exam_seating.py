"""Pure exam seat planning engine (Phase 4 Layer 3 §13.2).

Implements a two-stage solver:
1. Capacity-aware room split across candidate rooms (respecting locked room/seat
   assignments, accessibility, and front-row accommodation counts).
2. Seat assignment via OR-Tools CP-SAT (`ortools.sat.python.cp_model`) with
   boolean variables ``x[student, seat]``, spacing constraints, same-course
   adjacency separation (orthogonal and optional diagonal), accommodation
   constraints, deterministic seed, and a constructive "consecutive divide"
   heuristic fallback for large halls or solver timeouts.

Also provides CSV, printable PDF (via ReportLab), and privacy-aware student
slip formatters. Zero database or network dependencies.
"""

from __future__ import annotations

import csv
import io
import math
from dataclasses import dataclass, field
from typing import Literal
from uuid import UUID

from ortools.sat.python import cp_model
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas as pdf_canvas

SolverStatusName = Literal[
    "OPTIMAL",
    "FEASIBLE",
    "INFEASIBLE",
    "MODEL_INVALID",
    "UNKNOWN",
    "HEURISTIC_FALLBACK",
]


@dataclass(frozen=True)
class SeatSpec:
    """Single physical seat in a room's seat grid."""

    seat_id: str
    row: int  # 0-indexed row from front (0 = front row)
    col: int  # 0-indexed column from left
    label: str
    accessible: bool = False
    front_row: bool = False
    usable: bool = True


@dataclass(frozen=True)
class RoomSeatMap:
    """Candidate room and its physical seat grid."""

    space_id: UUID
    room_code: str
    room_name: str
    building_code: str
    rows: int
    cols: int
    seats: tuple[SeatSpec, ...]
    room_accessible: bool = True

    @property
    def usable_seats(self) -> tuple[SeatSpec, ...]:
        return tuple(s for s in self.seats if s.usable)

    def effective_capacity(self, min_spacing: int) -> int:
        """Maximum seats usable under row column spacing ``min_spacing``."""
        spacing = max(1, min_spacing)
        by_row: dict[int, list[SeatSpec]] = {}
        for s in self.usable_seats:
            by_row.setdefault(s.row, []).append(s)
        total = 0
        for row_seats in by_row.values():
            ordered = sorted(row_seats, key=lambda item: item.col)
            last_col: int | None = None
            for seat in ordered:
                if last_col is None or (seat.col - last_col) >= spacing:
                    total += 1
                    last_col = seat.col
        return total


@dataclass(frozen=True)
class StudentExamInput:
    """A student registered for an exam sitting."""

    student_id: UUID
    external_id: str
    display_name: str
    course_code: str
    needs_accessible: bool = False
    needs_front_row: bool = False
    locked_space_id: UUID | None = None
    locked_seat_id: str | None = None


@dataclass(frozen=True)
class ExamPlanSettings:
    """Configurable constraints and solver parameters for exam seating."""

    min_spacing: int = 2
    prevent_same_course_adjacent: bool = True
    prevent_same_course_diagonal: bool = True
    seed: int = 42
    max_time_seconds: float = 5.0
    num_workers: int = 1
    allow_heuristic_fallback: bool = True


@dataclass(frozen=True)
class SeatAssignment:
    """Single assigned student seat in the resulting plan."""

    student_id: UUID
    external_id: str
    display_name: str
    course_code: str
    space_id: UUID
    room_code: str
    seat_id: str
    seat_label: str
    row: int
    col: int
    accessible: bool
    front_row: bool
    locked: bool = False


@dataclass(frozen=True)
class ExamPlanResult:
    """Outcome of the two-stage exam seat planner."""

    feasible: bool
    status: SolverStatusName
    assignments: tuple[SeatAssignment, ...]
    unassigned_student_ids: tuple[UUID, ...]
    explanation: str
    metrics: dict[str, int | float | str] = field(default_factory=dict)


def build_grid_seat_map(
    *,
    space_id: UUID,
    room_code: str,
    room_name: str,
    building_code: str,
    capacity: int,
    room_accessible: bool = True,
    cols: int | None = None,
    broken_seat_ids: frozenset[str] = frozenset(),
) -> RoomSeatMap:
    """Construct a standard rectangular seat grid for a room of ``capacity``."""
    safe_cap = max(1, capacity)
    if cols is None or cols <= 0:
        cols = max(4, min(14, math.ceil(math.sqrt(safe_cap * 1.5))))
    rows = math.ceil(safe_cap / cols)
    seats: list[SeatSpec] = []
    count = 0
    for r in range(rows):
        row_letter = chr(ord("A") + (r % 26))
        if r >= 26:
            row_letter = f"{chr(ord('A') + (r // 26) - 1)}{row_letter}"
        for c in range(cols):
            if count >= safe_cap:
                break
            seat_id = f"{row_letter}{c + 1}"
            is_front = r == 0
            is_accessible = room_accessible and (r == 0 and c in (0, cols - 1))
            seats.append(
                SeatSpec(
                    seat_id=seat_id,
                    row=r,
                    col=c,
                    label=f"{row_letter}-{c + 1}",
                    accessible=is_accessible,
                    front_row=is_front,
                    usable=seat_id not in broken_seat_ids,
                )
            )
            count += 1
    return RoomSeatMap(
        space_id=space_id,
        room_code=room_code,
        room_name=room_name,
        building_code=building_code,
        rows=rows,
        cols=cols,
        seats=tuple(seats),
        room_accessible=room_accessible,
    )


def _select_spaced_seats_in_room(
    room: RoomSeatMap,
    min_spacing: int,
    locked_seat_ids: set[str],
) -> list[SeatSpec]:
    """Select maximal spaced subset of usable seats per row, keeping locked seats."""
    spacing = max(1, min_spacing)
    by_row: dict[int, list[SeatSpec]] = {}
    for s in room.usable_seats:
        by_row.setdefault(s.row, []).append(s)

    selected: list[SeatSpec] = []
    for r in sorted(by_row.keys()):
        row_seats = sorted(by_row[r], key=lambda item: item.col)
        locked_in_row = [s for s in row_seats if s.seat_id in locked_seat_ids]
        chosen_row: list[SeatSpec] = list(locked_in_row)
        for s in row_seats:
            if s.seat_id in locked_seat_ids:
                continue
            if all(abs(s.col - existing.col) >= spacing for existing in chosen_row):
                chosen_row.append(s)
        chosen_row.sort(key=lambda item: item.col)
        selected.extend(chosen_row)
    return selected


def _diagnose_infeasibility(
    students: tuple[StudentExamInput, ...],
    rooms: tuple[RoomSeatMap, ...],
    settings: ExamPlanSettings,
) -> str:
    """Return a clear, actionable human-readable infeasibility explanation."""
    if not rooms:
        return "No candidate exam rooms provided: add at least one room."

    total_students = len(students)
    total_effective_seats = sum(
        r.effective_capacity(settings.min_spacing) for r in rooms
    )
    if total_students > total_effective_seats:
        deficit = total_students - total_effective_seats
        return (
            f"{deficit} more seats needed at spacing {settings.min_spacing}: "
            f"reduce spacing or add a room (have {total_effective_seats} effective "
            f"seats across {len(rooms)} room(s) for {total_students} students)."
        )

    needed_accessible = sum(1 for s in students if s.needs_accessible)
    available_accessible = sum(
        1
        for r in rooms
        for seat in _select_spaced_seats_in_room(r, settings.min_spacing, set())
        if seat.accessible and r.room_accessible
    )
    if needed_accessible > available_accessible:
        deficit = needed_accessible - available_accessible
        return (
            f"{deficit} more accessible seats needed: {needed_accessible} students "
            f"require step-free/accessible seating but only {available_accessible} "
            f"accessible seats are available at spacing {settings.min_spacing}."
        )

    needed_front = sum(1 for s in students if s.needs_front_row)
    available_front = sum(
        1
        for r in rooms
        for seat in _select_spaced_seats_in_room(r, settings.min_spacing, set())
        if seat.front_row
    )
    if needed_front > available_front:
        deficit = needed_front - available_front
        return (
            f"{deficit} more front-row seats needed: {needed_front} students "
            f"require front-row seating but only {available_front} front-row seats "
            f"are available at spacing {settings.min_spacing}."
        )

    # Check locked seats validity
    seat_lookup: dict[tuple[UUID, str], SeatSpec] = {}
    for r in rooms:
        for seat in r.usable_seats:
            seat_lookup[(r.space_id, seat.seat_id)] = seat

    seen_locks: set[tuple[UUID, str]] = set()
    for s in students:
        if s.locked_space_id is not None and s.locked_seat_id is not None:
            key = (s.locked_space_id, s.locked_seat_id)
            if key not in seat_lookup:
                return (
                    f"Locked seat {s.locked_seat_id} in room {s.locked_space_id} "
                    f"for student {s.external_id} does not exist or is marked unusable."
                )
            if key in seen_locks:
                return (
                    f"Duplicate locked seat {s.locked_seat_id} in room "
                    f"{s.locked_space_id}: two students cannot lock the same seat."
                )
            seen_locks.add(key)

    return (
        f"Could not satisfy same-course separation and spacing={settings.min_spacing} "
        f"simultaneously for {total_students} students across {len(rooms)} room(s): "
        f"reduce spacing, allow same-course adjacency, or add another room."
    )


def _are_seats_adjacent(
    s1: SeatSpec,
    s2: SeatSpec,
    *,
    include_diagonal: bool,
) -> bool:
    dr = abs(s1.row - s2.row)
    dc = abs(s1.col - s2.col)
    if dr == 0 and dc == 0:
        return False
    if include_diagonal:
        return dr <= 1 and dc <= 1
    return (dr + dc) == 1


def _consecutive_divide_heuristic(
    students: tuple[StudentExamInput, ...],
    rooms: tuple[RoomSeatMap, ...],
    settings: ExamPlanSettings,
) -> ExamPlanResult:
    """Constructive 'consecutive divide' fallback for large halls or tight limits.

    Interleaves courses across alternating column parities and rows so students
    from the same course are separated while respecting locked seats and
    accommodations.
    """
    locked_by_room: dict[UUID, set[str]] = {}
    for st in students:
        if st.locked_space_id is not None and st.locked_seat_id is not None:
            locked_by_room.setdefault(st.locked_space_id, set()).add(st.locked_seat_id)

    # Gather candidate spaced seats across rooms in deterministic order
    candidate_slots: list[tuple[RoomSeatMap, SeatSpec]] = []
    for room in rooms:
        spaced = _select_spaced_seats_in_room(
            room,
            settings.min_spacing,
            locked_by_room.get(room.space_id, set()),
        )
        #Consecutive divide ordering: even rows then odd rows to spread courses
        even_rows = [s for s in spaced if s.row % 2 == 0]
        odd_rows = [s for s in spaced if s.row % 2 == 1]
        for s in even_rows + odd_rows:
            candidate_slots.append((room, s))

    if len(candidate_slots) < len(students):
        return ExamPlanResult(
            feasible=False,
            status="INFEASIBLE",
            assignments=(),
            unassigned_student_ids=tuple(s.student_id for s in students),
            explanation=_diagnose_infeasibility(students, rooms, settings),
        )

    used_slot_keys: set[tuple[UUID, str]] = set()
    assignments: list[SeatAssignment] = []
    unassigned: list[StudentExamInput] = []

    # 1. Place locked students first
    remaining_students: list[StudentExamInput] = []
    slot_lookup: dict[tuple[UUID, str], tuple[RoomSeatMap, SeatSpec]] = {
        (r.space_id, s.seat_id): (r, s) for r, s in candidate_slots
    }
    for st in students:
        if st.locked_space_id is not None and st.locked_seat_id is not None:
            key = (st.locked_space_id, st.locked_seat_id)
            found = slot_lookup.get(key)
            if found is None or key in used_slot_keys:
                return ExamPlanResult(
                    feasible=False,
                    status="INFEASIBLE",
                    assignments=(),
                    unassigned_student_ids=tuple(s.student_id for s in students),
                    explanation=_diagnose_infeasibility(students, rooms, settings),
                )
            room, seat = found
            used_slot_keys.add(key)
            assignments.append(
                SeatAssignment(
                    student_id=st.student_id,
                    external_id=st.external_id,
                    display_name=st.display_name,
                    course_code=st.course_code,
                    space_id=room.space_id,
                    room_code=room.room_code,
                    seat_id=seat.seat_id,
                    seat_label=seat.label,
                    row=seat.row,
                    col=seat.col,
                    accessible=seat.accessible,
                    front_row=seat.front_row,
                    locked=True,
                )
            )
        else:
            remaining_students.append(st)

    # 2. Order remaining students: accommodations first, then interleaved by course
    accom_students = sorted(
        [s for s in remaining_students if s.needs_accessible or s.needs_front_row],
        key=lambda s: (not s.needs_accessible, not s.needs_front_row, s.external_id),
    )
    regular_students = [
        s for s in remaining_students if not (s.needs_accessible or s.needs_front_row)
    ]

    by_course: dict[str, list[StudentExamInput]] = {}
    for reg_st in sorted(regular_students, key=lambda item: item.external_id):
        by_course.setdefault(reg_st.course_code, []).append(reg_st)

    interleaved_regular: list[StudentExamInput] = []
    course_queues = [
        by_course[k]
        for k in sorted(by_course.keys(), key=lambda k: (-len(by_course[k]), k))
    ]
    while any(course_queues):
        for q in course_queues:
            if q:
                interleaved_regular.append(q.pop(0))

    ordered_to_place = accom_students + interleaved_regular

    for st in ordered_to_place:
        placed = False
        for room, seat in candidate_slots:
            key = (room.space_id, seat.seat_id)
            if key in used_slot_keys:
                continue
            if st.needs_accessible and not (seat.accessible and room.room_accessible):
                continue
            if st.needs_front_row and not seat.front_row:
                continue
            used_slot_keys.add(key)
            assignments.append(
                SeatAssignment(
                    student_id=st.student_id,
                    external_id=st.external_id,
                    display_name=st.display_name,
                    course_code=st.course_code,
                    space_id=room.space_id,
                    room_code=room.room_code,
                    seat_id=seat.seat_id,
                    seat_label=seat.label,
                    row=seat.row,
                    col=seat.col,
                    accessible=seat.accessible,
                    front_row=seat.front_row,
                    locked=False,
                )
            )
            placed = True
            break
        if not placed:
            unassigned.append(st)

    if unassigned:
        return ExamPlanResult(
            feasible=False,
            status="INFEASIBLE",
            assignments=(),
            unassigned_student_ids=tuple(s.student_id for s in unassigned),
            explanation=_diagnose_infeasibility(students, rooms, settings),
        )

    assignments.sort(key=lambda a: (a.room_code, a.row, a.col))
    return ExamPlanResult(
        feasible=True,
        status="HEURISTIC_FALLBACK",
        assignments=tuple(assignments),
        unassigned_student_ids=(),
        explanation="Assigned seats via deterministic consecutive-divide heuristic.",
        metrics={
            "total_students": len(students),
            "rooms_used": len({a.space_id for a in assignments}),
            "min_spacing": settings.min_spacing,
        },
    )


def plan_exam_seating(
    students: tuple[StudentExamInput, ...] | list[StudentExamInput],
    rooms: tuple[RoomSeatMap, ...] | list[RoomSeatMap],
    settings: ExamPlanSettings | None = None,
) -> ExamPlanResult:
    """Plan exam seating across one or more candidate rooms using CP-SAT.

    Stage 1 validates total effective capacity, accommodations, and locked seats,
    and selects the minimal prefix of candidate rooms needed (while always keeping
    any room referenced by a locked seat).
    Stage 2 formulates and solves the CP-SAT assignment problem ``x[student, seat]``.
    """
    cfg = settings or ExamPlanSettings()
    student_tuple = tuple(
        sorted(students, key=lambda s: (s.course_code, s.external_id, str(s.student_id)))
    )
    room_tuple = tuple(rooms)

    if not student_tuple:
        return ExamPlanResult(
            feasible=True,
            status="OPTIMAL",
            assignments=(),
            unassigned_student_ids=(),
            explanation="No students to seat.",
            metrics={"total_students": 0, "rooms_used": 0, "min_spacing": cfg.min_spacing},
        )

    if not room_tuple:
        return ExamPlanResult(
            feasible=False,
            status="INFEASIBLE",
            assignments=(),
            unassigned_student_ids=tuple(s.student_id for s in student_tuple),
            explanation=_diagnose_infeasibility(student_tuple, room_tuple, cfg),
        )

    # Pre-check obvious capacity/accommodation infeasibility
    total_effective = sum(r.effective_capacity(cfg.min_spacing) for r in room_tuple)
    if len(student_tuple) > total_effective:
        return ExamPlanResult(
            feasible=False,
            status="INFEASIBLE",
            assignments=(),
            unassigned_student_ids=tuple(s.student_id for s in student_tuple),
            explanation=_diagnose_infeasibility(student_tuple, room_tuple, cfg),
        )

    # Stage 1: Capacity-aware room selection
    locked_room_ids = {
        s.locked_space_id for s in student_tuple if s.locked_space_id is not None
    }
    ordered_rooms = sorted(
        room_tuple,
        key=lambda r: (
            r.space_id not in locked_room_ids,
            -r.effective_capacity(cfg.min_spacing),
            r.room_code,
        ),
    )

    selected_rooms: list[RoomSeatMap] = []
    accumulated_cap = 0
    needed_accessible = sum(1 for s in student_tuple if s.needs_accessible)
    needed_front = sum(1 for s in student_tuple if s.needs_front_row)
    accumulated_acc = 0
    accumulated_front = 0

    for r in ordered_rooms:
        if (
            r.space_id in locked_room_ids
            or accumulated_cap < len(student_tuple)
            or accumulated_acc < needed_accessible
            or accumulated_front < needed_front
        ):
            selected_rooms.append(r)
            accumulated_cap += r.effective_capacity(cfg.min_spacing)
            accumulated_acc += sum(
                1 for seat in r.usable_seats if seat.accessible and r.room_accessible
            )
            accumulated_front += sum(1 for seat in r.usable_seats if seat.front_row)

    # Build flat list of usable (room, seat) pairs across selected rooms
    all_seats: list[tuple[RoomSeatMap, SeatSpec]] = []
    seat_index_by_key: dict[tuple[UUID, str], int] = {}
    for r in selected_rooms:
        for seat in r.usable_seats:
            idx = len(all_seats)
            all_seats.append((r, seat))
            seat_index_by_key[(r.space_id, seat.seat_id)] = idx

    num_students = len(student_tuple)
    num_seats = len(all_seats)

    # If the instance is huge (> 25,000 boolean variables), use consecutive divide heuristic
    if num_students * num_seats > 25_000 and cfg.allow_heuristic_fallback:
        return _consecutive_divide_heuristic(student_tuple, tuple(selected_rooms), cfg)

    # Stage 2: OR-Tools CP-SAT model
    model = cp_model.CpModel()

    # Boolean variables x[i, j] for student i assigned to seat j
    x: dict[tuple[int, int], cp_model.IntVar] = {}
    for i, st in enumerate(student_tuple):
        compatible_seats: list[int] = []
        for j, (room, seat) in enumerate(all_seats):
            if st.locked_space_id is not None and room.space_id != st.locked_space_id:
                continue
            if st.locked_seat_id is not None and seat.seat_id != st.locked_seat_id:
                continue
            if st.needs_accessible and not (seat.accessible and room.room_accessible):
                continue
            if st.needs_front_row and not seat.front_row:
                continue
            var = model.new_bool_var(f"x_{i}_{j}")
            x[(i, j)] = var
            compatible_seats.append(j)

        if not compatible_seats:
            return ExamPlanResult(
                feasible=False,
                status="INFEASIBLE",
                assignments=(),
                unassigned_student_ids=tuple(s.student_id for s in student_tuple),
                explanation=_diagnose_infeasibility(
                    student_tuple, tuple(selected_rooms), cfg
                ),
            )
        model.add_exactly_one(x[(i, j)] for j in compatible_seats)

    # At most one student per seat
    seat_occupied: dict[int, cp_model.IntVar] = {}
    for j in range(num_seats):
        vars_for_seat = [x[(i, j)] for i in range(num_students) if (i, j) in x]
        if not vars_for_seat:
            continue
        model.add_at_most_one(vars_for_seat)
        occ = model.new_bool_var(f"occ_{j}")
        model.add(occ == sum(vars_for_seat))
        seat_occupied[j] = occ

    # Minimum spacing constraint within the same room and row
    spacing = max(1, cfg.min_spacing)
    if spacing > 1:
        for j1 in range(num_seats):
            if j1 not in seat_occupied:
                continue
            r1, s1 = all_seats[j1]
            for j2 in range(j1 + 1, num_seats):
                if j2 not in seat_occupied:
                    continue
                r2, s2 = all_seats[j2]
                if (
                    r1.space_id == r2.space_id
                    and s1.row == s2.row
                    and abs(s1.col - s2.col) < spacing
                ):
                    model.add(seat_occupied[j1] + seat_occupied[j2] <= 1)

    # Same-course adjacency separation when multiple courses share a room
    distinct_courses = sorted({s.course_code for s in student_tuple})
    if cfg.prevent_same_course_adjacent and len(distinct_courses) > 1:
        for j1 in range(num_seats):
            r1, s1 = all_seats[j1]
            for j2 in range(j1 + 1, num_seats):
                r2, s2 = all_seats[j2]
                if r1.space_id != r2.space_id:
                    continue
                if _are_seats_adjacent(
                    s1,
                    s2,
                    include_diagonal=cfg.prevent_same_course_diagonal,
                ):
                    for course in distinct_courses:
                        course_students = [
                            i
                            for i, st in enumerate(student_tuple)
                            if st.course_code == course
                        ]
                        vars_j1 = [
                            x[(i, j1)] for i in course_students if (i, j1) in x
                        ]
                        vars_j2 = [
                            x[(i, j2)] for i in course_students if (i, j2) in x
                        ]
                        if vars_j1 and vars_j2:
                            model.add(sum(vars_j1) + sum(vars_j2) <= 1)

    # Objective: prefer front rows and compact rooms, with deterministic tie-breaking
    objective_terms: list[cp_model.LinearExpr] = []
    for (i, j), var in x.items():
        room, seat = all_seats[j]
        room_rank = selected_rooms.index(room)
        seat_cost = room_rank * 1000 + seat.row * 100 + seat.col * 10
        tie_break = (i + 1) * (j + 1)
        cost = seat_cost * 1000 + tie_break
        objective_terms.append(var * cost)
    model.minimize(sum(objective_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(cfg.max_time_seconds)
    solver.parameters.num_search_workers = int(cfg.num_workers)
    solver.parameters.random_seed = int(cfg.seed)
    if cfg.num_workers > 1:
        solver.parameters.interleave_search = True

    raw_status = solver.solve(model)
    status_name = solver.status_name(raw_status)

    if raw_status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        assignments: list[SeatAssignment] = []
        for i, st in enumerate(student_tuple):
            for j, (room, seat) in enumerate(all_seats):
                if (i, j) in x and solver.value(x[(i, j)]) == 1:
                    is_locked = (
                        st.locked_space_id is not None
                        and st.locked_seat_id is not None
                    )
                    assignments.append(
                        SeatAssignment(
                            student_id=st.student_id,
                            external_id=st.external_id,
                            display_name=st.display_name,
                            course_code=st.course_code,
                            space_id=room.space_id,
                            room_code=room.room_code,
                            seat_id=seat.seat_id,
                            seat_label=seat.label,
                            row=seat.row,
                            col=seat.col,
                            accessible=seat.accessible,
                            front_row=seat.front_row,
                            locked=is_locked,
                        )
                    )
                    break
        assignments.sort(key=lambda a: (a.room_code, a.row, a.col))
        resolved_status: SolverStatusName = (
            "OPTIMAL" if raw_status == cp_model.OPTIMAL else "FEASIBLE"
        )
        return ExamPlanResult(
            feasible=True,
            status=resolved_status,
            assignments=tuple(assignments),
            unassigned_student_ids=(),
            explanation=(
                f"Seated {len(assignments)} students across "
                f"{len({a.space_id for a in assignments})} room(s) ({resolved_status})."
            ),
            metrics={
                "total_students": len(assignments),
                "rooms_used": len({a.space_id for a in assignments}),
                "min_spacing": cfg.min_spacing,
                "objective_value": float(solver.objective_value),
            },
        )

    if raw_status == cp_model.UNKNOWN and cfg.allow_heuristic_fallback:
        return _consecutive_divide_heuristic(
            student_tuple, tuple(selected_rooms), cfg
        )

    # If selected_rooms was a subset of room_tuple, retry with all rooms before failing
    if len(selected_rooms) < len(room_tuple):
        return _consecutive_divide_heuristic(student_tuple, room_tuple, cfg)

    mapped_status: SolverStatusName = (
        "MODEL_INVALID"
        if raw_status == cp_model.MODEL_INVALID
        else ("UNKNOWN" if raw_status == cp_model.UNKNOWN else "INFEASIBLE")
    )
    return ExamPlanResult(
        feasible=False,
        status=mapped_status,
        assignments=(),
        unassigned_student_ids=tuple(s.student_id for s in student_tuple),
        explanation=_diagnose_infeasibility(student_tuple, room_tuple, cfg),
        metrics={"solver_status": status_name},
    )


def format_exam_plan_csv(
    assignments: tuple[SeatAssignment, ...] | list[SeatAssignment],
    *,
    include_student_names: bool = False,
) -> str:
    """Render an exam seating assignment list to CSV."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    headers = [
        "room_code",
        "seat_id",
        "seat_label",
        "row",
        "col",
        "student_external_id",
        "course_code",
        "accessible",
        "front_row",
        "locked",
    ]
    if include_student_names:
        headers.insert(6, "student_name")
    writer.writerow(headers)

    for a in sorted(assignments, key=lambda item: (item.room_code, item.row, item.col)):
        row_data: list[str | int | bool] = [
            a.room_code,
            a.seat_id,
            a.seat_label,
            a.row + 1,
            a.col + 1,
            a.external_id,
            a.course_code,
            a.accessible,
            a.front_row,
            a.locked,
        ]
        if include_student_names:
            row_data.insert(6, a.display_name)
        writer.writerow(row_data)
    return buf.getvalue()


def format_student_slips(
    assignments: tuple[SeatAssignment, ...] | list[SeatAssignment],
    *,
    exam_title: str,
    starts_at_iso: str,
    include_student_names: bool = False,
    for_student_id: UUID | None = None,
) -> list[dict[str, object]]:
    """Return individual student seat slips with privacy gating on student names."""
    slips: list[dict[str, object]] = []
    for a in sorted(assignments, key=lambda item: (item.room_code, item.seat_id)):
        if for_student_id is not None and a.student_id != for_student_id:
            continue
        slip: dict[str, object] = {
            "exam_title": exam_title,
            "starts_at": starts_at_iso,
            "student_id": str(a.student_id),
            "student_external_id": a.external_id,
            "course_code": a.course_code,
            "space_id": str(a.space_id),
            "room_code": a.room_code,
            "seat_id": a.seat_id,
            "seat_label": a.seat_label,
            "row": a.row + 1,
            "col": a.col + 1,
            "accessible": a.accessible,
            "front_row": a.front_row,
        }
        if include_student_names or (
            for_student_id is not None and a.student_id == for_student_id
        ):
            slip["student_name"] = a.display_name
        slips.append(slip)
    return slips


def render_exam_plan_pdf(
    assignments: tuple[SeatAssignment, ...] | list[SeatAssignment],
    rooms: tuple[RoomSeatMap, ...] | list[RoomSeatMap],
    *,
    exam_title: str,
    starts_at_iso: str,
    include_student_names: bool = False,
) -> bytes:
    """Render a printable PDF seat list and visual grid layout using ReportLab."""
    buf = io.BytesIO()
    page_w, page_h = landscape(A4)
    c = pdf_canvas.Canvas(buf, pagesize=(page_w, page_h))
    c.setTitle(f"Exam Seat Plan - {exam_title}")

    by_room: dict[UUID, list[SeatAssignment]] = {}
    for a in assignments:
        by_room.setdefault(a.space_id, []).append(a)

    room_map = {r.space_id: r for r in rooms}

    for room_idx, (space_id, room_assignments) in enumerate(by_room.items()):
        if room_idx > 0:
            c.showPage()
        room = room_map.get(space_id)
        room_title = (
            f"{room.room_code} ({room.room_name})"
            if room is not None
            else str(space_id)
        )

        # Header
        c.setFont("Helvetica-Bold", 15)
        c.drawString(18 * mm, page_h - 16 * mm, f"Exam Seat Plan: {exam_title}")
        c.setFont("Helvetica", 10)
        c.drawString(
            18 * mm,
            page_h - 22 * mm,
            f"Room: {room_title}   |   Start: {starts_at_iso}   |   Seated: {len(room_assignments)}",
        )

        # Draw grid map on the left half
        if room is not None and room.rows > 0 and room.cols > 0:
            grid_left = 18 * mm
            grid_top = page_h - 32 * mm
            grid_w = 145 * mm
            grid_h = page_h - 48 * mm
            cell_w = min(22 * mm, grid_w / max(1, room.cols))
            cell_h = min(14 * mm, grid_h / max(1, room.rows))

            assigned_by_rc = {(a.row, a.col): a for a in room_assignments}
            for seat in room.seats:
                x_pos = grid_left + seat.col * cell_w
                y_pos = grid_top - (seat.row + 1) * cell_h
                assigned = assigned_by_rc.get((seat.row, seat.col))
                if assigned is not None:
                    c.setFillColor(colors.HexColor("#dbeafe"))
                elif not seat.usable:
                    c.setFillColor(colors.HexColor("#fee2e2"))
                else:
                    c.setFillColor(colors.HexColor("#f8fafc"))
                c.setStrokeColor(colors.HexColor("#64748b"))
                c.rect(x_pos, y_pos, cell_w - 1.5, cell_h - 1.5, fill=1, stroke=1)
                c.setFillColor(colors.HexColor("#0f172a"))
                c.setFont("Helvetica-Bold", 6.5)
                c.drawString(x_pos + 2, y_pos + cell_h - 8, seat.seat_id)
                if assigned is not None:
                    c.setFont("Helvetica", 6)
                    c.drawString(x_pos + 2, y_pos + 3, assigned.external_id[:10])

        # Draw roster table on the right half
        table_left = 172 * mm
        y_cursor = page_h - 32 * mm
        c.setFont("Helvetica-Bold", 8.5)
        c.drawString(table_left, y_cursor, "Seat")
        c.drawString(table_left + 18 * mm, y_cursor, "Student ID")
        c.drawString(table_left + 46 * mm, y_cursor, "Course")
        if include_student_names:
            c.drawString(table_left + 72 * mm, y_cursor, "Name")
        y_cursor -= 5 * mm
        c.setFont("Helvetica", 8)

        for a in sorted(room_assignments, key=lambda item: (item.row, item.col)):
            if y_cursor < 16 * mm:
                c.showPage()
                y_cursor = page_h - 20 * mm
                c.setFont("Helvetica", 8)
            c.drawString(table_left, y_cursor, a.seat_id)
            c.drawString(table_left + 18 * mm, y_cursor, a.external_id)
            c.drawString(table_left + 46 * mm, y_cursor, a.course_code)
            if include_student_names:
                c.drawString(table_left + 72 * mm, y_cursor, a.display_name[:22])
            y_cursor -= 4.5 * mm

    c.save()
    return buf.getvalue()
