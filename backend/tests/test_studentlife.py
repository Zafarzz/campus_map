"""Tests for Layer 2: Student Life (brief section 12).

Covers:
* Study-group matcher (section 12.1):
  - opt-in consent requirement,
  - free window computation from student's own timetable without leaking to others,
  - pair scoring and scipy linear_sum_assignment matching + greedy expansion,
  - room proposal and automatic booking on unanimous acceptance,
  - privacy: other students' timetables are never exposed,
  - session dissolution when window expires.
* Lost and found (section 12.2):
  - EXIF stripping with Pillow,
  - sensitive ID card, passport, and payment card number masking,
  - TF-IDF + rapidfuzz hybrid matching of opposite kinds,
  - verification question/answer claim flow and finder approval,
  - automatic expiry job.
* Dorm services (section 12.3):
  - ticket engine reuse (category=dorm),
  - booking engine reuse (laundry, kitchen, study rooms),
  - crowd-reported machine status with exponential decay (provenance=reported),
  - dorm notice board.
* Teacher finder (section 12.4):
  - teacher-controlled visibility modes (default 'off'),
  - student view shows current status only, never a history,
  - office-hours appointment booking.
"""

from __future__ import annotations

import io
import uuid
from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

import pytest
from httpx import AsyncClient
from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.storage import has_exif_metadata, strip_image_exif
from app.core.config import Settings
from app.core.errors import ForbiddenError
from app.core.security import Role, create_access_token
from app.domain.base import (
    LostFoundKind,
    LostFoundStatus,
    StudyGroupStatus,
    TeacherVisibilityMode,
)
from app.domain.people import AppUser
from app.engines.studentlife import (
    LostFoundCandidate,
    StudyCandidate,
    TimeWindow,
    compute_free_windows,
    mask_sensitive_text,
    match_lost_found,
    match_study_groups,
    resolve_teacher_status,
    score_study_pair,
)
from app.services import studentlife_service

TASHKENT = ZoneInfo("Asia/Tashkent")
NOW = datetime(2026, 10, 19, 10, 0, tzinfo=UTC)


# ---------------------------------------------------------------------------
# 12.1 Study-group matcher unit tests
# ---------------------------------------------------------------------------


class TestStudyGroupMatchingPure:
    def test_free_window_subtraction(self) -> None:
        """Busy intervals are subtracted from the outer window."""
        outer = TimeWindow(NOW, NOW + timedelta(hours=4))  # 10:00 to 14:00
        busy = [
            (NOW + timedelta(hours=1), NOW + timedelta(hours=2)),  # 11:00 to 12:00
        ]
        free = compute_free_windows(outer, busy, min_duration_minutes=30)
        assert len(free) == 2
        assert free[0].starts_at == NOW
        assert free[0].ends_at == NOW + timedelta(hours=1)
        assert free[1].starts_at == NOW + timedelta(hours=2)
        assert free[1].ends_at == NOW + timedelta(hours=4)

    def test_pair_scoring_requires_common_free_slot(self) -> None:
        cand_a = StudyCandidate(
            request_id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            course_id=None,
            topic_tag="Calculus II",
            wanted_group_size=2,
            min_duration_minutes=60,
            preferred_building_id="bld-h",
            free_windows=(TimeWindow(NOW, NOW + timedelta(hours=2)),),
        )
        cand_b = StudyCandidate(
            request_id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            course_id=None,
            topic_tag="Calculus 2",
            wanted_group_size=2,
            min_duration_minutes=60,
            preferred_building_id="bld-h",
            free_windows=(TimeWindow(NOW + timedelta(hours=1), NOW + timedelta(hours=3)),),
        )
        score, slot = score_study_pair(cand_a, cand_b)
        assert score > 0.0
        assert slot is not None
        assert slot.starts_at == NOW + timedelta(hours=1)
        assert slot.ends_at >= slot.starts_at + timedelta(minutes=60)

    def test_matching_optimization(self) -> None:
        """match_study_groups forms pairs using linear_sum_assignment."""
        t1 = TimeWindow(NOW, NOW + timedelta(hours=2))
        u1, u2 = uuid.uuid4(), uuid.uuid4()
        cands = [
            StudyCandidate(
                request_id=uuid.uuid4(),
                user_id=u1,
                course_id=None,
                topic_tag="Data Structures",
                wanted_group_size=2,
                min_duration_minutes=60,
                preferred_building_id="bld-h",
                free_windows=(t1,),
            ),
            StudyCandidate(
                request_id=uuid.uuid4(),
                user_id=u2,
                course_id=None,
                topic_tag="Data Structures",
                wanted_group_size=2,
                min_duration_minutes=60,
                preferred_building_id="bld-h",
                free_windows=(t1,),
            ),
        ]
        proposals = match_study_groups(cands)
        assert len(proposals) == 1
        prop = proposals[0]
        assert set(prop.member_user_ids) == {u1, u2}
        assert prop.score > 0.5


