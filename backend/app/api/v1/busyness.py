"""Layer 1: Crowds & Place Busyness API (brief section 11).

Endpoints:
* ``GET /busyness`` — busyness readings for all monitored campus places.
* ``GET /busyness/flows`` — class-change corridor & entrance flows in 5-minute
  bins with small-cell suppression (section 11.3).
* ``GET /busyness/walking-check`` — timetable walking-time transition report
  (section 11.4).
* ``GET /busyness/{place_id}`` — busyness reading for one place (section 11.1).
* ``POST /busyness/{place_id}/report`` — authenticated one-tap crowd report
  (rate-limited per user per place per window; never accepts or stores location).
* ``GET /busyness/{place_id}/best-time`` — hour-of-week profile (`median`, `p80`)
  with schedule proxy fallback and ``"not_enough_data"`` gate (section 11.2).
* ``GET /busyness/{place_id}/queue`` — M/M/c (Erlang C) canteen queue estimate
  (section 11.5).
* ``GET /display/{place_id}`` — lightweight read-only display payload for a
  screen outside a venue (section 11.1).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.state import parse_at
from app.core.db import get_session
from app.core.errors import ValidationError
from app.core.security import CurrentPrincipal, Principal
from app.domain.base import CrowdLevel, PlaceKind
from app.domain.people import AppUser
from app.engines.crowds import DEFAULT_SMALL_CELL_MIN_COUNT, DEFAULT_WALKING_SPEED_MPS
from app.services import crowd_service
from app.services.crowd_service import PlaceBusynessView

router = APIRouter(tags=["crowds"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]


async def ensure_principal_user(session: AsyncSession, principal: Principal) -> uuid.UUID:
    """Resolve ``principal.subject`` to a UUID and ensure an ``AppUser`` row exists."""
    try:
        uid = uuid.UUID(principal.subject)
    except ValueError:
        uid = uuid.uuid5(uuid.NAMESPACE_OID, f"campus-user:{principal.subject}")

    user = await session.get(AppUser, uid)
    if user is None:
        user = AppUser(
            id=uid,
            external_ref=f"sub:{principal.subject}",
            is_active=True,
            locale="en",
        )
        session.add(user)
        await session.flush()
    return uid


class CrowdReportIn(BaseModel):
    """One-tap crowd report body.

    ``extra="forbid"`` rejects any attempt to send latitude, longitude, or
    device location fields (brief sections 3.4, 11.1).
    """

    model_config = ConfigDict(extra="forbid")

    level: CrowdLevel
    wait_band: str | None = Field(
        default=None,
        description="Optional canteen wait band: under_5, 5_10, 10_20, over_20.",
    )


def _serialize_busyness(view: PlaceBusynessView) -> dict[str, Any]:
    return {
        "place_id": view.place_id,
        "name": view.name,
        "kind": view.kind.value,
        "building_id": view.building_id,
        "capacity": view.capacity,
        "level": view.level.value,
        "percentage_of_capacity": view.percentage_of_capacity,
        "fraction": view.fraction,
        "headcount_likely": view.headcount_likely,
        "headcount_low": view.headcount_low,
        "headcount_high": view.headcount_high,
        "provenance": view.provenance.value,
        "confidence": view.confidence,
        "is_measurement": False,
        "fresh_reports_count": view.fresh_reports_count,
        "at": view.at.isoformat(),
        "inputs": list(view.inputs),
        "note": view.note,
    }


@router.get(
    "/busyness",
    summary="List busyness for monitored campus places",
)
async def list_busyness(
    session: SessionDep,
    kind: Annotated[PlaceKind | None, Query()] = None,
    building: Annotated[str | None, Query()] = None,
    at: Annotated[str | None, Query()] = None,
) -> dict[str, Any]:
    instant, _ = parse_at(at)
    views = await crowd_service.list_places_busyness(
        session,
        kind=kind,
        building_id=building,
        at=instant,
    )
    return {
        "at": instant.isoformat(),
        "count": len(views),
        "places": [_serialize_busyness(v) for v in views],
    }


@router.get(
    "/busyness/flows",
    summary="Class-change corridor and entrance flows in 5-minute bins",
)
async def get_flows(
    session: SessionDep,
    window_start: Annotated[
        datetime | None,
        Query(description="UTC start of window; defaults to 15 minutes ago."),
    ] = None,
    window_end: Annotated[
        datetime | None,
        Query(description="UTC end of window; defaults to 45 minutes from window_start."),
    ] = None,
    small_cell_min_count: Annotated[int, Query(ge=1, le=100)] = DEFAULT_SMALL_CELL_MIN_COUNT,
) -> dict[str, Any]:
    now_utc = datetime.now(UTC)
    s_at = window_start or (now_utc - timedelta(minutes=15))
    e_at = window_end or (s_at + timedelta(minutes=60))
    if s_at.tzinfo is None or e_at.tzinfo is None:
        raise ValidationError(
            "window_start and window_end must carry a timezone offset.",
            code="naive_instant",
        )
    if e_at <= s_at:
        raise ValidationError("window_end must be after window_start.", code="empty_period")

    res = await crowd_service.get_class_change_flows(
        session,
        window_start=s_at,
        window_end=e_at,
        small_cell_min_count=small_cell_min_count,
    )
    return {
        "window_start": s_at.isoformat(),
        "window_end": e_at.isoformat(),
        "small_cell_min_count": res.small_cell_min_count,
        "provenance": res.provenance.value,
        "distance_source": "straight_line_centroid_fallback_until_phase5",
        "corridor_bins": [
            {
                "origin_building_id": b.origin_building_id,
                "destination_building_id": b.destination_building_id,
                "bin_start": b.bin_start.isoformat(),
                "bin_end": b.bin_end.isoformat(),
                "distance_m": b.distance_m,
                "displayed_headcount": b.displayed_headcount,
                "suppressed": b.suppressed,
                "trip_count": b.trip_count,
            }
            for b in res.corridor_bins
        ],
        "entrance_bins": [
            {
                "building_id": b.building_id,
                "bin_start": b.bin_start.isoformat(),
                "bin_end": b.bin_end.isoformat(),
                "displayed_total": b.displayed_total,
                "suppressed": b.suppressed,
            }
            for b in res.entrance_bins
        ],
    }


@router.get(
    "/busyness/walking-check",
    summary="Check timetable transitions against inter-building walking times",
)
async def get_walking_check(
    session: SessionDep,
    walking_speed_mps: Annotated[float, Query(gt=0.2, le=3.5)] = DEFAULT_WALKING_SPEED_MPS,
) -> dict[str, Any]:
    issues = await crowd_service.get_walking_transitions_report(session, walking_speed_mps=walking_speed_mps)
    return {
        "walking_speed_mps": walking_speed_mps,
        "distance_source": "straight_line_centroid_fallback_until_phase5",
        "issue_count": len(issues),
        "issues": [
            {
                "subject_kind": item.subject_kind,
                "subject_id": item.subject_id,
                "weekday": item.weekday,
                "from_room_id": item.from_room_id,
                "to_room_id": item.to_room_id,
                "from_building_id": item.from_building_id,
                "to_building_id": item.to_building_id,
                "ends_at": item.ends_at,
                "starts_at": item.starts_at,
                "gap_seconds": item.gap_seconds,
                "required_seconds": item.required_seconds,
                "distance_m": item.distance_m,
                "floor_delta": item.floor_delta,
            }
            for item in issues
        ],
    }


@router.get(
    "/busyness/{place_id}",
    summary="Get busyness for one campus place",
)
async def get_busyness(
    place_id: str,
    session: SessionDep,
    at: Annotated[str | None, Query()] = None,
) -> dict[str, Any]:
    instant, _ = parse_at(at)
    view = await crowd_service.get_place_busyness(session, place_id, at=instant)
    return _serialize_busyness(view)


@router.post(
    "/busyness/{place_id}/report",
    status_code=status.HTTP_201_CREATED,
    summary="Submit a one-tap crowd report for a place",
)
async def report_busyness(
    place_id: str,
    body: CrowdReportIn,
    session: SessionDep,
    principal: CurrentPrincipal,
    at: Annotated[str | None, Query()] = None,
) -> dict[str, Any]:
    instant, _ = parse_at(at)
    user_id = await ensure_principal_user(session, principal)
    view = await crowd_service.submit_place_report(
        session,
        place_id=place_id,
        user_id=user_id,
        level=body.level,
        wait_band=body.wait_band,
        at=instant,
    )
    await session.commit()
    return _serialize_busyness(view)


@router.get(
    "/busyness/{place_id}/best-time",
    summary="Hour-of-week busyness profile ('best time to go')",
)
async def get_best_time(
    place_id: str,
    session: SessionDep,
    min_samples_per_bucket: Annotated[int, Query(ge=1, le=50)] = 3,
    min_buckets: Annotated[int, Query(ge=1, le=168)] = 1,
) -> dict[str, Any]:
    profile = await crowd_service.get_best_time_to_go(
        session,
        place_id,
        min_samples_per_bucket=min_samples_per_bucket,
        min_buckets=min_buckets,
    )
    return {
        "place_id": profile.place_id,
        "status": profile.status,
        "provenance": profile.provenance.value,
        "min_samples_required": profile.min_samples_required,
        "total_samples": profile.total_samples,
        "best_hours": list(profile.best_hours),
        "worst_hours": list(profile.worst_hours),
        "buckets": [
            {
                "hour_of_week": b.hour_of_week,
                "weekday": b.weekday,
                "hour": b.hour,
                "median_fraction": b.median_fraction,
                "p80_fraction": b.p80_fraction,
                "sample_count": b.sample_count,
                "level": b.level.value,
            }
            for b in profile.buckets
        ],
        "note": profile.note,
    }


@router.get(
    "/busyness/{place_id}/queue",
    summary="Canteen queue length and waiting-time estimate (M/M/c Erlang C)",
)
async def get_canteen_queue(
    place_id: str,
    session: SessionDep,
    at: Annotated[str | None, Query()] = None,
) -> dict[str, Any]:
    instant, _ = parse_at(at)
    est = await crowd_service.get_canteen_queue_estimate(session, place_id, at=instant)
    return {
        "place_id": place_id,
        "at": instant.isoformat(),
        "counters": est.counters,
        "effective_arrival_rate_per_min": est.effective_arrival_rate_per_min,
        "service_rate_per_counter_per_min": est.service_rate_per_counter_per_min,
        "utilization_rho": est.utilization_rho,
        "probability_of_waiting": est.probability_of_waiting,
        "expected_queue_length": est.expected_queue_length,
        "expected_wait_minutes": est.expected_wait_minutes,
        "wait_minutes_low": est.wait_minutes_low,
        "wait_minutes_high": est.wait_minutes_high,
        "saturated": est.saturated,
        "provenance": est.provenance.value,
        "confidence": est.confidence,
        "is_measurement": False,
        "assumptions": est.assumptions,
    }


@router.get(
    "/display/{place_id}",
    summary="Lightweight read-only display payload for a screen outside a venue",
)
async def get_display_view(
    place_id: str,
    session: SessionDep,
    at: Annotated[str | None, Query()] = None,
) -> dict[str, Any]:
    instant, _ = parse_at(at)
    view = await crowd_service.get_place_busyness(session, place_id, at=instant)
    payload: dict[str, Any] = {
        "place_id": view.place_id,
        "name": view.name,
        "kind": view.kind.value,
        "level": view.level.value,
        "percentage_of_capacity": view.percentage_of_capacity,
        "provenance": view.provenance.value,
        "confidence": view.confidence,
        "updated_at": view.at.isoformat(),
    }
    if view.kind is PlaceKind.canteen:
        q = await crowd_service.get_canteen_queue_estimate(session, place_id, at=instant)
        payload["expected_wait_minutes"] = q.expected_wait_minutes
        payload["expected_queue_length"] = q.expected_queue_length
    return payload
