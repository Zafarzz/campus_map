"""add lost_found_item.contact_info and remove manual QA test items

Adds the nullable ``contact_info`` column (phone number or Telegram handle) on
``lost_found_item`` so students and staff reporting lost or found items can
optionally share direct contact details alongside campus security handover.

Idempotent when ``contact_info`` was already added manually during local
verification, and includes a clean ``downgrade()`` per MASTER_PROMPT.md 0.4
rule 4.

Revision ID: 9c5e2b7a1f03
Revises: 4a1c8f92e104
Create Date: 2026-11-06
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import context, op

revision: str = "9c5e2b7a1f03"
down_revision: str | None = "4a1c8f92e104"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    if context.is_offline_mode():
        op.add_column(
            "lost_found_item",
            sa.Column("contact_info", sa.String(length=200), nullable=True),
        )
    else:
        bind = op.get_bind()
        inspector = sa.inspect(bind)
        existing_cols = {col["name"] for col in inspector.get_columns("lost_found_item")}
        if "contact_info" not in existing_cols:
            op.add_column(
                "lost_found_item",
                sa.Column("contact_info", sa.String(length=200), nullable=True),
            )

    op.execute(
        sa.text(
            "DELETE FROM lost_found_item "
            "WHERE (title = 'I found a wallet' AND description ILIKE '%Malika Nizamitdinova%') "
            "   OR title = 'Test Keychain with Blue Fob'"
        )
    )


def downgrade() -> None:
    if context.is_offline_mode():
        op.drop_column("lost_found_item", "contact_info")
    else:
        bind = op.get_bind()
        inspector = sa.inspect(bind)
        existing_cols = {col["name"] for col in inspector.get_columns("lost_found_item")}
        if "contact_info" in existing_cols:
            op.drop_column("lost_found_item", "contact_info")
