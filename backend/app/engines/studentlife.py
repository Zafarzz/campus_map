"""Layer 2: Student Life pure engine (brief section 12).

Covers:
1. **Study-group matcher** (section 12.1, opt-in):
   * Server-side free-window computation from a student's busy intervals without
     ever exposing the busy intervals to other students.
   * Pairwise compatibility scoring by overlapping free minutes, shared course or
     topic tag, and preferred building proximity.
   * Maximum-weight matching via :func:`scipy.optimize.linear_sum_assignment`
     for pairs, followed by greedy cluster expansion for groups of size 3..8.
2. **Lost and found matcher & privacy scrubber** (section 12.2):
   * Hybrid similarity combining ``scikit-learn`` TF-IDF cosine similarity,
     ``rapidfuzz`` token-set ratio, category match, time-window proximity, and
     spatial distance.
   * Automatic masking of sensitive ID-card / passport / card number sequences
     in item descriptions.
3. **Teacher finder visibility rules** (section 12.4):
   * Default ``off``. Students see current status only, never a history.

Nothing in this module performs database or network I/O.
"""

from __future__ import annotations

import math
import re
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, time, timedelta

import numpy as np
from rapidfuzz import fuzz
from scipy.optimize import linear_sum_assignment
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from app.domain.base import LostFoundKind, TeacherVisibilityMode
from app.engines.crowds import building_distance_m

__all__ = [
    "LostFoundCandidate",
    "LostFoundMatch",
    "StudyCandidate",
    "StudyGroupMatchProposal",
    "TeacherStatusView",
    "TimeWindow",
    "compute_free_windows",
    "intersect_windows",
    "mask_sensitive_text",
    "match_lost_found",
    "match_study_groups",
    "resolve_teacher_status",
    "score_study_pair",
]


# ---------------------------------------------------------------------------
# 12.1 Study-group matcher (opt-in)
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class TimeWindow:
    """Half-open UTC interval ``[starts_at, ends_at)``."""

    starts_at: datetime
    ends_at: datetime

    def __post_init__(self) -> None:
        if self.starts_at.tzinfo is None or self.ends_at.tzinfo is None:
            raise ValueError("TimeWindow endpoints must be timezone-aware")
        if self.ends_at <= self.starts_at:
            raise ValueError("TimeWindow ends_at must be strictly after starts_at")

    @property
    def duration_minutes(self) -> float:
        return (self.ends_at - self.starts_at).total_seconds() / 60.0


def compute_free_windows(
    outer_window: TimeWindow,
    busy_intervals: Sequence[tuple[datetime, datetime]],
    *,
    min_duration_minutes: int = 30,
) -> tuple[TimeWindow, ...]:
    """Subtract a student's busy intervals from ``outer_window``.

    Used on the server so other students only ever learn that a matched slot is
    ``"available"``, never which classes or bookings made the rest of the day
    busy (brief section 12.1).
    """
    clipped: list[tuple[datetime, datetime]] = []
    for b_start, b_end in busy_intervals:
        if b_end <= outer_window.starts_at or b_start >= outer_window.ends_at:
            continue
        s = max(outer_window.starts_at, b_start)
        e = min(outer_window.ends_at, b_end)
        if e > s:
            clipped.append((s, e))

    clipped.sort(key=lambda item: (item[0], item[1]))
    merged: list[tuple[datetime, datetime]] = []
    for s, e in clipped:
        if not merged or s > merged[-1][1]:
            merged.append((s, e))
        else:
            merged[-1] = (merged[-1][0], max(merged[-1][1], e))

    free: list[TimeWindow] = []
    cursor = outer_window.starts_at
    for b_start, b_end in merged:
        if b_start > cursor:
            candidate = TimeWindow(cursor, b_start)
            if candidate.duration_minutes >= min_duration_minutes:
                free.append(candidate)
        cursor = max(cursor, b_end)

    if cursor < outer_window.ends_at:
        candidate = TimeWindow(cursor, outer_window.ends_at)
        if candidate.duration_minutes >= min_duration_minutes:
            free.append(candidate)

    return tuple(free)


