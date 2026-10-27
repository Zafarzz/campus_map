"""Database-level guarantees.

These test PostgreSQL behaviour the application relies on but does not
implement: the booking exclusion constraint, half-open ranges, append-only
ordering, and the many-to-many alias table. They are the reason the brief
forbids SQLite even for tests - none of this exists there.
"""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import UTC
from app.domain.base import OccupancyKind, OccupancyStatus, Provenance, RoomStateKind
from app.domain.booking import Resource, ResourceOccupancy
from app.domain.history import RoomStateEvent
from app.domain.spatial import Campus

pytestmark = pytest.mark.db

START = datetime(2026, 10, 19, 8, 30, tzinfo=UTC)
END = START + timedelta(minutes=75)


def period(start: datetime, end: datetime) -> str:
    """A half-open tstzrange literal."""
    return f"[{start.isoformat()},{end.isoformat()})"


async def make_resource(session: AsyncSession, code: str) -> Resource:
    campus = Campus(id=f"c-{code}", name="Test Campus", timezone="Asia/Tashkent")
    session.add(campus)
    await session.flush()
    resource = Resource(campus_id=campus.id, code=code, name=f"Resource {code}", kind="room")
    session.add(resource)
    await session.flush()
    return resource


async def test_btree_gist_and_the_exclusion_constraint_exist(session: AsyncSession) -> None:
    extension = await session.scalar(text("SELECT count(*) FROM pg_extension WHERE extname = 'btree_gist'"))
    assert extension == 1, "btree_gist is required by the booking exclusion constraint"

    constraint = await session.scalar(
        text("SELECT conname FROM pg_constraint WHERE contype = 'x' AND conname = :name"),
        {"name": "resource_occupancy_no_overlap"},
    )
    assert constraint == "resource_occupancy_no_overlap"


async def test_overlapping_occupancies_are_impossible(session: AsyncSession) -> None:
    """The database is the referee, not the application (brief section 10.4)."""
    resource = await make_resource(session, "overlap")

    session.add(
        ResourceOccupancy(
            resource_id=resource.id,
            period=text(f"'{period(START, END)}'::tstzrange"),
            kind=OccupancyKind.lesson,
            status=OccupancyStatus.confirmed,
        )
    )
    await session.flush()

    overlapping = ResourceOccupancy(
        resource_id=resource.id,
        # Starts 15 minutes into the existing booking.
        period=text(f"'{period(START + timedelta(minutes=15), END + timedelta(minutes=15))}'::tstzrange"),
        kind=OccupancyKind.booking,
        status=OccupancyStatus.pending,
    )
    session.add(overlapping)
    with pytest.raises(IntegrityError) as exc:
        await session.flush()
    # SQLSTATE 23P01 is exclusion_violation - what the API maps to HTTP 409.
    assert "23P01" in str(exc.value) or "exclusion" in str(exc.value).lower()
    await session.rollback()


async def test_a_booking_may_start_exactly_when_a_lesson_ends(session: AsyncSession) -> None:
    """Half-open ranges: touching boundaries do not overlap.

    The brief calls this out explicitly as a required test - a room freed at
    09:45 must be bookable from 09:45.
    """
    resource = await make_resource(session, "touching")

    session.add(
        ResourceOccupancy(
            resource_id=resource.id,
            period=text(f"'{period(START, END)}'::tstzrange"),
            kind=OccupancyKind.lesson,
            status=OccupancyStatus.confirmed,
        )
    )
    session.add(
        ResourceOccupancy(
            resource_id=resource.id,
            period=text(f"'{period(END, END + timedelta(minutes=75))}'::tstzrange"),
            kind=OccupancyKind.booking,
            status=OccupancyStatus.confirmed,
        )
    )
    await session.flush()  # must not raise

    count = await session.scalar(
        select(func.count())
        .select_from(ResourceOccupancy)
        .where(ResourceOccupancy.resource_id == resource.id)
    )
    assert count == 2


async def test_a_cancelled_occupancy_frees_its_slot(session: AsyncSession) -> None:
    """The constraint's WHERE clause covers only pending and confirmed.

    So cancelling a booking releases the slot immediately, with no cleanup job.
    """
    resource = await make_resource(session, "cancelled")

    session.add(
        ResourceOccupancy(
            resource_id=resource.id,
            period=text(f"'{period(START, END)}'::tstzrange"),
            kind=OccupancyKind.booking,
            status=OccupancyStatus.cancelled,
        )
    )
    session.add(
        ResourceOccupancy(
            resource_id=resource.id,
            period=text(f"'{period(START, END)}'::tstzrange"),
            kind=OccupancyKind.lesson,
            status=OccupancyStatus.confirmed,
        )
    )
    await session.flush()  # must not raise


async def test_different_resources_do_not_conflict(session: AsyncSession) -> None:
    first = await make_resource(session, "res-a")
    second = await make_resource(session, "res-b")
    for resource in (first, second):
        session.add(
            ResourceOccupancy(
                resource_id=resource.id,
                period=text(f"'{period(START, END)}'::tstzrange"),
                kind=OccupancyKind.lesson,
                status=OccupancyStatus.confirmed,
            )
        )
    await session.flush()


