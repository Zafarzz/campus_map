"""Spatial model: campus, building, floor, room, aliases, connectors.

Identifiers here are **not** generated. They are the front end's identifiers,
seeded from its data, because they are the contract that lets the map switch
from demo data to this database without renaming anything
(``backend/docs/FRONTEND_CONTRACT.md`` section 4).

Geometry deliberately does not live here. ADR-003 in ``docs/DECISIONS.md``
freezes ``CampusGeometry`` as the front end's render contract, and ADR-013 keeps
geometry authoring in files under git. The optional columns below store only
what the backend needs to *reason* about space - floor level, capacity, step-free
access - never wall coordinates.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.domain.base import (
    DATA_PROVENANCE,
    PLACE_KIND,
    ROOM_KIND,
    DataProvenance,
    IsDemoMixin,
    PlaceKind,
    RoomKind,
    ShortText,
    SlugId,
    TimestampMixin,
)

if TYPE_CHECKING:
    pass


class Campus(Base, TimestampMixin, IsDemoMixin):
    """One campus. ``id`` is the front end's ``ajou-tashkent``."""

    __tablename__ = "campus"

    id: Mapped[SlugId] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    #: IANA timezone. Held per campus (brief section 7) rather than globally, so a
    #: second campus in another zone needs no schema change.
    timezone: Mapped[str] = mapped_column(String(64), nullable=False)

    buildings: Mapped[list[Building]] = relationship(
        back_populates="campus", cascade="all, delete-orphan", order_by="Building.sort_order"
    )
    connectors: Mapped[list[Connector]] = relationship(back_populates="campus", cascade="all, delete-orphan")


class Building(Base, TimestampMixin, IsDemoMixin):
    """A building, keyed by the front end's ``bld-*`` identifier.

    Careful: the letter in the ID is **not** the block letter. Block A is
    ``bld-h``, B is ``bld-g``, D is ``bld-c``, E is ``bld-b``, F is ``bld-d``,
    C is ``bld-i`` (``docs/PDF_INVENTORY.md`` section 3). ``short_name`` holds the
    user-facing letter; never derive it from ``id``.
    """

    __tablename__ = "building"
    __table_args__ = (
        CheckConstraint("floor_count >= 0", name="floor_count_non_negative"),
        Index("ix_building_campus_sort", "campus_id", "sort_order"),
    )

    id: Mapped[SlugId] = mapped_column(primary_key=True)
    campus_id: Mapped[SlugId] = mapped_column(
        ForeignKey("campus.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    #: The block letter shown on the map ("A", "B", "Dorm"). Not unique: the
    #: front end has historically shared "C" across several buildings.
    short_name: Mapped[ShortText] = mapped_column(nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    floor_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    provenance: Mapped[DataProvenance] = mapped_column(DATA_PROVENANCE, nullable=False)
    #: Preserves the front end's ordering in the Buildings list.
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))

    #: Stage-C visual configuration. Passed through untouched, never invented
    #: (ADR-015 moves appearance from code into data).
    appearance_preset: Mapped[str | None] = mapped_column(String(64))
    appearance: Mapped[dict[str, Any] | None] = mapped_column(JSONB)

    campus: Mapped[Campus] = relationship(back_populates="buildings")
    floors: Mapped[list[Floor]] = relationship(
        back_populates="building", cascade="all, delete-orphan", order_by="Floor.level"
    )


class Floor(Base, TimestampMixin, IsDemoMixin):
    """A floor. ``id`` is ``{building_id}-f{level}``; ``level`` 1 is the ground floor."""

    __tablename__ = "floor"
    __table_args__ = (UniqueConstraint("building_id", "level", name="uq_floor_building_id_level"),)

    id: Mapped[SlugId] = mapped_column(primary_key=True)
    building_id: Mapped[SlugId] = mapped_column(
        ForeignKey("building.id", ondelete="CASCADE"), nullable=False, index=True
    )
    #: 1 = ground floor; 0 and negative values are basements.
    level: Mapped[int] = mapped_column(Integer, nullable=False)
    #: Display string ("Floor 1"), not an identifier.
    name: Mapped[str] = mapped_column(String(120), nullable=False)

    building: Mapped[Building] = relationship(back_populates="floors")
    rooms: Mapped[list[Room]] = relationship(
        back_populates="floor", cascade="all, delete-orphan", order_by="Room.sort_order"
    )


class Room(Base, TimestampMixin, IsDemoMixin):
    """A room.

    ``number`` is stored exactly as the official source prints it
    (``GEOMETRY_SPEC.md`` section 5.4): no normalisation, no silent correction of a
    mismatch between the plan and the timetable. ``needs_review`` records such a
    discrepancy for a human instead.
    """

    __tablename__ = "room"
    __table_args__ = (
        CheckConstraint("capacity IS NULL OR capacity >= 0", name="capacity_non_negative"),
        Index("ix_room_floor_sort", "floor_id", "sort_order"),
        # Free-room search filters on these together.
        Index("ix_room_kind_capacity", "room_kind", "capacity"),
    )

    id: Mapped[SlugId] = mapped_column(primary_key=True)
    floor_id: Mapped[SlugId] = mapped_column(
        ForeignKey("floor.id", ondelete="CASCADE"), nullable=False, index=True
    )
    number: Mapped[ShortText] = mapped_column(nullable=False, index=True)
    name: Mapped[str | None] = mapped_column(String(200))
    room_kind: Mapped[RoomKind] = mapped_column(ROOM_KIND, nullable=False)
    capacity: Mapped[int | None] = mapped_column(Integer)
    provenance: Mapped[DataProvenance] = mapped_column(DATA_PROVENANCE, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))

    #: Step-free reachability. NULL means "not assessed", which is different
    #: from False and must not be rendered as "not accessible".
    accessible: Mapped[bool | None] = mapped_column(Boolean)
    #: Equipment and features for the free-room finder: {"whiteboard": true, ...}
    features: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    #: Set by a blocking maintenance ticket; removes the room from free-room
    #: search (brief section 10.2 precedence rule 6). An overlay, not a state.
    out_of_service: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    needs_review: Mapped[str | None] = mapped_column(Text)

    floor: Mapped[Floor] = relationship(back_populates="rooms")
    aliases: Mapped[list[RoomAlias]] = relationship(back_populates="room", cascade="all, delete-orphan")