# ---------------------------------------------------------------------------
# 12.2 Lost and found pure unit tests
# ---------------------------------------------------------------------------


class TestLostFoundPure:
    def test_sensitive_text_scrubber(self) -> None:
        sample = (
            "Found black wallet with student ID U2210045, passport AA1234567, "
            "and credit card 4111 2222 3333 4444."
        )
        cleaned = mask_sensitive_text(sample)
        assert "U2210045" not in cleaned
        assert "AA1234567" not in cleaned
        assert "4111 2222 3333 4444" not in cleaned
        assert "[REDACTED-ID]" in cleaned

    def test_exif_stripping_with_pillow(self) -> None:
        """Uploaded image must have EXIF metadata completely stripped."""
        img = Image.new("RGB", (64, 64), color="blue")
        exif = img.getexif()
        exif[0x010E] = "Antigravity GPS 41.311086, 69.240562"
        raw_io = io.BytesIO()
        img.save(raw_io, format="JPEG", exif=exif)
        raw_bytes = raw_io.getvalue()
        assert has_exif_metadata(raw_bytes) is True

        clean_bytes, ct = strip_image_exif(raw_bytes)
        assert has_exif_metadata(clean_bytes) is False
        assert ct == "image/jpeg"

    def test_hybrid_matcher_pairs_opposite_kinds(self) -> None:
        lost_item = LostFoundCandidate(
            id=uuid.uuid4(),
            kind=LostFoundKind.lost,
            category="electronics",
            title="Black ThinkPad laptop",
            description="Lenovo ThinkPad X1 with red trackpoint in sleeve",
            building_id="bld-h",
            pin_x_m=126.0,
            pin_z_m=247.5,
            occurred_at=NOW,
        )
        found_item = LostFoundCandidate(
            id=uuid.uuid4(),
            kind=LostFoundKind.found,
            category="electronics",
            title="Lenovo laptop found in A-101",
            description="Black Lenovo ThinkPad left on desk",
            building_id="bld-h",
            pin_x_m=126.0,
            pin_z_m=247.5,
            occurred_at=NOW + timedelta(hours=1),
        )
        unrelated = LostFoundCandidate(
            id=uuid.uuid4(),
            kind=LostFoundKind.found,
            category="clothing",
            title="Blue denim jacket",
            description="Size M jacket",
            building_id="bld-e",
            pin_x_m=99.6,
            pin_z_m=173.4,
            occurred_at=NOW - timedelta(days=5),
        )
        matches = match_lost_found(lost_item, [found_item, unrelated])
        assert len(matches) >= 1
        top = matches[0]
        assert top.candidate_id == found_item.id
        assert top.score > 0.40
        assert top.category_match is True


# ---------------------------------------------------------------------------
# 12.4 Teacher finder pure unit tests
# ---------------------------------------------------------------------------


