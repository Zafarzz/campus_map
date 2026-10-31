"""Pure facilities engine (Phase 4 Layer 4 §14.2, §14.3, §14.4).

Implements:
1. Deterministic Room Health Score (0..100) with transparent component breakdown,
   provenance, and confidence (§14.2).
2. Smart Cleaning Planner: dirt score calculation, available cleaning windows,
   and OR-Tools Routing Solver (`ortools.constraint_solver.pywrapcp`) with a
   `Time` dimension and nearest-neighbour fallback, plus CSV and PDF route sheet
   exporters (§14.3).
3. Asset Registry helpers: printable QR label PDF sheet (`segno` + `reportlab`),
   preventive maintenance due checks, and loan overdue checks (§14.4).

Zero database or network dependencies.
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Literal
from uuid import UUID

import segno
from ortools.constraint_solver import pywrapcp, routing_enums_pb2
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas as pdf_canvas

from app.domain.base import Provenance, TicketPriority, TicketStatus
from app.engines.tickets import ACTIVE_TICKET_STATUSES

HealthBand = Literal["healthy", "attention", "critical"]

_TICKET_SEVERITY_WEIGHTS: dict[TicketPriority, float] = {
    TicketPriority.urgent: 25.0,
    TicketPriority.high: 15.0,
    TicketPriority.normal: 8.0,
    TicketPriority.low: 4.0,
}


# ---------------------------------------------------------------------------
# §14.2 Room Health Score (0..100)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class RoomTicketSample:
    """Ticket summary used in room health calculation."""

    ticket_id: UUID
    category: str
    priority: TicketPriority
    status: TicketStatus
    created_at: datetime
    blocks_use: bool = False


@dataclass(frozen=True)
class EnvironmentalSample:
    """Optional imported environmental reading (temperature C, CO2 ppm, noise dBA)."""

    recorded_at: datetime
    co2_ppm: float | None = None
    temp_celsius: float | None = None
    noise_dba: float | None = None


@dataclass(frozen=True)
class RoomHealthBreakdown:
    """Transparent breakdown of a room's 0..100 health score (§14.2)."""

    space_id: UUID
    room_code: str
    score: float
    band: HealthBand
    base_score: float
    open_ticket_penalty: float
    repeat_issue_penalty: float
    satisfaction_adjustment: float
    environmental_penalty: float
    open_tickets_count: int
    repeat_categories: tuple[str, ...]
    blocks_use: bool
    provenance: Provenance
    confidence: float


