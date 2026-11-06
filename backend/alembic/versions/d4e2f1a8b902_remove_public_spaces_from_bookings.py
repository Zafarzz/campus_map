"""remove public spaces (canteens, libraries, study lounges, lobbies, Block C) from bookings

Updates ``resource.is_bookable = false`` for all public campus amenities:
- Canteens & dining halls (including Block C canteen)
- Campus libraries, reading halls, and archives (Block F F-101, Block A A-105, A-107)
- Open study spaces, lounges, and lobbies (Block G/B lobbies, Block C conference/lobby)
- Entire Block C and Dormitory (public facilities available 24/7, serving all students equally)

Includes a reversible ``downgrade()`` per MASTER_PROMPT.md 0.4 rule 4.

Revision ID: d4e2f1a8b902
Revises: 9c5e2b7a1f03
Create Date: 2026-11-06
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "d4e2f1a8b902"
down_revision: str | None = "9c5e2b7a1f03"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE resource
            SET is_bookable = false
            FROM room
            LEFT JOIN floor ON floor.id = room.floor_id
            WHERE resource.room_id = room.id
              AND (
                floor.building_id IN ('bld-i', 'bld-j')
                OR resource.kind IN ('laundry', 'dorm')
                OR resource.room_id IN (
                    'room-canteen', 'room-c-conf', 'bld-d-f1-f101',
                    'bld-h-f1-a105', 'bld-h-f1-a107', 'bld-g-f1-lobby', 'bld-g-f2-lobby'
                )
                OR resource.name ILIKE '%canteen%'
                OR resource.name ILIKE '%cafeteria%'
                OR resource.name ILIKE '%dining%'
                OR resource.name ILIKE '%library%'
                OR resource.name ILIKE '%reading%'
                OR resource.name ILIKE '%lounge%'
                OR resource.name ILIKE '%open space%'
                OR resource.name ILIKE '%lobby%'
                OR resource.name ILIKE '%exhibition%'
                OR resource.name ILIKE '%toilet%'
                OR resource.name ILIKE '%restroom%'
                OR resource.code ILIKE '%canteen%'
                OR resource.code ILIKE '%library%'
                OR resource.code ILIKE '%wc%'
              )
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE resource
            SET is_bookable = true
            WHERE room_id IN (
                'room-c-conf', 'bld-d-f1-f101', 'bld-h-f1-a105', 'bld-h-f1-a107', 'bld-g-f1-lobby'
            )
            """
        )
    )
