"""Layer 4 Facilities API (Phase 4 §14.2, §14.3, §14.4).

Endpoints:
* Room & Building Health Scores (§14.2):
  - ``GET /facilities/health/rooms/{room_id}`` — deterministic 0..100 room health score
  - ``GET /facilities/health/buildings/{building_id}`` — building health roll-up & rooms
  - ``POST /facilities/health/environmental-csv`` — optional CSV import hook for CO2/temp
* Smart Cleaning Plans (§14.3):
  - ``POST /facilities/cleaning/plans`` — generate daily cleaning routes via OR-Tools Routing
  - ``GET /facilities/cleaning/tasks`` — list cleaning tasks
  - ``POST /facilities/cleaning/tasks/{task_id}/complete`` — mark a cleaning task completed
  - ``GET /facilities/cleaning/route-sheet.csv`` — export route sheet CSV
  - ``GET /facilities/cleaning/route-sheet.pdf`` — export printable route sheet PDF
* Asset Registry & Loans (§14.4):
  - ``POST /facilities/assets`` — register a campus or laboratory asset
  - ``GET /facilities/assets`` — list assets
  - ``GET /facilities/assets/qr-labels.pdf`` — printable QR code label sheet PDF
  - ``POST /facilities/assets/{asset_id}/checkout`` — check out an asset with due date
  - ``POST /facilities/loans/{loan_id}/return`` — return a loaned asset & log usage hours
  - ``GET /facilities/loans`` — list asset loans
  - ``GET /facilities/alerts`` — overdue loans & preventive maintenance reminders
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Response, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.busyness import ensure_principal_user
from app.core.db import get_session
from app.core.errors import PermissionDeniedError
from app.core.security import CurrentPrincipal, Role
from app.domain.base import AssetCondition, AssetStatus
from app.domain.operations import Asset, AssetLoan, CleaningTask
from app.services import facilities_service

router = APIRouter(prefix="/facilities", tags=["facilities"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------


class EnvironmentalCsvIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    csv_text: str = Field(min_length=5, max_length=200_000)


class CleaningPlanGenerateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    campus_id: str = Field(default="ajou-tashkent", min_length=1, max_length=64)
    plan_date: date
    cleaner_zone: str = Field(default="campus-main", min_length=1, max_length=64)
    building_id: str | None = None
    num_cleaners: int = Field(default=2, ge=1, le=20)
    min_dirt_score: float = Field(default=10.0, ge=0.0, le=100.0)
    shift_start_hour: int = Field(default=8, ge=0, le=23)
    shift_minutes: int = Field(default=480, ge=60, le=960)


class AssetCreateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    campus_id: str = Field(default="ajou-tashkent", min_length=1, max_length=64)
    asset_code: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=200)
    asset_type: str = Field(min_length=1, max_length=64)
    room_id: str | None = None
    building_id: str | None = None
    resource_id: uuid.UUID | None = None
    serial_number: str | None = Field(default=None, max_length=128)
    condition: AssetCondition = AssetCondition.good
    maintenance_interval_days: int | None = Field(default=None, ge=1, le=3650)
    maintenance_interval_hours: float | None = Field(default=None, ge=1.0, le=100_000.0)
    next_maintenance_due_at: datetime | None = None
    notes: str | None = Field(default=None, max_length=2000)


class AssetCheckoutIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    borrower_user_id: uuid.UUID | None = None
    due_at: datetime
    purpose: str | None = Field(default=None, max_length=300)
    notes: str | None = Field(default=None, max_length=1000)


class AssetReturnIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    usage_hours_logged: float = Field(default=0.0, ge=0.0, le=10_000.0)
    condition_in: AssetCondition | None = None
    notes: str | None = Field(default=None, max_length=1000)


# ---------------------------------------------------------------------------
# §14.2 Room & Building Health Score Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/health/rooms/{room_id}",
    summary="Get deterministic 0..100 health score and breakdown for a room (§14.2)",
)
async def get_room_health(
    room_id: str,
    session: SessionDep,
    principal: CurrentPrincipal,
) -> dict[str, Any]:
    _ = await ensure_principal_user(session, principal)
    b = await facilities_service.get_room_health(session, room_id)
    return {
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


@router.get(
    "/health/buildings/{building_id}",
    summary="Get health scores for all rooms in a building (§14.2)",
)
async def get_building_health(
    building_id: str,
    session: SessionDep,
    principal: CurrentPrincipal,
) -> dict[str, Any]:
    _ = await ensure_principal_user(session, principal)
    return await facilities_service.get_building_health_scores(session, building_id)


@router.post(
    "/health/environmental-csv",
    summary="Optional CSV import hook for environmental readings (§14.2)",
)
async def import_environmental_csv(
    body: EnvironmentalCsvIn,
    session: SessionDep,
    principal: CurrentPrincipal,
) -> dict[str, Any]:
    if not principal.has_role(Role.admin, Role.facilities, Role.staff):
        raise PermissionDeniedError(
            "Only facilities, staff, or admins may import environmental CSV data.",
            code="env_import_forbidden",
        )
    _ = await ensure_principal_user(session, principal)
    count = facilities_service.import_environmental_csv(body.csv_text)
    return {"imported_rows": count}


# ---------------------------------------------------------------------------
# §14.3 Smart Cleaning Planner Endpoints
# ---------------------------------------------------------------------------


def _serialize_cleaning_task(t: CleaningTask) -> dict[str, Any]:
    return {
        "id": str(t.id),
        "campus_id": t.campus_id,
        "plan_date": t.plan_date.isoformat(),
        "cleaner_zone": t.cleaner_zone,
        "sequence_order": t.sequence_order,
        "room_id": t.room_id,
        "building_id": t.building_id,
        "dirt_score": t.dirt_score,
        "reason": t.reason,
        "window_start": t.window_start.isoformat(),
        "window_end": t.window_end.isoformat(),
        "estimated_arrival": (
            t.estimated_arrival.isoformat() if t.estimated_arrival else None
        ),
        "duration_minutes": t.duration_minutes,
        "status": t.status.value,
        "completed_at": t.completed_at.isoformat() if t.completed_at else None,
        "completed_by": str(t.completed_by) if t.completed_by else None,
    }


@router.post(
    "/cleaning/plans",
    status_code=status.HTTP_201_CREATED,
    summary="Generate daily smart cleaning routes via OR-Tools Routing (§14.3)",
)
async def create_cleaning_plan(
    body: CleaningPlanGenerateIn,
    session: SessionDep,
    principal: CurrentPrincipal,
) -> dict[str, Any]:
    if not principal.has_role(Role.admin, Role.facilities, Role.staff):
        raise PermissionDeniedError(
            "Only facilities, staff, or admins may generate cleaning plans.",
            code="cleaning_plan_forbidden",
        )
    _ = await ensure_principal_user(session, principal)
    tasks, res = await facilities_service.generate_cleaning_plan(
        session,
        campus_id=body.campus_id,
        plan_date=body.plan_date,
        cleaner_zone=body.cleaner_zone,
        building_id=body.building_id,
        num_cleaners=body.num_cleaners,
        min_dirt_score=body.min_dirt_score,
        shift_start_hour=body.shift_start_hour,
        shift_minutes=body.shift_minutes,
    )
    await session.commit()
    return {
        "plan_date": body.plan_date.isoformat(),
        "solver_used": res.solver_used,
        "summary": res.summary,
        "total_travel_minutes": res.total_travel_minutes,
        "total_service_minutes": res.total_service_minutes,
        "tasks_count": len(tasks),
        "tasks": [_serialize_cleaning_task(t) for t in tasks],
    }


@router.get(
    "/cleaning/tasks",
    summary="List scheduled cleaning tasks (§14.3)",
)
async def list_cleaning_tasks(
    session: SessionDep,
    principal: CurrentPrincipal,
    campus_id: Annotated[str | None, Query()] = None,
    plan_date: Annotated[date | None, Query()] = None,
    building_id: Annotated[str | None, Query()] = None,
) -> dict[str, Any]:
    _ = await ensure_principal_user(session, principal)
    rows = await facilities_service.list_cleaning_tasks(
        session,
        campus_id=campus_id,
        plan_date=plan_date,
        building_id=building_id,
    )
    return {
        "count": len(rows),
        "tasks": [_serialize_cleaning_task(t) for t in rows],
    }


@router.post(
    "/cleaning/tasks/{task_id}/complete",
    summary="Mark a cleaning task as completed (§14.3)",
)
async def complete_cleaning_task(
    task_id: uuid.UUID,
    session: SessionDep,
    principal: CurrentPrincipal,
) -> dict[str, Any]:
    if not principal.has_role(Role.admin, Role.facilities, Role.staff):
        raise PermissionDeniedError(
            "Only facilities, staff, or admins may complete cleaning tasks.",
            code="cleaning_complete_forbidden",
        )
    actor_id = await ensure_principal_user(session, principal)
    task = await facilities_service.complete_cleaning_task(
        session, task_id=task_id, completed_by=actor_id
    )
    await session.commit()
    return _serialize_cleaning_task(task)


@router.get(
    "/cleaning/route-sheet.csv",
    summary="Export cleaning route sheet as CSV (§14.3)",
)
async def export_cleaning_csv(
    session: SessionDep,
    principal: CurrentPrincipal,
    plan_date: Annotated[date, Query()],
    campus_id: Annotated[str, Query()] = "ajou-tashkent",
) -> Response:
    _ = await ensure_principal_user(session, principal)
    csv_body = await facilities_service.export_cleaning_route_sheet_csv(
        session, campus_id=campus_id, plan_date=plan_date
    )
    return Response(
        content=csv_body,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="cleaning-routes-{plan_date.isoformat()}.csv"'
        },
    )


@router.get(
    "/cleaning/route-sheet.pdf",
    summary="Export printable cleaning route sheet PDF (§14.3)",
)
async def export_cleaning_pdf(
    session: SessionDep,
    principal: CurrentPrincipal,
    plan_date: Annotated[date, Query()],
    campus_id: Annotated[str, Query()] = "ajou-tashkent",
) -> Response:
    _ = await ensure_principal_user(session, principal)
    pdf_bytes = await facilities_service.export_cleaning_route_sheet_pdf(
        session, campus_id=campus_id, plan_date=plan_date
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="cleaning-routes-{plan_date.isoformat()}.pdf"'
        },
    )


# ---------------------------------------------------------------------------
# §14.4 Asset Registry & Loans Endpoints
# ---------------------------------------------------------------------------


def _serialize_asset(a: Asset) -> dict[str, Any]:
    return {
        "id": str(a.id),
        "campus_id": a.campus_id,
        "asset_code": a.asset_code,
        "name": a.name,
        "asset_type": a.asset_type,
        "room_id": a.room_id,
        "building_id": a.building_id,
        "resource_id": str(a.resource_id) if a.resource_id else None,
        "condition": a.condition.value,
        "status": a.status.value,
        "serial_number": a.serial_number,
        "usage_hours": a.usage_hours,
        "maintenance_interval_days": a.maintenance_interval_days,
        "maintenance_interval_hours": a.maintenance_interval_hours,
        "next_maintenance_due_at": (
            a.next_maintenance_due_at.isoformat() if a.next_maintenance_due_at else None
        ),
        "notes": a.notes,
    }


def _serialize_loan(loan: AssetLoan) -> dict[str, Any]:
    return {
        "id": str(loan.id),
        "asset_id": str(loan.asset_id),
        "borrower_user_id": str(loan.borrower_user_id),
        "issued_by_user_id": (
            str(loan.issued_by_user_id) if loan.issued_by_user_id else None
        ),
        "checked_out_at": loan.checked_out_at.isoformat(),
        "due_at": loan.due_at.isoformat(),
        "returned_at": loan.returned_at.isoformat() if loan.returned_at else None,
        "usage_hours_logged": loan.usage_hours_logged,
        "condition_out": loan.condition_out.value,
        "condition_in": loan.condition_in.value if loan.condition_in else None,
        "purpose": loan.purpose,
        "overdue_notified_at": (
            loan.overdue_notified_at.isoformat() if loan.overdue_notified_at else None
        ),
        "notes": loan.notes,
    }


@router.post(
    "/assets",
    status_code=status.HTTP_201_CREATED,
    summary="Register a campus or laboratory asset (§14.4)",
)
async def create_asset(
    body: AssetCreateIn,
    session: SessionDep,
    principal: CurrentPrincipal,
) -> dict[str, Any]:
    if not principal.has_role(Role.admin, Role.facilities, Role.staff, Role.teacher):
        raise PermissionDeniedError(
            "Only facilities, teachers, staff, or admins may register assets.",
            code="asset_create_forbidden",
        )
    _ = await ensure_principal_user(session, principal)
    asset = await facilities_service.create_asset(
        session,
        campus_id=body.campus_id,
        asset_code=body.asset_code,
        name=body.name,
        asset_type=body.asset_type,
        room_id=body.room_id,
        building_id=body.building_id,
        resource_id=body.resource_id,
        serial_number=body.serial_number,
        condition=body.condition,
        maintenance_interval_days=body.maintenance_interval_days,
        maintenance_interval_hours=body.maintenance_interval_hours,
        next_maintenance_due_at=body.next_maintenance_due_at,
        notes=body.notes,
    )
    await session.commit()
    return _serialize_asset(asset)


@router.get(
    "/assets",
    summary="List registered assets (§14.4)",
)
async def list_assets(
    session: SessionDep,
    principal: CurrentPrincipal,
    campus_id: Annotated[str | None, Query()] = None,
    asset_type: Annotated[str | None, Query()] = None,
    room_id: Annotated[str | None, Query()] = None,
    status_filter: Annotated[AssetStatus | None, Query(alias="status")] = None,
) -> dict[str, Any]:
    _ = await ensure_principal_user(session, principal)
    rows = await facilities_service.list_assets(
        session,
        campus_id=campus_id,
        asset_type=asset_type,
        room_id=room_id,
        status=status_filter,
    )
    return {
        "count": len(rows),
        "assets": [_serialize_asset(a) for a in rows],
    }


@router.get(
    "/assets/qr-labels.pdf",
    summary="Export printable PDF sheet of QR code labels for assets (§14.4)",
)
async def export_asset_qr_labels(
    session: SessionDep,
    principal: CurrentPrincipal,
    campus_id: Annotated[str | None, Query()] = None,
) -> Response:
    _ = await ensure_principal_user(session, principal)
    pdf_bytes = await facilities_service.export_asset_qr_sheet_pdf(
        session, campus_id=campus_id
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="asset-qr-labels.pdf"'},
    )


@router.post(
    "/assets/{asset_id}/checkout",
    status_code=status.HTTP_201_CREATED,
    summary="Check out an asset to a borrower with a due date (§13.1, §14.4)",
)
async def checkout_asset(
    asset_id: uuid.UUID,
    body: AssetCheckoutIn,
    session: SessionDep,
    principal: CurrentPrincipal,
) -> dict[str, Any]:
    caller_id = await ensure_principal_user(session, principal)
    borrower_id = body.borrower_user_id or caller_id
    if borrower_id != caller_id and not principal.has_role(
        Role.admin, Role.facilities, Role.staff, Role.teacher
    ):
        raise PermissionDeniedError(
            "Students may only check out assets for themselves.",
            code="asset_checkout_other_forbidden",
        )
    loan = await facilities_service.checkout_asset(
        session,
        asset_id=asset_id,
        borrower_user_id=borrower_id,
        issued_by_user_id=caller_id,
        due_at=body.due_at,
        purpose=body.purpose,
        notes=body.notes,
    )
    await session.commit()
    return _serialize_loan(loan)


@router.post(
    "/loans/{loan_id}/return",
    summary="Return a loaned asset, logging usage hours and condition (§13.1, §14.4)",
)
async def return_asset(
    loan_id: uuid.UUID,
    body: AssetReturnIn,
    session: SessionDep,
    principal: CurrentPrincipal,
) -> dict[str, Any]:
    _ = await ensure_principal_user(session, principal)
    loan, asset = await facilities_service.return_asset(
        session,
        loan_id=loan_id,
        usage_hours_logged=body.usage_hours_logged,
        condition_in=body.condition_in,
        notes=body.notes,
    )
    await session.commit()
    return {
        "loan": _serialize_loan(loan),
        "asset": _serialize_asset(asset),
    }


@router.get(
    "/loans",
    summary="List asset loans (§13.1, §14.4)",
)
async def list_loans(
    session: SessionDep,
    principal: CurrentPrincipal,
    asset_id: Annotated[uuid.UUID | None, Query()] = None,
    active_only: Annotated[bool, Query()] = False,
) -> dict[str, Any]:
    _ = await ensure_principal_user(session, principal)
    rows = await facilities_service.list_asset_loans(
        session, asset_id=asset_id, active_only=active_only
    )
    return {
        "count": len(rows),
        "loans": [_serialize_loan(r) for r in rows],
    }


@router.get(
    "/alerts",
    summary="Evaluate overdue asset loans and preventive-maintenance reminders (§14.4)",
)
async def get_facilities_alerts(
    session: SessionDep,
    principal: CurrentPrincipal,
    campus_id: Annotated[str | None, Query()] = None,
) -> dict[str, Any]:
    _ = await ensure_principal_user(session, principal)
    alerts = await facilities_service.check_overdue_and_maintenance_alerts(
        session, campus_id=campus_id
    )
    await session.commit()
    return alerts