def compute_room_health_score(
    *,
    space_id: UUID,
    room_code: str,
    tickets: tuple[RoomTicketSample, ...] | list[RoomTicketSample],
    now: datetime,
    satisfaction_ratings: tuple[float, ...] | list[float] = (),
    environmental_samples: tuple[EnvironmentalSample, ...] | list[EnvironmentalSample] = (),
) -> RoomHealthBreakdown:
    """Compute the deterministic 0..100 room health score (§14.2).

    Formula:
    - Starts at ``base_score = 100.0``.
    - Subtracts ``open_ticket_penalty``: each active ticket deducts
      ``weight(priority) * (1 + 0.5 * min(1.0, age_hours / 72.0))``. If any
      active ticket has ``blocks_use=True``, an extra 30-point penalty is added.
    - Subtracts ``repeat_issue_penalty``: for tickets created within the last
      90 days, each category with ``count >= 2`` deducts ``(count - 1) * 6.0``
      (capped at 30.0 total).
    - Adds ``satisfaction_adjustment``: recent satisfaction ratings in ``[1, 5]``
      adjust score by ``clamp((mean_rating - 3.5) * 4.0, -6.0, +6.0)``.
    - Subtracts ``environmental_penalty``: if optional environmental readings
      show CO2 > 1200 ppm or temperature outside ``[18, 27]`` C, deducts up to 10.0.
    - Final score is clamped to ``[0.0, 100.0]``.
    """
    base_score = 100.0
    open_penalty = 0.0
    open_count = 0
    any_blocking = False

    ninety_days_ago = now - timedelta(days=90)
    category_counts_90d: dict[str, int] = {}

    for t in tickets:
        norm_cat = t.category.strip().lower() or "general"
        if t.created_at >= ninety_days_ago:
            category_counts_90d[norm_cat] = category_counts_90d.get(norm_cat, 0) + 1

        if t.status in ACTIVE_TICKET_STATUSES:
            open_count += 1
            base_w = _TICKET_SEVERITY_WEIGHTS.get(t.priority, 8.0)
            age_hours = max(0.0, (now - t.created_at).total_seconds() / 3600.0)
            age_factor = 1.0 + 0.5 * min(1.0, age_hours / 72.0)
            open_penalty += base_w * age_factor
            if t.blocks_use:
                any_blocking = True

    if any_blocking:
        open_penalty += 30.0
    open_penalty = round(min(100.0, open_penalty), 2)

    repeat_categories: list[str] = []
    repeat_penalty = 0.0
    for cat, cnt in sorted(category_counts_90d.items()):
        if cnt >= 2:
            repeat_categories.append(cat)
            repeat_penalty += (cnt - 1) * 6.0
    repeat_penalty = round(min(30.0, repeat_penalty), 2)

    sat_adjustment = 0.0
    if satisfaction_ratings:
        clamped_ratings = [min(5.0, max(1.0, float(r))) for r in satisfaction_ratings]
        mean_r = sum(clamped_ratings) / len(clamped_ratings)
        sat_adjustment = round(max(-6.0, min(6.0, (mean_r - 3.5) * 4.0)), 2)

    env_penalty = 0.0
    if environmental_samples:
        latest = max(environmental_samples, key=lambda s: s.recorded_at)
        if latest.co2_ppm is not None and latest.co2_ppm > 1200.0:
            env_penalty += min(6.0, (latest.co2_ppm - 1200.0) / 200.0 * 3.0)
        if latest.temp_celsius is not None and (
            latest.temp_celsius < 18.0 or latest.temp_celsius > 27.0
        ):
            env_penalty += 4.0
        env_penalty = round(min(10.0, env_penalty), 2)

    raw_score = (
        base_score
        - open_penalty
        - repeat_penalty
        + sat_adjustment
        - env_penalty
    )
    final_score = round(max(0.0, min(100.0, raw_score)), 2)

    if any_blocking or final_score < 50.0:
        band: HealthBand = "critical"
    elif final_score < 80.0:
        band = "attention"
    else:
        band = "healthy"

    # Provenance & confidence
    has_evidence = bool(tickets or satisfaction_ratings or environmental_samples)
    confidence = 0.9 if has_evidence else 0.75

    return RoomHealthBreakdown(
        space_id=space_id,
        room_code=room_code,
        score=final_score,
        band=band,
        base_score=base_score,
        open_ticket_penalty=open_penalty,
        repeat_issue_penalty=repeat_penalty,
        satisfaction_adjustment=sat_adjustment,
        environmental_penalty=env_penalty,
        open_tickets_count=open_count,
        repeat_categories=tuple(repeat_categories),
        blocks_use=any_blocking,
        provenance=Provenance.estimated,
        confidence=confidence,
    )


# ---------------------------------------------------------------------------
# §14.3 Smart Cleaning Plans (OR-Tools Routing Solver + Time Windows)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class RoomCleaningInput:
    """Room candidate for daily cleaning plan generation."""

    space_id: UUID
    room_code: str
    room_name: str
    building_id: UUID
    building_code: str
    floor_number: int = 1
    sessions_today: int = 0
    attendance_today: int = 0
    days_since_last_clean: int = 1
    open_cleaning_tickets: int = 0
    service_duration_minutes: int = 15
    # Allowed cleaning window in minutes from shift start (0..shift_minutes)
    window_start_min: int = 0
    window_end_min: int = 480


@dataclass(frozen=True)
class PlannedCleaningStop:
    """Single stop in a cleaner's ordered route."""

    cleaner_index: int
    sequence_order: int
    space_id: UUID
    room_code: str
    room_name: str
    building_code: str
    floor_number: int
    dirt_score: float
    arrival_min: int
    departure_min: int
    window_start_min: int
    window_end_min: int
    reason: str


@dataclass(frozen=True)
class CleaningPlanResult:
    """Outcome of the smart cleaning route solver."""

    stops: tuple[PlannedCleaningStop, ...]
    total_travel_minutes: int
    total_service_minutes: int
    solver_used: Literal["ORTOOLS_ROUTING", "NEAREST_NEIGHBOUR_FALLBACK"]
    summary: str
    metrics: dict[str, int | float | str] = field(default_factory=dict)


