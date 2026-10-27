"""Layer 2: Student Life service (brief section 12).

Implements:
1. Opt-in study-group matcher (section 12.1) with server-side timetable
   availability, maximum-weight pair matching + greedy group expansion,
   free-room proposal, booking on acceptance, and post-session dissolution.
2. Lost and found (section 12.2) with EXIF stripping, ID-number masking,
   TF-IDF + fuzzy + spatial + temporal matching, verification claim flow, and
   expiry job.
3. Dorm services (section 12.3) reusing the shared ticket engine for
   maintenance, the shared booking engine for laundry/kitchen/study-room slots,
   crowd-reported machine status with exponential decay, and the dorm notice
   board.
4. Teacher finder (section 12.4, teacher-controlled, default ``off``) exposing
   current status only (never history) and appointment slot booking.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.storage import StorageAdapter, strip_image_exif
from app.core.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.domain.academic import Meeting, MeetingRule, Section
from app.domain.base import (
    CrowdLevel,
    LostFoundKind,
    LostFoundStatus,
    OccupancyStatus,
    Provenance,
    RoomStateKind,
    SignalType,
    StudyGroupStatus,
    TeacherVisibilityMode,
    TicketPriority,
)
from app.domain.booking import Booking, Resource
from app.domain.evidence import Signal
from app.domain.operations import Ticket
from app.domain.people import Consent, EnrollmentRef, TeacherProfile
from app.domain.spatial import Building, Campus, Room
from app.domain.studentlife import (
    DormNotice,
    LostFoundClaim,
    LostFoundItem,
    StudyGroupMember,
    StudyGroupRequest,
    StudyGroupSession,
)
from app.engines.booking import RoomCandidate, Slot, rank_candidates
from app.engines.evidence import (
    EstimatorConfig,
    SignalInput,
    estimate_occupancy,
    fraction_for_crowd_level,
)
from app.engines.room_state import StateOptions
from app.engines.studentlife import (
    LostFoundCandidate,
    LostFoundMatch,
    StudyCandidate,
    TeacherStatusView,
    TimeWindow,
    compute_free_windows,
    mask_sensitive_text,
    match_lost_found,
    match_study_groups,
    resolve_teacher_status,
)
from app.services import booking_service, state_service, ticket_service
from app.services.notification_service import send_notification

__all__ = [
    "book_dorm_resource",
    "book_teacher_appointment",
    "create_dorm_notice",
    "create_dorm_ticket",
    "create_study_group_request",
    "dissolve_expired_study_groups",
    "ensure_default_dorm_resources",
    "expire_old_lost_found_items",
    "find_matches_for_item",
    "get_dorm_machines_status",
    "get_study_group_session_view",
    "get_teacher_status_for_student",
    "grant_or_revoke_consent",
    "has_active_consent",
    "list_dorm_notices",
    "list_lost_found_items",
    "list_study_group_requests",
    "list_study_group_sessions_for_user",
    "list_teachers_for_students",
    "report_dorm_machine_status",
    "report_lost_found_item",
    "resolve_claim",
    "respond_study_group_session",
    "run_study_group_matching",
    "submit_claim",
    "upsert_teacher_profile",
]


# ---------------------------------------------------------------------------
# Consent helper (brief section 3.4)
# ---------------------------------------------------------------------------


async def has_active_consent(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    purpose: str,
) -> bool:
    """Return True if ``user_id`` has an active (unrevoked) consent for ``purpose``."""
    row = (
        await session.execute(
            select(Consent.id)
            .where(
                Consent.user_id == user_id,
                Consent.purpose == purpose,
                Consent.revoked_at.is_(None),
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    return row is not None


async def grant_or_revoke_consent(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    purpose: str,
    granted: bool,
    settings: dict[str, Any] | None = None,
    note: str | None = None,
    now: datetime | None = None,
) -> Consent:
    """Grant or revoke explicit opt-in consent for a sensitive feature."""
    instant = now or datetime.now(UTC)
    active = (
        (
            await session.execute(
                select(Consent)
                .where(
                    Consent.user_id == user_id,
                    Consent.purpose == purpose,
                    Consent.revoked_at.is_(None),
                )
                .order_by(Consent.granted_at.desc())
            )
        )
        .scalars()
        .all()
    )

    if not granted:
        if active:
            for item in active:
                item.revoked_at = instant
            await session.flush()
            return active[0]
        row = Consent(
            user_id=user_id,
            purpose=purpose,
            granted_at=instant,
            revoked_at=instant,
            settings=settings,
            note=note,
        )
        session.add(row)
        await session.flush()
        return row

    if active:
        latest = active[0]
        if settings is not None:
            latest.settings = settings
        if note is not None:
            latest.note = note
        await session.flush()
        return latest

    row = Consent(
        user_id=user_id,
        purpose=purpose,
        granted_at=instant,
        revoked_at=None,
        settings=settings,
        note=note,
    )
    session.add(row)
    await session.flush()
    return row


# ---------------------------------------------------------------------------
# 12.1 Study-group matcher (opt-in)
# ---------------------------------------------------------------------------


async def _load_user_busy_intervals(
    session: AsyncSession,
    user_id: uuid.UUID,
    window_start: datetime,
    window_end: datetime,
) -> list[tuple[datetime, datetime]]:
    """Load a student's timetable and booking intervals inside ``[window_start, window_end]``.

    Never exposed outside the matching service (brief section 12.1).
    """
    busy: list[tuple[datetime, datetime]] = []

    # 1. Timetable meetings from sections the student is enrolled in.
    meeting_rows = (
        await session.execute(
            select(Meeting.starts_at, Meeting.ends_at)
            .join(MeetingRule, MeetingRule.id == Meeting.rule_id)
            .join(EnrollmentRef, EnrollmentRef.section_id == MeetingRule.section_id)
            .where(
                EnrollmentRef.user_id == user_id,
                Meeting.cancelled.is_(False),
                Meeting.starts_at < window_end,
                Meeting.ends_at > window_start,
            )
        )
    ).all()
    for s_at, e_at in meeting_rows:
        busy.append((s_at, e_at))

    # 2. Confirmed or pending bookings owned by the student.
    booking_rows = (
        await session.execute(
            select(Booking.starts_at, Booking.ends_at).where(
                Booking.user_id == user_id,
                Booking.status.in_((OccupancyStatus.pending, OccupancyStatus.confirmed)),
                Booking.starts_at < window_end,
                Booking.ends_at > window_start,
            )
        )
    ).all()
    for s_at, e_at in booking_rows:
        busy.append((s_at, e_at))

    return busy


async def _propose_free_study_room(
    session: AsyncSession,
    *,
    starts_at: datetime,
    ends_at: datetime,
    min_capacity: int,
    preferred_building_id: str | None,
    timezone: ZoneInfo,
) -> str | None:
    """Use the free-room finder to pick the best room for a matched study group."""
    duration_min = max(15, int((ends_at - starts_at).total_seconds() // 60))
    options = StateOptions(starts_soon_minutes=0, timezone=timezone)

    for bld in [preferred_building_id, None] if preferred_building_id else [None]:
        try:
            if bld is not None:
                res = await state_service.state_for_building(
                    session, bld, starts_at, timezone=timezone, options=options
                )
            else:
                res = await state_service.state_for_campus(
                    session, starts_at, timezone=timezone, options=options
                )
        except NotFoundError:
            continue

        matching_states = [
            st
            for st in res.states
            if st.state is RoomStateKind.free
            and not st.out_of_service
            and (st.free_until is None or st.free_until >= ends_at)
        ]
        if not matching_states:
            continue

        r_ids = [st.room_id for st in matching_states]
        caps_rows = (await session.execute(select(Room.id, Room.capacity).where(Room.id.in_(r_ids)))).all()
        caps = {row[0]: row[1] for row in caps_rows}

        candidates: list[RoomCandidate] = []
        for st in matching_states:
            free_mins = (
                int((st.free_until - starts_at).total_seconds() // 60)
                if st.free_until is not None
                else 24 * 60
            )
            candidates.append(
                RoomCandidate(
                    room_id=st.room_id,
                    building_id=st.building_id,
                    capacity=caps.get(st.room_id),
                    free_until=st.free_until,
                    free_minutes=free_mins,
                )
            )
        ranked = rank_candidates(
            candidates,
            min_capacity=min_capacity,
            free_for_minutes=duration_min,
        )
        if ranked:
            return ranked[0].room_id
    return None


async def create_study_group_request(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    topic_tag: str,
    window_start: datetime,
    window_end: datetime,
    course_id: uuid.UUID | None = None,
    wanted_group_size: int = 2,
    min_duration_minutes: int = 60,
    preferred_building_id: str | None = None,
    notes: str | None = None,
    is_demo: bool = False,
    timezone: ZoneInfo | None = None,
    now: datetime | None = None,
) -> tuple[StudyGroupRequest, list[StudyGroupSession]]:
    """Create an opt-in study-group request and attempt immediate matching."""
    if not await has_active_consent(session, user_id=user_id, purpose="study_group_matching"):
        raise ForbiddenError(
            "Study-group matching is opt-in; please grant 'study_group_matching' consent first.",
            code="consent_required",
        )
    if window_end <= window_start:
        raise ValidationError(
            "window_end must be strictly after window_start.",
            code="invalid_time_window",
        )
    if not 2 <= wanted_group_size <= 8:
        raise ValidationError(
            "wanted_group_size must be between 2 and 8.",
            code="invalid_group_size",
        )

    req = StudyGroupRequest(
        user_id=user_id,
        course_id=course_id,
        topic_tag=topic_tag.strip(),
        wanted_group_size=wanted_group_size,
        min_duration_minutes=min_duration_minutes,
        window_start=window_start,
        window_end=window_end,
        preferred_building_id=preferred_building_id,
        status=StudyGroupStatus.open,
        notes=notes,
        is_demo=is_demo,
    )
    session.add(req)
    await session.flush()

    matched_sessions = await run_study_group_matching(session, timezone=timezone, now=now)
    return req, matched_sessions


async def run_study_group_matching(
    session: AsyncSession,
    *,
    timezone: ZoneInfo | None = None,
    now: datetime | None = None,
) -> list[StudyGroupSession]:
    """Match open study-group requests and propose rooms + slots."""
    instant = now or datetime.now(UTC)
    tz = timezone or ZoneInfo("Asia/Tashkent")

    open_requests = (
        (
            await session.execute(
                select(StudyGroupRequest)
                .where(
                    StudyGroupRequest.status == StudyGroupStatus.open,
                    StudyGroupRequest.window_end > instant,
                )
                .order_by(StudyGroupRequest.created_at.asc())
            )
        )
        .scalars()
        .all()
    )

    if len(open_requests) < 2:
        return []

    candidates: list[StudyCandidate] = []
    req_by_id: dict[uuid.UUID, StudyGroupRequest] = {}

    for req in open_requests:
        if not await has_active_consent(session, user_id=req.user_id, purpose="study_group_matching"):
            continue
        busy = await _load_user_busy_intervals(session, req.user_id, req.window_start, req.window_end)
        free_wins = compute_free_windows(
            TimeWindow(req.window_start, req.window_end),
            busy,
            min_duration_minutes=req.min_duration_minutes,
        )
        if not free_wins:
            continue
        req_by_id[req.id] = req
        candidates.append(
            StudyCandidate(
                request_id=req.id,
                user_id=req.user_id,
                course_id=req.course_id,
                topic_tag=req.topic_tag,
                wanted_group_size=req.wanted_group_size,
                min_duration_minutes=req.min_duration_minutes,
                preferred_building_id=req.preferred_building_id,
                free_windows=free_wins,
            )
        )

    proposals = match_study_groups(candidates)
    created_sessions: list[StudyGroupSession] = []

    for prop in proposals:
        proposed_room = await _propose_free_study_room(
            session,
            starts_at=prop.starts_at,
            ends_at=prop.ends_at,
            min_capacity=len(prop.member_user_ids),
            preferred_building_id=prop.preferred_building_id,
            timezone=tz,
        )
        sg_session = StudyGroupSession(
            topic_tag=prop.topic_tag,
            course_id=prop.course_id,
            proposed_room_id=proposed_room,
            starts_at=prop.starts_at,
            ends_at=prop.ends_at,
            status=StudyGroupStatus.matched,
            match_score=prop.score,
        )
        session.add(sg_session)
        await session.flush()

        for req_id, member_uid in zip(prop.member_request_ids, prop.member_user_ids, strict=False):
            r_obj = req_by_id.get(req_id)
            if r_obj is not None:
                r_obj.status = StudyGroupStatus.matched
            session.add(
                StudyGroupMember(
                    session_id=sg_session.id,
                    request_id=req_id,
                    user_id=member_uid,
                    accepted=None,
                )
            )
            await send_notification(
                session,
                recipient_id=member_uid,
                template_id="study_group.matched",
                params={
                    "topic_tag": sg_session.topic_tag,
                    "starts_at": sg_session.starts_at.strftime("%Y-%m-%d %H:%M"),
                    "ends_at": sg_session.ends_at.strftime("%H:%M"),
                    "room_id": proposed_room or "TBD",
                },
                now=instant,
            )

        await session.flush()
        created_sessions.append(sg_session)

    return created_sessions


async def respond_study_group_session(
    session: AsyncSession,
    *,
    session_id: uuid.UUID,
    user_id: uuid.UUID,
    accept: bool,
    timezone: ZoneInfo | None = None,
    now: datetime | None = None,
) -> StudyGroupSession:
    """Record a member's acceptance/rejection; auto-book the proposed room when all accept."""
    instant = now or datetime.now(UTC)
    tz = timezone or ZoneInfo("Asia/Tashkent")

    sg_session = await session.get(StudyGroupSession, session_id)
    if sg_session is None:
        raise NotFoundError(
            f"Study group session {session_id} does not exist.",
            code="study_group_session_not_found",
        )

    members = (
        (await session.execute(select(StudyGroupMember).where(StudyGroupMember.session_id == session_id)))
        .scalars()
        .all()
    )
    my_member = next((m for m in members if m.user_id == user_id), None)
    if my_member is None:
        raise ForbiddenError(
            "You are not a member of this study group session.",
            code="not_study_group_member",
        )

    my_member.accepted = accept
    my_member.responded_at = instant
    await session.flush()

    if not accept:
        sg_session.status = StudyGroupStatus.cancelled
        for m in members:
            req = await session.get(StudyGroupRequest, m.request_id)
            if req is not None:
                req.status = StudyGroupStatus.cancelled if m.user_id == user_id else StudyGroupStatus.open
        await session.flush()
        return sg_session

    if (
        all(m.accepted is True for m in members)
        and sg_session.booking_id is None
        and sg_session.proposed_room_id is not None
    ):
        resource = (
            await session.execute(
                select(Resource).where(
                    Resource.room_id == sg_session.proposed_room_id,
                    Resource.is_bookable.is_(True),
                )
            )
        ).scalar_one_or_none()
        if resource is not None:
            try:
                res = await booking_service.create_booking(
                    session,
                    booking_service.BookingRequest(
                        resource_id=resource.id,
                        slot=Slot(sg_session.starts_at, sg_session.ends_at),
                        user_id=user_id,
                        purpose=f"Study group: {sg_session.topic_tag}",
                        attendee_count=len(members),
                    ),
                    timezone=tz,
                    now=instant,
                )
                sg_session.booking_id = res.booking.id
                await session.flush()
            except (ConflictError, ValidationError):
                pass

    return sg_session


