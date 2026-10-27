"""Shared issue & maintenance ticket engine (brief sections 6.2, 12.3, 14.1).

Enforces:
* The legal state machine::

      new -> triaged -> assigned -> in_progress -> resolved -> closed
      resolved -> reopened -> assigned | in_progress | resolved
      closed -> reopened

* SLA deadline calculation by priority.
* Duplicate merge window ("me too" upvoting when an open ticket already exists
  for the same room/place and category within the window).
* Room blocking rule: ``blocks_use=True`` while in an active status puts the
  room into ``out_of_service``.

Nothing in this module performs database or network I/O.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from app.domain.base import TicketPriority, TicketStatus

__all__ = [
    "ACTIVE_TICKET_STATUSES",
    "LEGAL_TICKET_TRANSITIONS",
    "SLA_HOURS_BY_PRIORITY",
    "CandidateExistingTicket",
    "InvalidTicketTransitionError",
    "compute_sla_due_at",
    "find_duplicate_ticket",
    "is_ticket_blocking_room",
    "validate_ticket_transition",
]

#: Legal state transitions (brief sections 12.3 and 14.1).
LEGAL_TICKET_TRANSITIONS: dict[TicketStatus, frozenset[TicketStatus]] = {
    TicketStatus.new: frozenset({TicketStatus.triaged, TicketStatus.assigned, TicketStatus.closed}),
    TicketStatus.triaged: frozenset({TicketStatus.assigned, TicketStatus.in_progress, TicketStatus.closed}),
    TicketStatus.assigned: frozenset({TicketStatus.in_progress, TicketStatus.triaged, TicketStatus.resolved}),
    TicketStatus.in_progress: frozenset({TicketStatus.resolved, TicketStatus.assigned}),
    TicketStatus.resolved: frozenset({TicketStatus.closed, TicketStatus.reopened}),
    TicketStatus.closed: frozenset({TicketStatus.reopened}),
    TicketStatus.reopened: frozenset(
        {TicketStatus.assigned, TicketStatus.in_progress, TicketStatus.resolved}
    ),
}

#: Statuses in which a ticket is still open/unresolved.
ACTIVE_TICKET_STATUSES: frozenset[TicketStatus] = frozenset(
    {
        TicketStatus.new,
        TicketStatus.triaged,
        TicketStatus.assigned,
        TicketStatus.in_progress,
        TicketStatus.reopened,
    }
)

#: Default SLA target hours by ticket priority.
SLA_HOURS_BY_PRIORITY: dict[TicketPriority, int] = {
    TicketPriority.urgent: 4,
    TicketPriority.high: 12,
    TicketPriority.normal: 48,
    TicketPriority.low: 120,
}


class InvalidTicketTransitionError(ValueError):
    """Raised when a caller requests an illegal ticket status transition."""

    def __init__(self, from_status: TicketStatus, to_status: TicketStatus) -> None:
        self.from_status = from_status
        self.to_status = to_status
        allowed = sorted(s.value for s in LEGAL_TICKET_TRANSITIONS.get(from_status, frozenset()))
        super().__init__(
            f"Illegal ticket transition from {from_status.value!r} to {to_status.value!r}; "
            f"allowed targets: {allowed}"
        )


def validate_ticket_transition(from_status: TicketStatus, to_status: TicketStatus) -> None:
    """Raise :class:`InvalidTicketTransitionError` if ``from_status -> to_status`` is illegal."""
    allowed = LEGAL_TICKET_TRANSITIONS.get(from_status, frozenset())
    if to_status not in allowed:
        raise InvalidTicketTransitionError(from_status, to_status)


def compute_sla_due_at(
    created_at: datetime,
    priority: TicketPriority,
    *,
    sla_hours_override: dict[TicketPriority, int] | None = None,
) -> datetime:
    """Compute the SLA deadline for a newly opened ticket."""
    if created_at.tzinfo is None:
        raise ValueError("created_at must be timezone-aware")
    table = sla_hours_override or SLA_HOURS_BY_PRIORITY
    hours = table.get(priority, 48)
    return created_at + timedelta(hours=hours)


def is_ticket_blocking_room(status: TicketStatus, blocks_use: bool) -> bool:
    """Whether a ticket with ``(status, blocks_use)`` keeps its room ``out_of_service``."""
    return bool(blocks_use) and status in ACTIVE_TICKET_STATUSES


@dataclass(frozen=True, slots=True)
class CandidateExistingTicket:
    """Summary of an existing open ticket considered for duplicate merging."""

    id: uuid.UUID
    room_id: str | None
    place_id: str | None
    building_id: str | None
    category: str
    subcategory: str | None
    status: TicketStatus
    created_at: datetime


def find_duplicate_ticket(
    candidates: list[CandidateExistingTicket] | tuple[CandidateExistingTicket, ...],
    *,
    room_id: str | None,
    place_id: str | None,
    building_id: str | None,
    category: str,
    subcategory: str | None,
    now: datetime,
    merge_window: timedelta = timedelta(hours=24),
) -> uuid.UUID | None:
    """Find an active ticket reported recently for the same location & category.

    When a match is found within ``merge_window``, the service increments
    ``upvotes_count`` ("me too") and links ``duplicate_of_id`` instead of
    creating an independent work item (brief sections 12.3 and 14.1).
    """
    if room_id is None and place_id is None:
        return None
    norm_cat = category.strip().lower()
    norm_sub = (subcategory or "").strip().lower()

    for item in sorted(candidates, key=lambda c: c.created_at, reverse=True):
        if item.status not in ACTIVE_TICKET_STATUSES:
            continue
        if (now - item.created_at) > merge_window:
            continue
        if item.category.strip().lower() != norm_cat:
            continue
        if norm_sub and (item.subcategory or "").strip().lower() not in {"", norm_sub}:
            continue
        if room_id is not None and item.room_id == room_id:
            return item.id
        if room_id is None and place_id is not None and item.place_id == place_id:
            return item.id
        if (
            room_id is None
            and place_id is None
            and building_id is not None
            and item.building_id == building_id
        ):
            return item.id
    return None