def compute_room_dirt_score(room: RoomCleaningInput) -> tuple[float, str]:
    """Compute a deterministic dirt score (>= 0) and reason for cleaning."""
    usage_score = room.sessions_today * 18.0 + min(40.0, room.attendance_today * 0.6)
    ticket_score = room.open_cleaning_tickets * 35.0
    deep_clean_score = 0.0
    reasons: list[str] = []

    if room.open_cleaning_tickets > 0:
        reasons.append(f"{room.open_cleaning_tickets} cleaning ticket(s)")
    if room.sessions_today > 0 or room.attendance_today > 0:
        reasons.append(
            f"{room.sessions_today} session(s) / {room.attendance_today} attendees today"
        )
    if room.days_since_last_clean >= 5:
        deep_clean_score = min(45.0, room.days_since_last_clean * 5.0)
        reasons.append(f"deep-clean due ({room.days_since_last_clean}d since last clean)")
    elif room.days_since_last_clean > 1 and usage_score > 0:
        deep_clean_score = (room.days_since_last_clean - 1) * 6.0

    total = round(min(100.0, usage_score + ticket_score + deep_clean_score), 2)
    reason_str = "; ".join(reasons) if reasons else "routine periodic check"
    return total, reason_str


def _estimate_travel_minutes(
    r1: RoomCleaningInput | None,
    r2: RoomCleaningInput | None,
    building_distances_m: dict[tuple[UUID, UUID], int],
) -> int:
    """Integer travel time in minutes between two rooms (or depot when None)."""
    if r1 is None or r2 is None:
        return 2
    if r1.space_id == r2.space_id:
        return 0
    if r1.building_id == r2.building_id:
        floor_diff = abs(r1.floor_number - r2.floor_number)
        return 1 + floor_diff
    dist_m = building_distances_m.get(
        (r1.building_id, r2.building_id),
        building_distances_m.get((r2.building_id, r1.building_id), 160),
    )
    # Assume 75 m/min indoor+outdoor walking pace + 2 min transition
    return max(2, round(dist_m / 75.0) + 2)


def _nearest_neighbour_cleaning_fallback(
    rooms_with_scores: list[tuple[RoomCleaningInput, float, str]],
    *,
    num_cleaners: int,
    shift_minutes: int,
    building_distances_m: dict[tuple[UUID, UUID], int],
) -> CleaningPlanResult:
    """Deterministic greedy nearest-neighbour fallback respecting shift horizon."""
    cleaners = max(1, num_cleaners)
    ordered = sorted(
        rooms_with_scores,
        key=lambda item: (item[0].window_start_min, -item[1], item[0].room_code),
    )
    stops: list[PlannedCleaningStop] = []
    total_travel = 0
    total_service = 0

    cleaner_clocks = [0 for _ in range(cleaners)]
    cleaner_last_room: list[RoomCleaningInput | None] = [None for _ in range(cleaners)]
    cleaner_seq = [0 for _ in range(cleaners)]

    for room, dirt_score, reason in ordered:
        # Pick cleaner who can arrive earliest
        best_c = min(
            range(cleaners),
            key=lambda c: cleaner_clocks[c]
            + _estimate_travel_minutes(cleaner_last_room[c], room, building_distances_m),
        )
        travel = _estimate_travel_minutes(
            cleaner_last_room[best_c], room, building_distances_m
        )
        arrival = max(room.window_start_min, cleaner_clocks[best_c] + travel)
        departure = arrival + max(5, room.service_duration_minutes)

        cleaner_seq[best_c] += 1
        cleaner_clocks[best_c] = min(shift_minutes, departure)
        cleaner_last_room[best_c] = room
        total_travel += travel
        total_service += max(5, room.service_duration_minutes)

        stops.append(
            PlannedCleaningStop(
                cleaner_index=best_c,
                sequence_order=cleaner_seq[best_c],
                space_id=room.space_id,
                room_code=room.room_code,
                room_name=room.room_name,
                building_code=room.building_code,
                floor_number=room.floor_number,
                dirt_score=dirt_score,
                arrival_min=arrival,
                departure_min=departure,
                window_start_min=room.window_start_min,
                window_end_min=room.window_end_min,
                reason=reason,
            )
        )

    stops.sort(key=lambda s: (s.cleaner_index, s.sequence_order))
    return CleaningPlanResult(
        stops=tuple(stops),
        total_travel_minutes=total_travel,
        total_service_minutes=total_service,
        solver_used="NEAREST_NEIGHBOUR_FALLBACK",
        summary=(
            f"Planned {len(stops)} room cleaning stop(s) across {cleaners} cleaner(s) "
            f"(nearest-neighbour fallback)."
        ),
        metrics={
            "rooms_planned": len(stops),
            "cleaners": cleaners,
            "total_travel_minutes": total_travel,
            "total_service_minutes": total_service,
        },
    )


