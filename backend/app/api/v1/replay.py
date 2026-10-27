"""``GET /replay``: the time machine's read side.

Two axes, and keeping them distinct is the whole point (brief section 10.6):

* ``from``/``to``/``step`` walk **when things were true**.
* ``as_known_at`` walks **when we learned them**.

A teacher who confirms at 10:30 that a 09:00 lesson happened creates a row
effective at 09:00 and recorded at 10:30. A replay of the morning as known at
09:15 must not include it, and one run today must. Collapsing the two would make
the past look tidier than it was.

Frames say whether they are **recorded** or **reconstructed**. A freshly seeded
database has no history, so a replay of it re-evaluates the timetable - a
legitimate answer to "what was the state", but not a recording, and the response
labels it so a gap in capture cannot masquerade as evidence.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Annotated, Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.db import get_session
from app.core.security import Role, require_roles
from app.services import campus_service, history_service, state_service

router = APIRouter(tags=["replay"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


@router.get(
    "/replay",
    summary="Replay recorded room states between two instants",
    description=(
        "Walks `from` to `to` in `step` increments and returns the state of every room at "
        "each frame.\n\n"
        "**`as_known_at` is the second axis.** With it set, only events *recorded* at or "
        "before that instant are used, so the replay shows what the system believed at the "
        "time rather than what later turned out to be true.\n\n"
        "Each frame reports `source`: `recorded` when it came from the append-only history, "
        "`reconstructed` when there was no history and the timetable was re-evaluated. The "
        "two are not the same claim, so they are never merged."
    ),
    responses={422: {"description": "The window, step, or instant format is invalid."}},
    dependencies=[Depends(require_roles(Role.admin, Role.staff, Role.analyst))],
)
async def get_replay(
    session: SessionDep,
    settings: SettingsDep,
    from_: Annotated[
        datetime,
        Query(alias="from", description="Start instant, offset-aware ISO 8601."),
    ],
    to: Annotated[datetime, Query(description="End instant, offset-aware ISO 8601.")],
    step_minutes: Annotated[int, Query(ge=1, le=1440, description="Minutes between frames.")] = 15,
    as_known_at: Annotated[
        datetime | None,
        Query(
            description=(
                "Only use events recorded at or before this instant - 'what did we believe "
                "then?' rather than 'what was true?'."
            )
        ),
    ] = None,
) -> dict[str, Any]:
    campus = await campus_service.get_default_campus(session)
    timezone = ZoneInfo(campus.timezone)
    options = state_service.resolve_options(settings, timezone)

    frames = await history_service.replay(
        session,
        start=_aware(from_, timezone),
        end=_aware(to, timezone),
        step=timedelta(minutes=step_minutes),
        timezone=timezone,
        as_known_at=_aware(as_known_at, timezone) if as_known_at else None,
        options=options,
    )

    recorded = sum(1 for frame in frames if frame.from_history)
    return {
        "from": _aware(from_, timezone).isoformat(),
        "to": _aware(to, timezone).isoformat(),
        "step_minutes": step_minutes,
        "as_known_at": as_known_at.isoformat() if as_known_at else None,
        "frame_count": len(frames),
        "recorded_frames": recorded,
        "reconstructed_frames": len(frames) - recorded,
        "frames": [frame.as_dict() for frame in frames],
        "note": (
            None
            if recorded == len(frames)
            else (
                "Some or all frames were reconstructed by re-evaluating the timetable "
                "because no recorded history covers this window. A reconstruction is what "
                "the engine would have said, not a record of what it did say."
            )
        ),
    }


def _aware(value: datetime, timezone: ZoneInfo) -> datetime:
    """Interpret a naive query instant as campus-local.

    FastAPI will happily parse ``2026-10-19T10:45:00`` into a naive datetime.
    Rather than rejecting it here - the history service would, with a less
    helpful message - it is read as campus-local, which is what someone typing a
    wall-clock time into a replay URL means.
    """
    return value.replace(tzinfo=timezone) if value.tzinfo is None else value
