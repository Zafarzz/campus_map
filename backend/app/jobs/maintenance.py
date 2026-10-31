"""Periodic housekeeping: auto-release, snapshots, heartbeats.

Each job takes its dependencies as arguments and opens its own session. They run
from a timer rather than a request, so holding a request's transaction would be
wrong, and taking the database explicitly keeps them testable without a
scheduler.

Every job is **idempotent**. In-process scheduling means they run once per
worker (see :mod:`app.jobs`), so a two-worker deployment would fire each one
twice; running twice must therefore be harmless rather than merely unlikely.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from app.core.config import Settings, get_settings
from app.core.db import Database, get_database
from app.core.logging import get_logger
from app.core.time import now as utc_now
from app.domain.history import StateSnapshot
from app.realtime.hub import Hub, get_hub
from app.services import booking_service, campus_service, history_service, state_service

log = get_logger(__name__)

__all__ = [
    "EDUPAGE_SYNC_INTERVAL_MINUTES",
    "SNAPSHOT_INTERVAL_MINUTES",
    "broadcast_heartbeat",
    "release_unclaimed_bookings",
    "run_facilities_housekeeping",
    "run_studentlife_housekeeping",
    "snapshot_campus_state",
    "snapshot_place_busyness",
    "sync_live_edupage_timetable",
]

#: How often to poll EduPage for a newly published timetable (e.g. exam -> regular).
EDUPAGE_SYNC_INTERVAL_MINUTES = 30

#: How often a full-campus snapshot is taken. Bounds replay work: a day's
#: replay folds at most this many minutes of events on top of a snapshot
#: instead of every transition since the system started.
SNAPSHOT_INTERVAL_MINUTES = 15


async def release_unclaimed_bookings(
    database: Database | None = None,
    hub: Hub | None = None,
) -> int:
    """Free bookings nobody checked in to, and publish the change."""
    db = database or get_database()
    hub_ = hub or get_hub()

    async with db.sessionmaker() as session:
        released = await booking_service.release_expired(session)
        if not released:
            return 0

        freed = [
            (str(booking.id), booking.resource_id, booking.starts_at, booking.ends_at) for booking in released
        ]
        await session.commit()

    from app.realtime.events import Envelope, EventType, Topic, TopicKind

    for booking_id, resource_id, starts_at, ends_at in freed:
        await hub_.publish(
            Envelope(
                type=EventType.booking_changed,
                payload={
                    "booking_id": booking_id,
                    "resource_id": str(resource_id),
                    "status": "released",
                    "reason": "no check-in within the grace period",
                    "starts_at": starts_at.isoformat(),
                    "ends_at": ends_at.isoformat(),
                },
            ),
            topic=Topic(kind=TopicKind.campus, id="all"),
        )

    log.info("unclaimed_bookings_released", count=len(freed))
    return len(freed)


async def snapshot_campus_state(
    database: Database | None = None,
    settings: Settings | None = None,
    *,
    at: datetime | None = None,
) -> bool:
    """Take a full-campus snapshot, unless a recent one already exists."""
    db = database or get_database()
    cfg = settings or get_settings()
    instant = at or utc_now()

    async with db.sessionmaker() as session:
        from sqlalchemy import select

        recent = await session.scalar(
            select(StateSnapshot.id)
            .where(StateSnapshot.at > instant - timedelta(minutes=SNAPSHOT_INTERVAL_MINUTES - 1))
            .limit(1)
        )
        if recent is not None:
            return False

        campus = await campus_service.get_default_campus(session)
        timezone = ZoneInfo(campus.timezone)
        await history_service.take_snapshot(
            session,
            at=instant,
            timezone=timezone,
            scope_type="campus",
            scope_id=campus.id,
            options=state_service.resolve_options(cfg, timezone),
        )
        await session.commit()

    return True


async def broadcast_heartbeat(database: Database | None = None, hub: Hub | None = None) -> int:
    """Beat this worker's own sockets. Returns how many were reached."""
    db = database or get_database()
    hub_ = hub or get_hub()

    if hub_.connection_count == 0:
        return 0

    async with db.sessionmaker() as session:
        sequence = await history_service.latest_sequence(session)

    return await hub_.broadcast_heartbeat(sequence)


async def snapshot_place_busyness(
    database: Database | None = None,
    *,
    at: datetime | None = None,
) -> int:
    """Record busyness snapshots for all active places (feeds best-time profiles)."""
    from app.services import crowd_service

    db = database or get_database()
    instant = at or utc_now()

    async with db.sessionmaker() as session:
        snapshots = await crowd_service.record_busyness_snapshots(session, at=instant)
        await session.commit()
        return len(snapshots)


async def run_studentlife_housekeeping(
    database: Database | None = None,
    *,
    now: datetime | None = None,
) -> tuple[int, int]:
    """Dissolve ended study-group sessions and expire old lost-and-found items."""
    from app.services import studentlife_service

    db = database or get_database()
    instant = now or utc_now()

    async with db.sessionmaker() as session:
        dissolved = await studentlife_service.dissolve_expired_study_groups(session, now=instant)
        expired = await studentlife_service.expire_old_lost_found_items(session, now=instant)
        await session.commit()
        return len(dissolved), len(expired)


async def run_facilities_housekeeping(
    database: Database | None = None,
    *,
    now: datetime | None = None,
) -> tuple[int, int]:
    """Escalate SLA-breached tickets and flag overdue asset loans (Phase 4 §14.1, §14.4)."""
    from app.services import facilities_service, ticket_service

    db = database or get_database()
    instant = now or utc_now()

    async with db.sessionmaker() as session:
        escalated = await ticket_service.escalate_overdue_tickets(session, now=instant)
        alerts = await facilities_service.check_overdue_and_maintenance_alerts(
            session, now=instant
        )
        await session.commit()
        return len(escalated), int(alerts["overdue_loans_count"])


async def sync_live_edupage_timetable(
    database: Database | None = None,
    settings: Settings | None = None,
) -> bool:
    """Sync the published EduPage timetable if upstream changed; no-op otherwise."""
    from app.jobs.scheduler import get_scheduler
    from app.services.edupage_sync_service import sync_edupage_timetable

    cfg = settings or get_settings()
    if not cfg.edupage_base_url.strip():
        return False
    db = database or get_database()

    async with db.sessionmaker() as session:
        result = await sync_edupage_timetable(session, settings=cfg)
        if not result.changed:
            return False
        await session.commit()

    get_scheduler(cfg).transitions.poke()
    return True
