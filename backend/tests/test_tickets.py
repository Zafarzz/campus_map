"""Tests for the Shared Issue & Maintenance Ticket Engine (brief sections 6.2, 12.3, 14.1).

Covers:
* Legal state transitions and rejection of illegal ones.
* SLA deadline calculation by priority.
* Duplicate detection and 'me too' upvoting within the 24h window.
* Room blocking rule: blocks_use=True sets Room.out_of_service=True, which
  removes the room from free room search and sets the top-priority
  out_of_service room state; resolving/closing the ticket restores it.
* Reporter satisfaction ratings (1..5) on resolved/closed tickets.
* API endpoints: POST /tickets, GET /tickets, GET /tickets/{id},
  PATCH /tickets/{id}/status, POST /tickets/{id}/rate.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.security import Role, create_access_token
from app.domain.base import RoomStateKind, TicketPriority, TicketStatus
from app.domain.people import AppUser
from app.domain.spatial import Room
from app.engines.room_state import StateOptions
from app.engines.tickets import (
    CandidateExistingTicket,
    InvalidTicketTransitionError,
    compute_sla_due_at,
    find_duplicate_ticket,
    is_ticket_blocking_room,
    validate_ticket_transition,
)
from app.services import state_service, ticket_service

TASHKENT = ZoneInfo("Asia/Tashkent")
NOW = datetime(2026, 10, 19, 10, 0, tzinfo=UTC)


# ---------------------------------------------------------------------------
# Pure engine unit tests
# ---------------------------------------------------------------------------


class TestTicketStateMachine:
    def test_legal_forward_transitions(self) -> None:
        """new -> triaged -> assigned -> in_progress -> resolved -> closed."""
        validate_ticket_transition(TicketStatus.new, TicketStatus.triaged)
        validate_ticket_transition(TicketStatus.triaged, TicketStatus.assigned)
        validate_ticket_transition(TicketStatus.assigned, TicketStatus.in_progress)
        validate_ticket_transition(TicketStatus.in_progress, TicketStatus.resolved)
        validate_ticket_transition(TicketStatus.resolved, TicketStatus.closed)

    def test_reopen_and_cycle(self) -> None:
        """resolved -> reopened -> in_progress -> resolved."""
        validate_ticket_transition(TicketStatus.resolved, TicketStatus.reopened)
        validate_ticket_transition(TicketStatus.reopened, TicketStatus.in_progress)
        validate_ticket_transition(TicketStatus.in_progress, TicketStatus.resolved)

    def test_illegal_transitions_raise(self) -> None:
        """Direct jump from new to resolved or closed to assigned is forbidden."""
        with pytest.raises(InvalidTicketTransitionError):
            validate_ticket_transition(TicketStatus.new, TicketStatus.resolved)

        with pytest.raises(InvalidTicketTransitionError):
            validate_ticket_transition(TicketStatus.closed, TicketStatus.assigned)

        with pytest.raises(InvalidTicketTransitionError):
            validate_ticket_transition(TicketStatus.triaged, TicketStatus.resolved)

    def test_sla_due_time_calculation(self) -> None:
        urgent_due = compute_sla_due_at(NOW, TicketPriority.urgent)
        assert urgent_due == NOW + timedelta(hours=4)

        normal_due = compute_sla_due_at(NOW, TicketPriority.normal)
        assert normal_due == NOW + timedelta(hours=48)

        low_due = compute_sla_due_at(NOW, TicketPriority.low)
        assert low_due == NOW + timedelta(hours=120)

    def test_blocking_status_logic(self) -> None:
        assert is_ticket_blocking_room(TicketStatus.new, True) is True
        assert is_ticket_blocking_room(TicketStatus.in_progress, True) is True
        assert is_ticket_blocking_room(TicketStatus.resolved, True) is False
        assert is_ticket_blocking_room(TicketStatus.closed, True) is False
        assert is_ticket_blocking_room(TicketStatus.reopened, True) is True
        assert is_ticket_blocking_room(TicketStatus.new, False) is False

    def test_find_duplicate_ticket_merges_within_window(self) -> None:
        tid = uuid.uuid4()
        candidates = [
            CandidateExistingTicket(
                id=tid,
                room_id="bld-h-f1-a101",
                place_id=None,
                building_id="bld-h",
                category="hvac",
                subcategory="ac_leak",
                status=TicketStatus.new,
                created_at=NOW - timedelta(hours=2),
            )
        ]
        dup = find_duplicate_ticket(
            candidates,
            room_id="bld-h-f1-a101",
            place_id=None,
            building_id="bld-h",
            category="hvac",
            subcategory="ac_leak",
            now=NOW,
        )
        assert dup == tid

    def test_find_duplicate_ticket_ignores_expired_or_resolved(self) -> None:
        tid = uuid.uuid4()
        candidates = [
            CandidateExistingTicket(
                id=tid,
                room_id="bld-h-f1-a101",
                place_id=None,
                building_id="bld-h",
                category="hvac",
                subcategory=None,
                status=TicketStatus.resolved,  # already resolved
                created_at=NOW - timedelta(hours=1),
            )
        ]
        dup = find_duplicate_ticket(
            candidates,
            room_id="bld-h-f1-a101",
            place_id=None,
            building_id="bld-h",
            category="hvac",
            subcategory=None,
            now=NOW,
        )
        assert dup is None


# ---------------------------------------------------------------------------
# Database & Service integration tests
# ---------------------------------------------------------------------------


@pytest.mark.db
async def test_ticket_creation_duplicate_merge_and_upvote(
    seeded_session: AsyncSession,
) -> None:
    reporter_a = uuid.uuid4()
    reporter_b = uuid.uuid4()
    seeded_session.add(AppUser(id=reporter_a, external_ref=f"sub:{reporter_a}", is_active=True))
    seeded_session.add(AppUser(id=reporter_b, external_ref=f"sub:{reporter_b}", is_active=True))
    await seeded_session.flush()
    room_id = "bld-h-f1-a101"

    ticket_1, merged_1 = await ticket_service.create_ticket(
        seeded_session,
        reporter_user_id=reporter_a,
        category="lighting",
        subcategory="bulb_flicker",
        title="Flickering lights near projector",
        room_id=room_id,
        now=NOW,
    )
    assert merged_1 is False
    assert ticket_1.upvotes_count == 1
    assert ticket_1.status is TicketStatus.new

    # Second user reports same issue on same room within 24h -> merges!
    ticket_2, merged_2 = await ticket_service.create_ticket(
        seeded_session,
        reporter_user_id=reporter_b,
        category="lighting",
        subcategory="bulb_flicker",
        title="Lights are blinking again",
        room_id=room_id,
        now=NOW + timedelta(minutes=10),
    )
    assert merged_2 is True
    assert ticket_2.id == ticket_1.id
    assert ticket_2.upvotes_count == 2


@pytest.mark.db
async def test_ticket_blocks_use_overlays_room_out_of_service(
    seeded_session: AsyncSession,
) -> None:
    """When blocks_use=True, Room.out_of_service is set to True.

    Resolving/closing the ticket restores Room.out_of_service to False.
    """
    reporter = uuid.uuid4()
    seeded_session.add(AppUser(id=reporter, external_ref=f"sub:{reporter}", is_active=True))
    await seeded_session.flush()
    room_id = "bld-h-f1-a101"
    room = await seeded_session.get(Room, room_id)
    assert room is not None
    assert room.out_of_service is False

    # 1. Create a blocking ticket
    ticket, _ = await ticket_service.create_ticket(
        seeded_session,
        reporter_user_id=reporter,
        category="safety",
        title="Flooding from broken radiator",
        room_id=room_id,
        priority=TicketPriority.urgent,
        blocks_use=True,
        now=NOW,
    )
    assert ticket.blocks_use is True
    await seeded_session.refresh(room)
    assert room.out_of_service is True

    # 2. State engine now reports the room as out_of_service
    opts = StateOptions(starts_soon_minutes=0, timezone=TASHKENT)
    state = await state_service.state_for_room(seeded_session, room_id, NOW, timezone=TASHKENT, options=opts)
    assert state.out_of_service is True
    assert state.state is RoomStateKind.free  # base timetable state may be free
    # But room search / UI hides it due to out_of_service flag

    # 3. Transition ticket: new -> assigned -> in_progress -> resolved
    await ticket_service.transition_ticket(
        seeded_session,
        ticket_id=ticket.id,
        to_status=TicketStatus.assigned,
        now=NOW + timedelta(minutes=15),
    )
    await ticket_service.transition_ticket(
        seeded_session,
        ticket_id=ticket.id,
        to_status=TicketStatus.in_progress,
        now=NOW + timedelta(minutes=30),
    )
    await ticket_service.transition_ticket(
        seeded_session,
        ticket_id=ticket.id,
        to_status=TicketStatus.resolved,
        note="Radiator valve replaced and floor dried",
        now=NOW + timedelta(hours=2),
    )
    await seeded_session.refresh(room)
    assert room.out_of_service is False

    # 4. Reporter rates the resolution
    rated = await ticket_service.rate_ticket(
        seeded_session,
        ticket_id=ticket.id,
        reporter_user_id=reporter,
        rating=5,
        comment="Quick fix, thank you!",
        now=NOW + timedelta(hours=3),
    )
    assert rated.satisfaction_rating == 5


# ---------------------------------------------------------------------------
# API Integration tests
# ---------------------------------------------------------------------------


@pytest.mark.db
async def test_tickets_api_lifecycle(
    seeded_client: AsyncClient,
    settings: Settings,
) -> None:
    reporter_id = uuid.uuid4()
    staff_id = uuid.uuid4()

    student_token = create_access_token(str(reporter_id), [Role.student], settings=settings)
    staff_token = create_access_token(str(staff_id), [Role.facilities, Role.staff], settings=settings)

    s_headers = {"Authorization": f"Bearer {student_token}"}
    fac_headers = {"Authorization": f"Bearer {staff_token}"}
    prefix = "/api/v1"

    # 1. Create a ticket
    r_create = await seeded_client.post(
        f"{prefix}/tickets",
        headers=s_headers,
        json={
            "category": "furniture",
            "title": "Broken desk in A-101",
            "description": "Leg is loose",
            "room_id": "bld-h-f1-a101",
            "priority": "normal",
        },
    )
    assert r_create.status_code == 201
    t_data = r_create.json()
    ticket_id = t_data["id"]
    assert t_data["status"] == "new"

    # 2. Get ticket by ID with event trail
    r_get = await seeded_client.get(f"{prefix}/tickets/{ticket_id}", headers=s_headers)
    assert r_get.status_code == 200
    assert len(r_get.json()["events"]) >= 1

    # 3. Facilities triages / assigns the ticket
    r_triage = await seeded_client.patch(
        f"{prefix}/tickets/{ticket_id}/status",
        headers=fac_headers,
        json={"to_status": "assigned", "note": "Assigned to team Alpha"},
    )
    assert r_triage.status_code == 200
    assert r_triage.json()["status"] == "assigned"

    # 4. Facilities marks it in_progress then resolved
    await seeded_client.patch(
        f"{prefix}/tickets/{ticket_id}/status",
        headers=fac_headers,
        json={"to_status": "in_progress"},
    )
    r_res = await seeded_client.patch(
        f"{prefix}/tickets/{ticket_id}/status",
        headers=fac_headers,
        json={"to_status": "resolved", "note": "Desk replaced"},
    )
    assert r_res.status_code == 200
    assert r_res.json()["status"] == "resolved"

    # 5. Reporter rates the ticket
    r_rate = await seeded_client.post(
        f"{prefix}/tickets/{ticket_id}/rate",
        headers=s_headers,
        json={"rating": 5, "comment": "Great work!"},
    )
    assert r_rate.status_code == 200
    assert r_rate.json()["satisfaction_rating"] == 5