def intersect_windows(
    windows_a: Sequence[TimeWindow],
    windows_b: Sequence[TimeWindow],
    *,
    min_duration_minutes: int = 30,
) -> tuple[TimeWindow, ...]:
    """Return all overlapping sub-windows of at least ``min_duration_minutes``."""
    overlaps: list[TimeWindow] = []
    for wa in windows_a:
        for wb in windows_b:
            s = max(wa.starts_at, wb.starts_at)
            e = min(wa.ends_at, wb.ends_at)
            if e > s:
                w = TimeWindow(s, e)
                if w.duration_minutes >= min_duration_minutes:
                    overlaps.append(w)
    return tuple(overlaps)


@dataclass(frozen=True, slots=True)
class StudyCandidate:
    """One opt-in student's study-group request and precomputed free windows."""

    request_id: uuid.UUID
    user_id: uuid.UUID
    course_id: uuid.UUID | None
    topic_tag: str
    wanted_group_size: int
    min_duration_minutes: int
    preferred_building_id: str | None
    free_windows: tuple[TimeWindow, ...]


@dataclass(frozen=True, slots=True)
class StudyGroupMatchProposal:
    """A proposed study group with its common free window and match score."""

    member_request_ids: tuple[uuid.UUID, ...]
    member_user_ids: tuple[uuid.UUID, ...]
    topic_tag: str
    course_id: uuid.UUID | None
    starts_at: datetime
    ends_at: datetime
    preferred_building_id: str | None
    score: float


def _topic_similarity(tag_a: str, tag_b: str) -> float:
    na = tag_a.strip().lower()
    nb = tag_b.strip().lower()
    if not na or not nb:
        return 0.0
    if na == nb:
        return 1.0
    ratio = float(fuzz.token_set_ratio(na, nb)) / 100.0
    return ratio if ratio >= 0.65 else 0.0


def score_study_pair(
    a: StudyCandidate,
    b: StudyCandidate,
) -> tuple[float, TimeWindow | None]:
    """Score compatibility of two study candidates and pick their best common slot.

    Returns ``(0.0, None)`` when the two candidates are for the same user, have
    incompatible courses/topics, or have no overlapping free window of at least
    ``max(a.min_duration_minutes, b.min_duration_minutes)``.
    """
    if a.user_id == b.user_id:
        return 0.0, None

    same_course = a.course_id is not None and a.course_id == b.course_id
    topic_sim = _topic_similarity(a.topic_tag, b.topic_tag)
    if not same_course and topic_sim <= 0.0:
        return 0.0, None

    req_minutes = max(a.min_duration_minutes, b.min_duration_minutes)
    common = intersect_windows(a.free_windows, b.free_windows, min_duration_minutes=req_minutes)
    if not common:
        return 0.0, None

    # Pick the longest overlapping window; trim to req_minutes..120 min for booking.
    best_win = max(common, key=lambda w: (w.duration_minutes, -w.starts_at.timestamp()))
    target_duration = min(best_win.duration_minutes, max(float(req_minutes), 90.0))
    slot = TimeWindow(
        starts_at=best_win.starts_at,
        ends_at=best_win.starts_at + timedelta(minutes=int(target_duration)),
    )

    overlap_score = min(1.0, best_win.duration_minutes / 120.0)
    subject_score = 1.0 if same_course else topic_sim * 0.85

    if a.preferred_building_id and b.preferred_building_id:
        dist = building_distance_m(a.preferred_building_id, b.preferred_building_id)
        proximity_score = math.exp(-dist / 150.0)
    else:
        proximity_score = 0.7

    total = 0.45 * subject_score + 0.35 * overlap_score + 0.20 * proximity_score
    return round(total, 4), slot


