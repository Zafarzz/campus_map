"""Compatibility layer: the front end's exact shapes, served from PostgreSQL.

Purpose (brief section 8, section 0.1 step 5): let the 3D map stop using its static
demo modules and read real data instead, with the smallest possible change to
the front end - ideally one function body per seam.

Status in Phase 1:

* ``/compat/campus`` - **working**. Replaces ``loadCampus()``.
* ``/compat/lessons``, ``/compat/room-states``, ``/compat/live-counts`` - documented
  and return **501**, because they need the timetable importer and the room-state
  engine, which are Layer 0 work in Phase 2. They return an explicit error
  rather than an empty list: "no data" and "not built yet" must not look alike.
"""

from __future__ import annotations

from datetime import date as date_type
from datetime import datetime
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.compat import (
    CompatCampus,
    CompatCampusResponse,
    CompatLessonsResponse,
    CompatLiveCountsResponse,
    CompatRoomStatesResponse,
)
from app.core.config import Settings, get_settings
from app.core.db import get_session
from app.core.errors import ValidationError
from app.core.time import campus_date, campus_local_naive, now, parse_campus_local_naive
from app.services import campus_service, compat_service, schedule_service, state_service

router = APIRouter(prefix="/compat", tags=["compat"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]

_SEAM_CAMPUS = "src/services/campus/campusService.ts :: loadCampus()"
_SEAM_LESSONS = "src/services/schedule/scheduleService.ts :: loadLessonsForDate()"
_SEAM_STATES = "src/domain/schedule/roomStatus.ts :: computeRoomStates()"
_SEAM_LIVE = "src/components/3d/Campus.tsx :: liveCountByBuilding"


@router.get(
    "/campus",
    response_model=CompatCampusResponse,
    response_model_exclude_none=True,
    summary="The campus tree in the front end's exact Campus shape, with provenance",
    description=(
        "Returns `{campus, meta}`, where `campus` is exactly the front end's `Campus` object "
        "and `meta` carries provenance and the demo-data flag.\n\n"
        "For a drop-in replacement of `" + _SEAM_CAMPUS + "` use "
        "**`GET /api/v1/compat/campus/bare`**, which returns the `Campus` object alone.\n\n"
        "Identifiers are the front end's own identifiers, seeded from its data, so switching "
        "the seam renames nothing. Optional fields (`name`, `capacity`, `description`, "
        "`appearance`) are **omitted** rather than sent as null, matching the `field?:` "
        'optional types - a literal null would render as the text "null" in the room card.'
    ),
)
async def compat_campus(session: SessionDep, response: Response) -> CompatCampusResponse:
    tree = await campus_service.load_campus_tree(session)
    meta = compat_service.meta_for_campus(tree)
    _provenance_headers(response, meta.source, meta.is_demo)
    return CompatCampusResponse(campus=compat_service.campus_to_compat(tree), meta=meta)


@router.get(
    "/campus/bare",
    response_model=CompatCampus,
    response_model_exclude_none=True,
    summary="The bare Campus object, for loadCampus()",
    description=(
        "Drop-in replacement for `" + _SEAM_CAMPUS + "`: the response body is exactly what "
        "that function must resolve to, so the seam becomes a single `fetch`.\n\n"
        "A separate route rather than a `?bare=true` flag on `/compat/campus`, because one "
        "endpoint returning two different shapes cannot be described by one response model - "
        "and an unvalidated response is the last thing a compatibility contract should have.\n\n"
        "Provenance travels in the `x-campus-source` and `x-campus-is-demo` response headers, "
        "since the body's shape is fixed by the front end's type."
    ),
)
async def compat_campus_bare(session: SessionDep, response: Response) -> CompatCampus:
    tree = await campus_service.load_campus_tree(session)
    meta = compat_service.meta_for_campus(tree)
    _provenance_headers(response, meta.source, meta.is_demo)
    return compat_service.campus_to_compat(tree)


def _provenance_headers(response: Response, source: str, is_demo: bool) -> None:
    """Label provenance even where the body cannot carry it (brief section 3.5)."""
    response.headers["x-campus-source"] = source
    response.headers["x-campus-is-demo"] = "true" if is_demo else "false"


@router.get(
    "/lessons",
    response_model=CompatLessonsResponse,
    response_model_exclude_none=True,
    summary="One day's lessons in the front end's Lesson[] shape",
    description=(
        "Drop-in replacement for `" + _SEAM_LESSONS + "`.\n\n"
        "`startsAt`/`endsAt` are offset-naive campus-local strings "
        "(`2026-10-19T09:00:00`), exactly as `src/data/demo-schedule.ts` writes them, so "
        "the browser's `new Date(...)` keeps parsing them as local time. Sending an "
        "offset-aware instant would still parse but would shift every lesson by the "
        "viewer's offset from the campus.\n\n"
        "`cancelled` is omitted when false, matching the optional `cancelled?: boolean`.\n\n"
        "The day is the **campus-local** day: for Asia/Tashkent (UTC+5) that is "
        "19:00 the previous day to 19:00 UTC."
    ),
)
async def compat_lessons(
    session: SessionDep,
    response: Response,
    date: Annotated[date_type, Query(description="Campus-local date, YYYY-MM-DD.")],
) -> CompatLessonsResponse:
    campus = await campus_service.get_default_campus(session)
    timezone = ZoneInfo(campus.timezone)

    meetings = await schedule_service.lessons_for_day(session, day=date, timezone=timezone)
    any_demo = any(meeting.is_demo for meeting in meetings)

    _provenance_headers(response, "demo" if any_demo else "confirmed", any_demo)
    return CompatLessonsResponse(
        date=date.isoformat(),
        lessons=[compat_service.meeting_to_compat(meeting, timezone) for meeting in meetings],
        meta=compat_service.meta_for_states([], at=now(), any_demo=any_demo),
    )


@router.get(
    "/room-states",
    response_model=CompatRoomStatesResponse,
    response_model_exclude_none=True,
    summary="Room states as of an instant, keyed by room id",
    description=(
        "Drop-in replacement for `" + _SEAM_STATES + "`.\n\n"
        "Returns `Record<roomId, RoomScheduleState>` with `status` in the front end's "
        "SCREAMING_CASE spelling (`AVAILABLE`, `CURRENT`, `UPCOMING`, `FINISHED`, "
        "`CANCELLED`), and an `upcomingWindowMinutes` that defaults to **60** to match "
        "`src/config/mapConfig.ts` - not the brief's clean-API default of 15, which would "
        "visibly change the colours on the map.\n\n"
        "`at` accepts the front end's own **offset-naive** campus-local spelling "
        "(`2026-10-19T10:45:00`) as well as an offset-aware instant, because that is what "
        "the Simulate slider produces. The clean `/state` endpoint rejects naive input; "
        "here it is part of the contract.\n\n"
        "**Deliberately lossy:** a room taken out of service by a maintenance ticket has no "
        "representation in `RoomStatus`, so it is reported in `meta.note` and in full on "
        "`/api/v1/state` rather than being painted as `CANCELLED`."
    ),
)
async def compat_room_states(
    session: SessionDep,
    settings: SettingsDep,
    response: Response,
    at: Annotated[
        str | None,
        Query(
            description=(
                "Campus-local naive instant or an offset-aware one. Omit for now. "
                "Simulate passes the slider's instant."
            ),
            examples=["2026-10-19T10:45:00"],
        ),
    ] = None,
    building: Annotated[
        str | None, Query(description="Limit to one building id, e.g. `bld-h`.")
    ] = None,
) -> CompatRoomStatesResponse:
    campus = await campus_service.get_default_campus(session)
    timezone = ZoneInfo(campus.timezone)
    instant = _parse_compat_at(at, timezone)
    options = state_service.resolve_options(settings, timezone, compat=True)

    if building is not None:
        result = await state_service.state_for_building(
            session, building, instant, timezone=timezone, options=options
        )
    else:
        result = await state_service.state_for_campus(
            session, instant, timezone=timezone, options=options
        )

    lessons_by_room = await schedule_service.lessons_by_room_for_day(
        session,
        day=campus_date(instant, timezone),
        timezone=timezone,
        room_ids=[item.room_id for item in result.states],
    )
    any_demo = await schedule_service.day_is_demo(
        session, day=campus_date(instant, timezone), timezone=timezone
    )

    states = {
        item.room_id: compat_service.room_state_to_compat(
            item,
            [
                compat_service.meeting_to_compat(meeting, timezone)
                for meeting in lessons_by_room.get(item.room_id, [])
            ],
            timezone,
        )
        for item in result.states
    }

    _provenance_headers(response, "demo" if any_demo else "confirmed", any_demo)
    return CompatRoomStatesResponse(
        # Naive campus-local, so a client can echo it straight back.
        at=campus_local_naive(instant, timezone),
        upcomingWindowMinutes=options.starts_soon_minutes,
        states=states,
        meta=compat_service.meta_for_states(result.states, at=instant, any_demo=any_demo),
    )


@router.get(
    "/live-counts",
    response_model=CompatLiveCountsResponse,
    response_model_exclude_none=True,
    summary='Rooms with a lesson in progress per building (the "N live" badge)',
    description=(
        "Replaces the `useMemo` in `" + _SEAM_LIVE + "`.\n\n"
        "Counts rooms whose status is `CURRENT`, per building id. Every building is "
        "present, zero included, so the badge does not have to special-case a missing key.\n\n"
        "Uses the same 60-minute upcoming window as `/compat/room-states`, so the two "
        "cannot disagree about which rooms are live."
    ),
)
async def compat_live_counts(
    session: SessionDep,
    settings: SettingsDep,
    response: Response,
    at: Annotated[
        str | None,
        Query(description="Campus-local naive instant or an offset-aware one. Omit for now."),
    ] = None,
) -> CompatLiveCountsResponse:
    campus = await campus_service.get_default_campus(session)
    timezone = ZoneInfo(campus.timezone)
    instant = _parse_compat_at(at, timezone)
    options = state_service.resolve_options(settings, timezone, compat=True)

    result = await state_service.state_for_campus(
        session, instant, timezone=timezone, options=options
    )
    any_demo = await schedule_service.day_is_demo(
        session, day=campus_date(instant, timezone), timezone=timezone
    )

    _provenance_headers(response, "demo" if any_demo else "confirmed", any_demo)
    return CompatLiveCountsResponse(
        at=campus_local_naive(instant, timezone),
        counts=result.live_counts,
        meta=compat_service.meta_for_states(result.states, at=instant, any_demo=any_demo),
    )


def _parse_compat_at(raw: str | None, timezone: ZoneInfo) -> datetime:
    """Parse the front end's ``at``, accepting its naive campus-local spelling.

    The clean API refuses a naive instant on principle; here accepting one *is*
    the contract, because ``src/hooks/useNow.ts`` models simulated time as
    minutes since local midnight and formats it without an offset. The
    interpretation is stated rather than guessed: naive means campus-local.
    """
    if raw is None or not raw.strip():
        return now()
    try:
        return parse_campus_local_naive(raw.strip().replace("Z", "+00:00"), timezone)
    except ValueError as exc:
        raise ValidationError(
            f"Could not parse 'at' value {raw!r}. Use the front end's campus-local "
            "spelling (2026-10-19T10:45:00) or an offset-aware instant.",
            code="invalid_at",
            details={"at": raw},
        ) from exc