def plan_smart_cleaning(
    rooms: tuple[RoomCleaningInput, ...] | list[RoomCleaningInput],
    *,
    num_cleaners: int = 1,
    min_dirt_score: float = 10.0,
    shift_minutes: int = 480,
    building_distances_m: dict[tuple[UUID, UUID], int] | None = None,
    max_time_seconds: int = 3,
) -> CleaningPlanResult:
    """Build an optimal daily cleaning route with time windows via OR-Tools Routing.

    1. Filters rooms whose ``dirt_score >= min_dirt_score``.
    2. Formulates a Vehicle Routing Problem with Time Windows (VRPTW) using
       ``ortools.constraint_solver.pywrapcp`` with node index 0 as the depot.
    3. Falls back to ``_nearest_neighbour_cleaning_fallback`` if time windows
       are over-constrained.
    """
    distances = building_distances_m or {}
    cleaners = max(1, num_cleaners)

    candidates: list[tuple[RoomCleaningInput, float, str]] = []
    for r in rooms:
        score, reason = compute_room_dirt_score(r)
        if score >= min_dirt_score:
            candidates.append((r, score, reason))

    candidates.sort(key=lambda item: (-item[1], item[0].room_code))

    if not candidates:
        return CleaningPlanResult(
            stops=(),
            total_travel_minutes=0,
            total_service_minutes=0,
            solver_used="ORTOOLS_ROUTING",
            summary="No rooms require cleaning above threshold.",
            metrics={"rooms_planned": 0, "cleaners": cleaners},
        )

    # Node 0 = depot, Nodes 1..N = candidate rooms
    nodes: list[RoomCleaningInput | None] = [None] + [c[0] for c in candidates]
    num_nodes = len(nodes)

    manager = pywrapcp.RoutingIndexManager(num_nodes, cleaners, 0)
    routing = pywrapcp.RoutingModel(manager)

    def transit_callback(from_index: int, to_index: int) -> int:
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        r_from = nodes[from_node]
        r_to = nodes[to_node]
        travel = _estimate_travel_minutes(r_from, r_to, distances)
        service = (
            max(5, r_from.service_duration_minutes) if r_from is not None else 0
        )
        return int(travel + service)

    transit_cb_idx = routing.RegisterTransitCallback(transit_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_cb_idx)

    horizon = max(shift_minutes, max(c[0].window_end_min for c in candidates) + 120)
    routing.AddDimension(
        transit_cb_idx,
        horizon,  # allow waiting slack for time window opening
        horizon,  # maximum cumulative time per cleaner
        False,  # don't force start cumul to zero if first window opens later
        "Time",
    )
    time_dimension = routing.GetDimensionOrDie("Time")

    # Apply time windows per node
    depot_idx = manager.NodeToIndex(0)
    time_dimension.CumulVar(depot_idx).SetRange(0, horizon)

    for node_idx in range(1, num_nodes):
        room = candidates[node_idx - 1][0]
        r_index = manager.NodeToIndex(node_idx)
        w_start = max(0, min(room.window_start_min, horizon - 10))
        w_end = max(w_start + 5, min(room.window_end_min, horizon))
        time_dimension.CumulVar(r_index).SetRange(w_start, w_end)

    for v in range(cleaners):
        routing.AddVariableMinimizedByFinalizer(
            time_dimension.CumulVar(routing.Start(v))
        )
        routing.AddVariableMinimizedByFinalizer(
            time_dimension.CumulVar(routing.End(v))
        )

    search_params = pywrapcp.DefaultRoutingSearchParameters()
    search_params.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    )
    search_params.local_search_metaheuristic = (
        routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    )
    search_params.time_limit.seconds = max(1, int(max_time_seconds))

    solution = routing.SolveWithParameters(search_params)
    if solution is None:
        return _nearest_neighbour_cleaning_fallback(
            candidates,
            num_cleaners=cleaners,
            shift_minutes=shift_minutes,
            building_distances_m=distances,
        )

    stops: list[PlannedCleaningStop] = []
    total_travel = 0
    total_service = 0

    for v in range(cleaners):
        index = routing.Start(v)
        seq = 0
        prev_room: RoomCleaningInput | None = None
        while not routing.IsEnd(index):
            node = manager.IndexToNode(index)
            if node > 0:
                room, dirt_score, reason = candidates[node - 1]
                seq += 1
                arrival = int(solution.Min(time_dimension.CumulVar(index)))
                service_dur = max(5, room.service_duration_minutes)
                departure = arrival + service_dur
                total_travel += _estimate_travel_minutes(prev_room, room, distances)
                total_service += service_dur
                prev_room = room
                stops.append(
                    PlannedCleaningStop(
                        cleaner_index=v,
                        sequence_order=seq,
                        space_id=room.space_id,
                        room_code=room.room_code,
                        room_name=room.room_name,
                        building_code=room.building_code,
                        floor_number=room.floor_number,
                        dirt_score=dirt_score,
                        arrival_min=arrival,
                        departure_min=departure,
                        window_start_min=room.window_start_min,
                        window_end_min=room.window_end_min,
                        reason=reason,
                    )
                )
            index = solution.Value(routing.NextVar(index))

    stops.sort(key=lambda s: (s.cleaner_index, s.sequence_order))
    return CleaningPlanResult(
        stops=tuple(stops),
        total_travel_minutes=total_travel,
        total_service_minutes=total_service,
        solver_used="ORTOOLS_ROUTING",
        summary=(
            f"Planned {len(stops)} room cleaning stop(s) across {cleaners} cleaner(s) "
            f"via OR-Tools Routing ({total_travel}m travel, {total_service}m service)."
        ),
        metrics={
            "rooms_planned": len(stops),
            "cleaners": cleaners,
            "total_travel_minutes": total_travel,
            "total_service_minutes": total_service,
        },
    )


