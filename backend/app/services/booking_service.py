"""Booking: the database does the refereeing.

The correctness argument in full (brief section 10.4):

1. :func:`app.engines.booking.validate_request` checks the policy and produces a
   friendly, complete error. It is **advisory only**.
2. An availability query looks for a conflict so the common case gets a 409 with
   alternatives instead of a constraint error.
3. The ``INSERT`` into ``resource_occupancy`` is the decision. The exclusion
   constraint ``EXCLUDE USING gist (resource_id WITH =, period WITH &&) WHERE
   (status IN ('pending','confirmed'))`` makes an overlap impossible, and the
   race between steps 2 and 3 is resolved by PostgreSQL rather than by hope.

Step 2 can never be sufficient. Between the check and the insert another
transaction can commit the same slot; a ``SELECT`` cannot prevent that at any
isolation level short of serialisable, and serialising every booking on a campus
to avoid a rare conflict is the wrong trade. So the check is for the message and
the constraint is for the truth. ``tests/test_booking.py`` runs 50 concurrent
requests for one slot and asserts exactly one winner.

**Lessons are never auto-cancelled.** The auto-release sweeper only releases
``booking``-kind occupancies. An official timetable lesson with nobody checked in
becomes *unconfirmed* and prompts a human (brief section 10.4); silently freeing
a lecture theatre because a teacher did not tap a button would be worse than the
problem it solves.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, replace
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from asyncpg.exceptions import ExclusionViolationError
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import Range
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.core.logging import get_logger
from app.core.time import now as utc_now
from app.domain.base import OccupancyKind, OccupancyStatus, new_uuid
from app.domain.booking import Blackout, Booking, Resource, ResourceOccupancy
from app.engines.booking import (
    BookingPolicy,
    PolicyViolation,
    Slot,
    propose_alternatives,
)

log = get_logger(__name__)

__all__ = [
    "BookingRequest",
    "BookingResult",
    "cancel_booking",
    "check_in",
    "create_booking",
    "list_bookings",
    "release_expired",
]

#: PostgreSQL's exclusion-violation SQLSTATE. Caught by class rather than by
#: string where possible, but the code is checked too: a driver that reports the
#: error only as a generic IntegrityError must still be handled.
SQLSTATE_EXCLUSION_VIOLATION = "23P01"


@dataclass(frozen=True, slots=True)
class BookingRequest:
    resource_id: uuid.UUID
    slot: Slot
    user_id: uuid.UUID | None = None
    purpose: str | None = None
    attendee_count: int | None = None


@dataclass(frozen=True, slots=True)
class BookingResult:
    booking: Booking
    occupancy: ResourceOccupancy
    policy: BookingPolicy
    #: True when the policy requires approval, so the row is ``pending``.
    awaiting_approval: bool

    @property
    def status(self) -> OccupancyStatus:
        return self.booking.status


async def create_booking(
    session: AsyncSession,
    request: BookingRequest,
    *,
    timezone: ZoneInfo,
    held_capabilities: frozenset[str] = frozenset(),
    now: datetime | None = None,
) -> BookingResult:
    """Create a booking, or raise with a reason.

    Raises :class:`ValidationError` for a policy breach (422) and
    :class:`ConflictError` for a taken slot (409, with alternatives in
    ``details``).
    """
    instant = now or utc_now()
    resource = await session.get(Resource, request.resource_id)
    if resource is None:
        raise NotFoundError(f"Resource {request.resource_id} does not exist.", code="resource_not_found")

    policy = _policy_for(resource)
    blackouts = await _load_blackouts(session, resource.id, request.slot, policy)
    active = await _count_active_bookings(session, request.user_id, instant)

    from app.engines.booking import validate_request

    violations = validate_request(
        request.slot,
        policy,
        now=instant,
        timezone=timezone,
        is_bookable=resource.is_bookable,
        active_bookings=active,
        held_capabilities=held_capabilities,
        blackouts=blackouts,
    )
    if violations:
        raise _policy_error(violations)

    # The period actually stored includes the buffers, so the constraint
    # enforces turnaround time too.
    stored = request.slot.with_buffers(setup=policy.setup, cleanup=policy.cleanup)

    conflicts = await _find_conflicts(session, resource.id, stored)
    if conflicts:
        raise await _conflict_error(session, resource.id, request.slot, stored, timezone)

    status = (
        OccupancyStatus.pending
        if (policy.requires_approval or resource.requires_approval)
        else OccupancyStatus.confirmed
    )

    # The primary key is generated here rather than at flush time so that both
    # rows can be written in a single flush **inside** one savepoint. That is
    # what makes the failure recoverable: SQLAlchemy poisons the whole session
    # when a flush raises, so a flush that happened before the savepoint opened
    # would take the outer transaction down with it and the caller would inherit
    # an unusable session instead of a 409.
    booking = Booking(
        id=new_uuid(),
        resource_id=resource.id,
        user_id=request.user_id,
        starts_at=request.slot.starts_at,
        ends_at=request.slot.ends_at,
        status=status,
        purpose=request.purpose,
        attendee_count=request.attendee_count,
        is_demo=resource.is_demo,
    )
    occupancy = ResourceOccupancy(
        resource_id=resource.id,
        period=_range(stored),
        kind=OccupancyKind.booking,
        status=status,
        booking_id=booking.id,
        is_demo=resource.is_demo,
    )

    # The moment of truth. A concurrent winner surfaces here as SQLSTATE 23P01.
    try:
        async with session.begin_nested():
            session.add(booking)
            session.add(occupancy)
            await session.flush()
    except IntegrityError as exc:
        if not _is_exclusion_violation(exc):
            raise
        log.info(
            "booking_lost_race",
            resource_id=str(resource.id),
            starts_at=request.slot.starts_at.isoformat(),
        )
        # The savepoint rolled back, but both objects are still in the session's
        # identity map and would be re-flushed on the next flush - recreating
        # exactly the row that just failed. Expunge them so the session is
        # genuinely back to where it was before the attempt.
        for orphan in (occupancy, booking):
            if orphan in session:
                session.expunge(orphan)
        raise await _conflict_error(session, resource.id, request.slot, stored, timezone) from exc

    log.info(
        "booking_created",
        booking_id=str(booking.id),
        resource_id=str(resource.id),
        status=status.value,
    )
    return BookingResult(
        booking=booking,
        occupancy=occupancy,
        policy=policy,
        awaiting_approval=status is OccupancyStatus.pending,
    )


async def check_in(
    session: AsyncSession,
    booking_id: uuid.UUID,
    *,
    now: datetime | None = None,
    actor_id: uuid.UUID | None = None,
) -> Booking:
    """Record a check-in, which protects the booking from auto-release.

    Outside the check-in window this is a 422 rather than a silent success: a
    user who checks in an hour early and then does not turn up has not actually
    claimed the room.
    """
    instant = now or utc_now()
    booking = await session.get(Booking, booking_id)
    if booking is None:
        raise NotFoundError(f"Booking {booking_id} does not exist.", code="booking_not_found")

    if booking.status in {OccupancyStatus.cancelled, OccupancyStatus.released}:
        raise ValidationError(
            f"This booking is {booking.status.value} and cannot be checked in to.",
            code="booking_not_active",
            details={"status": booking.status.value},
        )

    if booking.checked_in_at is not None:
        return booking  # Idempotent: a second tap is not an error.

    resource = await session.get(Resource, booking.resource_id)
    policy = _policy_for(resource) if resource else BookingPolicy()
    window = policy.checkin_window(Slot(starts_at=booking.starts_at, ends_at=booking.ends_at))

    if instant < window.starts_at:
        raise ValidationError(
            f"Check-in opens at {window.starts_at.isoformat()}.",
            code="checkin_not_open",
            details={"opens_at": window.starts_at.isoformat()},
        )
    if instant >= window.ends_at:
        raise ValidationError(
            f"The check-in window closed at {window.ends_at.isoformat()}.",
            code="checkin_window_closed",
            details={"closed_at": window.ends_at.isoformat()},
        )

    booking.checked_in_at = instant
    # A pending booking that is checked into stays pending: approval is a
    # separate decision and check-in must not be a way around it.
    if booking.status is OccupancyStatus.confirmed:
        await _set_occupancy_status(session, booking.id, OccupancyStatus.confirmed)

    await session.flush()
    log.info("booking_checked_in", booking_id=str(booking.id), actor=str(actor_id or ""))
    return booking


async def cancel_booking(
    session: AsyncSession,
    booking_id: uuid.UUID,
    *,
    now: datetime | None = None,
    reason: str | None = None,
) -> Booking:
    """Cancel a booking and free its slot immediately.

    The occupancy row is moved to ``cancelled`` rather than deleted. Only
    ``pending`` and ``confirmed`` participate in the exclusion constraint, so the
    slot frees at once while the history stays intact for the time machine.
    """
    instant = now or utc_now()
    booking = await session.get(Booking, booking_id)
    if booking is None:
        raise NotFoundError(f"Booking {booking_id} does not exist.", code="booking_not_found")

    if booking.status is OccupancyStatus.cancelled:
        return booking

    booking.status = OccupancyStatus.cancelled
    booking.released_at = instant
    await _set_occupancy_status(session, booking.id, OccupancyStatus.cancelled, note=reason)
    await session.flush()

    log.info("booking_cancelled", booking_id=str(booking.id))
    return booking


async def release_expired(
    session: AsyncSession,
    *,
    now: datetime | None = None,
    limit: int = 500,
) -> list[Booking]:
    """Release confirmed bookings nobody checked in to. Returns what was freed.

    Scoped to ``kind = 'booking'`` by construction - it queries the ``booking``
    table, which lessons have no row in. That is the mechanism behind "official
    timetable lessons are never auto-cancelled by default" (brief section 10.4):
    not a flag that could be set wrong, but the absence of any row for this
    sweeper to find.
    """
    instant = now or utc_now()

    # Candidates: started, not checked in, still holding their slot. The grace
    # period is per-resource policy, so filter broadly here and decide per row.
    result = await session.execute(
        select(Booking, Resource)
        .join(Resource, Resource.id == Booking.resource_id)
        .where(
            Booking.status == OccupancyStatus.confirmed,
            Booking.checked_in_at.is_(None),
            Booking.starts_at <= instant,
            Booking.ends_at > instant,
        )
        .order_by(Booking.starts_at)
        .limit(limit)
    )

    released: list[Booking] = []
    for booking, resource in result.all():
        policy = _policy_for(resource)
        deadline = policy.release_deadline(Slot(starts_at=booking.starts_at, ends_at=booking.ends_at))
        if instant < deadline:
            continue

        booking.status = OccupancyStatus.released
        booking.released_at = instant
        await _set_occupancy_status(
            session,
            booking.id,
            OccupancyStatus.released,
            note=f"auto-released: no check-in by {deadline.isoformat()}",
        )
        released.append(booking)

    if released:
        await session.flush()
        log.info("bookings_auto_released", count=len(released))
    return released


async def list_bookings(
    session: AsyncSession,
    *,
    user_id: uuid.UUID | None = None,
    resource_id: uuid.UUID | None = None,
    room_id: str | None = None,
    starts_after: datetime | None = None,
    starts_before: datetime | None = None,
    statuses: tuple[OccupancyStatus, ...] | None = None,
    limit: int = 100,
) -> list[Booking]:
    stmt = select(Booking).order_by(Booking.starts_at, Booking.id).limit(limit)

    if user_id is not None:
        stmt = stmt.where(Booking.user_id == user_id)
    if resource_id is not None:
        stmt = stmt.where(Booking.resource_id == resource_id)
    if room_id is not None:
        stmt = stmt.join(Resource, Resource.id == Booking.resource_id).where(Resource.room_id == room_id)
    if starts_after is not None:
        stmt = stmt.where(Booking.starts_at >= starts_after)
    if starts_before is not None:
        stmt = stmt.where(Booking.starts_at < starts_before)
    if statuses:
        stmt = stmt.where(Booking.status.in_(statuses))

    result = await session.execute(stmt)
    return list(result.scalars().all())


# --------------------------------------------------------------------- helpers


def _policy_for(resource: Resource | None) -> BookingPolicy:
    if resource is None:
        return BookingPolicy()
    try:
        policy = BookingPolicy.from_json(resource.policy)
    except ValueError as exc:
        # A malformed policy is an operator error, not a user error. Refusing
        # the booking is right: falling back to defaults would let a resource
        # behave differently from what its configuration says.
        raise ValidationError(
            f"Resource {resource.code!r} has an invalid booking policy: {exc}",
            code="invalid_resource_policy",
        ) from exc
    if resource.requires_approval and not policy.requires_approval:
        # Two places can demand approval: the column and the JSON policy.
        # Either one is enough, so the column wins when they disagree - the
        # safer reading of a contradiction is the more restrictive one.
        return replace(policy, requires_approval=True)
    return policy


def _range(slot: Slot) -> Range[datetime]:
    """Half-open ``tstzrange``, matching the table's check constraint."""
    return Range(slot.starts_at, slot.ends_at, bounds="[)")


