"""Assembles the v1 router.

Order matters for one reason: ``/compat`` is mounted before the clean routes so
its prefix cannot be shadowed by a future path parameter at the same level.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import auth, campus, compat, state

api_router = APIRouter()

api_router.include_router(compat.router)
# Before `campus`, so `/rooms/{room_id}/state` is matched by its own route rather
# than being swallowed by `/rooms/{room_id}`'s path parameter.
api_router.include_router(state.router)
api_router.include_router(campus.router)
api_router.include_router(auth.router)

__all__ = ["api_router"]
