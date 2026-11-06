"""restore Block C conference hall C-201 to bookable inventory

Keeps public spaces like canteen and dorms unbookable, while re-enabling
Block C Conference Hall (C-201) so it is available for booking.

Revision ID: e5f3a9b1c804
Revises: d4e2f1a8b902
Create Date: 2026-11-06
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "e5f3a9b1c804"
down_revision: str | None = "d4e2f1a8b902"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE resource
            SET is_bookable = true,
                name = 'C-201 Conference Hall'
            WHERE room_id = 'room-c-conf' OR room_id = 'bld-i-f2-r1';
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE resource
            SET is_bookable = false
            WHERE room_id = 'room-c-conf' OR room_id = 'bld-i-f2-r1';
            """
        )
    )
