"""Layer 4 Facilities service (Phase 4 §14.2, §14.3, §14.4).

Coordinates:
1. Room & Building Health Scores (0..100) (§14.2) with transparent component
   breakdown, provenance, confidence, and optional CSV environmental readings
   import hook.
2. Smart Cleaning Planner (§14.3): computes dirt scores from today's timetable
   meetings, bookings, attendance sessions, and cleaning tickets; builds time
   windows after last use / before next use; runs OR-Tools Routing Solver
   (`plan_smart_cleaning`), persists `CleaningTask` rows, and exports CSV/PDF
   route sheets.
3. Asset Registry & Loans (§14.4): `Asset` & `AssetLoan` CRUD, checkout/return
   flow with due dates, usage hours logging, condition tracking, overdue loan
   alerts, preventive maintenance reminders by date or usage hours, and
   printable QR code label PDF sheets.
"""

from __future__ import annotations

import csv
import io
import uuid
from datetime import UTC, date, datetime, time, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.core.logging import get_logger
from app.domain.academic import Meeting
from app.domain.base import (
    AssetCondition,
    AssetStatus,
    CleaningTaskStatus,
    OccupancyStatus,
)
from app.domain.booking import Booking, Resource
from app.domain.evidence import AttendanceRecord, AttendanceSession
from app.domain.operations import Asset, AssetLoan, CleaningTask, Ticket
from app.domain.spatial import Building, Floor, Room
from app.engines.facilities import (
    AssetLabelItem,
    CleaningPlanResult,
    EnvironmentalSample,
    PlannedCleaningStop,
    RoomCleaningInput,
    RoomHealthBreakdown,
    RoomTicketSample,
    compute_room_health_score,
    evaluate_asset_maintenance_due,
    format_cleaning_route_sheet_csv,
    is_loan_overdue,
    plan_smart_cleaning,
    render_asset_qr_labels_pdf,
    render_cleaning_route_sheet_pdf,
)
from app.engines.tickets import ACTIVE_TICKET_STATUSES

log = get_logger(__name__)

__all__ = [
    "check_overdue_and_maintenance_alerts",
    "checkout_asset",
    "complete_cleaning_task",
    "create_asset",
    "export_asset_qr_sheet_pdf",
    "export_cleaning_route_sheet_csv",
    "export_cleaning_route_sheet_pdf",
    "generate_cleaning_plan",
    "get_building_health_scores",
    "get_room_health",
    "import_environmental_csv",
    "list_asset_loans",
    "list_assets",
    "list_cleaning_tasks",
    "return_asset",
]

# In-memory store for optional imported environmental CSV readings per room
_ENV_SAMPLES_BY_ROOM: dict[str, list[EnvironmentalSample]] = {}


def _slug_uuid(slug: str) -> uuid.UUID:
    return uuid.uuid5(uuid.NAMESPACE_OID, f"campus-spatial:{slug}")


# ===========================================================================
# §14.2 Room Health Score (0..100) & Optional Environmental CSV Import
# ===========================================================================


async def get_room_health(
    session: AsyncSession,
    room_id: str,
    *,
    now: datetime | None = None,
) -> RoomHealthBreakdown:
    """Compute the deterministic 0..100 health score for ``room_id`` (§14.2)."""
    instant = now or datetime.now(UTC)
    room = await session.get(Room, room_id)
    if room is None:
        raise NotFoundError(f"Room {room_id!r} does not exist.", code="room_not_found")

    tickets = (
        await session.execute(
            select(Ticket)
            .where(Ticket.room_id == room_id)
            .order_by(Ticket.created_at.desc())
        )
    ).scalars().all()

    ticket_samples = [
        RoomTicketSample(
            ticket_id=t.id,
            category=t.category,
            priority=t.priority,
            status=t.status,
            created_at=t.created_at or instant,
            blocks_use=bool(t.blocks_use),
        )
        for t in tickets
    ]
    ratings = [
        float(t.satisfaction_rating)
        for t in tickets
        if t.satisfaction_rating is not None
    ]
    env_samples = _ENV_SAMPLES_BY_ROOM.get(room_id, [])

    return compute_room_health_score(
        space_id=_slug_uuid(room.id),
        room_code=room.id,
        tickets=ticket_samples,
        now=instant,
        satisfaction_ratings=ratings,
        environmental_samples=env_samples,
    )