async def _find_conflicts(
    session: AsyncSession, resource_id: uuid.UUID, slot: Slot
) -> list[ResourceOccupancy]:
    """Occupancies that would collide. Advisory - see the module docstring."""
    result = await session.execute(
        select(ResourceOccupancy).where(
            ResourceOccupancy.resource_id == resource_id,
            ResourceOccupancy.status.in_((OccupancyStatus.pending, OccupancyStatus.confirmed)),
            ResourceOccupancy.period.op("&&")(_range(slot)),
        )
    )
    return list(result.scalars().all())


async def _load_blackouts(
    session: AsyncSession, resource_id: uuid.UUID, slot: Slot, policy: BookingPolicy
) -> tuple[Slot, ...]:
    stored = slot.with_buffers(setup=policy.setup, cleanup=policy.cleanup)
    result = await session.execute(
        select(Blackout).where(
            Blackout.resource_id == resource_id,
            Blackout.starts_at < stored.ends_at,
            Blackout.ends_at > stored.starts_at,
        )
    )
    return tuple(Slot(starts_at=row.starts_at, ends_at=row.ends_at) for row in result.scalars().all())


async def _count_active_bookings(session: AsyncSession, user_id: uuid.UUID | None, now: datetime) -> int:
    """Future bookings the user already holds, for the quota rule."""
    if user_id is None:
        return 0
    count = await session.scalar(
        select(func.count(Booking.id)).where(
            Booking.user_id == user_id,
            Booking.ends_at > now,
            Booking.status.in_((OccupancyStatus.pending, OccupancyStatus.confirmed)),
        )
    )
    return int(count or 0)


