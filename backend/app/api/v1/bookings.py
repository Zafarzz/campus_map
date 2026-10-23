"""``/bookings``: create, list, check in, cancel.

A 409 from here carries **alternatives** (brief section 10.4), because "that
slot is taken" without a next-best option makes the user guess. A 422 carries
every policy violation at once rather than the first, so a booking that is both
too long and too far ahead is fixed in one attempt.

The user is taken from the verified token, never from the request body
(``app.core.security``). A client cannot book on someone else's behalf by
asserting their id.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.errors import PermissionDeniedError, ValidationError
from app.core.security import CurrentPrincipal, Role
from app.domain.base import OccupancyStatus
from app.domain.booking import Booking
from app.engines.booking import Slot
from app.services import booking_service, campus_service
from app.services.booking_service import BookingRequest

router = APIRouter(prefix="/bookings", tags=["bookings"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]


class BookingCreate(BaseModel):
    """A booking request.

    Note the absence of a ``user_id``. Identity comes from the token, so there
    is no field here for a caller to assert one.
    """

    model_config = ConfigDict(extra="forbid")

    resource_id: uuid.UUID
    starts_at: datetime = Field(description="Offset-aware ISO instant.")
    ends_at: datetime = Field(description="Offset-aware ISO instant, after starts_at.")
    purpose: str | None = Field(default=None, max_length=300)
    attendee_count: int | None = Field(default=None, ge=0)


class BookingOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: uuid.UUID
    resource_id: uuid.UUID
    starts_at: datetime
    ends_at: datetime
    status: OccupancyStatus
    purpose: str | None = None
    attendee_count: int | None = None
    checked_in_at: datetime | None = None
    released_at: datetime | None = None
    awaiting_approval: bool = False
    #: When check-in opens and closes. Clients need it to show the button.
    checkin_opens_at: datetime | None = None
    checkin_closes_at: datetime | None = None


def _out(booking: Booking, *, policy: Any = None) -> BookingOut:
    opens = closes = None
    if policy is not None:
        window = policy.checkin_window(Slot(starts_at=booking.starts_at, ends_at=booking.ends_at))
        opens, closes = window.starts_at, window.ends_at

    return BookingOut(
        id=booking.id,
        resource_id=booking.resource_id,
        starts_at=booking.starts_at,
        ends_at=booking.ends_at,
        status=booking.status,
        purpose=booking.purpose,
        attendee_count=booking.attendee_count,
        checked_in_at=booking.checked_in_at,
        released_at=booking.released_at,
        awaiting_approval=booking.status is OccupancyStatus.pending,
        checkin_opens_at=opens,
        checkin_closes_at=closes,
    )


@router.post(
    "",
    response_model=BookingOut,
    status_code=status.HTTP_201_CREATED,
    summary="Book a resource",
    description=(
        "Overlaps are impossible: a PostgreSQL exclusion constraint on the occupancy period "
        "is the referee, so 50 simultaneous requests for one slot produce exactly one "
        "winner.\n\n"
        "**409** means the slot is taken, and the response carries the next available slots "
        "in `details.alternatives`. **422** means a policy breach, and lists *every* "
        "violation in `details.violations` rather than only the first.\n\n"
        "A booking that starts exactly when a lesson ends is allowed - periods are half-open."
    ),
    responses={
        409: {"description": "The slot is taken. Alternatives are in `details.alternatives`."},
        422: {"description": "Policy violation. All breaches are in `details.violations`."},
    },
)
async def create_booking(
    body: BookingCreate,
    session: SessionDep,
    principal: CurrentPrincipal,
) -> BookingOut:
    if body.starts_at.tzinfo is None or body.ends_at.tzinfo is None:
        raise ValidationError(
            "starts_at and ends_at must carry a UTC offset so there is no ambiguity "
            "about which moment you mean.",
            code="naive_instant",
        )
    if body.ends_at <= body.starts_at:
        raise ValidationError("ends_at must be after starts_at.", code="empty_period")

    campus = await campus_service.get_default_campus(session)
    result = await booking_service.create_booking(
        session,
        BookingRequest(
            resource_id=body.resource_id,
            slot=Slot(starts_at=body.starts_at, ends_at=body.ends_at),
            user_id=_subject_uuid(principal.subject),
            purpose=body.purpose,
            attendee_count=body.attendee_count,
        ),
        timezone=ZoneInfo(campus.timezone),
    )
    return _out(result.booking, policy=result.policy)


@router.get(
    "",
    response_model=list[BookingOut],
    summary="List bookings",
    description=(
        "A caller sees **their own** bookings. Staff and admins may pass `user_id` or omit "
        "the filter to see everyone's - which is a privileged read and is audited."
    ),
)
async def list_bookings(
    session: SessionDep,
    principal: CurrentPrincipal,
    user_id: Annotated[uuid.UUID | None, Query(description="Staff and admins only.")] = None,
    resource_id: Annotated[uuid.UUID | None, Query()] = None,
    room_id: Annotated[str | None, Query(description="Filter by the room's id.")] = None,
    starts_after: Annotated[datetime | None, Query()] = None,
    starts_before: Annotated[datetime | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
) -> list[BookingOut]:
    mine = _subject_uuid(principal.subject)
    privileged = principal.has_role(Role.admin, Role.staff, Role.facilities)

    if user_id is not None and user_id != mine and not privileged:
        raise PermissionDeniedError("You may only list your own bookings.", code="not_your_bookings")

    # A non-privileged caller is always scoped to themselves, whatever they ask
    # for. Defaulting to "everyone" for an unprivileged caller who simply omits
    # the filter would be a quiet privacy hole.
    effective = user_id if privileged else mine

    bookings = await booking_service.list_bookings(
        session,
        user_id=effective,
        resource_id=resource_id,
        room_id=room_id,
        starts_after=starts_after,
        starts_before=starts_before,
        limit=limit,
    )
    return [_out(item) for item in bookings]


@router.post(
    "/{booking_id}/checkin",
    response_model=BookingOut,
    summary="Check in to a booking",
    description=(
        "Protects the booking from auto-release. Idempotent: a second tap is not an error.\n\n"
        "Refused outside the check-in window: too early is not claiming the room, and after "
        "the grace period the slot has already been released."
    ),
    responses={
        404: {"description": "No such booking."},
        422: {"description": "Outside the check-in window, or the booking is not active."},
    },
)
async def check_in(
    booking_id: uuid.UUID,
    session: SessionDep,
    principal: CurrentPrincipal,
) -> BookingOut:
    booking = await session.get(Booking, booking_id)
    if booking is not None and not _may_act_on(booking, principal):
        raise PermissionDeniedError("You may only check in to your own booking.", code="not_your_booking")

    updated = await booking_service.check_in(session, booking_id, actor_id=_subject_uuid(principal.subject))
    return _out(updated)


@router.post(
    "/{booking_id}/cancel",
    response_model=BookingOut,
    summary="Cancel a booking and free its slot",
    description=(
        "The slot frees immediately: only `pending` and `confirmed` occupancies participate "
        "in the exclusion constraint. The row is kept, not deleted, so history stays intact."
    ),
    responses={404: {"description": "No such booking."}},
)
async def cancel_booking(
    booking_id: uuid.UUID,
    session: SessionDep,
    principal: CurrentPrincipal,
    reason: Annotated[str | None, Query(max_length=300)] = None,
) -> BookingOut:
    booking = await session.get(Booking, booking_id)
    if booking is not None and not _may_act_on(booking, principal):
        raise PermissionDeniedError("You may only cancel your own booking.", code="not_your_booking")

    updated = await booking_service.cancel_booking(session, booking_id, reason=reason)
    return _out(updated)


def _subject_uuid(subject: str) -> uuid.UUID | None:
    """The token's subject as a UUID, or ``None`` if it is not one.

    Service tokens carry a non-UUID subject. Returning ``None`` rather than
    raising lets a service client create an unattributed booking, which is the
    right behaviour for an integration acting on nobody's behalf.
    """
    try:
        return uuid.UUID(subject)
    except ValueError:
        return None


def _may_act_on(booking: Booking, principal: CurrentPrincipal) -> bool:
    """Whether this caller may modify this booking."""
    if principal.has_role(Role.admin, Role.staff, Role.facilities):
        return True
    return booking.user_id is not None and booking.user_id == _subject_uuid(principal.subject)