async def get_building_health_scores(
    session: AsyncSession,
    building_id: str,
    *,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Compute health scores for all rooms in a building plus the building roll-up."""
    instant = now or datetime.now(UTC)
    building = await session.get(Building, building_id)
    if building is None:
        raise NotFoundError(f"Building {building_id!r} does not exist.", code="building_not_found")

    rooms = (
        await session.execute(
            select(Room)
            .join(Floor, Floor.id == Room.floor_id)
            .where(Floor.building_id == building_id)
            .order_by(Room.id.asc())
        )
    ).scalars().all()

    breakdowns: list[RoomHealthBreakdown] = []
    for rm in rooms:
        breakdowns.append(await get_room_health(session, rm.id, now=instant))

    avg_score = (
        round(sum(b.score for b in breakdowns) / len(breakdowns), 2)
        if breakdowns
        else 100.0
    )
    return {
        "building_id": building_id,
        "average_score": avg_score,
        "room_count": len(breakdowns),
        "healthy_count": sum(1 for b in breakdowns if b.band == "healthy"),
        "attention_count": sum(1 for b in breakdowns if b.band == "attention"),
        "critical_count": sum(1 for b in breakdowns if b.band == "critical"),
        "rooms": [
            {
                "room_id": b.room_code,
                "score": b.score,
                "band": b.band,
                "base_score": b.base_score,
                "open_ticket_penalty": b.open_ticket_penalty,
                "repeat_issue_penalty": b.repeat_issue_penalty,
                "satisfaction_adjustment": b.satisfaction_adjustment,
                "environmental_penalty": b.environmental_penalty,
                "open_tickets_count": b.open_tickets_count,
                "repeat_categories": list(b.repeat_categories),
                "blocks_use": b.blocks_use,
                "provenance": b.provenance.value,
                "confidence": b.confidence,
            }
            for b in breakdowns
        ],
    }


def import_environmental_csv(csv_text: str, *, now: datetime | None = None) -> int:
    """Optional CSV import hook for environmental readings (`room_id,co2_ppm,temp_celsius,noise_dba`)."""
    instant = now or datetime.now(UTC)
    reader = csv.DictReader(io.StringIO(csv_text.strip()))
    imported = 0
    for row in reader:
        room_id = (row.get("room_id") or "").strip()
        if not room_id:
            continue
        co2 = float(row["co2_ppm"]) if row.get("co2_ppm") else None
        temp = float(row["temp_celsius"]) if row.get("temp_celsius") else None
        noise = float(row["noise_dba"]) if row.get("noise_dba") else None
        _ENV_SAMPLES_BY_ROOM.setdefault(room_id, []).append(
            EnvironmentalSample(
                recorded_at=instant,
                co2_ppm=co2,
                temp_celsius=temp,
                noise_dba=noise,
            )
        )
        imported += 1
    return imported


# ===========================================================================
# §14.3 Smart Cleaning Plans
# ===========================================================================


async def generate_cleaning_plan(
    session: AsyncSession,
    *,
    campus_id: str,
    plan_date: date,
    cleaner_zone: str = "campus-main",
    building_id: str | None = None,
    num_cleaners: int = 2,
    min_dirt_score: float = 10.0,
    shift_start_hour: int = 8,
    shift_minutes: int = 480,
    is_demo: bool = False,
) -> tuple[list[CleaningTask], CleaningPlanResult]:
    """Generate and persist a daily smart cleaning plan using OR-Tools Routing (§14.3)."""
    day_start = datetime.combine(plan_date, time(0, 0), tzinfo=UTC)
    day_end = day_start + timedelta(days=1)
    shift_start_dt = datetime.combine(plan_date, time(shift_start_hour, 0), tzinfo=UTC)

    stmt = (
        select(Room, Floor.building_id, Floor.level)
        .join(Floor, Floor.id == Room.floor_id)
        .order_by(Floor.building_id.asc(), Floor.level.asc(), Room.id.asc())
    )
    if building_id is not None:
        stmt = stmt.where(Floor.building_id == building_id)
    room_rows = (await session.execute(stmt)).all()

    slug_by_uuid: dict[uuid.UUID, tuple[str, str]] = {}
    cleaning_inputs: list[RoomCleaningInput] = []

    for rm, bld_id, fl_level in room_rows:
        s_uuid = _slug_uuid(rm.id)
        b_uuid = _slug_uuid(bld_id)
        slug_by_uuid[s_uuid] = (rm.id, bld_id)

        # Count meetings today
        meetings_today = (
            await session.execute(
                select(Meeting).where(
                    Meeting.room_id == rm.id,
                    Meeting.cancelled.is_(False),
                    Meeting.starts_at < day_end,
                    Meeting.ends_at > day_start,
                )
            )
        ).scalars().all()

        # Count bookings today
        bookings_today = (
            await session.execute(
                select(Booking)
                .join(Resource, Resource.id == Booking.resource_id)
                .where(
                    Resource.room_id == rm.id,
                    Booking.status == OccupancyStatus.confirmed,
                    Booking.starts_at < day_end,
                    Booking.ends_at > day_start,
                )
            )
        ).scalars().all()

        # Count attendance scans today
        att_today = int(
            (
                await session.scalar(
                    select(func.count(AttendanceRecord.id))
                    .join(
                        AttendanceSession,
                        AttendanceSession.id == AttendanceRecord.session_id,
                    )
                    .where(
                        AttendanceSession.room_id == rm.id,
                        AttendanceRecord.scanned_at >= day_start,
                        AttendanceRecord.scanned_at < day_end,
                        AttendanceRecord.state.in_(("present", "late", "guest")),
                    )
                )
            )
            or 0
        )

        # Open cleaning tickets
        open_clean_tickets = int(
            (
                await session.scalar(
                    select(func.count(Ticket.id)).where(
                        Ticket.room_id == rm.id,
                        Ticket.status.in_(tuple(ACTIVE_TICKET_STATUSES)),
                        func.lower(Ticket.category).in_(("cleaning", "sanitation", "spill")),
                    )
                )
            )
            or 0
        )

        # Last completed cleaning task
        last_clean_date = (
            await session.scalar(
                select(func.max(CleaningTask.plan_date)).where(
                    CleaningTask.room_id == rm.id,
                    CleaningTask.status == CleaningTaskStatus.completed,
                    CleaningTask.plan_date < plan_date,
                )
            )
        )
        days_since = (
            max(1, (plan_date - last_clean_date).days)
            if last_clean_date is not None
            else 5
        )

        # Determine cleaning window after last meeting/booking or open all shift
        latest_end_min = 0
        for m in meetings_today:
            offset_m = int((m.ends_at - shift_start_dt).total_seconds() // 60)
            if 0 < offset_m < shift_minutes - 20:
                latest_end_min = max(latest_end_min, offset_m)
        for b in bookings_today:
            offset_m = int((b.ends_at - shift_start_dt).total_seconds() // 60)
            if 0 < offset_m < shift_minutes - 20:
                latest_end_min = max(latest_end_min, offset_m)

        sessions_count = len(meetings_today) + len(bookings_today)
        estimated_att = att_today or (sessions_count * max(10, (rm.capacity or 25) // 2))

        cleaning_inputs.append(
            RoomCleaningInput(
                space_id=s_uuid,
                room_code=rm.id,
                room_name=rm.name or rm.id,
                building_id=b_uuid,
                building_code=bld_id,
                floor_number=int(fl_level or 1),
                sessions_today=sessions_count,
                attendance_today=estimated_att,
                days_since_last_clean=days_since,
                open_cleaning_tickets=open_clean_tickets,
                service_duration_minutes=15 if (rm.capacity or 30) <= 40 else 25,
                window_start_min=latest_end_min,
                window_end_min=shift_minutes,
            )
        )

    plan_res = plan_smart_cleaning(
        cleaning_inputs,
        num_cleaners=num_cleaners,
        min_dirt_score=min_dirt_score,
        shift_minutes=shift_minutes,
    )

    # Clear existing pending tasks for the same date and zone before persisting new ones
    existing_tasks = (
        await session.execute(
            select(CleaningTask).where(
                CleaningTask.campus_id == campus_id,
                CleaningTask.plan_date == plan_date,
                CleaningTask.cleaner_zone == cleaner_zone,
                CleaningTask.status == CleaningTaskStatus.pending,
            )
        )
    ).scalars().all()
    for old_t in existing_tasks:
        await session.delete(old_t)
    await session.flush()

    created_tasks: list[CleaningTask] = []
    for stop in plan_res.stops:
        room_slug, bld_slug = slug_by_uuid.get(
            stop.space_id, (stop.room_code, stop.building_code)
        )
        w_start = shift_start_dt + timedelta(minutes=stop.window_start_min)
        w_end = shift_start_dt + timedelta(
            minutes=max(stop.window_start_min + 15, stop.window_end_min)
        )
        est_arr = shift_start_dt + timedelta(minutes=stop.arrival_min)
        dur_min = max(5, stop.departure_min - stop.arrival_min)
        reason_code = (
            "deep_clean_due" if "deep-clean" in stop.reason else "used_today"
        )
        task = CleaningTask(
            campus_id=campus_id,
            plan_date=plan_date,
            cleaner_zone=f"{cleaner_zone}-c{stop.cleaner_index + 1}",
            sequence_order=stop.sequence_order,
            room_id=room_slug,
            building_id=bld_slug,
            dirt_score=stop.dirt_score,
            reason=reason_code,
            window_start=w_start,
            window_end=w_end,
            estimated_arrival=est_arr,
            duration_minutes=dur_min,
            walking_distance_m=75,
            status=CleaningTaskStatus.pending,
            is_demo=is_demo,
        )
        session.add(task)
        created_tasks.append(task)

    await session.flush()
    return created_tasks, plan_res


async def list_cleaning_tasks(
    session: AsyncSession,
    *,
    campus_id: str | None = None,
    plan_date: date | None = None,
    building_id: str | None = None,
) -> list[CleaningTask]:
    stmt = select(CleaningTask).order_by(
        CleaningTask.plan_date.desc(),
        CleaningTask.cleaner_zone.asc(),
        CleaningTask.sequence_order.asc(),
    )
    if campus_id is not None:
        stmt = stmt.where(CleaningTask.campus_id == campus_id)
    if plan_date is not None:
        stmt = stmt.where(CleaningTask.plan_date == plan_date)
    if building_id is not None:
        stmt = stmt.where(CleaningTask.building_id == building_id)
    return list((await session.execute(stmt)).scalars().all())


async def complete_cleaning_task(
    session: AsyncSession,
    *,
    task_id: uuid.UUID,
    completed_by: uuid.UUID | None = None,
    now: datetime | None = None,
) -> CleaningTask:
    instant = now or datetime.now(UTC)
    task = await session.get(CleaningTask, task_id)
    if task is None:
        raise NotFoundError(
            f"CleaningTask {task_id} does not exist.",
            code="cleaning_task_not_found",
        )
    task.status = CleaningTaskStatus.completed
    task.completed_at = instant
    task.completed_by = completed_by
    await session.flush()
    return task


def _tasks_to_stops(tasks: list[CleaningTask]) -> list[PlannedCleaningStop]:
    stops: list[PlannedCleaningStop] = []
    for idx, t in enumerate(tasks):
        c_idx = 0
        if "-c" in t.cleaner_zone:
            try:
                c_idx = max(0, int(t.cleaner_zone.rsplit("-c", 1)[-1]) - 1)
            except ValueError:
                c_idx = 0
        arr_min = (
            int((t.estimated_arrival - t.window_start).total_seconds() // 60)
            if t.estimated_arrival
            else 0
        )
        arr_min = max(0, arr_min)
        stops.append(
            PlannedCleaningStop(
                cleaner_index=c_idx,
                sequence_order=t.sequence_order or (idx + 1),
                space_id=_slug_uuid(t.room_id),
                room_code=t.room_id,
                room_name=t.room_id,
                building_code=t.building_id or "campus",
                floor_number=1,
                dirt_score=t.dirt_score,
                arrival_min=arr_min,
                departure_min=arr_min + t.duration_minutes,
                window_start_min=0,
                window_end_min=480,
                reason=t.reason,
            )
        )
    return stops


async def export_cleaning_route_sheet_csv(
    session: AsyncSession,
    *,
    campus_id: str,
    plan_date: date,
) -> str:
    tasks = await list_cleaning_tasks(session, campus_id=campus_id, plan_date=plan_date)
    return format_cleaning_route_sheet_csv(_tasks_to_stops(tasks))


async def export_cleaning_route_sheet_pdf(
    session: AsyncSession,
    *,
    campus_id: str,
    plan_date: date,
) -> bytes:
    tasks = await list_cleaning_tasks(session, campus_id=campus_id, plan_date=plan_date)
    return render_cleaning_route_sheet_pdf(
        _tasks_to_stops(tasks), plan_date_iso=plan_date.isoformat()
    )


# ===========================================================================
# §14.4 Asset Registry, QR Labels, Loans & Preventive Maintenance
# ===========================================================================


async def create_asset(
    session: AsyncSession,
    *,
    campus_id: str,
    asset_code: str,
    name: str,
    asset_type: str,
    room_id: str | None = None,
    building_id: str | None = None,
    resource_id: uuid.UUID | None = None,
    serial_number: str | None = None,
    condition: AssetCondition = AssetCondition.good,
    maintenance_interval_days: int | None = None,
    maintenance_interval_hours: float | None = None,
    next_maintenance_due_at: datetime | None = None,
    notes: str | None = None,
    is_demo: bool = False,
) -> Asset:
    """Register a campus or laboratory asset (§14.4)."""
    if room_id is not None and building_id is None:
        rm = await session.get(Room, room_id)
        if rm is not None and rm.floor_id:
            fl = await session.get(Floor, rm.floor_id)
            if fl is not None:
                building_id = fl.building_id

    asset = Asset(
        campus_id=campus_id,
        asset_code=asset_code.strip(),
        name=name.strip(),
        asset_type=asset_type.strip(),
        room_id=room_id,
        building_id=building_id,
        resource_id=resource_id,
        serial_number=serial_number,
        condition=condition,
        status=AssetStatus.available,
        usage_hours=0.0,
        maintenance_interval_days=maintenance_interval_days,
        maintenance_interval_hours=maintenance_interval_hours,
        next_maintenance_due_at=next_maintenance_due_at,
        notes=notes,
        is_demo=is_demo,
    )
    try:
        async with session.begin_nested():
            session.add(asset)
            await session.flush()
    except IntegrityError as exc:
        raise ConflictError(
            f"Asset code {asset_code!r} already exists on campus {campus_id!r}.",
            code="duplicate_asset_code",
        ) from exc
    return asset


async def list_assets(
    session: AsyncSession,
    *,
    campus_id: str | None = None,
    asset_type: str | None = None,
    room_id: str | None = None,
    status: AssetStatus | None = None,
    limit: int = 100,
) -> list[Asset]:
    stmt = select(Asset).order_by(Asset.asset_code.asc()).limit(limit)
    if campus_id is not None:
        stmt = stmt.where(Asset.campus_id == campus_id)
    if asset_type is not None:
        stmt = stmt.where(Asset.asset_type == asset_type)
    if room_id is not None:
        stmt = stmt.where(Asset.room_id == room_id)
    if status is not None:
        stmt = stmt.where(Asset.status == status)
    return list((await session.execute(stmt)).scalars().all())


async def checkout_asset(
    session: AsyncSession,
    *,
    asset_id: uuid.UUID,
    borrower_user_id: uuid.UUID,
    due_at: datetime,
    issued_by_user_id: uuid.UUID | None = None,
    purpose: str | None = None,
    notes: str | None = None,
    now: datetime | None = None,
) -> AssetLoan:
    """Check out an available asset to a borrower with a due date (§13.1, §14.4)."""
    instant = now or datetime.now(UTC)
    asset = await session.get(Asset, asset_id)
    if asset is None:
        raise NotFoundError(f"Asset {asset_id} does not exist.", code="asset_not_found")
    if asset.status != AssetStatus.available:
        raise ConflictError(
            f"Asset {asset.asset_code!r} is currently {asset.status.value} and cannot be checked out.",
            code="asset_not_available",
        )
    if due_at <= instant:
        raise ValidationError("Loan due_at must be after checked_out_at.", code="invalid_loan_due_at")

    asset.status = AssetStatus.loaned
    loan = AssetLoan(
        asset_id=asset.id,
        borrower_user_id=borrower_user_id,
        issued_by_user_id=issued_by_user_id,
        checked_out_at=instant,
        due_at=due_at,
        condition_out=asset.condition,
        purpose=purpose,
        notes=notes,
        is_demo=asset.is_demo,
    )
    session.add(loan)
    await session.flush()
    return loan


async def return_asset(
    session: AsyncSession,
    *,
    loan_id: uuid.UUID,
    usage_hours_logged: float = 0.0,
    condition_in: AssetCondition | None = None,
    notes: str | None = None,
    now: datetime | None = None,
) -> tuple[AssetLoan, Asset]:
    """Return a loaned asset, logging usage hours and updating condition (§13.1, §14.4)."""
    instant = now or datetime.now(UTC)
    loan = await session.get(AssetLoan, loan_id)
    if loan is None:
        raise NotFoundError(f"AssetLoan {loan_id} does not exist.", code="asset_loan_not_found")
    asset = await session.get(Asset, loan.asset_id)
    if asset is None:
        raise NotFoundError(f"Asset {loan.asset_id} does not exist.", code="asset_not_found")

    if loan.returned_at is not None:
        return loan, asset

    safe_hours = max(0.0, float(usage_hours_logged))
    loan.returned_at = instant
    loan.usage_hours_logged = safe_hours
    loan.condition_in = condition_in or asset.condition
    if notes:
        loan.notes = notes

    asset.usage_hours = round((asset.usage_hours or 0.0) + safe_hours, 2)
    if condition_in is not None:
        asset.condition = condition_in
    if condition_in in {AssetCondition.needs_repair, AssetCondition.retired}:
        asset.status = (
            AssetStatus.retired
            if condition_in == AssetCondition.retired
            else AssetStatus.maintenance
        )
    else:
        asset.status = AssetStatus.available

    await session.flush()
    return loan, asset


async def list_asset_loans(
    session: AsyncSession,
    *,
    asset_id: uuid.UUID | None = None,
    borrower_user_id: uuid.UUID | None = None,
    active_only: bool = False,
) -> list[AssetLoan]:
    stmt = select(AssetLoan).order_by(AssetLoan.checked_out_at.desc())
    if asset_id is not None:
        stmt = stmt.where(AssetLoan.asset_id == asset_id)
    if borrower_user_id is not None:
        stmt = stmt.where(AssetLoan.borrower_user_id == borrower_user_id)
    if active_only:
        stmt = stmt.where(AssetLoan.returned_at.is_(None))
    return list((await session.execute(stmt)).scalars().all())


async def check_overdue_and_maintenance_alerts(
    session: AsyncSession,
    *,
    campus_id: str | None = None,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Evaluate overdue asset loans and preventive-maintenance reminders (§14.4)."""
    instant = now or datetime.now(UTC)
    today = instant.date()

    loan_stmt = select(AssetLoan, Asset).join(Asset, Asset.id == AssetLoan.asset_id).where(
        AssetLoan.returned_at.is_(None)
    )
    if campus_id is not None:
        loan_stmt = loan_stmt.where(Asset.campus_id == campus_id)

    overdue_loans: list[dict[str, Any]] = []
    for loan, asset in (await session.execute(loan_stmt)).all():
        if is_loan_overdue(now=instant, due_at=loan.due_at, returned_at=loan.returned_at):
            if loan.overdue_notified_at is None:
                loan.overdue_notified_at = instant
            overdue_loans.append(
                {
                    "loan_id": str(loan.id),
                    "asset_id": str(asset.id),
                    "asset_code": asset.asset_code,
                    "asset_name": asset.name,
                    "borrower_user_id": str(loan.borrower_user_id),
                    "due_at": loan.due_at.isoformat(),
                    "hours_overdue": round(
                        (instant - loan.due_at).total_seconds() / 3600.0, 2
                    ),
                }
            )

    assets = await list_assets(session, campus_id=campus_id, limit=500)
    maintenance_due: list[dict[str, Any]] = []
    for asset in assets:
        due_date = (
            asset.next_maintenance_due_at.date()
            if asset.next_maintenance_due_at is not None
            else None
        )
        is_due, reason = evaluate_asset_maintenance_due(
            today=today,
            next_maintenance_due_at=due_date,
            usage_hours=asset.usage_hours or 0.0,
            maintenance_interval_hours=asset.maintenance_interval_hours,
        )
        if is_due:
            maintenance_due.append(
                {
                    "asset_id": str(asset.id),
                    "asset_code": asset.asset_code,
                    "asset_name": asset.name,
                    "room_id": asset.room_id,
                    "usage_hours": asset.usage_hours,
                    "reason": reason,
                }
            )

    if overdue_loans:
        await session.flush()

    return {
        "evaluated_at": instant.isoformat(),
        "overdue_loans_count": len(overdue_loans),
        "overdue_loans": overdue_loans,
        "maintenance_due_count": len(maintenance_due),
        "maintenance_due": maintenance_due,
    }


async def export_asset_qr_sheet_pdf(
    session: AsyncSession,
    *,
    campus_id: str | None = None,
    asset_ids: list[uuid.UUID] | None = None,
) -> bytes:
    """Render a printable PDF sheet of QR labels for campus assets (§14.4)."""
    stmt = select(Asset).order_by(Asset.asset_code.asc())
    if campus_id is not None:
        stmt = stmt.where(Asset.campus_id == campus_id)
    if asset_ids:
        stmt = stmt.where(Asset.id.in_(asset_ids))
    assets = (await session.execute(stmt)).scalars().all()

    items = [
        AssetLabelItem(
            asset_id=a.id,
            asset_tag=a.asset_code,
            name=a.name,
            category=a.asset_type,
            room_code=a.room_id,
            serial_number=a.serial_number,
        )
        for a in assets
    ]
    return render_asset_qr_labels_pdf(items)