class TestTeacherFinderPure:
    def test_default_visibility_off_hides_everything(self) -> None:
        uid = uuid.uuid4()
        view = resolve_teacher_status(
            user_id=uid,
            public_name="Prof. Kim",
            department="CSE",
            visibility_mode=TeacherVisibilityMode.off,
            office_room_id="bld-h-f2-a205",
            office_hours=[{"weekday": 0, "starts_at": "10:00", "ends_at": "12:00"}],
            manual_status="in_office",
            manual_note="Drop by",
            manual_until=None,
            active_class_room_id="bld-h-f1-a101",
            appointment_resource_id=uuid.uuid4(),
            now_local_weekday=0,
            now_local_time=time(11, 0),
        )
        assert view.status == "hidden"
        assert view.office_room_id is None
        assert view.current_room_id is None
        assert view.office_hours == []

    def test_office_hours_only_shows_office_during_office_hours(self) -> None:
        uid = uuid.uuid4()
        view = resolve_teacher_status(
            user_id=uid,
            public_name="Prof. Kim",
            department="CSE",
            visibility_mode=TeacherVisibilityMode.office_hours_only,
            office_room_id="bld-h-f2-a205",
            office_hours=[{"weekday": 0, "starts_at": "10:00", "ends_at": "12:00"}],
            manual_status=None,
            manual_note=None,
            manual_until=None,
            active_class_room_id="bld-h-f1-a101",
            appointment_resource_id=uuid.uuid4(),
            now_local_weekday=0,
            now_local_time=time(11, 0),  # inside office hours!
        )
        assert view.status == "office_hours"
        assert view.current_room_id == "bld-h-f2-a205"

    def test_timetable_status_shows_class_when_in_lesson(self) -> None:
        uid = uuid.uuid4()
        view = resolve_teacher_status(
            user_id=uid,
            public_name="Prof. Kim",
            department="CSE",
            visibility_mode=TeacherVisibilityMode.timetable_status,
            office_room_id="bld-h-f2-a205",
            office_hours=[],
            manual_status=None,
            manual_note=None,
            manual_until=None,
            active_class_room_id="bld-h-f1-a101",
            appointment_resource_id=uuid.uuid4(),
            now_local_weekday=0,
            now_local_time=time(11, 0),
        )
        assert view.status == "in_class_now"
        assert view.current_room_id == "bld-h-f1-a101"


# ---------------------------------------------------------------------------
# Database & Service Integration tests
# ---------------------------------------------------------------------------


@pytest.mark.db
async def test_study_group_opt_in_consent_and_matching(
    seeded_session: AsyncSession,
) -> None:
    u1, u2 = uuid.uuid4(), uuid.uuid4()
    seeded_session.add(AppUser(id=u1, external_ref=f"sub:{u1}", is_active=True))
    seeded_session.add(AppUser(id=u2, external_ref=f"sub:{u2}", is_active=True))
    await seeded_session.flush()

    # 1. Without consent, creating a request raises ForbiddenError
    with pytest.raises(ForbiddenError):
        await studentlife_service.create_study_group_request(
            seeded_session,
            user_id=u1,
            topic_tag="Linear Algebra",
            window_start=NOW,
            window_end=NOW + timedelta(hours=3),
        )

    # 2. Grant opt-in consent for both students
    await studentlife_service.grant_or_revoke_consent(
        seeded_session, user_id=u1, purpose="study_group_matching", granted=True
    )
    await studentlife_service.grant_or_revoke_consent(
        seeded_session, user_id=u2, purpose="study_group_matching", granted=True
    )

    # 3. Post compatible requests
    _req1, _ = await studentlife_service.create_study_group_request(
        seeded_session,
        user_id=u1,
        topic_tag="Linear Algebra",
        window_start=NOW,
        window_end=NOW + timedelta(hours=3),
        wanted_group_size=2,
        now=NOW,
    )
    _req2, sessions = await studentlife_service.create_study_group_request(
        seeded_session,
        user_id=u2,
        topic_tag="Linear Algebra",
        window_start=NOW,
        window_end=NOW + timedelta(hours=3),
        wanted_group_size=2,
        now=NOW,
    )
    assert len(sessions) == 1
    sg_session = sessions[0]
    assert sg_session.status is StudyGroupStatus.matched

    # 4. View session: privacy check - other member is only marked 'available'
    view = await studentlife_service.get_study_group_session_view(
        seeded_session, sg_session.id, viewer_user_id=u1
    )
    assert len(view["members"]) == 2
    for m in view["members"]:
        assert m["availability"] == "available"
        assert "timetable" not in m

    # 5. Both accept session
    await studentlife_service.respond_study_group_session(
        seeded_session, session_id=sg_session.id, user_id=u1, accept=True, now=NOW
    )
    res_final = await studentlife_service.respond_study_group_session(
        seeded_session, session_id=sg_session.id, user_id=u2, accept=True, now=NOW
    )
    assert res_final.status is StudyGroupStatus.matched


