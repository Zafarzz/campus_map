"""Tests for the per-minute-bucket room context cache (Phase 2 item, Phase 3).

Covers:
* Cache hit on identical queries within the same minute bucket.
* Cache miss when querying across minute boundaries.
* Verification of hit/miss counters and entry count via state_cache_stats().
* Explicit invalidation via invalidate_state_cache().
* Automatic invalidation on SQLAlchemy session flush / state changes.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.base import TicketPriority
from app.domain.people import AppUser
from app.engines.room_state import StateOptions
from app.services import state_service, ticket_service
from app.services.state_service import (
    StateQuery,
    invalidate_state_cache,
    load_room_contexts,
    state_cache_stats,
)

TASHKENT = ZoneInfo("Asia/Tashkent")
NOW = datetime(2026, 10, 19, 10, 15, 30, tzinfo=UTC)  # 10:15 bucket


@pytest.mark.db
async def test_state_cache_hit_and_minute_bucket_miss(
    seeded_session: AsyncSession,
) -> None:
    invalidate_state_cache()
    stats_before = state_cache_stats()

    # Query 1: at 10:15:30 -> cache miss, entry cached
    query_1 = StateQuery(at=NOW, building_id="bld-h")
    ctx_1 = await load_room_contexts(seeded_session, query_1, timezone=TASHKENT)
    assert len(ctx_1) > 0

    stats_after_1 = state_cache_stats()
    assert stats_after_1["misses"] == stats_before["misses"] + 1
    assert stats_after_1["entries"] >= 1

    # Query 2: at 10:15:45 (same minute bucket 10:15) -> cache hit!
    query_2 = StateQuery(at=NOW + timedelta(seconds=15), building_id="bld-h")
    ctx_2 = await load_room_contexts(seeded_session, query_2, timezone=TASHKENT)
    assert ctx_2 == ctx_1

    stats_after_2 = state_cache_stats()
    assert stats_after_2["hits"] == stats_after_1["hits"] + 1
    assert stats_after_2["misses"] == stats_after_1["misses"]

    # Query 3: at 10:16:05 (next minute bucket 10:16) -> cache miss!
    query_3 = StateQuery(at=NOW + timedelta(seconds=35), building_id="bld-h")
    ctx_3 = await load_room_contexts(seeded_session, query_3, timezone=TASHKENT)
    assert len(ctx_3) > 0

    stats_after_3 = state_cache_stats()
    assert stats_after_3["misses"] == stats_after_2["misses"] + 1


@pytest.mark.db
async def test_state_cache_explicit_invalidation(
    seeded_session: AsyncSession,
) -> None:
    invalidate_state_cache()
    query = StateQuery(at=NOW, building_id="bld-h")
    await load_room_contexts(seeded_session, query, timezone=TASHKENT)
    assert state_cache_stats()["entries"] >= 1

    invalidate_state_cache()
    assert state_cache_stats()["entries"] == 0

    # Querying again in the same bucket now causes a miss
    misses_before = state_cache_stats()["misses"]
    await load_room_contexts(seeded_session, query, timezone=TASHKENT)
    assert state_cache_stats()["misses"] == misses_before + 1


@pytest.mark.db
async def test_state_cache_invalidated_on_session_flush(
    seeded_session: AsyncSession,
) -> None:
    """Modifying database state via ticket creation (or room update) flushes session and clears cache."""
    invalidate_state_cache()
    room_id = "bld-h-f1-a101"
    opts = StateOptions(starts_soon_minutes=0, timezone=TASHKENT)

    # 1. Warm cache
    s1 = await state_service.state_for_room(seeded_session, room_id, NOW, timezone=TASHKENT, options=opts)
    assert s1.out_of_service is False
    assert state_cache_stats()["entries"] >= 1

    # 2. Create ticket that blocks room use
    reporter = uuid.uuid4()
    seeded_session.add(AppUser(id=reporter, external_ref=f"sub:{reporter}", is_active=True))
    await seeded_session.flush()

    ticket, _ = await ticket_service.create_ticket(
        seeded_session,
        reporter_user_id=reporter,
        category="safety",
        title="Chemical spill",
        room_id=room_id,
        priority=TicketPriority.urgent,
        blocks_use=True,
        now=NOW,
    )
    assert ticket.blocks_use is True

    # Cache must have been invalidated by after_flush hook
    assert state_cache_stats()["entries"] == 0

    # 3. Next query in the exact same minute bucket loads fresh data with out_of_service=True
    s2 = await state_service.state_for_room(seeded_session, room_id, NOW, timezone=TASHKENT, options=opts)
    assert s2.out_of_service is True
