"""Reading the timetable: one campus-local day at a time.

Range queries read **materialised** ``meeting`` rows and never re-expand
recurrence rules per request (brief section 10.1). Expansion happens once, at
import time, in :mod:`app.engines.recurrence`; everything here is an indexed
read.

"A day" always means a campus-local day, bounded by
:func:`app.core.time.campus_day_bounds`. For Asia/Tashkent that is 19:00 the
previous day to 19:00 UTC, and getting it wrong by using UTC midnight would
shift every day's lesson list by five hours.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import campus_day_bounds
from app.domain.academic import Meeting

__all__ = [
    "day_is_demo",
    "lessons_between",
    "lessons_by_room_for_day",
    "lessons_for_day",
    "lessons_for_room",
]


async def lessons_for_day(
    session: AsyncSession,
    *,
    day: date,
    timezone: ZoneInfo,
    room_ids: list[str] | None = None,
) -> list[Meeting]:
    """Every lesson of one campus-local day, in start order.

    Selected by **start instant** inside the day, not by overlap. That is the
    right rule for a day's lesson *list*: the front end groups lessons under the
    date they begin, so a lesson starting at 23:30 belongs to that day and not
    to both. The state engine, which needs whatever is in the room at an
    instant, uses overlap instead - see
    :func:`app.services.state_service.load_room_contexts`.
    """
    start, end = campus_day_bounds(day, timezone)
    return await lessons_between(session, start=start, end=end, room_ids=room_ids)


async def lessons_between(
    session: AsyncSession,
    *,
    start: datetime,
    end: datetime,
    room_ids: list[str] | None = None,
) -> list[Meeting]:
    """Lessons starting in ``[start, end)``, in start order."""
    stmt = (
        select(Meeting)
        .where(Meeting.starts_at >= start, Meeting.starts_at < end)
        .order_by(Meeting.starts_at, Meeting.room_id, Meeting.id)
    )
    if room_ids is not None:
        if not room_ids:
            return []
        stmt = stmt.where(Meeting.room_id.in_(room_ids))

    result = await session.execute(stmt)
    return list(result.scalars().all())


async def lessons_by_room_for_day(
    session: AsyncSession,
    *,
    day: date,
    timezone: ZoneInfo,
    room_ids: list[str] | None = None,
) -> dict[str, list[Meeting]]:
    """One day's lessons bucketed by room.

    What the compatibility layer's ``RoomScheduleState.lessons`` needs: the front
    end renders a room card with that room's whole day, so the grouping happens
    once here rather than with a query per room.
    """
    meetings = await lessons_for_day(session, day=day, timezone=timezone, room_ids=room_ids)

    grouped: dict[str, list[Meeting]] = defaultdict(list)
    for meeting in meetings:
        if meeting.room_id is not None:
            grouped[meeting.room_id].append(meeting)
    return dict(grouped)


async def lessons_for_room(
    session: AsyncSession,
    *,
    room_id: str,
    day: date,
    timezone: ZoneInfo,
) -> list[Meeting]:
    """One room's day."""
    return await lessons_for_day(session, day=day, timezone=timezone, room_ids=[room_id])


async def day_is_demo(
    session: AsyncSession,
    *,
    day: date,
    timezone: ZoneInfo,
) -> bool:
    """True when any lesson on this day is generated demo data.

    Drives the ``is_demo`` flag and the ``source`` field on compat responses. The
    brief forbids presenting demo data as real (section 3.5), so this is checked
    per response rather than assumed from configuration - a campus can be
    half-imported, and a response that covers generated lessons must say so.

    Implemented as an ``EXISTS``: the answer is a boolean and counting every row
    to produce it would read the whole day for nothing.
    """
    start, end = campus_day_bounds(day, timezone)
    found = await session.scalar(
        select(
            exists().where(
                Meeting.starts_at >= start,
                Meeting.starts_at < end,
                Meeting.is_demo.is_(True),
            )
        )
    )
    return bool(found)
