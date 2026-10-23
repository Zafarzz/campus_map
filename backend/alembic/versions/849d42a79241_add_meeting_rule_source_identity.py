"""add meeting_rule.source_identity for exact import diffs

The import diff compares an incoming file against what is already stored. That
comparison was reconstructing each stored row's identity from its
``meeting_rule``, which cannot be done faithfully: the declared date window ends
up folded into ``DTSTART``/``UNTIL`` with weekday anchoring applied, and a week
parity becomes an ``INTERVAL``. The rebuilt key never matched, so every
re-import of an unchanged file reported "replace everything" - breaking the
idempotence the brief requires (MASTER_PROMPT.md section 10.1).

This column stores the row's identity verbatim at import time, so the next dry
run compares like with like.

Nullable, with no backfill. Rules written before this column existed keep
``NULL`` and are treated as absent by the diff, which makes them show up as
additions. That is the safe direction to be wrong in: a human reviewing the dry
run sees them, whereas a false "unchanged" would hide a real change.

Revision ID: 849d42a79241
Revises: b46274d842de
Create Date: 2026-10-19
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "849d42a79241"
down_revision: str | None = "b46274d842de"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column(
        "meeting_rule",
        sa.Column("source_identity", sa.String(length=512), nullable=True),
    )
    # Indexed because the diff's only operation is an equality lookup per row,
    # once per import.
    op.create_index(
        "ix_meeting_rule_source_identity",
        "meeting_rule",
        ["source_identity"],
    )


def downgrade() -> None:
    op.drop_index("ix_meeting_rule_source_identity", table_name="meeting_rule")
    op.drop_column("meeting_rule", "source_identity")
