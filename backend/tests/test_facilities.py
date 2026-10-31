"""Tests for Phase 4 Layer 4: Facilities & Asset Registry (§14.1-§14.4).

Covers:
1. Ticket SLA escalation (`next_escalated_priority`, `escalate_overdue_tickets`)
   and operational metrics (`compute_ticket_metrics`: time to triage, time to
   resolve, SLA breaches, reopen rate) (§14.1).
2. Deterministic Room Health Score (0..100) worked numerical examples, component
   breakdown, provenance, confidence, Hypothesis boundedness & monotonicity
   properties, and optional environmental CSV import hook (§14.2).
3. Smart Cleaning Planner (`compute_room_dirt_score`, `plan_smart_cleaning` via
   OR-Tools Routing Solver `pywrapcp` with `Time` dimension and nearest-neighbour
   fallback, plus CSV and PDF route sheets) (§14.3).
4. Asset Registry (`Asset`, `AssetLoan`), printable QR code label PDF sheets
   (`segno` + `reportlab`), checkout/return with due dates, usage hours logging,
   condition tracking, overdue alerts, and preventive maintenance reminders (§14.4).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from hypothesis import given
from hypothesis import settings as hyp_settings
from hypothesis import strategies as st

from app.core.config import Settings
from app.core.db import Database
from app.core.security import Role, create_access_token
from app.domain.base import TicketPriority, TicketStatus
from app.domain.people import AppUser
from app.engines.facilities import (
    AssetLabelItem,
    EnvironmentalSample,
    RoomCleaningInput,
    RoomTicketSample,
    compute_room_dirt_score,
    compute_room_health_score,
    evaluate_asset_maintenance_due,
    format_cleaning_route_sheet_csv,
    is_loan_overdue,
    plan_smart_cleaning,
    render_asset_qr_labels_pdf,
    render_cleaning_route_sheet_pdf,
)
from app.engines.tickets import (
    TicketMetricSample,
    compute_ticket_metrics,
    next_escalated_priority,
)
from app.services import ticket_service

NOW = datetime(2026, 10, 19, 12, 0, tzinfo=UTC)


# ===========================================================================
# 1. Pure Engine Tests: Ticket Metrics & SLA Priority Escalation (§14.1)
# ===========================================================================


class TestTicketMetricsAndEscalationEngine:
    def test_priority_escalation_chain(self) -> None:
        assert next_escalated_priority(TicketPriority.low) == TicketPriority.normal
        assert next_escalated_priority(TicketPriority.normal) == TicketPriority.high
        assert next_escalated_priority(TicketPriority.high) == TicketPriority.urgent
        assert next_escalated_priority(TicketPriority.urgent) == TicketPriority.urgent

    def test_compute_ticket_metrics_worked_example(self) -> None:
        t1 = TicketMetricSample(
            ticket_id=uuid.uuid4(),
            status=TicketStatus.resolved,
            priority=TicketPriority.normal,
            created_at=NOW - timedelta(hours=10),
            sla_due_at=NOW + timedelta(hours=38),
            triaged_at=NOW - timedelta(hours=8),  # 2h to triage
            resolved_at=NOW - timedelta(hours=4),  # 6h to resolve
            reopened_count=0,
        )
        t2 = TicketMetricSample(
            ticket_id=uuid.uuid4(),
            status=TicketStatus.in_progress,
            priority=TicketPriority.urgent,
            created_at=NOW - timedelta(hours=6),
            sla_due_at=NOW - timedelta(hours=2),  # SLA breached!
            triaged_at=NOW - timedelta(hours=5),  # 1h to triage
            resolved_at=None,
            reopened_count=1,
        )
        summary = compute_ticket_metrics([t1, t2], now=NOW)
        assert summary.total_tickets == 2
        assert summary.open_tickets == 1
        assert summary.resolved_or_closed_tickets == 1
        assert summary.sla_breaches == 1
        assert summary.sla_breach_rate == pytest.approx(0.5)
        assert summary.avg_time_to_triage_hours == pytest.approx(1.5)
        assert summary.avg_time_to_resolve_hours == pytest.approx(6.0)
        assert summary.reopened_tickets == 1
        assert summary.reopen_rate == pytest.approx(0.5)


# ===========================================================================
# 2. Pure Engine Tests: Deterministic Room Health Score (0..100) (§14.2)
# ===========================================================================


class TestRoomHealthScoreEngine:
    def test_worked_numerical_examples(self) -> None:
        space_id = uuid.uuid4()

        # Example 1: Clean room with no issues -> 100.0 (healthy)
        h_clean = compute_room_health_score(
            space_id=space_id,
            room_code="A-101",
            tickets=(),
            now=NOW,
        )
        assert h_clean.score == 100.0
        assert h_clean.band == "healthy"
        assert h_clean.open_ticket_penalty == 0.0

        # Example 2: Room with 1 brand-new high-priority open ticket (weight=15.0)
        # + 1 resolved ticket in the same category within 90 days (repeat penalty = 6.0)
        # + 5.0 satisfaction rating (adjustment = +6.0)
        # Expected score = 100.0 - 15.0 - 6.0 + 6.0 = 85.0
        tickets = [
            RoomTicketSample(
                ticket_id=uuid.uuid4(),
                category="av",
                priority=TicketPriority.high,
                status=TicketStatus.in_progress,
                created_at=NOW,
                blocks_use=False,
            ),
            RoomTicketSample(
                ticket_id=uuid.uuid4(),
                category="av",
                priority=TicketPriority.normal,
                status=TicketStatus.resolved,
                created_at=NOW - timedelta(days=10),
                blocks_use=False,
            ),
        ]
        h_worked = compute_room_health_score(
            space_id=space_id,
            room_code="A-101",
            tickets=tickets,
            now=NOW,
            satisfaction_ratings=[5.0],
        )
        assert h_worked.open_ticket_penalty == pytest.approx(15.0)
        assert h_worked.repeat_issue_penalty == pytest.approx(6.0)
        assert h_worked.satisfaction_adjustment == pytest.approx(6.0)
        assert h_worked.score == pytest.approx(85.0)
        assert h_worked.band == "healthy"
        assert h_worked.repeat_categories == ("av",)

        # Example 3: Blocking urgent ticket -> critical band
        h_blocking = compute_room_health_score(
            space_id=space_id,
            room_code="A-101",
            tickets=[
                RoomTicketSample(
                    ticket_id=uuid.uuid4(),
                    category="hvac",
                    priority=TicketPriority.urgent,
                    status=TicketStatus.new,
                    created_at=NOW - timedelta(hours=36),
                    blocks_use=True,
                )
            ],
            now=NOW,
        )
        assert h_blocking.blocks_use is True
        assert h_blocking.band == "critical"
        assert h_blocking.score < 50.0

    @given(
        open_count=st.integers(min_value=0, max_value=8),
        age_hours=st.floats(min_value=0.0, max_value=200.0),
        rating=st.floats(min_value=1.0, max_value=5.0),
        co2_ppm=st.floats(min_value=400.0, max_value=2500.0),
    )
    @hyp_settings(max_examples=40)
    def test_property_health_score_bounded_and_monotonic_in_open_tickets(
        self,
        open_count: int,
        age_hours: float,
        rating: float,
        co2_ppm: float,
    ) -> None:
        space_id = uuid.uuid4()
        base_tickets = [
            RoomTicketSample(
                ticket_id=uuid.uuid4(),
                category=f"cat-{i}",
                priority=TicketPriority.normal,
                status=TicketStatus.new,
                created_at=NOW - timedelta(hours=age_hours),
            )
            for i in range(open_count)
        ]
        env = [EnvironmentalSample(recorded_at=NOW, co2_ppm=co2_ppm, temp_celsius=22.0)]
        res1 = compute_room_health_score(
            space_id=space_id,
            room_code="R1",
            tickets=base_tickets,
            now=NOW,
            satisfaction_ratings=[rating],
            environmental_samples=env,
        )
        assert 0.0 <= res1.score <= 100.0

        # Adding another open ticket must never increase the room health score
        extra_ticket = RoomTicketSample(
            ticket_id=uuid.uuid4(),
            category="extra-cat",
            priority=TicketPriority.high,
            status=TicketStatus.new,
            created_at=NOW,
        )
        res2 = compute_room_health_score(
            space_id=space_id,
            room_code="R1",
            tickets=[*base_tickets, extra_ticket],
            now=NOW,
            satisfaction_ratings=[rating],
            environmental_samples=env,
        )
        assert 0.0 <= res2.score <= 100.0
        assert res2.score <= res1.score


# ===========================================================================
# 3. Pure Engine Tests: Smart Cleaning & Asset Registry (§14.3, §14.4)
# ===========================================================================


class TestSmartCleaningAndAssetsEngine:
    def test_ortools_cleaning_routing_and_exports(self) -> None:
        b1 = uuid.uuid4()
        b2 = uuid.uuid4()
        rooms = [
            RoomCleaningInput(
                space_id=uuid.uuid4(),
                room_code="A-101",
                room_name="Lecture Hall A-101",
                building_id=b1,
                building_code="bld-h",
                floor_number=1,
                sessions_today=4,
                attendance_today=120,
                days_since_last_clean=1,
                window_start_min=60,
                window_end_min=300,
            ),
            RoomCleaningInput(
                space_id=uuid.uuid4(),
                room_code="B-202",
                room_name="Lab B-202",
                building_id=b2,
                building_code="bld-g",
                floor_number=2,
                sessions_today=0,
                attendance_today=0,
                days_since_last_clean=7,  # deep-clean due!
                window_start_min=0,
                window_end_min=240,
            ),
        ]
        score_b202, reason_b202 = compute_room_dirt_score(rooms[1])
        assert score_b202 >= 35.0
        assert "deep-clean" in reason_b202

        plan = plan_smart_cleaning(
            rooms,
            num_cleaners=1,
            min_dirt_score=10.0,
            building_distances_m={(b1, b2): 150},
        )
        assert len(plan.stops) == 2
        assert plan.solver_used in ("ORTOOLS_ROUTING", "NEAREST_NEIGHBOUR_FALLBACK")
        # B-202 window starts at 0, A-101 opens at 60 -> B-202 visited first
        assert plan.stops[0].room_code == "B-202"
        assert plan.stops[1].room_code == "A-101"
        assert plan.stops[1].arrival_min >= 60

        csv_out = format_cleaning_route_sheet_csv(plan.stops)
        assert "A-101" in csv_out and "B-202" in csv_out
        pdf_out = render_cleaning_route_sheet_pdf(
            plan.stops, plan_date_iso="2026-10-19"
        )
        assert pdf_out.startswith(b"%PDF-")

    def test_asset_qr_labels_pdf_and_maintenance_checks(self) -> None:
        due, reason = evaluate_asset_maintenance_due(
            today=NOW.date(),
            next_maintenance_due_at=NOW.date() - timedelta(days=1),
            usage_hours=125.0,
            maintenance_interval_hours=100.0,
        )
        assert due is True
        assert reason is not None
        assert "scheduled maintenance due" in reason
        assert "usage hours" in reason

        assert is_loan_overdue(
            now=NOW, due_at=NOW - timedelta(hours=2), returned_at=None
        ) is True
        assert is_loan_overdue(
            now=NOW, due_at=NOW - timedelta(hours=2), returned_at=NOW - timedelta(hours=3)
        ) is False

        labels_pdf = render_asset_qr_labels_pdf(
            [
                AssetLabelItem(
                    asset_id=uuid.uuid4(),
                    asset_tag="AST-OSC-001",
                    name="Digital Oscilloscope",
                    category="lab_instrument",
                    room_code="bld-h-f1-a101",
                    serial_number="TEK-99881",
                )
            ]
        )
        assert labels_pdf.startswith(b"%PDF-")


# ===========================================================================
# 4. Database & API Integration Tests (§14.1 - §14.4)
# ===========================================================================


@pytest.mark.db
async def test_facilities_full_api_lifecycle(
    clean_database: Database,
    seeded_client: AsyncClient,
    settings: Settings,
) -> None:
    fac_user_id = uuid.uuid4()
    student_id = uuid.uuid4()
    async with clean_database.sessionmaker() as db_session:
        db_session.add_all(
            [
                AppUser(id=fac_user_id, display_name="Facilities Lead", is_demo=True),
                AppUser(id=student_id, display_name="Borrower Student", is_demo=True),
            ]
        )
        await db_session.commit()

        fac_token = create_access_token(
            str(fac_user_id), [Role.facilities, Role.staff, Role.admin], settings=settings
        )
        stu_token = create_access_token(
            str(student_id), [Role.student], settings=settings
        )
        f_headers = {"Authorization": f"Bearer {fac_token}"}
        s_headers = {"Authorization": f"Bearer {stu_token}"}

        # 1. Create an overdue ticket and trigger SLA escalation (§14.1)
        past_created = NOW - timedelta(days=5)
        t_overdue, _ = await ticket_service.create_ticket(
            db_session,
            reporter_user_id=student_id,
            category="cleaning",
            title="Spill in A-101",
            room_id="bld-h-f1-a101",
            priority=TicketPriority.normal,
            now=past_created,
            is_demo=True,
        )
        # Force sla_due_at into the past relative to real wall-clock time
        t_overdue.sla_due_at = datetime.now(UTC) - timedelta(hours=3)
        await db_session.commit()

    r_esc = await seeded_client.post(
        "/api/v1/tickets/escalate-overdue",
        headers=f_headers,
    )
    assert r_esc.status_code == 200
    assert r_esc.json()["escalated_count"] >= 1

    r_metrics = await seeded_client.get(
        "/api/v1/tickets/metrics?building_id=bld-h",
        headers=f_headers,
    )
    assert r_metrics.status_code == 200
    assert r_metrics.json()["total_tickets"] >= 1

    # 2. Room & Building Health Score + Environmental CSV hook (§14.2)
    r_env = await seeded_client.post(
        "/api/v1/facilities/health/environmental-csv",
        headers=f_headers,
        json={
            "csv_text": "room_id,co2_ppm,temp_celsius,noise_dba\nbld-h-f1-a101,1450,23.5,45.0\n"
        },
    )
    assert r_env.status_code == 200
    assert r_env.json()["imported_rows"] == 1

    r_health = await seeded_client.get(
        "/api/v1/facilities/health/rooms/bld-h-f1-a101",
        headers=f_headers,
    )
    assert r_health.status_code == 200
    h_json = r_health.json()
    assert 0.0 <= h_json["score"] < 100.0
    assert h_json["open_ticket_penalty"] > 0.0
    assert h_json["environmental_penalty"] > 0.0

    r_bld_health = await seeded_client.get(
        "/api/v1/facilities/health/buildings/bld-h",
        headers=f_headers,
    )
    assert r_bld_health.status_code == 200
    assert r_bld_health.json()["room_count"] >= 1

    # 3. Smart Cleaning Plan generation + CSV/PDF route sheet (§14.3)
    r_clean = await seeded_client.post(
        "/api/v1/facilities/cleaning/plans",
        headers=f_headers,
        json={
            "campus_id": "ajou-tashkent",
            "plan_date": "2026-10-19",
            "cleaner_zone": "block-a",
            "building_id": "bld-h",
            "num_cleaners": 2,
            "min_dirt_score": 5.0,
        },
    )
    assert r_clean.status_code == 201
    clean_data = r_clean.json()
    assert clean_data["tasks_count"] >= 1
    first_task_id = clean_data["tasks"][0]["id"]

    r_complete = await seeded_client.post(
        f"/api/v1/facilities/cleaning/tasks/{first_task_id}/complete",
        headers=f_headers,
    )
    assert r_complete.status_code == 200
    assert r_complete.json()["status"] == "completed"

    r_route_pdf = await seeded_client.get(
        "/api/v1/facilities/cleaning/route-sheet.pdf?plan_date=2026-10-19",
        headers=f_headers,
    )
    assert r_route_pdf.status_code == 200
    assert r_route_pdf.content.startswith(b"%PDF-")

    # 4. Asset Registry, QR Labels PDF, Checkout/Return & Maintenance Alerts (§14.4)
    r_asset = await seeded_client.post(
        "/api/v1/facilities/assets",
        headers=f_headers,
        json={
            "campus_id": "ajou-tashkent",
            "asset_code": "AST-3DPRN-01",
            "name": "Prusa MK4 3D Printer",
            "asset_type": "maker_equipment",
            "room_id": "bld-h-f1-a101",
            "serial_number": "PRUSA-2026-01",
            "maintenance_interval_hours": 50.0,
        },
    )
    assert r_asset.status_code == 201
    asset_id = r_asset.json()["id"]

    r_qr_pdf = await seeded_client.get(
        "/api/v1/facilities/assets/qr-labels.pdf?campus_id=ajou-tashkent",
        headers=f_headers,
    )
    assert r_qr_pdf.status_code == 200
    assert r_qr_pdf.content.startswith(b"%PDF-")

    # Student checks out the asset
    r_checkout = await seeded_client.post(
        f"/api/v1/facilities/assets/{asset_id}/checkout",
        headers=s_headers,
        json={
            "due_at": (datetime.now(UTC) + timedelta(days=2)).isoformat(),
            "purpose": "Robotics capstone prototype",
        },
    )
    assert r_checkout.status_code == 201
    loan_id = r_checkout.json()["id"]

    # Student returns the asset and logs 55 usage hours (>= 50h maintenance interval)
    r_return = await seeded_client.post(
        f"/api/v1/facilities/loans/{loan_id}/return",
        headers=s_headers,
        json={
            "usage_hours_logged": 55.0,
            "condition_in": "fair",
            "notes": "Nozzle needs routine cleaning",
        },
    )
    assert r_return.status_code == 200
    assert r_return.json()["asset"]["usage_hours"] == 55.0
    assert r_return.json()["asset"]["status"] == "available"

    # Alerts endpoint now flags the asset as due for preventive maintenance!
    r_alerts = await seeded_client.get(
        "/api/v1/facilities/alerts?campus_id=ajou-tashkent",
        headers=f_headers,
    )
    assert r_alerts.status_code == 200
    alerts_data = r_alerts.json()
    assert alerts_data["maintenance_due_count"] >= 1
    assert any(
        item["asset_code"] == "AST-3DPRN-01"
        for item in alerts_data["maintenance_due"]
    )