def match_study_groups(
    candidates: Sequence[StudyCandidate],
) -> list[StudyGroupMatchProposal]:
    """Form optimal study pairs via max-weight assignment and greedily fill larger groups.

    Uses :func:`scipy.optimize.linear_sum_assignment` on the symmetrised pair
    weight matrix to select a maximum-weight disjoint set of seed pairs, then
    greedily adds compatible remaining candidates when ``wanted_group_size > 2``
    (brief section 12.1).
    """
    n = len(candidates)
    if n < 2:
        return []

    score_matrix = np.zeros((n, n), dtype=np.float64)
    slot_matrix: dict[tuple[int, int], TimeWindow] = {}

    for i in range(n):
        for j in range(i + 1, n):
            score, slot = score_study_pair(candidates[i], candidates[j])
            if score > 0 and slot is not None:
                score_matrix[i, j] = score
                score_matrix[j, i] = score
                slot_matrix[(i, j)] = slot
                slot_matrix[(j, i)] = slot

    # Solve maximum-weight assignment on the upper-triangle / bipartite relaxation
    # and extract highest-weight disjoint pairs.
    row_ind, col_ind = linear_sum_assignment(-score_matrix)
    assigned_pairs: list[tuple[float, int, int]] = []
    seen_edges: set[tuple[int, int]] = set()
    for r, c in zip(row_ind, col_ind, strict=False):
        if r == c or score_matrix[r, c] <= 0:
            continue
        edge = (min(int(r), int(c)), max(int(r), int(c)))
        if edge not in seen_edges:
            seen_edges.add(edge)
            assigned_pairs.append((float(score_matrix[r, c]), edge[0], edge[1]))

    # Also include any positive-weight edges not picked if endpoints remain free,
    # ordered by weight descending.
    for i in range(n):
        for j in range(i + 1, n):
            if score_matrix[i, j] > 0 and (i, j) not in seen_edges:
                assigned_pairs.append((float(score_matrix[i, j]), i, j))

    assigned_pairs.sort(key=lambda item: (-item[0], item[1], item[2]))

    used: set[int] = set()
    proposals: list[StudyGroupMatchProposal] = []

    for pair_score, i, j in assigned_pairs:
        if i in used or j in used:
            continue
        seed_slot = slot_matrix.get((i, j))
        if seed_slot is None:
            continue

        used.add(i)
        used.add(j)
        group_indices = [i, j]
        current_windows: tuple[TimeWindow, ...] = intersect_windows(
            candidates[i].free_windows,
            candidates[j].free_windows,
            min_duration_minutes=max(
                candidates[i].min_duration_minutes,
                candidates[j].min_duration_minutes,
            ),
        )
        max_size = min(candidates[i].wanted_group_size, candidates[j].wanted_group_size)
        req_minutes = max(candidates[i].min_duration_minutes, candidates[j].min_duration_minutes)

        # Greedily add extra members if the pair wants a larger group (3..8).
        if max_size > 2:
            remaining = [
                k
                for k in range(n)
                if k not in used
                and candidates[k].wanted_group_size >= len(group_indices) + 1
                and score_matrix[i, k] > 0
                and score_matrix[j, k] > 0
            ]
            remaining.sort(key=lambda k: -(score_matrix[i, k] + score_matrix[j, k]) / 2.0)
            for k in remaining:
                if len(group_indices) >= max_size:
                    break
                new_req = max(req_minutes, candidates[k].min_duration_minutes)
                next_windows = intersect_windows(
                    current_windows,
                    candidates[k].free_windows,
                    min_duration_minutes=new_req,
                )
                if next_windows:
                    group_indices.append(k)
                    used.add(k)
                    current_windows = next_windows
                    req_minutes = new_req
                    max_size = min(max_size, candidates[k].wanted_group_size)

        best_win = max(
            current_windows,
            key=lambda w: (w.duration_minutes, -w.starts_at.timestamp()),
        )
        duration = min(best_win.duration_minutes, max(float(req_minutes), 90.0))
        final_start = best_win.starts_at
        final_end = final_start + timedelta(minutes=int(duration))

        members = [candidates[idx] for idx in group_indices]
        pref_bld = next(
            (m.preferred_building_id for m in members if m.preferred_building_id),
            None,
        )
        course_id = next((m.course_id for m in members if m.course_id is not None), None)

        proposals.append(
            StudyGroupMatchProposal(
                member_request_ids=tuple(m.request_id for m in members),
                member_user_ids=tuple(m.user_id for m in members),
                topic_tag=members[0].topic_tag,
                course_id=course_id,
                starts_at=final_start,
                ends_at=final_end,
                preferred_building_id=pref_bld,
                score=round(pair_score, 4),
            )
        )

    return proposals


