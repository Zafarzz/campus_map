"""Domain model.

One shared model, reused by every layer (brief section 2.3): *place x time x
state x source of truth*. Phase 1 creates the tables that Layer 0 needs; later
phases add their own through migrations, never by widening these in place
without one.

Importing this package imports every model module, which is what Alembic's
autogenerate and ``Base.metadata`` rely on.
"""

from app.domain import academic, booking, evidence, history, people, platform, spatial
from app.domain.base import (
    IsDemoMixin,
    Provenance,
    RoomKind,
    RoomStateKind,
    RoomStatusCompat,
    TimestampMixin,
    UuidPkMixin,
)

__all__ = [
    "IsDemoMixin",
    "Provenance",
    "RoomKind",
    "RoomStateKind",
    "RoomStatusCompat",
    "TimestampMixin",
    "UuidPkMixin",
    "academic",
    "booking",
    "evidence",
    "history",
    "people",
    "platform",
    "spatial",
]