def format_cleaning_route_sheet_csv(
    stops: tuple[PlannedCleaningStop, ...] | list[PlannedCleaningStop],
    *,
    shift_start_label: str = "08:00",
) -> str:
    """Export cleaning route stops to CSV."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        [
            "cleaner_index",
            "sequence_order",
            "building_code",
            "floor",
            "room_code",
            "room_name",
            "dirt_score",
            "arrival_offset_min",
            "departure_offset_min",
            "shift_start",
            "reason",
        ]
    )
    for s in stops:
        writer.writerow(
            [
                s.cleaner_index + 1,
                s.sequence_order,
                s.building_code,
                s.floor_number,
                s.room_code,
                s.room_name,
                s.dirt_score,
                s.arrival_min,
                s.departure_min,
                shift_start_label,
                s.reason,
            ]
        )
    return buf.getvalue()


def render_cleaning_route_sheet_pdf(
    stops: tuple[PlannedCleaningStop, ...] | list[PlannedCleaningStop],
    *,
    plan_date_iso: str,
    shift_start_label: str = "08:00",
) -> bytes:
    """Render a printable PDF route sheet for cleaning staff via ReportLab."""
    buf = io.BytesIO()
    _page_w, page_h = A4
    c = pdf_canvas.Canvas(buf, pagesize=A4)
    c.setTitle(f"Cleaning Route Sheet - {plan_date_iso}")

    c.setFont("Helvetica-Bold", 15)
    c.drawString(18 * mm, page_h - 18 * mm, f"Smart Cleaning Route Sheet — {plan_date_iso}")
    c.setFont("Helvetica", 10)
    c.drawString(
        18 * mm,
        page_h - 24 * mm,
        f"Shift start: {shift_start_label}   |   Total rooms: {len(stops)}",
    )

    y = page_h - 34 * mm
    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(18 * mm, y, "Cleaner")
    c.drawString(34 * mm, y, "Seq")
    c.drawString(45 * mm, y, "Room")
    c.drawString(75 * mm, y, "Dirt")
    c.drawString(92 * mm, y, "Window (min)")
    c.drawString(120 * mm, y, "Reason")
    y -= 5 * mm
    c.setFont("Helvetica", 8)

    for s in stops:
        if y < 18 * mm:
            c.showPage()
            y = page_h - 20 * mm
            c.setFont("Helvetica", 8)
        c.drawString(18 * mm, y, f"#{s.cleaner_index + 1}")
        c.drawString(34 * mm, y, str(s.sequence_order))
        c.drawString(45 * mm, y, f"{s.room_code} (F{s.floor_number})")
        c.drawString(75 * mm, y, f"{s.dirt_score:.0f}")
        c.drawString(92 * mm, y, f"+{s.arrival_min}..+{s.departure_min}m")
        c.drawString(120 * mm, y, s.reason[:42])
        y -= 5 * mm

    c.save()
    return buf.getvalue()


# ---------------------------------------------------------------------------
# §14.4 Asset Registry & QR Labels
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class AssetLabelItem:
    """Data for a single printable asset QR label (§14.4)."""

    asset_id: UUID
    asset_tag: str
    name: str
    category: str
    room_code: str | None = None
    serial_number: str | None = None


def evaluate_asset_maintenance_due(
    *,
    today: date,
    next_maintenance_due_at: date | None,
    usage_hours: float,
    maintenance_interval_hours: float | None,
) -> tuple[bool, str | None]:
    """Check whether an asset requires preventive maintenance by date or usage hours."""
    reasons: list[str] = []
    if next_maintenance_due_at is not None and today >= next_maintenance_due_at:
        reasons.append(
            f"scheduled maintenance due on {next_maintenance_due_at.isoformat()}"
        )
    if (
        maintenance_interval_hours is not None
        and maintenance_interval_hours > 0
        and usage_hours >= maintenance_interval_hours
    ):
        reasons.append(
            f"usage hours ({usage_hours:.1f}h) reached interval ({maintenance_interval_hours:.1f}h)"
        )
    if reasons:
        return True, "; ".join(reasons)
    return False, None


def is_loan_overdue(
    *,
    now: datetime,
    due_at: datetime,
    returned_at: datetime | None,
) -> bool:
    """Return True if an asset loan is unreturned past its ``due_at`` timestamp."""
    if returned_at is not None:
        return False
    return now > due_at


def render_asset_qr_labels_pdf(
    assets: tuple[AssetLabelItem, ...] | list[AssetLabelItem],
    *,
    base_url: str = "https://campus.ajou.uz/assets/",
) -> bytes:
    """Render a printable A4 sheet of QR code labels for campus assets (`segno` + `reportlab`)."""
    buf = io.BytesIO()
    page_w, page_h = A4
    c = pdf_canvas.Canvas(buf, pagesize=A4)
    c.setTitle("Campus Asset QR Labels")

    # 2 columns x 5 rows per A4 sheet (10 labels per page)
    cols = 2
    rows = 5
    margin_x = 15 * mm
    margin_y = 15 * mm
    cell_w = (page_w - 2 * margin_x) / cols
    cell_h = (page_h - 2 * margin_y) / rows

    for idx, item in enumerate(assets):
        pos_in_page = idx % (cols * rows)
        if idx > 0 and pos_in_page == 0:
            c.showPage()

        col = pos_in_page % cols
        row = pos_in_page // cols
        x0 = margin_x + col * cell_w
        y0 = page_h - margin_y - (row + 1) * cell_h

        # Border box
        c.setStrokeColor(colors.HexColor("#94a3b8"))
        c.rect(x0 + 2 * mm, y0 + 2 * mm, cell_w - 4 * mm, cell_h - 4 * mm, fill=0, stroke=1)

        # Generate QR PNG via segno in memory
        payload = f"{base_url.rstrip('/')}/{item.asset_tag}?id={item.asset_id}"
        qr = segno.make(payload, error="m")
        png_buf = io.BytesIO()
        qr.save(png_buf, kind="png", scale=4, border=1)
        png_buf.seek(0)
        img = ImageReader(png_buf)

        qr_size = min(34 * mm, cell_h - 10 * mm)
        c.drawImage(
            img,
            x0 + 5 * mm,
            y0 + (cell_h - qr_size) / 2,
            width=qr_size,
            height=qr_size,
            preserveAspectRatio=True,
            mask="auto",
        )

        text_x = x0 + 8 * mm + qr_size
        text_y = y0 + cell_h - 12 * mm
        c.setFillColor(colors.HexColor("#0f172a"))
        c.setFont("Helvetica-Bold", 10)
        c.drawString(text_x, text_y, item.asset_tag[:20])
        c.setFont("Helvetica", 8.5)
        c.drawString(text_x, text_y - 5 * mm, item.name[:26])
        c.setFont("Helvetica", 7.5)
        c.drawString(text_x, text_y - 10 * mm, f"Category: {item.category[:22]}")
        if item.room_code:
            c.drawString(text_x, text_y - 15 * mm, f"Room: {item.room_code}")
        if item.serial_number:
            c.drawString(text_x, text_y - 20 * mm, f"S/N: {item.serial_number[:18]}")

    c.save()
    return buf.getvalue()
