"""update crowded places navigation targets for study lounge, sports hall, and indoor tennis hall

Updates place-study-a to Block A-C Open Study Lounge (room-open-study-ac),
place-sports-hall to Block C Floor 2 Main Sports Hall (bld-i-f2-gym), and
place-gym to Indoor Tennis Hall H-103 (bld-e-f1-tennis).

Revision ID: f6a4b2c9d105
Revises: e5f3a9b1c804
Create Date: 2026-11-08
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "f6a4b2c9d105"
down_revision: str | None = "e5f3a9b1c804"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE place
            SET name = 'Indoor Tennis Hall (H-103)',
                building_id = CASE
                    WHEN EXISTS (SELECT 1 FROM building WHERE id = 'bld-e') THEN 'bld-e'
                    ELSE building_id
                END,
                config = jsonb_set(
                    jsonb_set(COALESCE(config, '{}'::jsonb), '{floor_id}', '"bld-e-f1"'::jsonb),
                    '{room_id}',
                    '"bld-e-f1-tennis"'::jsonb
                )
            WHERE id = 'place-gym'
            """
        )
    )

    op.execute(
        sa.text(
            """
            UPDATE place
            SET name = 'Main Sports Hall',
                capacity = 60,
                building_id = CASE
                    WHEN EXISTS (SELECT 1 FROM building WHERE id = 'bld-i') THEN 'bld-i'
                    ELSE building_id
                END,
                config = jsonb_set(
                    jsonb_set(COALESCE(config, '{}'::jsonb), '{floor_id}', '"bld-i-f2"'::jsonb),
                    '{room_id}',
                    '"bld-i-f2-gym"'::jsonb
                )
            WHERE id = 'place-sports-hall'
            """
        )
    )

    op.execute(
        sa.text(
            """
            UPDATE place
            SET name = 'Block A Open Study Lounge',
                building_id = CASE
                    WHEN EXISTS (SELECT 1 FROM building WHERE id = 'bld-i') THEN 'bld-i'
                    ELSE building_id
                END,
                config = jsonb_set(
                    jsonb_set(COALESCE(config, '{}'::jsonb), '{floor_id}', '"bld-i-f2"'::jsonb),
                    '{room_id}',
                    '"room-open-study-ac"'::jsonb
                )
            WHERE id = 'place-study-a'
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE place
            SET name = 'Campus Fitness Gym',
                config = jsonb_set(
                    jsonb_set(COALESCE(config, '{}'::jsonb), '{floor_id}', '"bld-e-f1"'::jsonb),
                    '{room_id}',
                    '"bld-e-f1-r1"'::jsonb
                )
            WHERE id = 'place-gym'
            """
        )
    )

    op.execute(
        sa.text(
            """
            UPDATE place
            SET name = 'Main Sports Hall',
                capacity = 120,
                building_id = CASE
                    WHEN EXISTS (SELECT 1 FROM building WHERE id = 'bld-e') THEN 'bld-e'
                    ELSE building_id
                END,
                config = jsonb_set(
                    jsonb_set(COALESCE(config, '{}'::jsonb), '{floor_id}', '"bld-e-f1"'::jsonb),
                    '{room_id}',
                    '"bld-e-f1-r1"'::jsonb
                )
            WHERE id = 'place-sports-hall'
            """
        )
    )

    op.execute(
        sa.text(
            """
            UPDATE place
            SET name = 'Block A Open Study Lounge',
                building_id = CASE
                    WHEN EXISTS (SELECT 1 FROM building WHERE id = 'bld-h') THEN 'bld-h'
                    ELSE building_id
                END,
                config = jsonb_set(
                    jsonb_set(COALESCE(config, '{}'::jsonb), '{floor_id}', '"bld-h-f1"'::jsonb),
                    '{room_id}',
                    '"bld-h-f1-a105"'::jsonb
                )
            WHERE id = 'place-study-a'
            """
        )
    )