async def dissolve_expired_study_groups(
    session: AsyncSession,
    *,
    now: datetime | None = None,
) -> list[StudyGroupSession]:
    """Dissolve study group sessions that have ended (brief section 12.1)."""
    instant = now or datetime.now(UTC)
    expired = (
        (
            await session.execute(
                select(StudyGroupSession).where(
                    StudyGroupSession.status == StudyGroupStatus.matched,
                    StudyGroupSession.ends_at <= instant,
                )
            )
        )
        .scalars()
        .all()
    )

    for sg in expired:
        sg.status = StudyGroupStatus.dissolved
        members = (
            (await session.execute(select(StudyGroupMember).where(StudyGroupMember.session_id == sg.id)))
            .scalars()
            .all()
        )
        for m in members:
            req = await session.get(StudyGroupRequest, m.request_id)
            if req is not None:
                req.status = StudyGroupStatus.dissolved
            await send_notification(
                session,
                recipient_id=m.user_id,
                template_id="study_group.dissolved",
                params={"topic_tag": sg.topic_tag},
                now=instant,
            )
    await session.flush()
    return list(expired)


async def list_study_group_requests(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
) -> list[StudyGroupRequest]:
    """List a user's own study-group requests."""
    rows = (
        (
            await session.execute(
                select(StudyGroupRequest)
                .where(StudyGroupRequest.user_id == user_id)
                .order_by(StudyGroupRequest.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    return list(rows)


async def get_study_group_session_view(
    session: AsyncSession,
    session_id: uuid.UUID,
    *,
    viewer_user_id: uuid.UUID,
) -> dict[str, Any]:
    """Return a privacy-preserving view of a study group session.

    Other members' timetables are **never** exposed; each member entry only
    indicates ``availability="available"`` for the matched session window
    (brief section 12.1).
    """
    sg = await session.get(StudyGroupSession, session_id)
    if sg is None:
        raise NotFoundError(
            f"Study group session {session_id} does not exist.",
            code="study_group_session_not_found",
        )
    members = (
        (await session.execute(select(StudyGroupMember).where(StudyGroupMember.session_id == session_id)))
        .scalars()
        .all()
    )
    if not any(m.user_id == viewer_user_id for m in members):
        raise ForbiddenError(
            "You may only view study group sessions you belong to.",
            code="not_study_group_member",
        )

    return {
        "id": str(sg.id),
        "topic_tag": sg.topic_tag,
        "course_id": str(sg.course_id) if sg.course_id else None,
        "proposed_room_id": sg.proposed_room_id,
        "booking_id": str(sg.booking_id) if sg.booking_id else None,
        "starts_at": sg.starts_at.isoformat(),
        "ends_at": sg.ends_at.isoformat(),
        "status": sg.status.value,
        "match_score": sg.match_score,
        "members": [
            {
                "user_id": str(m.user_id),
                "availability": "available",
                "accepted": m.accepted,
                "responded_at": m.responded_at.isoformat() if m.responded_at else None,
            }
            for m in members
        ],
    }


async def list_study_group_sessions_for_user(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
) -> list[dict[str, Any]]:
    """List all study-group sessions that ``user_id`` belongs to."""
    session_ids = (
        (
            await session.execute(
                select(StudyGroupMember.session_id).where(StudyGroupMember.user_id == user_id)
            )
        )
        .scalars()
        .all()
    )
    views: list[dict[str, Any]] = []
    for sid in session_ids:
        views.append(await get_study_group_session_view(session, sid, viewer_user_id=user_id))
    return views


# ---------------------------------------------------------------------------
# 12.2 Lost and found
# ---------------------------------------------------------------------------


async def report_lost_found_item(
    session: AsyncSession,
    *,
    reporter_user_id: uuid.UUID,
    kind: LostFoundKind,
    category: str,
    title: str,
    description: str = "",
    building_id: str | None = None,
    floor_id: str | None = None,
    room_id: str | None = None,
    pin_x_m: float | None = None,
    pin_z_m: float | None = None,
    occurred_at: datetime | None = None,
    verification_question: str | None = None,
    handover_point: str | None = None,
    photo_bytes: bytes | None = None,
    storage: StorageAdapter | None = None,
    expiry_days: int = 30,
    is_demo: bool = False,
    now: datetime | None = None,
) -> tuple[LostFoundItem, list[LostFoundMatch]]:
    """Report a lost or found item, strip EXIF, mask IDs, and match opposite items."""
    instant = now or datetime.now(UTC)
    occ = occurred_at or instant

    clean_title = mask_sensitive_text(title.strip())
    clean_desc = mask_sensitive_text(description.strip())

    photo_key: str | None = None
    if photo_bytes is not None and storage is not None:
        stripped, content_type = strip_image_exif(photo_bytes)
        ext = content_type.split("/")[-1]
        key = f"lost-found/{uuid.uuid4().hex}.{ext}"
        stored = storage.put_bytes(key, stripped, content_type=content_type)
        photo_key = stored.key

    item = LostFoundItem(
        reporter_user_id=reporter_user_id,
        kind=kind,
        status=LostFoundStatus.open,
        category=category.strip(),
        title=clean_title,
        description=clean_desc,
        photo_storage_key=photo_key,
        building_id=building_id,
        floor_id=floor_id,
        room_id=room_id,
        pin_x_m=pin_x_m,
        pin_z_m=pin_z_m,
        occurred_at=occ,
        verification_question=verification_question,
        handover_point=handover_point,
        expires_at=instant + timedelta(days=max(1, expiry_days)),
        is_demo=is_demo,
    )
    session.add(item)
    await session.flush()

    matches = await find_matches_for_item(session, item.id)
    if matches and matches[0].score >= 0.55:
        top = matches[0]
        other = await session.get(LostFoundItem, top.candidate_id)
        if other is not None:
            item.status = LostFoundStatus.matched
            if other.status is LostFoundStatus.open:
                other.status = LostFoundStatus.matched
            await session.flush()
            await send_notification(
                session,
                recipient_id=reporter_user_id,
                template_id="lost_found.matched",
                params={
                    "kind": item.kind.value,
                    "title": item.title,
                    "category": item.category,
                    "score": f"{top.score:.2f}",
                },
                now=instant,
            )
            await send_notification(
                session,
                recipient_id=other.reporter_user_id,
                template_id="lost_found.matched",
                params={
                    "kind": other.kind.value,
                    "title": other.title,
                    "category": other.category,
                    "score": f"{top.score:.2f}",
                },
                now=instant,
            )

    return item, matches


async def find_matches_for_item(
    session: AsyncSession,
    item_id: uuid.UUID,
    *,
    limit: int = 10,
) -> list[LostFoundMatch]:
    """Compute ranked opposite-kind matches for ``item_id``."""
    item = await session.get(LostFoundItem, item_id)
    if item is None:
        raise NotFoundError(
            f"Lost/found item {item_id} does not exist.",
            code="lost_found_not_found",
        )

    opposite_kind = LostFoundKind.found if item.kind is LostFoundKind.lost else LostFoundKind.lost
    pool_rows = (
        (
            await session.execute(
                select(LostFoundItem).where(
                    LostFoundItem.kind == opposite_kind,
                    LostFoundItem.status.in_((LostFoundStatus.open, LostFoundStatus.matched)),
                )
            )
        )
        .scalars()
        .all()
    )

    query_cand = LostFoundCandidate(
        id=item.id,
        kind=item.kind,
        category=item.category,
        title=item.title,
        description=item.description,
        building_id=item.building_id,
        pin_x_m=item.pin_x_m,
        pin_z_m=item.pin_z_m,
        occurred_at=item.occurred_at,
    )
    pool = [
        LostFoundCandidate(
            id=row.id,
            kind=row.kind,
            category=row.category,
            title=row.title,
            description=row.description,
            building_id=row.building_id,
            pin_x_m=row.pin_x_m,
            pin_z_m=row.pin_z_m,
            occurred_at=row.occurred_at,
        )
        for row in pool_rows
    ]
    return match_lost_found(query_cand, pool, limit=limit)


async def submit_claim(
    session: AsyncSession,
    *,
    item_id: uuid.UUID,
    claimant_user_id: uuid.UUID,
    verification_answer: str,
    now: datetime | None = None,
) -> LostFoundClaim:
    """Submit a verification answer to claim a found item (brief section 12.2)."""
    instant = now or datetime.now(UTC)
    item = await session.get(LostFoundItem, item_id)
    if item is None:
        raise NotFoundError(
            f"Lost/found item {item_id} does not exist.",
            code="lost_found_not_found",
        )
    if item.kind is not LostFoundKind.found:
        raise ValidationError(
            "Claims can only be submitted on 'found' items.",
            code="cannot_claim_lost_item",
        )
    if item.status in {LostFoundStatus.returned, LostFoundStatus.expired}:
        raise ConflictError(
            f"Item is already {item.status.value}.",
            code="item_not_claimable",
        )

    claim = LostFoundClaim(
        item_id=item.id,
        claimant_user_id=claimant_user_id,
        verification_answer=mask_sensitive_text(verification_answer.strip()),
        status="pending",
        handover_point=item.handover_point,
    )
    session.add(claim)
    await session.flush()

    await send_notification(
        session,
        recipient_id=item.reporter_user_id,
        template_id="lost_found.claim_submitted",
        params={"title": item.title},
        now=instant,
    )
    return claim


async def resolve_claim(
    session: AsyncSession,
    *,
    claim_id: uuid.UUID,
    actor_user_id: uuid.UUID,
    approve: bool,
    handover_point: str | None = None,
    mark_returned: bool = False,
    now: datetime | None = None,
) -> LostFoundClaim:
    """Allow the finder (or admin) to approve or reject a claim."""
    instant = now or datetime.now(UTC)
    claim = await session.get(LostFoundClaim, claim_id)
    if claim is None:
        raise NotFoundError(f"Claim {claim_id} does not exist.", code="claim_not_found")
    item = await session.get(LostFoundItem, claim.item_id)
    if item is None:
        raise NotFoundError(f"Item {claim.item_id} does not exist.", code="lost_found_not_found")
    if item.reporter_user_id != actor_user_id:
        raise ForbiddenError(
            "Only the finder who reported this item may resolve a claim.",
            code="not_item_finder",
        )

    claim.status = "approved" if approve else "rejected"
    claim.resolved_at = instant
    if handover_point is not None:
        claim.handover_point = handover_point
        item.handover_point = handover_point

    if approve:
        item.status = LostFoundStatus.returned if mark_returned else LostFoundStatus.claimed
    await session.flush()

    await send_notification(
        session,
        recipient_id=claim.claimant_user_id,
        template_id="lost_found.claim_resolved",
        params={
            "decision": claim.status,
            "title": item.title,
            "handover_point": claim.handover_point or item.handover_point or "Security desk",
        },
        now=instant,
    )
    return claim


async def expire_old_lost_found_items(
    session: AsyncSession,
    *,
    now: datetime | None = None,
) -> list[LostFoundItem]:
    """Expire open/matched lost-and-found items past ``expires_at``."""
    instant = now or datetime.now(UTC)
    rows = (
        (
            await session.execute(
                select(LostFoundItem).where(
                    LostFoundItem.status.in_((LostFoundStatus.open, LostFoundStatus.matched)),
                    LostFoundItem.expires_at <= instant,
                )
            )
        )
        .scalars()
        .all()
    )
    for row in rows:
        row.status = LostFoundStatus.expired
    await session.flush()
    return list(rows)


async def list_lost_found_items(
    session: AsyncSession,
    *,
    kind: LostFoundKind | None = None,
    status: LostFoundStatus | None = None,
    category: str | None = None,
    building_id: str | None = None,
    limit: int = 100,
) -> list[LostFoundItem]:
    """List lost/found items ordered newest-first."""
    stmt = select(LostFoundItem)
    if kind is not None:
        stmt = stmt.where(LostFoundItem.kind == kind)
    if status is not None:
        stmt = stmt.where(LostFoundItem.status == status)
    if category is not None:
        stmt = stmt.where(LostFoundItem.category == category)
    if building_id is not None:
        stmt = stmt.where(LostFoundItem.building_id == building_id)
    stmt = stmt.order_by(LostFoundItem.created_at.desc()).limit(limit)
    return list((await session.execute(stmt)).scalars().all())


# ---------------------------------------------------------------------------
# 12.3 Dorm services
# ---------------------------------------------------------------------------

DEFAULT_DORM_RESOURCES: tuple[dict[str, Any], ...] = (
    {
        "code": "dorm-laundry-1",
        "name": "Dormitory Washing Machine #1",
        "kind": "laundry",
        "capacity": 1,
        "policy": {"min_minutes": 30, "max_minutes": 120, "grace_minutes": 10},
    },
    {
        "code": "dorm-laundry-2",
        "name": "Dormitory Washing Machine #2",
        "kind": "laundry",
        "capacity": 1,
        "policy": {"min_minutes": 30, "max_minutes": 120, "grace_minutes": 10},
    },
    {
        "code": "dorm-kitchen-f1",
        "name": "Dormitory Shared Kitchen (Floor 1)",
        "kind": "kitchen",
        "capacity": 6,
        "policy": {"min_minutes": 30, "max_minutes": 120, "grace_minutes": 15},
    },
    {
        "code": "dorm-study-f1",
        "name": "Dormitory Quiet Study Room",
        "kind": "study_room",
        "capacity": 8,
        "policy": {"min_minutes": 30, "max_minutes": 180, "grace_minutes": 15},
    },
)


async def ensure_default_dorm_resources(
    session: AsyncSession,
    *,
    campus_id: str = "ajou-tashkent",
    is_demo: bool = True,
) -> list[Resource]:
    """Ensure bookable dorm resources exist on ``campus_id``."""
    campus = await session.get(Campus, campus_id)
    if campus is None:
        return []

    resources: list[Resource] = []
    for spec in DEFAULT_DORM_RESOURCES:
        existing = (
            await session.execute(
                select(Resource).where(
                    Resource.campus_id == campus_id,
                    Resource.code == spec["code"],
                )
            )
        ).scalar_one_or_none()
        if existing is None:
            existing = Resource(
                campus_id=campus_id,
                code=spec["code"],
                name=spec["name"],
                kind=spec["kind"],
                capacity=spec["capacity"],
                policy=dict(spec["policy"]),
                requires_approval=False,
                is_bookable=True,
                is_demo=is_demo,
            )
            session.add(existing)
        resources.append(existing)
    await session.flush()
    return resources


async def create_dorm_ticket(
    session: AsyncSession,
    *,
    reporter_user_id: uuid.UUID,
    subcategory: str,
    title: str,
    description: str = "",
    room_id: str | None = None,
    building_id: str = "bld-j",
    priority: TicketPriority = TicketPriority.normal,
    blocks_use: bool = False,
    now: datetime | None = None,
) -> tuple[Ticket, bool]:
    """Submit a dorm maintenance request through the shared ticket engine."""
    bld = await session.get(Building, building_id)
    eff_bld = building_id if bld is not None else None
    return await ticket_service.create_ticket(
        session,
        reporter_user_id=reporter_user_id,
        category="dorm",
        subcategory=subcategory,
        title=title,
        description=description,
        building_id=eff_bld,
        room_id=room_id,
        priority=priority,
        blocks_use=blocks_use,
        now=now,
    )


async def book_dorm_resource(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    resource_code: str,
    starts_at: datetime,
    ends_at: datetime,
    purpose: str | None = None,
    campus_id: str = "ajou-tashkent",
    timezone: ZoneInfo | None = None,
    now: datetime | None = None,
) -> booking_service.BookingResult:
    """Book a dorm laundry slot, kitchen, or shared study room via the booking engine."""
    tz = timezone or ZoneInfo("Asia/Tashkent")
    await ensure_default_dorm_resources(session, campus_id=campus_id)
    resource = (
        await session.execute(
            select(Resource).where(
                Resource.campus_id == campus_id,
                Resource.code == resource_code,
            )
        )
    ).scalar_one_or_none()
    if resource is None:
        raise NotFoundError(
            f"Dorm resource {resource_code!r} does not exist.",
            code="dorm_resource_not_found",
        )
    return await booking_service.create_booking(
        session,
        booking_service.BookingRequest(
            resource_id=resource.id,
            slot=Slot(starts_at, ends_at),
            user_id=user_id,
            purpose=purpose or f"Dorm {resource.kind} booking",
            attendee_count=1,
        ),
        timezone=tz,
        now=now,
    )


async def report_dorm_machine_status(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    resource_code: str,
    is_free: bool,
    at: datetime | None = None,
) -> dict[str, Any]:
    """Record a crowd-reported 'machine free?' signal with exponential decay (section 12.3)."""
    instant = at or datetime.now(UTC)
    await ensure_default_dorm_resources(session)
    level = CrowdLevel.empty if is_free else CrowdLevel.full
    val = fraction_for_crowd_level(level)

    sig = Signal(
        signal_type=SignalType.crowd_report,
        subject_type="dorm_machine",
        subject_id=resource_code,
        value=val,
        reliability=0.75,
        provenance=Provenance.reported,
        observed_at=instant,
        expires_at=instant + timedelta(minutes=30),
        source_ref=str(user_id),
        payload={"is_free": is_free},
    )
    session.add(sig)
    await session.flush()

    statuses = await get_dorm_machines_status(session, resource_code=resource_code, at=instant)
    return statuses[0]


async def get_dorm_machines_status(
    session: AsyncSession,
    *,
    resource_code: str | None = None,
    campus_id: str = "ajou-tashkent",
    at: datetime | None = None,
) -> list[dict[str, Any]]:
    """Compute exponentially decayed crowd status for dorm machines, labelled ``reported``."""
    instant = at or datetime.now(UTC)
    resources = await ensure_default_dorm_resources(session, campus_id=campus_id)
    if resource_code is not None:
        resources = [r for r in resources if r.code == resource_code]
        if not resources:
            raise NotFoundError(
                f"Dorm resource {resource_code!r} does not exist.",
                code="dorm_resource_not_found",
            )

    cfg = EstimatorConfig(
        prior_weight=0.0,
        tau=timedelta(minutes=15),
        min_reports_for_reported=1,
    )
    lookback = instant - timedelta(minutes=45)
    results: list[dict[str, Any]] = []

    for res in resources:
        raw_signals = (
            (
                await session.execute(
                    select(Signal)
                    .where(
                        Signal.subject_type == "dorm_machine",
                        Signal.subject_id == res.code,
                        Signal.observed_at >= lookback,
                        Signal.observed_at <= instant,
                    )
                    .order_by(Signal.observed_at.desc())
                )
            )
            .scalars()
            .all()
        )

        inputs = [
            SignalInput(
                signal_type=s.signal_type,
                value=float(s.value or 0.0),
                observed_at=s.observed_at,
                reliability=s.reliability,
                expires_at=s.expires_at,
                ref=str(s.id),
            )
            for s in raw_signals
            if s.value is not None
        ]

        est = estimate_occupancy(
            at=instant,
            capacity=res.capacity or 1,
            prior_fraction=None,
            signals=inputs,
            config=cfg,
        )
        has_fresh = any(i.is_fresh(instant) for i in inputs)
        state_str = "unknown" if not has_fresh else ("free" if est.fraction < 0.5 else "in_use")
        results.append(
            {
                "resource_id": str(res.id),
                "code": res.code,
                "name": res.name,
                "kind": res.kind,
                "state": state_str,
                "busy_fraction": round(est.fraction, 4),
                "provenance": Provenance.reported.value if has_fresh else Provenance.estimated.value,
                "confidence": round(est.confidence, 4),
                "at": instant.isoformat(),
            }
        )
    return results


async def create_dorm_notice(
    session: AsyncSession,
    *,
    author_user_id: uuid.UUID | None,
    title_i18n: dict[str, str],
    body_i18n: dict[str, str],
    building_id: str = "bld-j",
    pinned: bool = False,
    expires_at: datetime | None = None,
    is_demo: bool = False,
) -> DormNotice:
    """Create a dorm notice board entry."""
    notice = DormNotice(
        author_user_id=author_user_id,
        building_id=building_id,
        title_i18n=dict(title_i18n),
        body_i18n=dict(body_i18n),
        pinned=pinned,
        expires_at=expires_at,
        is_demo=is_demo,
    )
    session.add(notice)
    await session.flush()
    return notice


async def list_dorm_notices(
    session: AsyncSession,
    *,
    building_id: str = "bld-j",
    now: datetime | None = None,
) -> list[DormNotice]:
    """List active dorm notice board items (pinned first, then newest)."""
    instant = now or datetime.now(UTC)
    stmt = (
        select(DormNotice)
        .where(
            DormNotice.building_id == building_id,
            (DormNotice.expires_at.is_(None)) | (DormNotice.expires_at > instant),
        )
        .order_by(DormNotice.pinned.desc(), DormNotice.created_at.desc())
    )
    return list((await session.execute(stmt)).scalars().all())


# ---------------------------------------------------------------------------
# 12.4 Teacher finder (teacher-controlled, default off)
# ---------------------------------------------------------------------------


async def upsert_teacher_profile(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    public_name: str,
    department: str | None = None,
    teacher_ref: str | None = None,
    office_room_id: str | None = None,
    visibility_mode: TeacherVisibilityMode = TeacherVisibilityMode.off,
    manual_status: str | None = None,
    manual_note: str | None = None,
    manual_until: datetime | None = None,
    office_hours: list[dict[str, Any]] | None = None,
    campus_id: str = "ajou-tashkent",
    now: datetime | None = None,
) -> TeacherProfile:
    """Create or update a teacher's visibility profile and appointment resource."""
    instant = now or datetime.now(UTC)
    profile = await session.get(TeacherProfile, user_id)

    # Ensure a bookable resource exists for appointments with this teacher.
    campus = await session.get(Campus, campus_id)
    appt_res_id: uuid.UUID | None = profile.appointment_resource_id if profile else None
    if appt_res_id is None and campus is not None:
        code = f"teacher-appt-{str(user_id)[:8]}"
        res = (
            await session.execute(
                select(Resource).where(
                    Resource.campus_id == campus_id,
                    Resource.code == code,
                )
            )
        ).scalar_one_or_none()
        if res is None:
            res = Resource(
                campus_id=campus_id,
                code=code,
                name=f"Office hours appointment: {public_name}",
                kind="appointment",
                room_id=office_room_id,
                capacity=1,
                policy={"min_minutes": 15, "max_minutes": 60, "grace_minutes": 10},
                requires_approval=False,
                is_bookable=True,
            )
            session.add(res)
            await session.flush()
        appt_res_id = res.id

    if profile is None:
        profile = TeacherProfile(
            user_id=user_id,
            teacher_ref=teacher_ref,
            public_name=public_name,
            department=department,
            office_room_id=office_room_id,
            appointment_resource_id=appt_res_id,
            visibility_mode=visibility_mode,
            manual_status=manual_status,
            manual_note=manual_note,
            manual_until=manual_until,
            manual_updated_at=instant if manual_status else None,
            office_hours=office_hours or [],
        )
        session.add(profile)
    else:
        profile.public_name = public_name
        if department is not None:
            profile.department = department
        if teacher_ref is not None:
            profile.teacher_ref = teacher_ref
        if office_room_id is not None:
            profile.office_room_id = office_room_id
        if appt_res_id is not None:
            profile.appointment_resource_id = appt_res_id
        profile.visibility_mode = visibility_mode
        profile.manual_status = manual_status
        profile.manual_note = manual_note
        profile.manual_until = manual_until
        if manual_status is not None:
            profile.manual_updated_at = instant
        if office_hours is not None:
            profile.office_hours = office_hours

    await grant_or_revoke_consent(
        session,
        user_id=user_id,
        purpose="teacher_visibility",
        granted=(visibility_mode is not TeacherVisibilityMode.off),
        settings={"visibility_mode": visibility_mode.value},
        now=instant,
    )
    await session.flush()
    return profile


async def _active_class_room_for_teacher(
    session: AsyncSession,
    teacher_ref: str | None,
    at: datetime,
) -> str | None:
    if not teacher_ref:
        return None
    row = (
        await session.execute(
            select(Meeting.room_id)
            .outerjoin(MeetingRule, MeetingRule.id == Meeting.rule_id)
            .outerjoin(Section, Section.id == MeetingRule.section_id)
            .where(
                Meeting.cancelled.is_(False),
                Meeting.starts_at <= at,
                Meeting.ends_at > at,
                (Section.teacher_ref == teacher_ref) | (Meeting.teacher_label == teacher_ref),
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    return row


async def get_teacher_status_for_student(
    session: AsyncSession,
    teacher_user_id: uuid.UUID,
    *,
    at: datetime | None = None,
    timezone: ZoneInfo | None = None,
) -> TeacherStatusView:
    """Return a teacher's current status according to their ``visibility_mode`` (section 12.4).

    Never returns any historical status log.
    """
    instant = at or datetime.now(UTC)
    tz = timezone or ZoneInfo("Asia/Tashkent")
    local_dt = instant.astimezone(tz)

    profile = await session.get(TeacherProfile, teacher_user_id)
    if profile is None:
        raise NotFoundError(
            f"Teacher profile {teacher_user_id} does not exist.",
            code="teacher_not_found",
        )

    active_room: str | None = None
    if profile.visibility_mode in {
        TeacherVisibilityMode.timetable_status,
        TeacherVisibilityMode.manual_status,
    }:
        active_room = await _active_class_room_for_teacher(session, profile.teacher_ref, instant)

    return resolve_teacher_status(
        user_id=profile.user_id,
        public_name=profile.public_name,
        department=profile.department,
        visibility_mode=profile.visibility_mode,
        office_room_id=profile.office_room_id,
        office_hours=profile.office_hours,
        manual_status=profile.manual_status,
        manual_note=profile.manual_note,
        manual_until=profile.manual_until,
        active_class_room_id=active_room,
        appointment_resource_id=profile.appointment_resource_id,
        now_local_weekday=local_dt.weekday(),
        now_local_time=local_dt.time(),
    )


async def list_teachers_for_students(
    session: AsyncSession,
    *,
    at: datetime | None = None,
    timezone: ZoneInfo | None = None,
) -> list[TeacherStatusView]:
    """List current status views for all registered teacher profiles."""
    profiles = (
        (await session.execute(select(TeacherProfile).order_by(TeacherProfile.public_name.asc())))
        .scalars()
        .all()
    )
    views: list[TeacherStatusView] = []
    for p in profiles:
        views.append(await get_teacher_status_for_student(session, p.user_id, at=at, timezone=timezone))
    return views


async def book_teacher_appointment(
    session: AsyncSession,
    *,
    teacher_user_id: uuid.UUID,
    student_user_id: uuid.UUID,
    starts_at: datetime,
    ends_at: datetime,
    purpose: str | None = None,
    timezone: ZoneInfo | None = None,
    now: datetime | None = None,
) -> booking_service.BookingResult:
    """Book an office-hours appointment slot with a teacher via the booking engine."""
    tz = timezone or ZoneInfo("Asia/Tashkent")
    profile = await session.get(TeacherProfile, teacher_user_id)
    if profile is None:
        raise NotFoundError(
            f"Teacher profile {teacher_user_id} does not exist.",
            code="teacher_not_found",
        )
    if profile.visibility_mode is TeacherVisibilityMode.off:
        raise ForbiddenError(
            "This teacher has not enabled office-hours appointment booking.",
            code="teacher_visibility_off",
        )
    if profile.appointment_resource_id is None:
        raise ValidationError(
            "This teacher does not have an appointment resource configured.",
            code="no_appointment_resource",
        )

    return await booking_service.create_booking(
        session,
        booking_service.BookingRequest(
            resource_id=profile.appointment_resource_id,
            slot=Slot(starts_at, ends_at),
            user_id=student_user_id,
            purpose=purpose or f"Office hours appointment with {profile.public_name}",
            attendee_count=1,
        ),
        timezone=tz,
        now=now,
    )
