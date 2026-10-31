"""Shared issue & maintenance ticket service (brief sections 6.2, 12.3, 14.1).

Coordinates:
* Duplicate detection ("me too" upvoting within the merge window).
* EXIF stripping and storage for attached photos.
* Automatic assignment rules by category and building scope.
* Legal state transitions and append-only ``TicketEvent`` history.
* Background SLA breach escalation (`escalate_overdue_tickets`).
* Operational metrics (`get_ticket_metrics`: time to triage, time to resolve,
  SLA breaches, reopen rate).
* Synchronising ``Room.out_of_service`` whenever a blocking ticket is opened,
  updated, resolved, closed, or reopened (so the room-state precedence engine
  immediately reflects ``out_of_service`` at priority #1).
* Reporter notifications on creation and status changes.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.storage import StorageAdapter, strip_image_exif
from app.core.errors import ForbiddenError, NotFoundError, ValidationError
from app.core.security import Role
from app.domain.base import TicketPriority, TicketStatus
from app.domain.operations import Ticket, TicketEvent
from app.domain.people import UserRole
from app.domain.spatial import Floor, Room
from app.engines.tickets import (
    ACTIVE_TICKET_STATUSES,
    CandidateExistingTicket,
    InvalidTicketTransitionError,
    TicketMetricSample,
    TicketMetricsSummary,
    compute_sla_due_at,
    compute_ticket_metrics,
    find_duplicate_ticket,
    next_escalated_priority,
    validate_ticket_transition,
)
from app.services.notification_service import send_notification
from app.services.state_service import invalidate_state_cache

__all__ = [
    "create_ticket",
    "escalate_overdue_tickets",
    "get_ticket_metrics",
    "get_ticket_with_events",
    "list_tickets",
    "rate_ticket",
    "sync_room_out_of_service",
    "transition_ticket",
]

_CATEGORY_TO_STAFF_ROLE: dict[str, Role] = {
    "av": Role.staff,
    "projector": Role.staff,
    "network": Role.staff,
    "it": Role.staff,
    "cleaning": Role.facilities,
    "sanitation": Role.facilities,
    "spill": Role.facilities,
}


async def _find_auto_assignee(
    session: AsyncSession,
    *,
    category: str,
    building_id: str | None,
) -> uuid.UUID | None:
    """Resolve an assignee from ``user_role`` based on category and building scope (§14.1)."""
    norm_cat = category.strip().lower()
    target_role = _CATEGORY_TO_STAFF_ROLE.get(norm_cat, Role.facilities)
    rows = (
        await session.execute(
            select(UserRole).where(UserRole.role == target_role).order_by(UserRole.created_at.asc())
        )
    ).scalars().all()
    if not rows:
        return None
    if building_id is not None:
        for r in rows:
            if r.scope == building_id or r.scope == norm_cat:
                return r.user_id
    for r in rows:
        if r.scope is None or r.scope == norm_cat:
            return r.user_id
    return rows[0].user_id


async def create_ticket(
    session: AsyncSession,
    *,
    reporter_user_id: uuid.UUID,
    category: str,
    title: str,
    description: str = "",
    subcategory: str | None = None,
    building_id: str | None = None,
    floor_id: str | None = None,
    room_id: str | None = None,
    place_id: str | None = None,
    priority: TicketPriority = TicketPriority.normal,
    blocks_use: bool = False,
    photo_bytes: bytes | None = None,
    storage: StorageAdapter | None = None,
    merge_window: timedelta = timedelta(hours=24),
    is_demo: bool = False,
    now: datetime | None = None,
) -> tuple[Ticket, bool]:
    """Create a ticket or merge into an open duplicate within ``merge_window``.

    Returns ``(ticket, was_merged)``.
    """
    instant = now or datetime.now(UTC)

    # Resolve building_id / floor_id from room_id when not explicitly passed.
    if room_id is not None:
        room = await session.get(Room, room_id)
        if room is None:
            raise NotFoundError(f"Room {room_id!r} does not exist.", code="room_not_found")
        if floor_id is None:
            floor_id = room.floor_id
        if building_id is None and room.floor_id:
            floor = await session.get(Floor, room.floor_id)
            if floor is not None:
                building_id = floor.building_id

    # Check for open duplicates in the merge window.
    if room_id is not None or place_id is not None:
        cutoff = instant - merge_window
        stmt = select(Ticket).where(
            Ticket.status.in_(tuple(ACTIVE_TICKET_STATUSES)),
            Ticket.created_at >= cutoff,
        )
        if room_id is not None:
            stmt = stmt.where(Ticket.room_id == room_id)
        elif place_id is not None:
            stmt = stmt.where(Ticket.place_id == place_id)

        recent = (await session.execute(stmt)).scalars().all()
        candidates = [
            CandidateExistingTicket(
                id=t.id,
                room_id=t.room_id,
                place_id=t.place_id,
                building_id=t.building_id,
                category=t.category,
                subcategory=t.subcategory,
                status=t.status,
                created_at=t.created_at or instant,
            )
            for t in recent
        ]
        dup_id = find_duplicate_ticket(
            candidates,
            room_id=room_id,
            place_id=place_id,
            building_id=building_id,
            category=category,
            subcategory=subcategory,
            now=instant,
            merge_window=merge_window,
        )
        if dup_id is not None:
            primary = await session.get(Ticket, dup_id)
            if primary is not None:
                primary.upvotes_count = (primary.upvotes_count or 1) + 1
                if blocks_use and not primary.blocks_use:
                    primary.blocks_use = True
                session.add(
                    TicketEvent(
                        ticket_id=primary.id,
                        actor_user_id=reporter_user_id,
                        event_type="merged_upvote",
                        from_status=primary.status,
                        to_status=primary.status,
                        note=title,
                        payload={"merged_reporter_id": str(reporter_user_id)},
                        created_at=instant,
                    )
                )
                await session.flush()
                if primary.room_id:
                    await sync_room_out_of_service(session, primary.room_id)
                return primary, True

    photo_key: str | None = None
    if photo_bytes is not None and storage is not None:
        clean_bytes, content_type = strip_image_exif(photo_bytes)
        ext = content_type.split("/")[-1]
        key = f"tickets/{uuid.uuid4().hex}.{ext}"
        stored = storage.put_bytes(key, clean_bytes, content_type=content_type)
        photo_key = stored.key

    auto_assignee = await _find_auto_assignee(
        session, category=category, building_id=building_id
    )
    sla_due = compute_sla_due_at(instant, priority)
    ticket = Ticket(
        reporter_user_id=reporter_user_id,
        assignee_user_id=auto_assignee,
        building_id=building_id,
        floor_id=floor_id,
        room_id=room_id,
        place_id=place_id,
        category=category.strip(),
        subcategory=subcategory.strip() if subcategory else None,
        title=title.strip(),
        description=description.strip(),
        photo_storage_key=photo_key,
        priority=priority,
        status=TicketStatus.new,
        blocks_use=blocks_use,
        upvotes_count=1,
        sla_due_at=sla_due,
        is_demo=is_demo,
    )
    session.add(ticket)
    await session.flush()

    session.add(
        TicketEvent(
            ticket_id=ticket.id,
            actor_user_id=reporter_user_id,
            event_type="created",
            from_status=None,
            to_status=TicketStatus.new,
            note="Ticket created",
            created_at=instant,
        )
    )
    await session.flush()

    if room_id is not None:
        await sync_room_out_of_service(session, room_id)

    await send_notification(
        session,
        recipient_id=reporter_user_id,
        template_id="ticket.created",
        params={
            "ticket_short": str(ticket.id)[:8],
            "title": ticket.title,
            "category": ticket.category,
            "status": ticket.status.value,
        },
        now=instant,
        is_demo=is_demo,
    )
    return ticket, False


async def transition_ticket(
    session: AsyncSession,
    *,
    ticket_id: uuid.UUID,
    to_status: TicketStatus,
    actor_user_id: uuid.UUID | None = None,
    assignee_user_id: uuid.UUID | None = None,
    blocks_use: bool | None = None,
    note: str | None = None,
    now: datetime | None = None,
) -> Ticket:
    """Transition a ticket along the legal state machine and sync room status."""
    instant = now or datetime.now(UTC)
    ticket = await session.get(Ticket, ticket_id)
    if ticket is None:
        raise NotFoundError(f"Ticket {ticket_id} does not exist.", code="ticket_not_found")

    from_status = ticket.status
    if to_status != from_status:
        try:
            validate_ticket_transition(from_status, to_status)
        except InvalidTicketTransitionError as exc:
            raise ValidationError(str(exc), code="invalid_ticket_transition") from exc

    ticket.status = to_status
    if assignee_user_id is not None:
        ticket.assignee_user_id = assignee_user_id
    if blocks_use is not None:
        ticket.blocks_use = blocks_use

    if to_status is TicketStatus.resolved:
        ticket.resolved_at = instant
    elif to_status is TicketStatus.closed:
        ticket.closed_at = instant
    elif to_status is TicketStatus.reopened:
        ticket.resolved_at = None
        ticket.closed_at = None

    session.add(
        TicketEvent(
            ticket_id=ticket.id,
            actor_user_id=actor_user_id,
            event_type="status_changed",
            from_status=from_status,
            to_status=to_status,
            note=note,
            created_at=instant,
        )
    )
    await session.flush()

    if ticket.room_id is not None:
        await sync_room_out_of_service(session, ticket.room_id)

    if from_status != to_status:
        await send_notification(
            session,
            recipient_id=ticket.reporter_user_id,
            template_id="ticket.status_changed",
            params={
                "ticket_short": str(ticket.id)[:8],
                "title": ticket.title,
                "from_status": from_status.value,
                "to_status": to_status.value,
            },
            now=instant,
            is_demo=ticket.is_demo,
        )
    return ticket


async def escalate_overdue_tickets(
    session: AsyncSession,
    *,
    now: datetime | None = None,
    limit: int = 200,
) -> list[Ticket]:
    """Promote priority of active tickets that have breached ``sla_due_at`` (§14.1)."""
    instant = now or datetime.now(UTC)
    rows = (
        await session.execute(
            select(Ticket)
            .where(
                Ticket.status.in_(tuple(ACTIVE_TICKET_STATUSES)),
                Ticket.sla_due_at.is_not(None),
                Ticket.sla_due_at < instant,
                Ticket.priority != TicketPriority.urgent,
            )
            .order_by(Ticket.sla_due_at.asc())
            .limit(limit)
        )
    ).scalars().all()

    escalated: list[Ticket] = []
    for ticket in rows:
        old_priority = ticket.priority
        new_priority = next_escalated_priority(old_priority)
        if new_priority == old_priority:
            continue
        ticket.priority = new_priority
        ticket.sla_due_at = compute_sla_due_at(instant, new_priority)
        session.add(
            TicketEvent(
                ticket_id=ticket.id,
                actor_user_id=None,
                event_type="sla_escalated",
                from_status=ticket.status,
                to_status=ticket.status,
                note=f"SLA breached; priority escalated from {old_priority.value} to {new_priority.value}",
                payload={
                    "old_priority": old_priority.value,
                    "new_priority": new_priority.value,
                },
                created_at=instant,
            )
        )
        escalated.append(ticket)

    if escalated:
        await session.flush()
    return escalated


async def get_ticket_metrics(
    session: AsyncSession,
    *,
    building_id: str | None = None,
    category: str | None = None,
    now: datetime | None = None,
) -> TicketMetricsSummary:
    """Compute operational ticket metrics (§14.1)."""
    instant = now or datetime.now(UTC)
    stmt = select(Ticket)
    if building_id is not None:
        stmt = stmt.where(Ticket.building_id == building_id)
    if category is not None:
        stmt = stmt.where(Ticket.category == category)

    tickets = list((await session.execute(stmt)).scalars().all())
    if not tickets:
        return compute_ticket_metrics((), now=instant)

    ticket_ids = [t.id for t in tickets]
    events = (
        await session.execute(
            select(TicketEvent)
            .where(TicketEvent.ticket_id.in_(ticket_ids))
            .order_by(TicketEvent.created_at.asc())
        )
    ).scalars().all()

    triaged_at_by_ticket: dict[uuid.UUID, datetime] = {}
    reopen_count_by_ticket: dict[uuid.UUID, int] = {}
    for ev in events:
        if (
            ev.to_status in {TicketStatus.triaged, TicketStatus.assigned, TicketStatus.in_progress}
            and ev.ticket_id not in triaged_at_by_ticket
        ):
            triaged_at_by_ticket[ev.ticket_id] = ev.created_at
        if ev.to_status == TicketStatus.reopened:
            reopen_count_by_ticket[ev.ticket_id] = (
                reopen_count_by_ticket.get(ev.ticket_id, 0) + 1
            )

    samples = [
        TicketMetricSample(
            ticket_id=t.id,
            status=t.status,
            priority=t.priority,
            created_at=t.created_at or instant,
            sla_due_at=t.sla_due_at,
            triaged_at=triaged_at_by_ticket.get(t.id),
            resolved_at=t.resolved_at,
            reopened_count=reopen_count_by_ticket.get(t.id, 0),
        )
        for t in tickets
    ]
    return compute_ticket_metrics(samples, now=instant)


async def sync_room_out_of_service(session: AsyncSession, room_id: str) -> bool:
    """Update ``Room.out_of_service`` based on whether any active blocking ticket exists."""
    room = await session.get(Room, room_id)
    if room is None:
        return False

    blocking_count = (
        await session.execute(
            select(Ticket.id)
            .where(
                Ticket.room_id == room_id,
                Ticket.blocks_use.is_(True),
                Ticket.status.in_(tuple(ACTIVE_TICKET_STATUSES)),
            )
            .limit(1)
        )
    ).scalar_one_or_none()

    should_block = blocking_count is not None
    if room.out_of_service != should_block:
        room.out_of_service = should_block
        await session.flush()
    invalidate_state_cache()
    return should_block


async def rate_ticket(
    session: AsyncSession,
    *,
    ticket_id: uuid.UUID,
    reporter_user_id: uuid.UUID,
    rating: int,
    comment: str | None = None,
    now: datetime | None = None,
) -> Ticket:
    """Record a 1..5 satisfaction rating from the reporter on a resolved/closed ticket."""
    if not 1 <= rating <= 5:
        raise ValidationError(
            "Satisfaction rating must be between 1 and 5.",
            code="invalid_satisfaction_rating",
        )
    ticket = await session.get(Ticket, ticket_id)
    if ticket is None:
        raise NotFoundError(f"Ticket {ticket_id} does not exist.", code="ticket_not_found")
    if ticket.reporter_user_id != reporter_user_id:
        raise ForbiddenError(
            "Only the ticket reporter may submit a satisfaction rating.",
            code="not_ticket_reporter",
        )
    if ticket.status not in {TicketStatus.resolved, TicketStatus.closed}:
        raise ValidationError(
            "A ticket can only be rated once it is resolved or closed.",
            code="ticket_not_resolved",
        )
    instant = now or datetime.now(UTC)
    ticket.satisfaction_rating = rating
    ticket.satisfaction_comment = comment
    session.add(
        TicketEvent(
            ticket_id=ticket.id,
            actor_user_id=reporter_user_id,
            event_type="rated",
            from_status=ticket.status,
            to_status=ticket.status,
            note=comment,
            payload={"rating": rating},
            created_at=instant,
        )
    )
    await session.flush()
    return ticket


async def get_ticket_with_events(
    session: AsyncSession,
    ticket_id: uuid.UUID,
) -> tuple[Ticket, list[TicketEvent]]:
    """Load a ticket and its chronological event trail."""
    ticket = await session.get(Ticket, ticket_id)
    if ticket is None:
        raise NotFoundError(f"Ticket {ticket_id} does not exist.", code="ticket_not_found")
    events = (
        (
            await session.execute(
                select(TicketEvent)
                .where(TicketEvent.ticket_id == ticket_id)
                .order_by(TicketEvent.created_at.asc())
            )
        )
        .scalars()
        .all()
    )
    return ticket, list(events)


async def list_tickets(
    session: AsyncSession,
    *,
    status: TicketStatus | None = None,
    category: str | None = None,
    building_id: str | None = None,
    room_id: str | None = None,
    reporter_user_id: uuid.UUID | None = None,
    limit: int = 100,
) -> list[Ticket]:
    """List tickets matching optional filters, ordered newest-first."""
    stmt = select(Ticket)
    if status is not None:
        stmt = stmt.where(Ticket.status == status)
    if category is not None:
        stmt = stmt.where(Ticket.category == category)
    if building_id is not None:
        stmt = stmt.where(Ticket.building_id == building_id)
    if room_id is not None:
        stmt = stmt.where(Ticket.room_id == room_id)
    if reporter_user_id is not None:
        stmt = stmt.where(Ticket.reporter_user_id == reporter_user_id)
    stmt = stmt.order_by(Ticket.created_at.desc()).limit(limit)
    return list((await session.execute(stmt)).scalars().all())