async def _set_occupancy_status(
    session: AsyncSession,
    booking_id: uuid.UUID,
    status: OccupancyStatus,
    *,
    note: str | None = None,
) -> None:
    result = await session.execute(
        select(ResourceOccupancy).where(ResourceOccupancy.booking_id == booking_id)
    )
    for occupancy in result.scalars().all():
        occupancy.status = status
        if note:
            occupancy.note = note


def _policy_error(violations: list[PolicyViolation]) -> ValidationError:
    """Turn policy violations into one 422 that lists all of them."""
    return ValidationError(
        "; ".join(item.message for item in violations),
        code="booking_policy_violation",
        details={
            "violations": [
                {"code": item.code.value, "message": item.message, **item.details} for item in violations
            ]
        },
    )


async def _conflict_error(
    session: AsyncSession,
    resource_id: uuid.UUID,
    requested: Slot,
    stored: Slot,
    timezone: ZoneInfo,
) -> ConflictError:
    """A 409 carrying the next available slots (brief section 10.4)."""
    search = Slot(
        starts_at=requested.starts_at - timedelta(hours=6),
        ends_at=requested.starts_at + timedelta(hours=18),
    )
    occupied = await session.execute(
        select(ResourceOccupancy).where(
            ResourceOccupancy.resource_id == resource_id,
            ResourceOccupancy.status.in_((OccupancyStatus.pending, OccupancyStatus.confirmed)),
            ResourceOccupancy.period.op("&&")(_range(search)),
        )
    )
    busy: list[Slot] = []
    for row in occupied.scalars().all():
        lower = getattr(row.period, "lower", None)
        upper = getattr(row.period, "upper", None)
        if isinstance(lower, datetime) and isinstance(upper, datetime) and upper > lower:
            busy.append(Slot(starts_at=lower, ends_at=upper))

    alternatives = propose_alternatives(busy, requested=requested, search_within=search, limit=3)

    return ConflictError(
        "That slot is already taken.",
        code="slot_taken",
        details={
            "requested": {
                "starts_at": requested.starts_at.isoformat(),
                "ends_at": requested.ends_at.isoformat(),
            },
            "alternatives": [
                {
                    "starts_at": item.starts_at.isoformat(),
                    "ends_at": item.ends_at.isoformat(),
                    "starts_at_local": item.starts_at.astimezone(timezone).isoformat(),
                }
                for item in alternatives
            ],
        },
    )


def _is_exclusion_violation(exc: IntegrityError) -> bool:
    """True when an IntegrityError is specifically an overlap rejection.

    Checked two ways because the two can diverge: asyncpg raises a typed
    ``ExclusionViolationError``, but a wrapped or re-raised error may only carry
    the SQLSTATE. Treating *any* IntegrityError as a conflict would turn a
    genuine foreign-key bug into a cheerful "slot taken" 409.
    """
    original = getattr(exc, "orig", None)
    if isinstance(original, ExclusionViolationError):
        return True
    sqlstate = getattr(original, "sqlstate", None) or getattr(original, "pgcode", None)
    return sqlstate == SQLSTATE_EXCLUSION_VIOLATION
