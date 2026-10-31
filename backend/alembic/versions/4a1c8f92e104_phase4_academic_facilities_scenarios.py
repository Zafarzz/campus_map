"""phase4_academic_facilities_scenarios

Revision ID: 4a1c8f92e104
Revises: 0ce72ccaa26e
Created: 2026-10-31 20:00:00.000000+00:00

Every migration must have a working downgrade, or a comment here explaining why
it cannot (MASTER_PROMPT.md 0.4 rule 4). Both directions are tested.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "4a1c8f92e104"
down_revision: str | None = "0ce72ccaa26e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_device",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("device_ref", sa.String(length=128), nullable=False),
        sa.Column("registered_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["app_user.id"],
            name=op.f("fk_user_device_user_id_app_user"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("user_id", name=op.f("pk_user_device")),
    )

    op.create_table(
        "user_capability",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("capability", sa.String(length=64), nullable=False),
        sa.Column("granted_by", sa.UUID(), nullable=True),
        sa.Column("granted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("is_demo", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.ForeignKeyConstraint(
            ["granted_by"],
            ["app_user.id"],
            name=op.f("fk_user_capability_granted_by_app_user"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["app_user.id"],
            name=op.f("fk_user_capability_user_id_app_user"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_user_capability")),
        sa.UniqueConstraint("user_id", "capability", name="uq_user_capability_user_id_capability"),
    )
    op.create_index(op.f("ix_user_capability_is_demo"), "user_capability", ["is_demo"], unique=False)
    op.create_index("ix_user_capability_user", "user_capability", ["user_id"], unique=False)

    op.create_table(
        "exam_plan",
        sa.Column("campus_id", sa.String(length=96), nullable=False),
        sa.Column("term_id", sa.UUID(), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("seed", sa.Integer(), server_default=sa.text("42"), nullable=False),
        sa.Column("status", sa.String(length=64), nullable=False),
        sa.Column("settings_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("rooms_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("sessions_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("assignments_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("locked_seats_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("summary_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_by", sa.UUID(), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("is_demo", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.CheckConstraint("ends_at > starts_at", name=op.f("ck_exam_plan_exam_plan_window_ordered")),
        sa.ForeignKeyConstraint(
            ["campus_id"],
            ["campus.id"],
            name=op.f("fk_exam_plan_campus_id_campus"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["app_user.id"],
            name=op.f("fk_exam_plan_created_by_app_user"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["term_id"],
            ["term.id"],
            name=op.f("fk_exam_plan_term_id_term"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_exam_plan")),
    )
    op.create_index(op.f("ix_exam_plan_campus_id"), "exam_plan", ["campus_id"], unique=False)
    op.create_index("ix_exam_plan_campus_starts", "exam_plan", ["campus_id", "starts_at"], unique=False)
    op.create_index(op.f("ix_exam_plan_is_demo"), "exam_plan", ["is_demo"], unique=False)

    op.create_table(
        "scenario",
        sa.Column("campus_id", sa.String(length=96), nullable=False),
        sa.Column("term_id", sa.UUID(), nullable=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "kind",
            sa.String(length=64),
            server_default=sa.text("'timetable_optimiser'"),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum(
                "draft",
                "proposed",
                "approved",
                "rejected",
                "committed",
                name="scenario_status",
            ),
            server_default=sa.text("'proposed'"),
            nullable=False,
        ),
        sa.Column("solver_status", sa.String(length=64), nullable=True),
        sa.Column("baseline_metrics", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("proposal_metrics", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("tradeoffs_summary", sa.Text(), nullable=True),
        sa.Column("parameters_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_by", sa.UUID(), nullable=True),
        sa.Column("approved_by", sa.UUID(), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("committed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("is_demo", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.ForeignKeyConstraint(
            ["approved_by"],
            ["app_user.id"],
            name=op.f("fk_scenario_approved_by_app_user"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["campus_id"],
            ["campus.id"],
            name=op.f("fk_scenario_campus_id_campus"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["app_user.id"],
            name=op.f("fk_scenario_created_by_app_user"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["term_id"],
            ["term.id"],
            name=op.f("fk_scenario_term_id_term"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_scenario")),
    )
    op.create_index(op.f("ix_scenario_campus_id"), "scenario", ["campus_id"], unique=False)
    op.create_index("ix_scenario_campus_status", "scenario", ["campus_id", "status"], unique=False)
    op.create_index(op.f("ix_scenario_is_demo"), "scenario", ["is_demo"], unique=False)

    op.create_table(
        "scenario_change",
        sa.Column("scenario_id", sa.UUID(), nullable=False),
        sa.Column("change_type", sa.String(length=64), nullable=False),
        sa.Column("section_id", sa.UUID(), nullable=True),
        sa.Column("meeting_id", sa.UUID(), nullable=True),
        sa.Column("course_code", sa.String(length=64), nullable=True),
        sa.Column("section_code", sa.String(length=64), nullable=True),
        sa.Column("old_room_id", sa.String(length=96), nullable=True),
        sa.Column("new_room_id", sa.String(length=96), nullable=True),
        sa.Column("old_weekday", sa.Integer(), nullable=True),
        sa.Column("new_weekday", sa.Integer(), nullable=True),
        sa.Column("old_period", sa.Integer(), nullable=True),
        sa.Column("new_period", sa.Integer(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["meeting_id"],
            ["meeting.id"],
            name=op.f("fk_scenario_change_meeting_id_meeting"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["new_room_id"],
            ["room.id"],
            name=op.f("fk_scenario_change_new_room_id_room"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["old_room_id"],
            ["room.id"],
            name=op.f("fk_scenario_change_old_room_id_room"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["scenario_id"],
            ["scenario.id"],
            name=op.f("fk_scenario_change_scenario_id_scenario"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["section_id"],
            ["section.id"],
            name=op.f("fk_scenario_change_section_id_section"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_scenario_change")),
    )
    op.create_index("ix_scenario_change_scenario", "scenario_change", ["scenario_id"], unique=False)

    op.create_table(
        "asset",
        sa.Column("campus_id", sa.String(length=96), nullable=False),
        sa.Column("asset_code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("asset_type", sa.String(length=64), nullable=False),
        sa.Column("room_id", sa.String(length=96), nullable=True),
        sa.Column("building_id", sa.String(length=96), nullable=True),
        sa.Column("resource_id", sa.UUID(), nullable=True),
        sa.Column(
            "condition",
            sa.Enum("good", "fair", "needs_repair", "retired", name="asset_condition"),
            server_default=sa.text("'good'"),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum("available", "loaned", "maintenance", "retired", name="asset_status"),
            server_default=sa.text("'available'"),
            nullable=False,
        ),
        sa.Column("serial_number", sa.String(length=128), nullable=True),
        sa.Column("usage_hours", sa.Float(), server_default=sa.text("0.0"), nullable=False),
        sa.Column("maintenance_interval_days", sa.Integer(), nullable=True),
        sa.Column("maintenance_interval_hours", sa.Float(), nullable=True),
        sa.Column("last_maintained_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_maintenance_due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("metadata_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("is_demo", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.CheckConstraint("usage_hours >= 0.0", name=op.f("ck_asset_asset_usage_hours_non_negative")),
        sa.ForeignKeyConstraint(
            ["building_id"],
            ["building.id"],
            name=op.f("fk_asset_building_id_building"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["campus_id"],
            ["campus.id"],
            name=op.f("fk_asset_campus_id_campus"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["resource_id"],
            ["resource.id"],
            name=op.f("fk_asset_resource_id_resource"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["room_id"],
            ["room.id"],
            name=op.f("fk_asset_room_id_room"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_asset")),
        sa.UniqueConstraint("campus_id", "asset_code", name="uq_asset_campus_id_asset_code"),
    )
    op.create_index(op.f("ix_asset_campus_id"), "asset", ["campus_id"], unique=False)
    op.create_index("ix_asset_campus_type", "asset", ["campus_id", "asset_type"], unique=False)
    op.create_index(op.f("ix_asset_is_demo"), "asset", ["is_demo"], unique=False)
    op.create_index("ix_asset_room", "asset", ["room_id"], unique=False)

    op.create_table(
        "asset_loan",
        sa.Column("asset_id", sa.UUID(), nullable=False),
        sa.Column("borrower_user_id", sa.UUID(), nullable=False),
        sa.Column("issued_by_user_id", sa.UUID(), nullable=True),
        sa.Column("checked_out_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("returned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("usage_hours_logged", sa.Float(), nullable=True),
        sa.Column(
            "condition_out",
            sa.Enum("good", "fair", "needs_repair", "retired", name="asset_condition"),
            server_default=sa.text("'good'"),
            nullable=False,
        ),
        sa.Column(
            "condition_in",
            sa.Enum("good", "fair", "needs_repair", "retired", name="asset_condition"),
            nullable=True,
        ),
        sa.Column("purpose", sa.String(length=300), nullable=True),
        sa.Column("overdue_notified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("is_demo", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.CheckConstraint("due_at > checked_out_at", name=op.f("ck_asset_loan_asset_loan_window_ordered")),
        sa.ForeignKeyConstraint(
            ["asset_id"],
            ["asset.id"],
            name=op.f("fk_asset_loan_asset_id_asset"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["borrower_user_id"],
            ["app_user.id"],
            name=op.f("fk_asset_loan_borrower_user_id_app_user"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["issued_by_user_id"],
            ["app_user.id"],
            name=op.f("fk_asset_loan_issued_by_user_id_app_user"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_asset_loan")),
    )
    op.create_index(
        "ix_asset_loan_asset_returned", "asset_loan", ["asset_id", "returned_at"], unique=False
    )
    op.create_index("ix_asset_loan_borrower", "asset_loan", ["borrower_user_id"], unique=False)
    op.create_index(op.f("ix_asset_loan_is_demo"), "asset_loan", ["is_demo"], unique=False)

    op.create_table(
        "cleaning_task",
        sa.Column("campus_id", sa.String(length=96), nullable=False),
        sa.Column("plan_date", sa.Date(), nullable=False),
        sa.Column("cleaner_zone", sa.String(length=64), nullable=False),
        sa.Column("sequence_order", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("room_id", sa.String(length=96), nullable=False),
        sa.Column("building_id", sa.String(length=96), nullable=True),
        sa.Column("dirt_score", sa.Float(), nullable=False),
        sa.Column("reason", sa.String(length=64), server_default=sa.text("'used_today'"), nullable=False),
        sa.Column("window_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("window_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("estimated_arrival", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_minutes", sa.Integer(), server_default=sa.text("15"), nullable=False),
        sa.Column("walking_distance_m", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column(
            "status",
            sa.Enum("pending", "in_progress", "completed", "skipped", name="cleaning_task_status"),
            server_default=sa.text("'pending'"),
            nullable=False,
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_by", sa.UUID(), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("is_demo", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.CheckConstraint(
            "dirt_score >= 0.0", name=op.f("ck_cleaning_task_cleaning_task_dirt_non_negative")
        ),
        sa.CheckConstraint(
            "window_end > window_start", name=op.f("ck_cleaning_task_cleaning_task_window_ordered")
        ),
        sa.ForeignKeyConstraint(
            ["building_id"],
            ["building.id"],
            name=op.f("fk_cleaning_task_building_id_building"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["campus_id"],
            ["campus.id"],
            name=op.f("fk_cleaning_task_campus_id_campus"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["completed_by"],
            ["app_user.id"],
            name=op.f("fk_cleaning_task_completed_by_app_user"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["room_id"],
            ["room.id"],
            name=op.f("fk_cleaning_task_room_id_room"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_cleaning_task")),
    )
    op.create_index(op.f("ix_cleaning_task_campus_id"), "cleaning_task", ["campus_id"], unique=False)
    op.create_index(
        "ix_cleaning_task_date_zone",
        "cleaning_task",
        ["campus_id", "plan_date", "cleaner_zone", "sequence_order"],
        unique=False,
    )
    op.create_index(op.f("ix_cleaning_task_is_demo"), "cleaning_task", ["is_demo"], unique=False)
    op.create_index(
        "ix_cleaning_task_room_date", "cleaning_task", ["room_id", "plan_date"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_cleaning_task_room_date", table_name="cleaning_task")
    op.drop_index(op.f("ix_cleaning_task_is_demo"), table_name="cleaning_task")
    op.drop_index("ix_cleaning_task_date_zone", table_name="cleaning_task")
    op.drop_index(op.f("ix_cleaning_task_campus_id"), table_name="cleaning_task")
    op.drop_table("cleaning_task")

    op.drop_index(op.f("ix_asset_loan_is_demo"), table_name="asset_loan")
    op.drop_index("ix_asset_loan_borrower", table_name="asset_loan")
    op.drop_index("ix_asset_loan_asset_returned", table_name="asset_loan")
    op.drop_table("asset_loan")

    op.drop_index("ix_asset_room", table_name="asset")
    op.drop_index(op.f("ix_asset_is_demo"), table_name="asset")
    op.drop_index("ix_asset_campus_type", table_name="asset")
    op.drop_index(op.f("ix_asset_campus_id"), table_name="asset")
    op.drop_table("asset")

    op.drop_index("ix_scenario_change_scenario", table_name="scenario_change")
    op.drop_table("scenario_change")

    op.drop_index(op.f("ix_scenario_is_demo"), table_name="scenario")
    op.drop_index("ix_scenario_campus_status", table_name="scenario")
    op.drop_index(op.f("ix_scenario_campus_id"), table_name="scenario")
    op.drop_table("scenario")

    op.drop_index(op.f("ix_exam_plan_is_demo"), table_name="exam_plan")
    op.drop_index("ix_exam_plan_campus_starts", table_name="exam_plan")
    op.drop_index(op.f("ix_exam_plan_campus_id"), table_name="exam_plan")
    op.drop_table("exam_plan")

    op.drop_index("ix_user_capability_user", table_name="user_capability")
    op.drop_index(op.f("ix_user_capability_is_demo"), table_name="user_capability")
    op.drop_table("user_capability")

    op.drop_table("user_device")

    for enum_name in (
        "asset_condition",
        "asset_status",
        "cleaning_task_status",
        "scenario_status",
    ):
        op.execute(f"DROP TYPE IF EXISTS {enum_name}")