# ---------------------------------------------------------------------------
# 12.2 Lost and found matcher & privacy text masking
# ---------------------------------------------------------------------------

#: Patterns that look like student ID numbers, passport numbers, or payment cards.
_SENSITIVE_ID_PATTERNS: tuple[re.Pattern[str], ...] = (
    # Payment card / long digit runs (8 to 19 digits, optionally separated by spaces/hyphens)
    re.compile(r"\b(?:\d[ -]*?){8,19}\b"),
    # Passport / national ID style: 2 uppercase letters followed by 6-9 digits (e.g. AA1234567)
    re.compile(r"\b[A-Z]{2}\s?\d{6,9}\b"),
    # Student ID style: U/A/S followed by 6-8 digits (e.g. U2210045)
    re.compile(r"\b[UAS]\d{6,8}\b", re.IGNORECASE),
)


def mask_sensitive_text(text: str) -> str:
    """Mask ID-card, passport, or payment card numbers in free-text descriptions."""
    masked = text
    for pattern in _SENSITIVE_ID_PATTERNS:
        masked = pattern.sub("[REDACTED-ID]", masked)
    return masked


@dataclass(frozen=True, slots=True)
class LostFoundCandidate:
    """An open lost or found item considered for matching."""

    id: uuid.UUID
    kind: LostFoundKind
    category: str
    title: str
    description: str
    building_id: str | None
    pin_x_m: float | None
    pin_z_m: float | None
    occurred_at: datetime


@dataclass(frozen=True, slots=True)
class LostFoundMatch:
    """Ranked match between a lost item and a found item."""

    candidate_id: uuid.UUID
    score: float
    text_similarity: float
    category_match: bool
    time_proximity: float
    spatial_proximity: float


