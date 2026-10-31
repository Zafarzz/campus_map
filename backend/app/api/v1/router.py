"""Assembles the v1 router.

Order matters for one reason: ``/compat`` is mounted before the clean routes so
its prefix cannot be shadowed by a future path parameter at the same level.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import (
    academic,
    auth,
    bookings,
    busyness,
    campus,
    compat,
    facilities,
    notifications,
    replay,
    rooms_search,
    schedule,
    state,
    stream,
    studentlife,
    tickets,
)

api_router = APIRouter()

api_router.include_router(compat.router)
# `/rooms/search` and `/rooms/{id}/state` must both be registered **before**
# `campus`, whose `/rooms/{room_id}` would otherwise match "search" as a room id
# and answer 404 for a perfectly good query.
api_router.include_router(rooms_search.router)
api_router.include_router(state.router)
api_router.include_router(campus.router)
api_router.include_router(schedule.router)
api_router.include_router(bookings.router)
api_router.include_router(replay.router)
api_router.include_router(stream.router)
api_router.include_router(auth.router)
api_router.include_router(busyness.router)
api_router.include_router(studentlife.router)
api_router.include_router(tickets.router)
api_router.include_router(notifications.router)
api_router.include_router(academic.router)
api_router.include_router(facilities.router)

__all__ = ["api_router"]
