"""Booking policy: the pure rules, with no database access.

The split that matters here (brief section 10.4): **the database is the referee**.
An application-level availability check exists only to produce a friendly error
with alternatives; the *guarantee* that two bookings cannot overlap comes from
the exclusion constraint on ``resource_occupancy.period``. Under concurrency,
50 simultaneous requests for one slot must produce exactly one winner, and no
amount of Python can promise that - only PostgreSQL can.

So this module holds the parts that are decidable without I/O: parsing a
resource's policy, validating a requested window against it, ranking free-room
candidates, and proposing alternatives when a slot is taken.
:mod:`app.services.booking_service` does the queries and catches SQLSTATE
``23P01``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, time, timedelta
from enum import StrEnum
from typing import Any
from zoneinfo import ZoneInfo

__all__ = [
    "BookingPolicy",
    "PolicyViolation",
    "RoomCandidate",
    "Slot",
    "ViolationCode",
    "free_windows",
    "propose_alternatives",
    "rank_candidates",
    "validate_request",
]


class ViolationCode(StrEnum):
    """Why a booking request was refused. Stable, machine-readable."""

    not_bookable = "not_bookable"
    too_short = "too_short"
    too_long = "too_long"
    too_far_ahead = "too_far_ahead"
    in_the_past = "in_the_past"
    outside_opening_hours = "outside_opening_hours"
    quota_exceeded = "quota_exceeded"
    missing_prerequisite = "missing_prerequisite"
    blacked_out = "blacked_out"
    not_aligned = "not_aligned"


@dataclass(frozen=True, slots=True)
class PolicyViolation:
    """One broken rule, with enough detail for the client to fix it."""

    code: ViolationCode
    message: str
    details: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class Slot:
    """A half-open ``[starts_at, ends_at)`` window."""

    starts_at: datetime
    ends_at: datetime

    def __post_init__(self) -> None:
        if self.starts_at.tzinfo is None or self.ends_at.tzinfo is None:
            raise ValueError("Slot instants must be timezone-aware")
        if self.ends_at <= self.starts_at:
            raise ValueError(f"slot must be non-empty, got {self.starts_at} to {self.ends_at}")

    @property
    def duration(self) -> timedelta:
        return self.ends_at - self.starts_at

    @property
    def minutes(self) -> int:
        return int(self.duration.total_seconds() // 60)

    def overlaps(self, other: Slot) -> bool:
        """Half-open overlap: touching at a boundary is **not** an overlap.

        A booking that starts exactly when a lesson ends is allowed, which the
        brief requires as an explicit test and which matches the ``[)`` bounds
        of the ``tstzrange`` the constraint uses.
        """
        return self.starts_at < other.ends_at and self.ends_at > other.starts_at

    def with_buffers(self, *, setup: timedelta, cleanup: timedelta) -> Slot:
        """Widen by setup and cleanup time.

        The *widened* slot is what gets written to ``resource_occupancy``, so the
        constraint enforces the buffers too. Keeping them out of the stored
        period would let two bookings sit back-to-back with no turnaround.
        """
        return Slot(starts_at=self.starts_at - setup, ends_at=self.ends_at + cleanup)


@dataclass(frozen=True, slots=True)
class BookingPolicy:
    """Per-resource rules, parsed from ``resource.policy`` JSONB.

    Data rather than code (brief section 10.4): a lab, a tennis court and a
    laundry machine want different numbers, and none of them should need a
    deployment to change.
    """

    min_duration_minutes: int = 15
    max_duration_minutes: int = 240
    #: How far ahead a booking may be made. The brief suggests 1 to 2 weeks.
    max_days_ahead: int = 14
    setup_minutes: int = 0
    cleanup_minutes: int = 0
    #: Start times must land on this grid, in minutes. 0 disables the rule.
    slot_granularity_minutes: int = 0
    #: Bookable window within a campus-local day, or ``None`` for all day.
    opens_at: time | None = None
    closes_at: time | None = None
    #: Concurrent future bookings one user may hold. 0 means unlimited.
    max_active_per_user: int = 0
    requires_approval: bool = False
    #: Capability names the user must hold, e.g. a safety certification.
    prerequisites: tuple[str, ...] = ()
    #: Minutes after the start before an unclaimed booking is auto-released.
    checkin_grace_minutes: int = 15
    #: How early check-in opens, in minutes before the start.
    checkin_opens_minutes_before: int = 15

    @classmethod
    def from_json(cls, raw: dict[str, Any] | None) -> BookingPolicy:
        """Build a policy from stored JSON, ignoring unknown keys.

        Unknown keys are tolerated rather than rejected so that a policy written
        for a later phase (lab prerequisites, say) does not break a resource in
        this one. Malformed *values* are still errors: silently falling back to a
        default would mean a resource whose policy says one thing behaves
        another way.
        """
        if not raw:
            return cls()

        def integer(key: str, default: int) -> int:
            value = raw.get(key, default)
            if isinstance(value, bool) or not isinstance(value, int):
                if value is None:
                    return default
                raise ValueError(f"policy field {key!r} must be an integer, got {value!r}")
            return value

        def clock(key: str) -> time | None:
            value = raw.get(key)
            if value is None:
                return None
            if isinstance(value, time):
                return value
            try:
                return time.fromisoformat(str(value))
            except ValueError as exc:
                raise ValueError(
                    f"policy field {key!r} must be an HH:MM time, got {value!r}"
                ) from exc

        prerequisites = raw.get("prerequisites") or ()
        if isinstance(prerequisites, str):
            prerequisites = (prerequisites,)

        return cls(
            min_duration_minutes=integer("min_duration_minutes", 15),
            max_duration_minutes=integer("max_duration_minutes", 240),
            max_days_ahead=integer("max_days_ahead", 14),
            setup_minutes=integer("setup_minutes", 0),
            cleanup_minutes=integer("cleanup_minutes", 0),
            slot_granularity_minutes=integer("slot_granularity_minutes", 0),
            opens_at=clock("opens_at"),
            closes_at=clock("closes_at"),
            max_active_per_user=integer("max_active_per_user", 0),
            requires_approval=bool(raw.get("requires_approval", False)),
            prerequisites=tuple(str(item) for item in prerequisites),
            checkin_grace_minutes=integer("checkin_grace_minutes", 15),
            checkin_opens_minutes_before=integer("checkin_opens_minutes_before", 15),
        )

    @property
    def setup(self) -> timedelta:
        return timedelta(minutes=self.setup_minutes)

    @property
    def cleanup(self) -> timedelta:
        return timedelta(minutes=self.cleanup_minutes)

    def checkin_window(self, slot: Slot) -> Slot:
        """When check-in is accepted for a booking in ``slot``.

        Opens before the start so a punctual user is not refused, and closes at
        the grace deadline - the instant after which the booking is released.
        """
        return Slot(
            starts_at=slot.starts_at - timedelta(minutes=self.checkin_opens_minutes_before),
            ends_at=slot.starts_at + timedelta(minutes=self.checkin_grace_minutes),
        )

    def release_deadline(self, slot: Slot) -> datetime:
        return slot.starts_at + timedelta(minutes=self.checkin_grace_minutes)


def validate_request(
    slot: Slot,
    policy: BookingPolicy,
    *,
    now: datetime,
    timezone: ZoneInfo,
    is_bookable: bool = True,
    active_bookings: int = 0,
    held_capabilities: frozenset[str] | set[str] = frozenset(),
    blackouts: tuple[Slot, ...] = (),
) -> list[PolicyViolation]:
    """Check a request against a policy. Returns **every** violation, not the first.

    Reporting all of them at once is a deliberate choice: a user whose booking is
    both too long and too far ahead should learn both facts from one response
    rather than discovering them one round trip at a time.

    This is advisory. Passing it does not mean the booking will succeed - the
    slot can still be taken by a concurrent request, and only the database's
    exclusion constraint decides that.
    """
    violations: list[PolicyViolation] = []

    if not is_bookable:
        violations.append(
            PolicyViolation(
                code=ViolationCode.not_bookable,
                message="This resource is not bookable.",
            )
        )

    if slot.ends_at <= now:
        violations.append(
            PolicyViolation(
                code=ViolationCode.in_the_past,
                message="That slot has already ended.",
                details={"ends_at": slot.ends_at.isoformat(), "now": now.isoformat()},
            )
        )

    minutes = slot.minutes
    if minutes < policy.min_duration_minutes:
        violations.append(
            PolicyViolation(
                code=ViolationCode.too_short,
                message=f"Bookings must last at least {policy.min_duration_minutes} minutes.",
                details={"requested_minutes": minutes, "minimum": policy.min_duration_minutes},
            )
        )
    if minutes > policy.max_duration_minutes:
        violations.append(
            PolicyViolation(
                code=ViolationCode.too_long,
                message=f"Bookings may last at most {policy.max_duration_minutes} minutes.",
                details={"requested_minutes": minutes, "maximum": policy.max_duration_minutes},
            )
        )

    horizon = now + timedelta(days=policy.max_days_ahead)
    if slot.starts_at > horizon:
        violations.append(
            PolicyViolation(
                code=ViolationCode.too_far_ahead,
                message=f"Bookings open {policy.max_days_ahead} days ahead.",
                details={"latest_start": horizon.isoformat()},
            )
        )

    if policy.slot_granularity_minutes > 0:
        local = slot.starts_at.astimezone(timezone)
        minutes_into_day = local.hour * 60 + local.minute
        if (
            minutes_into_day % policy.slot_granularity_minutes
            or local.second
            or local.microsecond
        ):
            violations.append(
                PolicyViolation(
                    code=ViolationCode.not_aligned,
                    message=(
                        f"Bookings must start on a {policy.slot_granularity_minutes}-minute "
                        "boundary."
                    ),
                    details={"granularity_minutes": policy.slot_granularity_minutes},
                )
            )

    violations.extend(_opening_hours_violations(slot, policy, timezone))

    if policy.max_active_per_user and active_bookings >= policy.max_active_per_user:
        violations.append(
            PolicyViolation(
                code=ViolationCode.quota_exceeded,
                message=(
                    f"You already hold {active_bookings} active bookings; the limit is "
                    f"{policy.max_active_per_user}."
                ),
                details={"held": active_bookings, "limit": policy.max_active_per_user},
            )
        )

    missing = sorted(set(policy.prerequisites) - set(held_capabilities))
    if missing:
        violations.append(
            PolicyViolation(
                code=ViolationCode.missing_prerequisite,
                message=(
                    "This resource requires " + ", ".join(missing) + " before it can be booked."
                ),
                details={"missing": missing},
            )
        )

    stored = slot.with_buffers(setup=policy.setup, cleanup=policy.cleanup)
    for blackout in blackouts:
        if stored.overlaps(blackout):
            violations.append(
                PolicyViolation(
                    code=ViolationCode.blacked_out,
                    message="The resource is unavailable during that period.",
                    details={
                        "blackout_start": blackout.starts_at.isoformat(),
                        "blackout_end": blackout.ends_at.isoformat(),
                    },
                )
            )
            break

    return violations


def _opening_hours_violations(
    slot: Slot, policy: BookingPolicy, timezone: ZoneInfo
) -> list[PolicyViolation]:
    """Check the slot against the resource's campus-local opening hours.

    Compared in **campus-local** wall clock, because "the lab closes at 18:00"
    is a statement about local time. A slot spanning more than one local day is
    rejected outright when opening hours apply: "within opening hours" has no
    sensible meaning across a closure.
    """
    if policy.opens_at is None and policy.closes_at is None:
        return []

    start_local = slot.starts_at.astimezone(timezone)
    # The last instant actually inside the half-open slot.
    end_local = (slot.ends_at - timedelta(microseconds=1)).astimezone(timezone)

    def violation(message: str) -> PolicyViolation:
        return PolicyViolation(
            code=ViolationCode.outside_opening_hours,
            message=message,
            details={
                "opens_at": policy.opens_at.isoformat() if policy.opens_at else None,
                "closes_at": policy.closes_at.isoformat() if policy.closes_at else None,
            },
        )

    if start_local.date() != end_local.date():
        return [violation("Bookings may not span a closing time.")]

    if policy.opens_at is not None and start_local.time() < policy.opens_at:
        return [violation(f"The resource opens at {policy.opens_at.isoformat('minutes')}.")]
    if policy.closes_at is not None and end_local.time() >= policy.closes_at:
        return [violation(f"The resource closes at {policy.closes_at.isoformat('minutes')}.")]
    return []


def free_windows(
    occupied: list[Slot] | tuple[Slot, ...],
    *,
    within: Slot,
    min_minutes: int = 0,
) -> list[Slot]:
    """Gaps in ``within`` not covered by ``occupied``, longest-first by start.

    Overlapping and unsorted input is handled: the occupied slots are merged
    before the complement is taken, so a room held by both a lesson and an
    overlapping event yields one busy block rather than a negative-length gap.
    """
    clipped = [
        Slot(
            starts_at=max(item.starts_at, within.starts_at),
            ends_at=min(item.ends_at, within.ends_at),
        )
        for item in occupied
        if item.overlaps(within)
    ]
    merged = _merge(clipped)

    windows: list[Slot] = []
    cursor = within.starts_at
    for block in merged:
        if block.starts_at > cursor:
            windows.append(Slot(starts_at=cursor, ends_at=block.starts_at))
        cursor = max(cursor, block.ends_at)
    if cursor < within.ends_at:
        windows.append(Slot(starts_at=cursor, ends_at=within.ends_at))

    if min_minutes > 0:
        windows = [item for item in windows if item.minutes >= min_minutes]
    return windows


def _merge(slots: list[Slot]) -> list[Slot]:
    """Merge overlapping and touching slots into disjoint blocks."""
    if not slots:
        return []
    ordered = sorted(slots, key=lambda item: (item.starts_at, item.ends_at))
    merged = [ordered[0]]
    for item in ordered[1:]:
        last = merged[-1]
        if item.starts_at <= last.ends_at:
            if item.ends_at > last.ends_at:
                merged[-1] = Slot(starts_at=last.starts_at, ends_at=item.ends_at)
        else:
            merged.append(item)
    return merged


def propose_alternatives(
    occupied: list[Slot] | tuple[Slot, ...],
    *,
    requested: Slot,
    search_within: Slot,
    limit: int = 3,
) -> list[Slot]:
    """Nearby free slots of the requested length, for a 409 response.

    The brief requires a conflict to come back with "the next available slots as
    alternatives" (section 10.4). Candidates are ranked by how close their start
    is to what the user asked for, in either direction - the nearest option is
    often earlier, and only offering later ones would hide it.
    """
    wanted = requested.duration
    candidates: list[Slot] = []

    for window in free_windows(occupied, within=search_within, min_minutes=requested.minutes):
        # Prefer starting the alternative as close to the request as the window
        # allows, rather than always at the window's start.
        start = min(max(requested.starts_at, window.starts_at), window.ends_at - wanted)
        candidates.append(Slot(starts_at=start, ends_at=start + wanted))

    candidates.sort(key=lambda item: abs(item.starts_at - requested.starts_at))
    return candidates[:limit]


@dataclass(frozen=True, slots=True)
class RoomCandidate:
    """A room offered by the free-room finder, with the reason it ranked there."""

    room_id: str
    building_id: str | None
    capacity: int | None
    free_until: datetime | None
    free_minutes: int
    #: Metres from the requested origin, when one was given.
    distance_metres: float | None = None
    features: tuple[str, ...] = ()
    accessible: bool | None = None
    #: Human-readable justification, shown to the user (brief section 10.4).
    reason: str = ""


def rank_candidates(
    candidates: list[RoomCandidate],
    *,
    min_capacity: int | None = None,
    free_for_minutes: int = 0,
) -> list[RoomCandidate]:
    """Rank free rooms by fit and attach a reason to each.

    The brief's ranking (section 10.4): smallest room that fits, shortest walking
    distance, longest free window. Implemented in that priority order, with a
    reason string so a user can see *why* a room came first rather than having
    to trust the order.

    "Smallest that fits" is a real preference, not aesthetic: putting four people
    in a 200-seat lecture hall blocks the hall for a class that needs it. A room
    with unknown capacity sorts after every known-capacity room, because an
    unknown is not evidence of a good fit.
    """
    eligible = [
        item
        for item in candidates
        if (min_capacity is None or (item.capacity is not None and item.capacity >= min_capacity))
        and item.free_minutes >= free_for_minutes
    ]

    def sort_key(item: RoomCandidate) -> tuple[int, int, float, int, str]:
        return (
            # Known capacity first, then smallest that fits.
            0 if item.capacity is not None else 1,
            item.capacity if item.capacity is not None else 0,
            item.distance_metres if item.distance_metres is not None else float("inf"),
            # Longest free window wins, so negate.
            -item.free_minutes,
            item.room_id,
        )

    ranked = sorted(eligible, key=sort_key)
    return [
        RoomCandidate(
            room_id=item.room_id,
            building_id=item.building_id,
            capacity=item.capacity,
            free_until=item.free_until,
            free_minutes=item.free_minutes,
            distance_metres=item.distance_metres,
            features=item.features,
            accessible=item.accessible,
            reason=item.reason or _reason_for(item, min_capacity),
        )
        for item in ranked
    ]


def _reason_for(candidate: RoomCandidate, min_capacity: int | None) -> str:
    parts: list[str] = []
    if candidate.capacity is not None:
        if min_capacity:
            spare = candidate.capacity - min_capacity
            parts.append(
                f"seats {candidate.capacity}"
                + (f" ({spare} spare)" if spare else " (exact fit)")
            )
        else:
            parts.append(f"seats {candidate.capacity}")
    else:
        parts.append("capacity unknown")

    if candidate.free_minutes >= 60:
        hours = candidate.free_minutes / 60
        parts.append(f"free for {hours:.1f}h")
    else:
        parts.append(f"free for {candidate.free_minutes} min")

    if candidate.distance_metres is not None:
        parts.append(f"{candidate.distance_metres:.0f} m away")
    if candidate.accessible:
        parts.append("step-free")

    return ", ".join(parts)