class RoomAlias(Base, TimestampMixin):
    """Former identifiers for a room (ADR-008's ``legacyIds``).

    **Many-to-many on purpose.** The front end's legacy IDs are not unique:
    ``bld-h-f2-r7`` is listed as the ``legacyId`` of both ``A-207`` and ``A-208``
    in ``src/data/floor-plans/index.ts``. A unique constraint here would reject
    the real seed data, and picking a winner would silently lose a room - so
    both rows are stored and resolution raises ``AmbiguousAliasError``.
    """

    __tablename__ = "room_alias"
    # No UniqueConstraint on (alias, room_id): the composite primary key below
    # already enforces exactly that, and declaring both left the models
    # permanently "drifted" from the migration (autogenerate kept offering to add
    # a constraint the database rightly never created).
    # The separate index on `alias` alone is the one that matters: lookups are by
    # alias, and the primary key's index is ordered (alias, room_id), so it only
    # serves that query as a prefix scan.
    __table_args__ = (Index("ix_room_alias_alias", "alias"),)

    alias: Mapped[SlugId] = mapped_column(primary_key=True)
    room_id: Mapped[SlugId] = mapped_column(ForeignKey("room.id", ondelete="CASCADE"), primary_key=True)
    #: Where the alias came from, e.g. "floor-plans/index.ts legacyId".
    source: Mapped[str | None] = mapped_column(String(120))

    room: Mapped[Room] = relationship(back_populates="aliases")


class Connector(Base, TimestampMixin, IsDemoMixin):
    """Enclosed passage between two buildings (ADR-020, ``accepted``).

    Not a building: no floors, no rooms, not searchable, not selectable. It
    exists in the backend only because the routing graph will need to know that
    Block B and Block C are joined under cover.
    """

    __tablename__ = "connector"
    __table_args__ = (
        CheckConstraint("building_a_id <> building_b_id", name="connector_links_two_buildings"),
    )

    id: Mapped[SlugId] = mapped_column(primary_key=True)
    campus_id: Mapped[SlugId] = mapped_column(
        ForeignKey("campus.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(String(40), nullable=False, server_default=text("'enclosed-corridor'"))
    building_a_id: Mapped[SlugId] = mapped_column(
        ForeignKey("building.id", ondelete="CASCADE"), nullable=False
    )
    building_b_id: Mapped[SlugId] = mapped_column(
        ForeignKey("building.id", ondelete="CASCADE"), nullable=False
    )

    campus: Mapped[Campus] = relationship(back_populates="connectors")


class Place(Base, TimestampMixin, IsDemoMixin):
    """A monitored campus venue for crowd levels and queues (brief section 11).

    Covers the library, canteen, gym, sports hall, study areas and corridors. A
    place may correspond to a :class:`Room` (for example ``room-canteen``), or
    to a corridor/entrance that is not in the room inventory.

    ``config`` holds place-type tunables: crowd-level fractions, report decay
    ``tau``, and (for canteens) the number of service counters, service rate per
    counter, base arrival rate, and calibrated arrival multiplier.
    """

    __tablename__ = "place"
    __table_args__ = (
        CheckConstraint("capacity IS NULL OR capacity > 0", name="place_capacity_positive"),
        Index("ix_place_campus_kind", "campus_id", "kind"),
    )

    id: Mapped[SlugId] = mapped_column(primary_key=True)
    campus_id: Mapped[SlugId] = mapped_column(
        ForeignKey("campus.id", ondelete="CASCADE"), nullable=False, index=True
    )
    building_id: Mapped[SlugId | None] = mapped_column(
        ForeignKey("building.id", ondelete="SET NULL"), index=True
    )
    floor_id: Mapped[SlugId | None] = mapped_column(ForeignKey("floor.id", ondelete="SET NULL"))
    room_id: Mapped[SlugId | None] = mapped_column(ForeignKey("room.id", ondelete="SET NULL"), index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    kind: Mapped[PlaceKind] = mapped_column(PLACE_KIND, nullable=False)
    capacity: Mapped[int | None] = mapped_column(Integer)
    #: Nearby building IDs whose ending classes feed the schedule-based proxy
    #: and canteen arrival surge (brief sections 11.2, 11.5).
    nearby_building_ids: Mapped[list[Any] | None] = mapped_column(JSONB)
    #: Place-specific parameters (counters, service_rate_per_min, tau_minutes, ...).
    config: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