def match_lost_found(
    query: LostFoundCandidate,
    pool: Sequence[LostFoundCandidate],
    *,
    min_score: float = 0.25,
    limit: int = 10,
) -> list[LostFoundMatch]:
    """Rank opposite-kind items (`lost` vs `found`) by hybrid text + space + time similarity.

    Uses ``scikit-learn`` :class:`TfidfVectorizer` cosine similarity combined
    with ``rapidfuzz`` token-set ratio for short/multilingual descriptions,
    category agreement, temporal closeness (within 14 days), and campus
    building/pin proximity (brief section 12.2).
    """
    opposite = [item for item in pool if item.id != query.id and item.kind != query.kind]
    if not opposite:
        return []

    query_text = f"{query.category} {query.title} {query.description}".strip().lower()
    corpus = [query_text] + [
        f"{item.category} {item.title} {item.description}".strip().lower() for item in opposite
    ]

    try:
        vectorizer = TfidfVectorizer(ngram_range=(1, 2), min_df=1)
        tfidf_matrix = vectorizer.fit_transform(corpus)
        cos_scores = cosine_similarity(tfidf_matrix[0:1], tfidf_matrix[1:]).flatten()
    except ValueError:
        cos_scores = np.zeros(len(opposite), dtype=np.float64)

    matches: list[LostFoundMatch] = []
    q_cat = query.category.strip().lower()

    for idx, cand in enumerate(opposite):
        c_cat = cand.category.strip().lower()
        cat_match = q_cat == c_cat

        tfidf_sim = float(cos_scores[idx]) if idx < len(cos_scores) else 0.0
        fuzzy_sim = (
            float(
                fuzz.token_set_ratio(
                    f"{query.title} {query.description}",
                    f"{cand.title} {cand.description}",
                )
            )
            / 100.0
        )
        text_sim = 0.55 * tfidf_sim + 0.45 * fuzzy_sim

        # Time proximity: exponential decay with a 7-day scale; a found item
        # that occurred more than 24h *before* the item was lost is penalised.
        delta_hours = (cand.occurred_at - query.occurred_at).total_seconds() / 3600.0
        if (query.kind is LostFoundKind.lost and delta_hours < -24.0) or (
            query.kind is LostFoundKind.found and delta_hours > 24.0
        ):
            time_prox = math.exp(-abs(delta_hours) / 48.0) * 0.3
        else:
            time_prox = math.exp(-abs(delta_hours) / (7.0 * 24.0))

        # Spatial proximity: pin coordinates if both present, else building centroids.
        if (
            query.pin_x_m is not None
            and query.pin_z_m is not None
            and cand.pin_x_m is not None
            and cand.pin_z_m is not None
        ):
            dist_m = math.hypot(query.pin_x_m - cand.pin_x_m, query.pin_z_m - cand.pin_z_m)
            spatial_prox = math.exp(-dist_m / 120.0)
        elif query.building_id and cand.building_id:
            dist_m = building_distance_m(query.building_id, cand.building_id)
            spatial_prox = math.exp(-dist_m / 120.0)
        else:
            spatial_prox = 0.5

        cat_score = 1.0 if cat_match else 0.15
        total_score = 0.45 * text_sim + 0.25 * cat_score + 0.15 * time_prox + 0.15 * spatial_prox
        if total_score >= min_score:
            matches.append(
                LostFoundMatch(
                    candidate_id=cand.id,
                    score=round(total_score, 4),
                    text_similarity=round(text_sim, 4),
                    category_match=cat_match,
                    time_proximity=round(time_prox, 4),
                    spatial_proximity=round(spatial_prox, 4),
                )
            )

    matches.sort(key=lambda m: (-m.score, str(m.candidate_id)))
    return matches[:limit]


# ---------------------------------------------------------------------------
# 12.4 Teacher finder visibility resolver
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class TeacherStatusView:
    """Privacy-safe current status of a teacher shown to students (section 12.4)."""

    user_id: uuid.UUID
    public_name: str
    department: str | None
    visibility_mode: TeacherVisibilityMode
    status: str  # "hidden" | "office_hours" | "in_class_now" | "in_office" | "away" | "back_at" | "available"
    status_label: str
    office_room_id: str | None
    current_room_id: str | None
    office_hours: list[dict[str, object]]
    manual_note: str | None
    manual_until: datetime | None
    appointment_resource_id: uuid.UUID | None


