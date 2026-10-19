"""initial schema

Revision ID: b46274d842de
Revises:
Created: 2026-10-17 07:33:13.331056+00:00

Every migration must have a working downgrade, or a comment here explaining why
it cannot (MASTER_PROMPT.md 0.4 rule 4). Both directions are tested.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "b46274d842de"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # --- hand-written prologue -------------------------------------------------
    # Autogenerate cannot know about either of these, and both are load-bearing.
    #
    # 1. btree_gist. The booking engine's correctness rests on an exclusion
    #    constraint that mixes an equality operator on a scalar column with an
    #    overlap operator on a range inside one GiST index. Core GiST has no
    #    equality operator class for uuid, so without this extension
    #    `resource_occupancy_no_overlap` below cannot be created at all.
    #    Created here rather than in docker/initdb so that a database built from
    #    migrations alone is identical to a freshly initialised container
    #    (MASTER_PROMPT.md 0.4 rule 4).
    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")

    # 2. The shared event sequence. `room_state_event.sequence` defaults to
    #    nextval() on it, so it has to exist before that table is created.
    #    Alembic's autogenerate does not emit standalone Sequence objects.
    op.execute(
        "CREATE SEQUENCE IF NOT EXISTS room_state_event_sequence AS bigint START WITH 1 INCREMENT BY 1"
    )
    # --- end prologue ----------------------------------------------------------

    op.create_table(
        "api_client",
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("token_hash", sa.String(length=128), nullable=False),
        sa.Column("scopes", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("rate_limit_per_minute", sa.Integer(), server_default=sa.text("60"), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_api_client")),
    )
    op.create_index("ix_api_client_token_hash", "api_client", ["token_hash"], unique=True)
    op.create_table(
        "app_user",
        sa.Column("external_ref", sa.String(length=128), nullable=True),
        sa.Column("email", sa.String(length=254), nullable=True),
        sa.Column("display_name", sa.String(length=200), nullable=True),
        sa.Column("password_hash", sa.String(length=256), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("locale", sa.String(length=8), server_default=sa.text("'en'"), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("is_demo", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_app_user")),
        sa.UniqueConstraint("external_ref", name="uq_app_user_external_ref"),
    )
    op.create_index(
        "ix_app_user_email_lower",
        "app_user",
        [sa.literal_column("lower(email)")],
        unique=True,
        postgresql_where=sa.text("email IS NOT NULL"),
    )
    op.create_index(op.f("ix_app_user_is_demo"), "app_user", ["is_demo"], unique=False)
    op.create_table(
        "busyness_snapshot",
        sa.Column("place_id", sa.String(length=96), nullable=False),
        sa.Column("at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("hour_of_week", sa.Integer(), nullable=False),
        sa.Column("fraction", sa.Double(), nullable=False),
        sa.Column(
            "provenance",
            sa.Enum(
                "scheduled",
                "confirmed",
                "reported",
                "estimated",
                "forecast",
                "imported",
                "demo",
                name="provenance",
            ),
            nullable=False,
        ),
        sa.Column("sample_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("is_demo", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.CheckConstraint("fraction >= 0.0", name=op.f("ck_busyness_snapshot_fraction_non_negative")),
        sa.CheckConstraint(
            "hour_of_week BETWEEN 0 AND 167", name=op.f("ck_busyness_snapshot_hour_of_week_in_range")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_busyness_snapshot")),
    )
    op.create_index(op.f("ix_busyness_snapshot_is_demo"), "busyness_snapshot", ["is_demo"], unique=False)
    op.create_index("ix_busyness_snapshot_place_at", "busyness_snapshot", ["place_id", "at"], unique=False)
    op.create_index(
        "ix_busyness_snapshot_place_how", "busyness_snapshot", ["place_id", "hour_of_week"], unique=False
    )
    op.create_table(
        "campus",
        sa.Column("id", sa.String(length=96), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("timezone", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("is_demo", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_campus")),
    )
    op.create_index(op.f("ix_campus_is_demo"), "campus", ["is_demo"], unique=False)
    op.create_table(
        "occupancy_estimate",
        sa.Column("subject_type", sa.String(length=64), nullable=False),
        sa.Column("subject_id", sa.String(length=96), nullable=False),
        sa.Column("at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("fraction", sa.Float(), nullable=False),
        sa.Column("headcount_low", sa.Integer(), nullable=True),
        sa.Column("headcount_likely", sa.Integer(), nullable=True),
        sa.Column("headcount_high", sa.Integer(), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column(
            "provenance",
            sa.Enum(
                "scheduled",
                "confirmed",
                "reported",
                "estimated",
                "forecast",
                "imported",
                "demo",
                name="provenance",
            ),
            nullable=False,
        ),
        sa.Column(
            "confirmation",
            sa.Enum("not_required", "unconfirmed", "confirmed", name="confirmation_state"),
            server_default=sa.text("'not_required'"),
            nullable=False,
        ),
        sa.Column("inputs", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("is_demo", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.CheckConstraint(
            "confidence >= 0.0 AND confidence <= 1.0", name=op.f("ck_occupancy_estimate_confidence_in_range")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_occupancy_estimate")),
    )
    op.create_index(op.f("ix_occupancy_estimate_is_demo"), "occupancy_estimate", ["is_demo"], unique=False)
    op.create_index(
        "ix_occupancy_estimate_subject_at",
        "occupancy_estimate",
        ["subject_type", "subject_id", "at"],
        unique=False,
    )
    op.create_table(
        "seed_run",
        sa.Column("at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("source", sa.String(length=64), nullable=False),
        sa.Column("inventory_hash", sa.String(length=64), nullable=False),
        sa.Column("random_seed", sa.Integer(), nullable=False),
        sa.Column("counts", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("warnings", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_seed_run")),
    )
    op.create_table(
        "signal",
        sa.Column(
            "signal_type",
            sa.Enum(
                "schedule",
                "booking",
                "checkin",
                "teacher_confirmation",
                "crowd_report",
                "ticket",
                "history_profile",
                name="signal_type",
            ),
            nullable=False,
        ),
        sa.Column("subject_type", sa.String(length=64), nullable=False),
        sa.Column("subject_id", sa.String(length=96), nullable=False),
        sa.Column("value", sa.Float(), nullable=True),
        sa.Column("count", sa.Integer(), nullable=True),
        sa.Column("reliability", sa.Float(), server_default=sa.text("0.5"), nullable=False),
        sa.Column(
            "provenance",
            sa.Enum(
                "scheduled",
                "confirmed",
                "reported",
                "estimated",
                "forecast",
                "imported",
                "demo",
                name="provenance",
            ),
            nullable=False,
        ),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("source_ref", sa.String(length=128), nullable=True),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("is_demo", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.CheckConstraint(
            "expires_at IS NULL OR expires_at > observed_at", name=op.f("ck_signal_expiry_after_observation")
        ),
        sa.CheckConstraint(
            "reliability >= 0.0 AND reliability <= 1.0", name=op.f("ck_signal_reliability_in_range")
        ),
        sa.CheckConstraint(
            "value IS NULL OR (value >= 0.0 AND value <= 5.0)", name=op.f("ck_signal_value_in_range")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_signal")),
    )
    op.create_index(op.f("ix_signal_is_demo"), "signal", ["is_demo"], unique=False)
    op.create_index("ix_signal_observed_at", "signal", ["observed_at"], unique=False)
    op.create_index(
        "ix_signal_subject_observed", "signal", ["subject_type", "subject_id", "observed_at"], unique=False
    )
    op.create_table(
        "state_snapshot",
        sa.Column("scope_type", sa.String(length=64), nullable=False),
        sa.Column("scope_id", sa.String(length=96), nullable=False),
        sa.Column("at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("states", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("live_counts", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("recorded_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("is_demo", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_state_snapshot")),
    )
    op.create_index(op.f("ix_state_snapshot_is_demo"), "state_snapshot", ["is_demo"], unique=False)
    op.create_index(
        "ix_state_snapshot_scope_at", "state_snapshot", ["scope_type", "scope_id", "at"], unique=False
    )
    op.create_table(
        "audit_log",
        sa.Column("at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("actor_id", sa.UUID(), nullable=True),
        sa.Column("actor_label", sa.String(length=120), nullable=True),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("target_type", sa.String(length=64), nullable=True),
        sa.Column("target_id", sa.String(length=128), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("request_id", sa.String(length=64), nullable=True),
        sa.Column("details", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("outcome", sa.String(length=64), server_default=sa.text("'ok'"), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(
            ["actor_id"], ["app_user.id"], name=op.f("fk_audit_log_actor_id_app_user"), ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_audit_log")),
    )
    op.create_index("ix_audit_log_action_at", "audit_log", ["action", "at"], unique=False)
    op.create_index("ix_audit_log_actor_at", "audit_log", ["actor_id", "at"], unique=False)
    op.create_index("ix_audit_log_target", "audit_log", ["target_type", "target_id"], unique=False)
    op.create_table(
        "building",
        sa.Column("id", sa.String(length=96), nullable=False),
        sa.Column("campus_id", sa.String(length=96), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("short_name", sa.String(length=64), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("floor_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("provenance", sa.Enum("confirmed", "demo", name="data_provenance"), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("appearance_preset", sa.String(length=64), nullable=True),
        sa.Column("appearance", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("is_demo", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.CheckConstraint("floor_count >= 0", name=op.f("ck_building_floor_count_non_negative")),
        sa.ForeignKeyConstraint(
            ["campus_id"], ["campus.id"], name=op.f("fk_building_campus_id_campus"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_building")),
    )
    op.create_index(op.f("ix_building_campus_id"), "building", ["campus_id"], unique=False)
    op.create_index("ix_building_campus_sort", "building", ["campus_id", "sort_order"], unique=False)
    op.create_index(op.f("ix_building_is_demo"), "building", ["is_demo"], unique=False)
    op.create_table(
        "consent",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("purpose", sa.String(length=64), nullable=False),
        sa.Column("granted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("settings", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["app_user.id"], name=op.f("fk_consent_user_id_app_user"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_consent")),
    )
    op.create_index("ix_consent_user_purpose", "consent", ["user_id", "purpose"], unique=False)
    op.create_table(
        "course",
        sa.Column("campus_id", sa.String(length=96), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("department", sa.String(length=200), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("is_demo", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.ForeignKeyConstraint(
            ["campus_id"], ["campus.id"], name=op.f("fk_course_campus_id_campus"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_course")),
        sa.UniqueConstraint("campus_id", "code", name="uq_course_campus_id_code"),
    )
    op.create_index(op.f("ix_course_campus_id"), "course", ["campus_id"], unique=False)
    op.create_index(op.f("ix_course_is_demo"), "course", ["is_demo"], unique=False)
    op.create_table(
        "crowd_report",
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column("subject_type", sa.String(length=64), nullable=False),
        sa.Column("subject_id", sa.String(length=96), nullable=False),
        sa.Column(
            "level", sa.Enum("empty", "quiet", "moderate", "busy", "full", name="crowd_level"), nullable=False
        ),
        sa.Column("bucket_minute", sa.Integer(), nullable=False),
        sa.Column("wait_band", sa.String(length=64), nullable=True),
        sa.Column("signal_id", sa.UUID(), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("is_demo", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.ForeignKeyConstraint(
            ["signal_id"], ["signal.id"], name=op.f("fk_crowd_report_signal_id_signal"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["app_user.id"], name=op.f("fk_crowd_report_user_id_app_user"), ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_crowd_report")),
        sa.UniqueConstraint(
            "user_id",
            "subject_type",
            "subject_id",
            "bucket_minute",
            name="uq_crowd_report_user_subject_bucket",
        ),
    )
    op.create_index(op.f("ix_crowd_report_is_demo"), "crowd_report", ["is_demo"], unique=False)
    op.create_index(
        "ix_crowd_report_subject_created",
        "crowd_report",
        ["subject_type", "subject_id", "created_at"],
        unique=False,
    )
    op.create_table(
        "import_batch",
        sa.Column("source", sa.String(length=64), nullable=False),
        sa.Column("source_version", sa.String(length=128), nullable=True),
        sa.Column(
            "status",
            sa.Enum("dry_run", "applied", "rolled_back", "failed", name="import_status"),
            nullable=False,
        ),
        sa.Column("report", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("applied_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rolled_back_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.UUID(), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["app_user.id"],
            name=op.f("fk_import_batch_created_by_app_user"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_import_batch")),
    )
    op.create_index("ix_import_batch_status_created", "import_batch", ["status", "created_at"], unique=False)
    op.create_table(
        "reporter_reliability",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("reliability", sa.Float(), server_default=sa.text("0.5"), nullable=False),
        sa.Column("agreements", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("disagreements", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["app_user.id"],
            name=op.f("fk_reporter_reliability_user_id_app_user"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("user_id", name=op.f("pk_reporter_reliability")),
    )
    op.create_table(
        "term",
        sa.Column("campus_id", sa.String(length=96), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("starts_on", sa.Date(), nullable=False),
        sa.Column("ends_on", sa.Date(), nullable=False),
        sa.Column("holidays", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("is_current", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("is_demo", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.CheckConstraint("ends_on >= starts_on", name=op.f("ck_term_term_window_ordered")),
        sa.ForeignKeyConstraint(
            ["campus_id"], ["campus.id"], name=op.f("fk_term_campus_id_campus"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_term")),
        sa.UniqueConstraint("campus_id", "code", name="uq_term_campus_id_code"),
    )
    op.create_index(op.f("ix_term_campus_id"), "term", ["campus_id"], unique=False)
    op.create_index(op.f("ix_term_is_demo"), "term", ["is_demo"], unique=False)
    op.create_table(
        "user_role",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column(
            "role",
            sa.Enum(
                "student",
                "teacher",
                "staff",
                "facilities",
                "safety_officer",
                "analyst",
                "admin",
                "service",
                # Not "user_role": the user_role TABLE created here owns an
                # implicit composite type of that name, and the two collide.
                name="app_role",
            ),
            nullable=False,
        ),
        sa.Column("scope", sa.String(length=96), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["app_user.id"], name=op.f("fk_user_role_user_id_app_user"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("user_id", "role", name=op.f("pk_user_role")),
    )
    op.create_table(
        "connector",
        sa.Column("id", sa.String(length=96), nullable=False),
        sa.Column("campus_id", sa.String(length=96), nullable=False),
        sa.Column(
            "kind", sa.String(length=40), server_default=sa.text("'enclosed-corridor'"), nullable=False
        ),
        sa.Column("building_a_id", sa.String(length=96), nullable=False),
        sa.Column("building_b_id", sa.String(length=96), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("is_demo", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.CheckConstraint(
            "building_a_id <> building_b_id", name=op.f("ck_connector_connector_links_two_buildings")
        ),
        sa.ForeignKeyConstraint(
            ["building_a_id"],
            ["building.id"],
            name=op.f("fk_connector_building_a_id_building"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["building_b_id"],
            ["building.id"],
            name=op.f("fk_connector_building_b_id_building"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["campus_id"], ["campus.id"], name=op.f("fk_connector_campus_id_campus"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_connector")),
    )
    op.create_index(op.f("ix_connector_campus_id"), "connector", ["campus_id"], unique=False)
    op.create_index(op.f("ix_connector_is_demo"), "connector", ["is_demo"], unique=False)
    op.create_table(
        "floor",
        sa.Column("id", sa.String(length=96), nullable=False),
        sa.Column("building_id", sa.String(length=96), nullable=False),
        sa.Column("level", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("is_demo", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.ForeignKeyConstraint(
            ["building_id"], ["building.id"], name=op.f("fk_floor_building_id_building"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_floor")),
        sa.UniqueConstraint("building_id", "level", name="uq_floor_building_id_level"),
    )
    op.create_index(op.f("ix_floor_building_id"), "floor", ["building_id"], unique=False)
    op.create_index(op.f("ix_floor_is_demo"), "floor", ["is_demo"], unique=False)
    op.create_table(
        "section",
        sa.Column("term_id", sa.UUID(), nullable=False),
        sa.Column("course_id", sa.UUID(), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("cohort", sa.String(length=64), nullable=True),
        sa.Column("teacher_ref", sa.String(length=128), nullable=True),
        sa.Column("teacher_user_id", sa.UUID(), nullable=True),
        sa.Column("enrolled_count", sa.Integer(), nullable=True),
        sa.Column("requires_step_free", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("is_demo", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.CheckConstraint(
            "enrolled_count IS NULL OR enrolled_count >= 0", name=op.f("ck_section_enrolled_non_negative")
        ),
        sa.ForeignKeyConstraint(
            ["course_id"], ["course.id"], name=op.f("fk_section_course_id_course"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["teacher_user_id"],
            ["app_user.id"],
            name=op.f("fk_section_teacher_user_id_app_user"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["term_id"], ["term.id"], name=op.f("fk_section_term_id_term"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_section")),
        sa.UniqueConstraint("term_id", "course_id", "code", name="uq_section_term_id_course_id_code"),
    )
    op.create_index(op.f("ix_section_is_demo"), "section", ["is_demo"], unique=False)
    op.create_index("ix_section_term", "section", ["term_id"], unique=False)
    op.create_table(
        "attendance_rate",
        sa.Column("section_id", sa.UUID(), nullable=False),
        sa.Column("weekday", sa.Integer(), nullable=False),
        sa.Column("hour", sa.Integer(), nullable=False),
        sa.Column("alpha", sa.Float(), nullable=False),
        sa.Column("beta", sa.Float(), nullable=False),
        sa.Column("observations", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("is_demo", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.CheckConstraint("alpha > 0 AND beta > 0", name=op.f("ck_attendance_rate_beta_params_positive")),
        sa.CheckConstraint("hour BETWEEN 0 AND 23", name=op.f("ck_attendance_rate_hour_in_range")),
        sa.CheckConstraint("weekday BETWEEN 0 AND 6", name=op.f("ck_attendance_rate_weekday_in_range")),
        sa.ForeignKeyConstraint(
            ["section_id"],
            ["section.id"],
            name=op.f("fk_attendance_rate_section_id_section"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("section_id", "weekday", "hour", name=op.f("pk_attendance_rate")),
    )
    op.create_index(op.f("ix_attendance_rate_is_demo"), "attendance_rate", ["is_demo"], unique=False)
    op.create_table(
        "room",
        sa.Column("id", sa.String(length=96), nullable=False),
        sa.Column("floor_id", sa.String(length=96), nullable=False),
        sa.Column("number", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=True),
        sa.Column(
            "room_kind",
            sa.Enum("classroom", "lab", "office", "hall", "other", name="room_kind"),
            nullable=False,
        ),
        sa.Column("capacity", sa.Integer(), nullable=True),
        sa.Column("provenance", sa.Enum("confirmed", "demo", name="data_provenance"), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("accessible", sa.Boolean(), nullable=True),
        sa.Column("features", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("out_of_service", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("needs_review", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("is_demo", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.CheckConstraint("capacity IS NULL OR capacity >= 0", name=op.f("ck_room_capacity_non_negative")),
        sa.ForeignKeyConstraint(
            ["floor_id"], ["floor.id"], name=op.f("fk_room_floor_id_floor"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_room")),
    )
    op.create_index(op.f("ix_room_floor_id"), "room", ["floor_id"], unique=False)
    op.create_index("ix_room_floor_sort", "room", ["floor_id", "sort_order"], unique=False)
    op.create_index(op.f("ix_room_is_demo"), "room", ["is_demo"], unique=False)
    op.create_index("ix_room_kind_capacity", "room", ["room_kind", "capacity"], unique=False)
    op.create_index(op.f("ix_room_number"), "room", ["number"], unique=False)
    op.create_table(
        "meeting_rule",
        sa.Column("section_id", sa.UUID(), nullable=False),
        sa.Column("room_id", sa.String(length=96), nullable=True),
        sa.Column("source_room_code", sa.String(length=64), nullable=True),
        sa.Column("rrule", sa.Text(), nullable=False),
        sa.Column("dtstart_local", sa.String(length=32), nullable=False),
        sa.Column("tzid", sa.String(length=64), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("exdates", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("uid", sa.String(length=256), nullable=True),
        sa.Column("import_batch_id", sa.UUID(), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("is_demo", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.CheckConstraint("duration_minutes > 0", name=op.f("ck_meeting_rule_duration_positive")),
        sa.ForeignKeyConstraint(
            ["import_batch_id"],
            ["import_batch.id"],
            name=op.f("fk_meeting_rule_import_batch_id_import_batch"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["room_id"], ["room.id"], name=op.f("fk_meeting_rule_room_id_room"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["section_id"],
            ["section.id"],
            name=op.f("fk_meeting_rule_section_id_section"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_meeting_rule")),
    )
    op.create_index(op.f("ix_meeting_rule_is_demo"), "meeting_rule", ["is_demo"], unique=False)
    op.create_index(op.f("ix_meeting_rule_room_id"), "meeting_rule", ["room_id"], unique=False)
    op.create_index("ix_meeting_rule_section", "meeting_rule", ["section_id"], unique=False)
    op.create_index(op.f("ix_meeting_rule_uid"), "meeting_rule", ["uid"], unique=False)
    op.create_table(
        "resource",
        sa.Column("campus_id", sa.String(length=96), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("kind", sa.String(length=64), nullable=False),
        sa.Column("room_id", sa.String(length=96), nullable=True),
        sa.Column("capacity", sa.Integer(), nullable=True),
        sa.Column("policy", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("requires_approval", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("is_bookable", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("is_demo", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.ForeignKeyConstraint(
            ["campus_id"], ["campus.id"], name=op.f("fk_resource_campus_id_campus"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["room_id"], ["room.id"], name=op.f("fk_resource_room_id_room"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_resource")),
        sa.UniqueConstraint("campus_id", "code", name="uq_resource_campus_id_code"),
    )
    op.create_index(op.f("ix_resource_is_demo"), "resource", ["is_demo"], unique=False)
    op.create_index("ix_resource_kind", "resource", ["kind"], unique=False)
    op.create_index(op.f("ix_resource_room_id"), "resource", ["room_id"], unique=False)
    op.create_table(
        "room_alias",
        sa.Column("alias", sa.String(length=96), nullable=False),
        sa.Column("room_id", sa.String(length=96), nullable=False),
        sa.Column("source", sa.String(length=120), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["room_id"], ["room.id"], name=op.f("fk_room_alias_room_id_room"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("alias", "room_id", name=op.f("pk_room_alias")),
        sa.UniqueConstraint("alias", "room_id", name="uq_room_alias_alias_room_id"),
    )
    op.create_index("ix_room_alias_alias", "room_alias", ["alias"], unique=False)
    op.create_table(
        "room_state_event",
        sa.Column(
            "sequence",
            sa.BigInteger(),
            server_default=sa.text("nextval('room_state_event_sequence')"),
            nullable=False,
        ),
        sa.Column("room_id", sa.String(length=96), nullable=False),
        sa.Column(
            "state",
            sa.Enum(
                "free", "lesson_now", "starts_soon", "done_for_today", "cancelled", name="room_state_kind"
            ),
            nullable=False,
        ),
        sa.Column(
            "previous_state",
            sa.Enum(
                "free", "lesson_now", "starts_soon", "done_for_today", "cancelled", name="room_state_kind"
            ),
            nullable=True,
        ),
        sa.Column("kind", sa.String(length=64), nullable=True),
        sa.Column(
            "confirmation",
            sa.Enum("not_required", "unconfirmed", "confirmed", name="confirmation_state"),
            server_default=sa.text("'not_required'"),
            nullable=False,
        ),
        sa.Column(
            "provenance",
            sa.Enum(
                "scheduled",
                "confirmed",
                "reported",
                "estimated",
                "forecast",
                "imported",
                "demo",
                name="provenance",
            ),
            nullable=False,
        ),
        sa.Column("out_of_service", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("effective_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("cause_ref", sa.String(length=128), nullable=True),
        sa.Column("details", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("is_demo", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.ForeignKeyConstraint(
            ["room_id"], ["room.id"], name=op.f("fk_room_state_event_room_id_room"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_room_state_event")),
    )
    op.create_index("ix_room_state_event_effective_at", "room_state_event", ["effective_at"], unique=False)
    op.create_index(op.f("ix_room_state_event_is_demo"), "room_state_event", ["is_demo"], unique=False)
    op.create_index(
        "ix_room_state_event_room_effective", "room_state_event", ["room_id", "effective_at"], unique=False
    )
    op.create_index("ix_room_state_event_sequence", "room_state_event", ["sequence"], unique=True)
    op.create_table(
        "blackout",
        sa.Column("resource_id", sa.UUID(), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("is_demo", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.CheckConstraint("ends_at > starts_at", name=op.f("ck_blackout_blackout_window_ordered")),
        sa.ForeignKeyConstraint(
            ["resource_id"],
            ["resource.id"],
            name=op.f("fk_blackout_resource_id_resource"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_blackout")),
    )
    op.create_index(op.f("ix_blackout_is_demo"), "blackout", ["is_demo"], unique=False)
    op.create_index(
        "ix_blackout_resource_window", "blackout", ["resource_id", "starts_at", "ends_at"], unique=False
    )
    op.create_table(
        "booking",
        sa.Column("resource_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "status",
            sa.Enum("pending", "confirmed", "cancelled", "released", name="occupancy_status"),
            nullable=False,
        ),
        sa.Column("purpose", sa.String(length=300), nullable=True),
        sa.Column("attendee_count", sa.Integer(), nullable=True),
        sa.Column("checked_in_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("released_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("approved_by", sa.UUID(), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("is_demo", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.CheckConstraint(
            "attendee_count IS NULL OR attendee_count >= 0", name=op.f("ck_booking_attendees_non_negative")
        ),
        sa.CheckConstraint("ends_at > starts_at", name=op.f("ck_booking_booking_window_ordered")),
        sa.ForeignKeyConstraint(
            ["approved_by"],
            ["app_user.id"],
            name=op.f("fk_booking_approved_by_app_user"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["resource_id"], ["resource.id"], name=op.f("fk_booking_resource_id_resource"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["app_user.id"], name=op.f("fk_booking_user_id_app_user"), ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_booking")),
    )
    op.create_index(op.f("ix_booking_is_demo"), "booking", ["is_demo"], unique=False)
    op.create_index(
        "ix_booking_resource_window", "booking", ["resource_id", "starts_at", "ends_at"], unique=False
    )
    op.create_index("ix_booking_user", "booking", ["user_id"], unique=False)
    op.create_table(
        "meeting",
        sa.Column("rule_id", sa.UUID(), nullable=True),
        sa.Column("room_id", sa.String(length=96), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("original_starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("subject", sa.String(length=300), nullable=True),
        sa.Column("teacher_label", sa.String(length=200), nullable=True),
        sa.Column("group_label", sa.String(length=64), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("is_demo", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.CheckConstraint("ends_at > starts_at", name=op.f("ck_meeting_meeting_window_ordered")),
        sa.ForeignKeyConstraint(
            ["room_id"], ["room.id"], name=op.f("fk_meeting_room_id_room"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["rule_id"], ["meeting_rule.id"], name=op.f("fk_meeting_rule_id_meeting_rule"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_meeting")),
        sa.UniqueConstraint("rule_id", "original_starts_at", name="uq_meeting_rule_id_original_starts_at"),
    )
    op.create_index(op.f("ix_meeting_is_demo"), "meeting", ["is_demo"], unique=False)
    op.create_index("ix_meeting_room_window", "meeting", ["room_id", "starts_at", "ends_at"], unique=False)
    op.create_index(op.f("ix_meeting_rule_id"), "meeting", ["rule_id"], unique=False)
    op.create_index("ix_meeting_window", "meeting", ["starts_at", "ends_at"], unique=False)
    op.create_table(
        "attendance_session",
        sa.Column("meeting_id", sa.UUID(), nullable=True),
        sa.Column("room_id", sa.String(length=96), nullable=True),
        sa.Column("opened_by", sa.UUID(), nullable=True),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("token_step_seconds", sa.Integer(), server_default=sa.text("20"), nullable=False),
        sa.Column("late_after_minutes", sa.Integer(), server_default=sa.text("15"), nullable=False),
        sa.Column("expected_count", sa.Integer(), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("is_demo", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.CheckConstraint(
            "token_step_seconds BETWEEN 10 AND 120", name=op.f("ck_attendance_session_token_step_sane")
        ),
        sa.ForeignKeyConstraint(
            ["meeting_id"],
            ["meeting.id"],
            name=op.f("fk_attendance_session_meeting_id_meeting"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["opened_by"],
            ["app_user.id"],
            name=op.f("fk_attendance_session_opened_by_app_user"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["room_id"], ["room.id"], name=op.f("fk_attendance_session_room_id_room"), ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_attendance_session")),
    )
    op.create_index(op.f("ix_attendance_session_is_demo"), "attendance_session", ["is_demo"], unique=False)
    op.create_index("ix_attendance_session_meeting", "attendance_session", ["meeting_id"], unique=False)
    op.create_table(
        "meeting_override",
        sa.Column("meeting_id", sa.UUID(), nullable=False),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("new_starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("new_ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("new_room_id", sa.String(length=96), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("created_by", sa.UUID(), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("is_demo", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["app_user.id"],
            name=op.f("fk_meeting_override_created_by_app_user"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["meeting_id"],
            ["meeting.id"],
            name=op.f("fk_meeting_override_meeting_id_meeting"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["new_room_id"],
            ["room.id"],
            name=op.f("fk_meeting_override_new_room_id_room"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_meeting_override")),
    )
    op.create_index(op.f("ix_meeting_override_is_demo"), "meeting_override", ["is_demo"], unique=False)
    op.create_index("ix_meeting_override_meeting", "meeting_override", ["meeting_id"], unique=False)
    op.create_table(
        "resource_occupancy",
        sa.Column("resource_id", sa.UUID(), nullable=False),
        sa.Column("period", postgresql.TSTZRANGE(), nullable=False),
        sa.Column(
            "kind",
            sa.Enum("lesson", "booking", "event", "maintenance", "blackout", name="occupancy_kind"),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum("pending", "confirmed", "cancelled", "released", name="occupancy_status"),
            nullable=False,
        ),
        sa.Column("meeting_id", sa.UUID(), nullable=True),
        sa.Column("booking_id", sa.UUID(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("is_demo", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        postgresql.ExcludeConstraint(
            (sa.column("resource_id"), "="),
            (sa.column("period"), "&&"),
            where=sa.text("status IN ('pending', 'confirmed')"),
            using="gist",
            name="resource_occupancy_no_overlap",
        ),
        sa.CheckConstraint("NOT isempty(period)", name=op.f("ck_resource_occupancy_period_not_empty")),
        sa.CheckConstraint(
            "lower_inc(period) AND NOT upper_inc(period)", name=op.f("ck_resource_occupancy_period_half_open")
        ),
        sa.ForeignKeyConstraint(
            ["booking_id"],
            ["booking.id"],
            name=op.f("fk_resource_occupancy_booking_id_booking"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["meeting_id"],
            ["meeting.id"],
            name=op.f("fk_resource_occupancy_meeting_id_meeting"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["resource_id"],
            ["resource.id"],
            name=op.f("fk_resource_occupancy_resource_id_resource"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_resource_occupancy")),
    )
    op.create_index(op.f("ix_resource_occupancy_is_demo"), "resource_occupancy", ["is_demo"], unique=False)
    op.create_index(
        "ix_resource_occupancy_period",
        "resource_occupancy",
        ["period"],
        unique=False,
        postgresql_using="gist",
    )
    op.create_index(
        "ix_resource_occupancy_resource_status", "resource_occupancy", ["resource_id", "status"], unique=False
    )
    op.create_table(
        "attendance_record",
        sa.Column("session_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column("state", sa.String(length=64), nullable=False),
        sa.Column("scanned_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("device_ref", sa.String(length=128), nullable=True),
        sa.Column("review_reason", sa.Text(), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("is_demo", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["attendance_session.id"],
            name=op.f("fk_attendance_record_session_id_attendance_session"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["app_user.id"],
            name=op.f("fk_attendance_record_user_id_app_user"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_attendance_record")),
        sa.UniqueConstraint("session_id", "user_id", name="uq_attendance_record_session_id_user_id"),
    )
    op.create_index(op.f("ix_attendance_record_is_demo"), "attendance_record", ["is_demo"], unique=False)
    op.create_index("ix_attendance_record_session", "attendance_record", ["session_id"], unique=False)
    # ### end Alembic commands ###


def downgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    # NOTE: autogenerate originally emitted `op.drop_table("alembic_version")`
    # here in upgrade() and a matching create in downgrade(), because the
    # database already held Alembic's own version table and that table is not
    # part of Base.metadata. Both were removed by hand: a migration that drops
    # the version table deletes the bookkeeping Alembic is about to write to,
    # and the upgrade fails with
    # `relation "campus.alembic_version" does not exist` *after* all 34 tables
    # have been created. `include_object` in alembic/env.py now filters the
    # version table out so autogenerate cannot reintroduce this.
    op.drop_index("ix_attendance_record_session", table_name="attendance_record")
    op.drop_index(op.f("ix_attendance_record_is_demo"), table_name="attendance_record")
    op.drop_table("attendance_record")
    op.drop_index("ix_resource_occupancy_resource_status", table_name="resource_occupancy")
    op.drop_index("ix_resource_occupancy_period", table_name="resource_occupancy", postgresql_using="gist")
    op.drop_index(op.f("ix_resource_occupancy_is_demo"), table_name="resource_occupancy")
    op.drop_table("resource_occupancy")
    op.drop_index("ix_meeting_override_meeting", table_name="meeting_override")
    op.drop_index(op.f("ix_meeting_override_is_demo"), table_name="meeting_override")
    op.drop_table("meeting_override")
    op.drop_index("ix_attendance_session_meeting", table_name="attendance_session")
    op.drop_index(op.f("ix_attendance_session_is_demo"), table_name="attendance_session")
    op.drop_table("attendance_session")
    op.drop_index("ix_meeting_window", table_name="meeting")
    op.drop_index(op.f("ix_meeting_rule_id"), table_name="meeting")
    op.drop_index("ix_meeting_room_window", table_name="meeting")
    op.drop_index(op.f("ix_meeting_is_demo"), table_name="meeting")
    op.drop_table("meeting")
    op.drop_index("ix_booking_user", table_name="booking")
    op.drop_index("ix_booking_resource_window", table_name="booking")
    op.drop_index(op.f("ix_booking_is_demo"), table_name="booking")
    op.drop_table("booking")
    op.drop_index("ix_blackout_resource_window", table_name="blackout")
    op.drop_index(op.f("ix_blackout_is_demo"), table_name="blackout")
    op.drop_table("blackout")
    op.drop_index("ix_room_state_event_sequence", table_name="room_state_event")
    op.drop_index("ix_room_state_event_room_effective", table_name="room_state_event")
    op.drop_index(op.f("ix_room_state_event_is_demo"), table_name="room_state_event")
    op.drop_index("ix_room_state_event_effective_at", table_name="room_state_event")
    op.drop_table("room_state_event")
    op.drop_index("ix_room_alias_alias", table_name="room_alias")
    op.drop_table("room_alias")
    op.drop_index(op.f("ix_resource_room_id"), table_name="resource")
    op.drop_index("ix_resource_kind", table_name="resource")
    op.drop_index(op.f("ix_resource_is_demo"), table_name="resource")
    op.drop_table("resource")
    op.drop_index(op.f("ix_meeting_rule_uid"), table_name="meeting_rule")
    op.drop_index("ix_meeting_rule_section", table_name="meeting_rule")
    op.drop_index(op.f("ix_meeting_rule_room_id"), table_name="meeting_rule")
    op.drop_index(op.f("ix_meeting_rule_is_demo"), table_name="meeting_rule")
    op.drop_table("meeting_rule")
    op.drop_index(op.f("ix_room_number"), table_name="room")
    op.drop_index("ix_room_kind_capacity", table_name="room")
    op.drop_index(op.f("ix_room_is_demo"), table_name="room")
    op.drop_index("ix_room_floor_sort", table_name="room")
    op.drop_index(op.f("ix_room_floor_id"), table_name="room")
    op.drop_table("room")
    op.drop_index(op.f("ix_attendance_rate_is_demo"), table_name="attendance_rate")
    op.drop_table("attendance_rate")
    op.drop_index("ix_section_term", table_name="section")
    op.drop_index(op.f("ix_section_is_demo"), table_name="section")
    op.drop_table("section")
    op.drop_index(op.f("ix_floor_is_demo"), table_name="floor")
    op.drop_index(op.f("ix_floor_building_id"), table_name="floor")
    op.drop_table("floor")
    op.drop_index(op.f("ix_connector_is_demo"), table_name="connector")
    op.drop_index(op.f("ix_connector_campus_id"), table_name="connector")
    op.drop_table("connector")
    op.drop_table("user_role")
    op.drop_index(op.f("ix_term_is_demo"), table_name="term")
    op.drop_index(op.f("ix_term_campus_id"), table_name="term")
    op.drop_table("term")
    op.drop_table("reporter_reliability")
    op.drop_index("ix_import_batch_status_created", table_name="import_batch")
    op.drop_table("import_batch")
    op.drop_index("ix_crowd_report_subject_created", table_name="crowd_report")
    op.drop_index(op.f("ix_crowd_report_is_demo"), table_name="crowd_report")
    op.drop_table("crowd_report")
    op.drop_index(op.f("ix_course_is_demo"), table_name="course")
    op.drop_index(op.f("ix_course_campus_id"), table_name="course")
    op.drop_table("course")
    op.drop_index("ix_consent_user_purpose", table_name="consent")
    op.drop_table("consent")
    op.drop_index(op.f("ix_building_is_demo"), table_name="building")
    op.drop_index("ix_building_campus_sort", table_name="building")
    op.drop_index(op.f("ix_building_campus_id"), table_name="building")
    op.drop_table("building")
    op.drop_index("ix_audit_log_target", table_name="audit_log")
    op.drop_index("ix_audit_log_actor_at", table_name="audit_log")
    op.drop_index("ix_audit_log_action_at", table_name="audit_log")
    op.drop_table("audit_log")
    op.drop_index("ix_state_snapshot_scope_at", table_name="state_snapshot")
    op.drop_index(op.f("ix_state_snapshot_is_demo"), table_name="state_snapshot")
    op.drop_table("state_snapshot")
    op.drop_index("ix_signal_subject_observed", table_name="signal")
    op.drop_index("ix_signal_observed_at", table_name="signal")
    op.drop_index(op.f("ix_signal_is_demo"), table_name="signal")
    op.drop_table("signal")
    op.drop_table("seed_run")
    op.drop_index("ix_occupancy_estimate_subject_at", table_name="occupancy_estimate")
    op.drop_index(op.f("ix_occupancy_estimate_is_demo"), table_name="occupancy_estimate")
    op.drop_table("occupancy_estimate")
    op.drop_index(op.f("ix_campus_is_demo"), table_name="campus")
    op.drop_table("campus")
    op.drop_index("ix_busyness_snapshot_place_how", table_name="busyness_snapshot")
    op.drop_index("ix_busyness_snapshot_place_at", table_name="busyness_snapshot")
    op.drop_index(op.f("ix_busyness_snapshot_is_demo"), table_name="busyness_snapshot")
    op.drop_table("busyness_snapshot")
    op.drop_index(op.f("ix_app_user_is_demo"), table_name="app_user")
    op.drop_index(
        "ix_app_user_email_lower", table_name="app_user", postgresql_where=sa.text("email IS NOT NULL")
    )
    op.drop_table("app_user")
    op.drop_index("ix_api_client_token_hash", table_name="api_client")
    op.drop_table("api_client")
    # ### end Alembic commands ###

    # --- hand-written epilogue -------------------------------------------------
    # Mirror of the prologue, in reverse. Autogenerate emitted neither.
    #
    # The native enum types are created implicitly by the first column that uses
    # them, but PostgreSQL does not drop them with their tables, so a downgrade
    # that skipped this would leave orphaned types behind and a re-upgrade would
    # fail with "type already exists". Dropping them is what makes the
    # down/up cycle actually repeatable.
    for enum_name in (
        "app_role",
        "confirmation_state",
        "crowd_level",
        "data_provenance",
        "import_status",
        "occupancy_kind",
        "occupancy_status",
        "provenance",
        "room_kind",
        "room_state_kind",
        "signal_type",
        "space_kind",
    ):
        op.execute(f"DROP TYPE IF EXISTS {enum_name}")

    op.execute("DROP SEQUENCE IF EXISTS room_state_event_sequence")

    # btree_gist is deliberately NOT dropped: extensions are database-wide and
    # another schema in the same database may depend on it. Removing it is an
    # operator decision, not a migration's.
    # --- end epilogue ----------------------------------------------------------