async def test_an_empty_period_is_refused(session: AsyncSession) -> None:
    """A zero-length booking is meaningless and would bypass overlap checks."""
    resource = await make_resource(session, "empty")
    session.add(
        ResourceOccupancy(
            resource_id=resource.id,
            period=text(f"'{period(START, START)}'::tstzrange"),
            kind=OccupancyKind.booking,
            status=OccupancyStatus.confirmed,
        )
    )
    with pytest.raises(IntegrityError):
        await session.flush()
    await session.rollback()


async def test_state_events_get_a_strictly_increasing_sequence(session: AsyncSession) -> None:
    """A reconnecting client asks for "everything after N", so order must be total.

    Two events in the same microsecond still need a strict order, which is why
    this is a database sequence rather than a timestamp.
    """
    campus = Campus(id="c-seq", name="Test", timezone="Asia/Tashkent")
    session.add(campus)
    await session.flush()

    from app.domain.spatial import Building, Floor, Room

    session.add(
        Building(
            id="b-seq",
            campus_id=campus.id,
            name="B",
            short_name="B",
            floor_count=1,
            provenance="confirmed",
        )
    )
    await session.flush()
    session.add(Floor(id="b-seq-f1", building_id="b-seq", level=1, name="Floor 1"))
    await session.flush()
    session.add(
        Room(
            id="b-seq-f1-r1",
            floor_id="b-seq-f1",
            number="R1",
            room_kind="classroom",
            provenance="confirmed",
        )
    )
    await session.flush()

    events = [
        RoomStateEvent(
            room_id="b-seq-f1-r1",
            state=RoomStateKind.free,
            provenance=Provenance.scheduled,
            effective_at=START + timedelta(minutes=i),
        )
        for i in range(5)
    ]
    session.add_all(events)
    await session.flush()
    for event in events:
        await session.refresh(event)

    sequences = [event.sequence for event in events]
    assert sequences == sorted(sequences)
    assert len(set(sequences)) == len(sequences)


async def test_room_aliases_are_many_to_many(session: AsyncSession) -> None:
    """One legacy id may belong to several rooms - real data requires it.

    `bld-h-f2-r7` is the legacyId of both A-207 and A-208, so a unique
    constraint on `alias` would reject the actual front-end data.
    """
    from app.domain.spatial import Building, Floor, Room, RoomAlias

    campus = Campus(id="c-alias", name="Test", timezone="Asia/Tashkent")
    session.add(campus)
    await session.flush()
    session.add(
        Building(
            id="b-alias",
            campus_id=campus.id,
            name="B",
            short_name="B",
            floor_count=1,
            provenance="confirmed",
        )
    )
    await session.flush()
    session.add(Floor(id="b-alias-f1", building_id="b-alias", level=1, name="Floor 1"))
    await session.flush()
    for suffix in ("x", "y"):
        session.add(
            Room(
                id=f"b-alias-f1-{suffix}",
                floor_id="b-alias-f1",
                number=suffix.upper(),
                room_kind="classroom",
                provenance="confirmed",
            )
        )
    await session.flush()

    session.add(RoomAlias(alias="shared-legacy", room_id="b-alias-f1-x"))
    session.add(RoomAlias(alias="shared-legacy", room_id="b-alias-f1-y"))
    await session.flush()  # must not raise

    owners = await session.scalars(select(RoomAlias.room_id).where(RoomAlias.alias == "shared-legacy"))
    assert set(owners.all()) == {"b-alias-f1-x", "b-alias-f1-y"}


async def test_timestamps_come_back_as_aware_utc(session: AsyncSession) -> None:
    """Everything stored is timestamptz; nothing naive crosses the boundary."""
    campus = Campus(id="c-tz", name="Test", timezone="Asia/Tashkent")
    session.add(campus)
    await session.flush()
    await session.refresh(campus)
    assert campus.created_at.tzinfo is not None
    assert campus.created_at.utcoffset() == timedelta(0)


async def test_capacity_cannot_be_negative(session: AsyncSession) -> None:
    from app.domain.spatial import Building, Floor, Room

    campus = Campus(id="c-cap", name="Test", timezone="Asia/Tashkent")
    session.add(campus)
    await session.flush()
    session.add(
        Building(
            id="b-cap",
            campus_id=campus.id,
            name="B",
            short_name="B",
            floor_count=1,
            provenance="confirmed",
        )
    )
    await session.flush()
    session.add(Floor(id="b-cap-f1", building_id="b-cap", level=1, name="Floor 1"))
    await session.flush()
    session.add(
        Room(
            id="b-cap-f1-r1",
            floor_id="b-cap-f1",
            number="R1",
            room_kind="classroom",
            provenance="confirmed",
            capacity=-5,
        )
    )
    with pytest.raises(IntegrityError):
        await session.flush()
    await session.rollback()