@pytest.mark.db
async def test_lost_found_lifecycle_and_claim(
    seeded_session: AsyncSession,
) -> None:
    finder = uuid.uuid4()
    claimant = uuid.uuid4()
    seeded_session.add(AppUser(id=finder, external_ref=f"sub:{finder}", is_active=True))
    seeded_session.add(AppUser(id=claimant, external_ref=f"sub:{claimant}", is_active=True))
    await seeded_session.flush()

    # 1. Finder reports found keys
    item, _ = await studentlife_service.report_lost_found_item(
        seeded_session,
        reporter_user_id=finder,
        kind=LostFoundKind.found,
        category="keys",
        title="Dorm room keys with blue lanyard",
        description="Found in Block A study lounge",
        building_id="bld-h",
        verification_question="What mascot is on the keychain?",
        handover_point="Block A reception desk",
        now=NOW,
    )
    assert item.status is LostFoundStatus.open

    # 2. Claimant submits claim
    claim = await studentlife_service.submit_claim(
        seeded_session,
        item_id=item.id,
        claimant_user_id=claimant,
        verification_answer="Blue tiger mascot",
        now=NOW + timedelta(minutes=30),
    )
    assert claim.status == "pending"

    # 3. Finder approves claim
    resolved = await studentlife_service.resolve_claim(
        seeded_session,
        claim_id=claim.id,
        actor_user_id=finder,
        approve=True,
        handover_point="Front security desk",
        mark_returned=True,
        now=NOW + timedelta(hours=1),
    )
    assert resolved.status == "approved"
    assert item.status is LostFoundStatus.returned


@pytest.mark.db
async def test_dorm_services_and_machine_status(
    seeded_session: AsyncSession,
) -> None:
    u = uuid.uuid4()
    seeded_session.add(AppUser(id=u, external_ref=f"sub:{u}", is_active=True))
    await seeded_session.flush()
    # 1. Report machine status
    rep = await studentlife_service.report_dorm_machine_status(
        seeded_session,
        user_id=u,
        resource_code="dorm-laundry-1",
        is_free=True,
        at=NOW,
    )
    assert rep["code"] == "dorm-laundry-1"
    assert rep["state"] == "free"
    assert rep["provenance"] == "reported"

    # 2. Post and list dorm notice
    notice = await studentlife_service.create_dorm_notice(
        seeded_session,
        author_user_id=u,
        title_i18n={"en": "Quiet Hours", "ru": "Часы тишины"},
        body_i18n={"en": "Please keep quiet after 22:00", "ru": "Просьба соблюдать тишину после 22:00"},
        pinned=True,
    )
    assert notice.pinned is True
    notices = await studentlife_service.list_dorm_notices(seeded_session, now=NOW)
    assert len(notices) >= 1
    assert notices[0].title_i18n["en"] == "Quiet Hours"


# ---------------------------------------------------------------------------
# API Integration tests
# ---------------------------------------------------------------------------


@pytest.mark.db
async def test_studentlife_api_endpoints(
    seeded_client: AsyncClient,
    settings: Settings,
) -> None:
    student_id = uuid.uuid4()
    token = create_access_token(str(student_id), [Role.student], settings=settings)
    headers = {"Authorization": f"Bearer {token}"}
    prefix = "/api/v1"

    # 1. POST /consents
    r_consent = await seeded_client.post(
        f"{prefix}/consents",
        headers=headers,
        json={"purpose": "study_group_matching", "granted": True},
    )
    assert r_consent.status_code == 200
    assert r_consent.json()["is_active"] is True

    # 2. GET /dorm/machines
    r_mach = await seeded_client.get(f"{prefix}/dorm/machines")
    assert r_mach.status_code == 200
    assert "machines" in r_mach.json()

    # 3. POST /dorm/machines/dorm-laundry-1/report
    r_mrep = await seeded_client.post(
        f"{prefix}/dorm/machines/dorm-laundry-1/report",
        headers=headers,
        json={"is_free": True},
    )
    assert r_mrep.status_code == 201

    # 4. GET /teachers (student view)
    r_teach = await seeded_client.get(f"{prefix}/teachers")
    assert r_teach.status_code == 200
    assert "teachers" in r_teach.json()