def resolve_teacher_status(
    *,
    user_id: uuid.UUID,
    public_name: str,
    department: str | None,
    visibility_mode: TeacherVisibilityMode,
    office_room_id: str | None,
    office_hours: Sequence[dict[str, object]] | None,
    manual_status: str | None,
    manual_note: str | None,
    manual_until: datetime | None,
    active_class_room_id: str | None,
    appointment_resource_id: uuid.UUID | None,
    now_local_weekday: int,
    now_local_time: time,
) -> TeacherStatusView:
    """Compute what a student is allowed to see about a teacher right now.

    * ``visibility_mode == off`` (the default): hides location, office hours,
      and timetable status.
    * ``visibility_mode == office_hours_only``: exposes published office hours
      and office room, never live timetable room or manual status.
    * ``visibility_mode == timetable_status``: exposes office hours plus
      ``"in_class_now"`` when a scheduled lesson is currently running.
    * ``visibility_mode == manual_status``: exposes the teacher's explicit
      status (`in_office`, `away`, `back_at`), falling back to timetable/office
      hours.
    """
    clean_hours = [dict(h) for h in (office_hours or ())]

    if visibility_mode is TeacherVisibilityMode.off:
        return TeacherStatusView(
            user_id=user_id,
            public_name=public_name,
            department=department,
            visibility_mode=visibility_mode,
            status="hidden",
            status_label="Visibility is off",
            office_room_id=None,
            current_room_id=None,
            office_hours=[],
            manual_note=None,
            manual_until=None,
            appointment_resource_id=None,
        )

    in_office_hours_now = False
    for slot in clean_hours:
        try:
            raw_wd = slot.get("weekday", -1)
            wd = int(raw_wd) if isinstance(raw_wd, (int, str)) else -1
            s_str = str(slot.get("starts_at", ""))
            e_str = str(slot.get("ends_at", ""))
            s_t = time.fromisoformat(s_str)
            e_t = time.fromisoformat(e_str)
            if wd == now_local_weekday and s_t <= now_local_time < e_t:
                in_office_hours_now = True
                break
        except (ValueError, TypeError):
            continue

    if visibility_mode is TeacherVisibilityMode.office_hours_only:
        status = "office_hours" if in_office_hours_now else "available"
        label = "In scheduled office hours" if in_office_hours_now else "Office hours published"
        return TeacherStatusView(
            user_id=user_id,
            public_name=public_name,
            department=department,
            visibility_mode=visibility_mode,
            status=status,
            status_label=label,
            office_room_id=office_room_id,
            current_room_id=office_room_id if in_office_hours_now else None,
            office_hours=clean_hours,
            manual_note=None,
            manual_until=None,
            appointment_resource_id=appointment_resource_id,
        )

    if visibility_mode is TeacherVisibilityMode.timetable_status:
        if active_class_room_id is not None:
            return TeacherStatusView(
                user_id=user_id,
                public_name=public_name,
                department=department,
                visibility_mode=visibility_mode,
                status="in_class_now",
                status_label=f"In class now ({active_class_room_id})",
                office_room_id=office_room_id,
                current_room_id=active_class_room_id,
                office_hours=clean_hours,
                manual_note=None,
                manual_until=None,
                appointment_resource_id=appointment_resource_id,
            )
        status = "office_hours" if in_office_hours_now else "available"
        label = "In scheduled office hours" if in_office_hours_now else "Not in class right now"
        return TeacherStatusView(
            user_id=user_id,
            public_name=public_name,
            department=department,
            visibility_mode=visibility_mode,
            status=status,
            status_label=label,
            office_room_id=office_room_id,
            current_room_id=office_room_id if in_office_hours_now else None,
            office_hours=clean_hours,
            manual_note=None,
            manual_until=None,
            appointment_resource_id=appointment_resource_id,
        )

    # manual_status mode
    eff_manual = manual_status or ("office_hours" if in_office_hours_now else "available")
    current_room = office_room_id if eff_manual in {"in_office", "office_hours"} else active_class_room_id
    label_map = {
        "in_office": "In office",
        "away": "Away",
        "back_at": f"Back at {manual_until.strftime('%H:%M')}" if manual_until else "Back later",
        "office_hours": "In scheduled office hours",
        "available": "Available",
    }
    return TeacherStatusView(
        user_id=user_id,
        public_name=public_name,
        department=department,
        visibility_mode=visibility_mode,
        status=eff_manual,
        status_label=manual_note or label_map.get(eff_manual, eff_manual),
        office_room_id=office_room_id,
        current_room_id=current_room,
        office_hours=clean_hours,
        manual_note=manual_note,
        manual_until=manual_until,
        appointment_resource_id=appointment_resource_id,
    )
