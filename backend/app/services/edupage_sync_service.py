"""Live synchronisation of the official EduPage timetable into PostgreSQL.

Queries the same unauthenticated JSON endpoints that ``https://aut.edupage.org/timetable/``
calls in the browser (ADR-0010):

1. ``ttviewer.js?__func=getTTViewerData`` -> discovers the currently active
   ``default_num`` (e.g. ``163`` during Mid-term Exams, ``154`` during regular
   teaching weeks).
2. ``regulartt.js?__func=regularttGetData`` -> fetches the complete period grid,
   classrooms, subjects, cohorts, teachers and weekly lesson cards.

Idempotent and self-healing:

* Unchanged upstream timetables (matching ``tt_num`` and SHA-256 content hash,
  with an active term window and zero leftover demo schedule rows) perform
  **zero** database writes.
* Whenever ``aut.edupage.org`` publishes a new timetable or switches
  ``default_num`` (for instance from exam schedule ``163`` back to regular
  semester schedule ``154``), the service purges any ``is_demo`` schedule rows,
  replaces the active EduPage term's rules via :func:`apply_import`, and records
  the new ``source_version`` on :class:`ImportBatch`.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any, cast
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import CursorResult, delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.logging import get_logger
from app.core.time import campus_date
from app.core.time import now as utc_now
from app.domain.academic import Course, ImportBatch, Meeting, MeetingRule, Section, Term
from app.domain.base import ImportStatus
from app.domain.booking import Resource, ResourceOccupancy
from app.domain.spatial import Building, Floor, Room
from app.engines.timetable.validate import IssueCode
from app.services import campus_service, import_service

log = get_logger(__name__)

__all__ = [
    "EDUPAGE_BATCH_SOURCE",
    "EDUPAGE_TERM_CODE",
    "EdupageSyncResult",
    "ensure_campus_room_resources",
    "fetch_active_edupage_payload",
    "purge_demo_schedule_data",
    "sync_edupage_timetable",
]

EDUPAGE_BATCH_SOURCE = "edupage:aut"
EDUPAGE_TERM_CODE = "AUT-EDUPAGE"
_GSH = "00000000"
_HTTP_TIMEOUT = httpx.Timeout(30.0)


@dataclass
class EdupageSyncResult:
    """Summary of one EduPage synchronisation check or import."""

    campus_id: str
    tt_num: str
    tt_title: str
    source_version: str
    changed: bool
    batch_id: uuid.UUID | None = None
    rules: int = 0
    meetings: int = 0
    occupancies: int = 0
    resources_created: int = 0
    demo_purged: dict[str, int] = field(default_factory=dict)

    def summary(self) -> str:
        status = "APPLIED" if self.changed else "UP-TO-DATE (no-op)"
        lines = [
            f"status     {status}",
            f"campus     {self.campus_id}",
            f"timetable  #{self.tt_num} ({self.tt_title or 'untitled'})",
            f"version    {self.source_version}",
        ]
        if self.changed:
            lines.append(
                f"imported   rules={self.rules}, meetings={self.meetings}, occupancies={self.occupancies}"
            )
        if any(self.demo_purged.values()):
            parts = ", ".join(f"{k}={v}" for k, v in sorted(self.demo_purged.items()) if v)
            lines.append(f"purged     demo({parts})")
        return "\n".join(lines)


async def _edupage_post(client: httpx.AsyncClient, path: str, args: list[Any]) -> dict[str, Any]:
    response = await client.post(path, json={"__args": args, "__gsh": _GSH})
    response.raise_for_status()
    payload: dict[str, Any] = response.json()
    if "r" not in payload:
        raise RuntimeError(f"unexpected EduPage response shape from {path}: {sorted(payload)}")
    return payload


def _candidate_academic_years() -> list[int]:
    current = utc_now()
    academic = current.year if current.month >= 8 else current.year - 1
    seen: list[int] = []
    for yr in (academic, current.year, current.year - 1):
        if yr not in seen:
            seen.append(yr)
    return seen


async def fetch_active_edupage_payload(
    base_url: str,
    *,
    tt_number: str | None = None,
) -> tuple[str, str, bytes]:
    """Fetch ``(tt_num, tt_title, raw_json_bytes)`` from EduPage."""
    explicit = (tt_number or "").strip()
    tt_title = ""

    async with httpx.AsyncClient(
        base_url=base_url.rstrip("/"),
        timeout=_HTTP_TIMEOUT,
        follow_redirects=True,
    ) as client:
        resolved_num = explicit
        for year in _candidate_academic_years():
            try:
                viewer = await _edupage_post(
                    client, "/timetable/server/ttviewer.js?__func=getTTViewerData", [None, year]
                )
            except Exception:
                if resolved_num:
                    break
                continue

            regular = viewer.get("r", {}).get("regular", {})
            timetables = [t for t in regular.get("timetables", []) if isinstance(t, dict)]

            if not resolved_num:
                default_num = str(regular.get("default_num") or "").strip()
                if default_num:
                    resolved_num = default_num
                else:
                    published = [t for t in timetables if not t.get("hidden") and t.get("tt_num")]
                    if published:
                        published.sort(key=lambda item: str(item.get("datefrom") or ""))
                        resolved_num = str(published[-1]["tt_num"]).strip()

            if resolved_num:
                for entry in timetables:
                    if str(entry.get("tt_num") or "").strip() == resolved_num:
                        tt_title = str(entry.get("text") or "").strip()
                        break
                break

        if not resolved_num:
            raise RuntimeError(f"could not determine active EduPage timetable number from {base_url}")

        payload = await _edupage_post(
            client, "/timetable/server/regulartt.js?__func=regularttGetData", [None, resolved_num]
        )

    canonical_bytes = json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")
    return resolved_num, tt_title, canonical_bytes


async def ensure_campus_room_resources(session: AsyncSession, campus_id: str) -> int:
    """Create bookable :class:`Resource` rows for any rooms missing one."""
    rooms_res = await session.execute(
        select(Room)
        .join(Floor, Floor.id == Room.floor_id)
        .join(Building, Building.id == Floor.building_id)
        .where(Building.campus_id == campus_id)
        .order_by(Room.id)
    )
    rooms = list(rooms_res.scalars().all())
    existing_res = await session.execute(
        select(Resource.room_id).where(Resource.campus_id == campus_id, Resource.room_id.is_not(None))
    )
    existing_room_ids = {room_id for (room_id,) in existing_res.all() if room_id}

    created = 0
    for room in rooms:
        if room.id in existing_room_ids:
            continue
        session.add(
            Resource(
                campus_id=campus_id,
                code=f"room:{room.id}",
                name=room.name or room.number,
                kind="room",
                room_id=room.id,
                capacity=room.capacity,
                is_bookable=room.room_kind.value != "office",
                is_demo=room.is_demo,
            )
        )
        created += 1

    if created:
        await session.flush()
    return created


async def purge_demo_schedule_data(session: AsyncSession, campus_id: str) -> dict[str, int]:
    """Remove all generated demo timetable rows so only real schedules remain."""
    occ = cast(
        "CursorResult[Any]",
        await session.execute(delete(ResourceOccupancy).where(ResourceOccupancy.is_demo.is_(True))),
    )
    mtg = cast(
        "CursorResult[Any]",
        await session.execute(delete(Meeting).where(Meeting.is_demo.is_(True))),
    )
    rules = cast(
        "CursorResult[Any]",
        await session.execute(delete(MeetingRule).where(MeetingRule.is_demo.is_(True))),
    )
    sec = cast(
        "CursorResult[Any]",
        await session.execute(delete(Section).where(Section.is_demo.is_(True))),
    )
    crs = cast(
        "CursorResult[Any]",
        await session.execute(
            delete(Course).where(Course.campus_id == campus_id, Course.is_demo.is_(True))
        ),
    )
    trm = cast(
        "CursorResult[Any]",
        await session.execute(
            delete(Term).where(Term.campus_id == campus_id, Term.is_demo.is_(True))
        ),
    )
    await session.flush()
    return {
        "occupancies": occ.rowcount or 0,
        "meetings": mtg.rowcount or 0,
        "rules": rules.rowcount or 0,
        "sections": sec.rowcount or 0,
        "courses": crs.rowcount or 0,
        "terms": trm.rowcount or 0,
    }


async def sync_edupage_timetable(
    session: AsyncSession,
    *,
    settings: Settings | None = None,
    tt_number: str | None = None,
    force: bool = False,
    payload_override: tuple[str, str, bytes] | None = None,
) -> EdupageSyncResult:
    """Fetch and apply the current EduPage timetable if new or changed."""
    cfg = settings or get_settings()
    campus = await campus_service.get_default_campus(session)
    timezone = ZoneInfo(campus.timezone)
    today = campus_date(utc_now(), timezone)

    if payload_override is not None:
        tt_num, tt_title, payload_bytes = payload_override
    else:
        tt_num, tt_title, payload_bytes = await fetch_active_edupage_payload(
            cfg.edupage_base_url,
            tt_number=tt_number or cfg.edupage_timetable_number or None,
        )

    digest = hashlib.sha256(payload_bytes).hexdigest()[:16]
    source_version = f"tt{tt_num}:{digest}"

    existing_term = (
        await session.execute(
            select(Term).where(Term.campus_id == campus.id, Term.code == EDUPAGE_TERM_CODE)
        )
    ).scalar_one_or_none()

    latest_batch = (
        await session.execute(
            select(ImportBatch)
            .where(
                ImportBatch.source == EDUPAGE_BATCH_SOURCE,
                ImportBatch.status == ImportStatus.applied,
            )
            .order_by(ImportBatch.applied_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    demo_count = int(
        await session.scalar(select(func.count(Meeting.id)).where(Meeting.is_demo.is_(True))) or 0
    )
    real_count = int(
        await session.scalar(select(func.count(Meeting.id)).where(Meeting.is_demo.is_(False))) or 0
    )

    window_healthy = (
        existing_term is not None
        and existing_term.is_current
        and existing_term.starts_on <= today - timedelta(days=7)
        and existing_term.ends_on >= today + timedelta(days=14)
    )

    if (
        not force
        and latest_batch is not None
        and latest_batch.source_version == source_version
        and window_healthy
        and demo_count == 0
        and real_count > 0
    ):
        return EdupageSyncResult(
            campus_id=campus.id,
            tt_num=tt_num,
            tt_title=tt_title,
            source_version=source_version,
            changed=False,
        )

    resources_created = await ensure_campus_room_resources(session, campus.id)
    purged = await purge_demo_schedule_data(session, campus.id)

    await session.execute(
        update(Term)
        .where(Term.campus_id == campus.id, Term.code != EDUPAGE_TERM_CODE)
        .values(is_current=False)
    )

    desired_start = today - timedelta(days=14)
    desired_end = today + timedelta(days=45)
    if existing_term is None:
        existing_term = Term(
            campus_id=campus.id,
            code=EDUPAGE_TERM_CODE,
            name=(tt_title or f"AUT EduPage Timetable #{tt_num}")[:200],
            starts_on=desired_start,
            ends_on=desired_end,
            is_current=True,
            is_demo=False,
        )
        session.add(existing_term)
    else:
        existing_term.name = (tt_title or f"AUT EduPage Timetable #{tt_num}")[:200]
        existing_term.starts_on = desired_start
        existing_term.ends_on = desired_end
        existing_term.is_current = True
        existing_term.is_demo = False

    await session.flush()

    preview, _ = await import_service.dry_run_import(
        session,
        payload=payload_bytes,
        filename=f"edupage-tt{tt_num}.json",
        campus_id=campus.id,
        timezone=timezone,
        term_id=existing_term.id,
        record_batch=False,
    )
    # During Mid-term and Final Exam timetables (e.g. TT #163), one course
    # professor legitimately owns simultaneous exam rooms proctored in parallel.
    # Allow ``teacher_double_booked`` while still blocking any room collision,
    # unparsable payload, or unknown room.
    blocking = [err for err in preview.errors if err.code is not IssueCode.teacher_double_booked]
    allow_multi_room_exam = not preview.file_errors and not blocking and bool(preview.errors)

    applied = await import_service.apply_import(
        session,
        payload=payload_bytes,
        filename=f"edupage-tt{tt_num}.json",
        campus_id=campus.id,
        timezone=timezone,
        term_id=existing_term.id,
        replace_existing=True,
        force=allow_multi_room_exam,
    )

    batch = await session.get(ImportBatch, applied.batch_id)
    if batch is not None:
        batch.source = EDUPAGE_BATCH_SOURCE
        batch.source_version = source_version
        await session.flush()

    log.info(
        "edupage_timetable_synced",
        campus_id=campus.id,
        tt_num=tt_num,
        tt_title=tt_title,
        source_version=source_version,
        rules=applied.rules,
        meetings=applied.meetings,
        occupancies=applied.occupancies,
    )

    return EdupageSyncResult(
        campus_id=campus.id,
        tt_num=tt_num,
        tt_title=tt_title,
        source_version=source_version,
        changed=True,
        batch_id=applied.batch_id,
        rules=applied.rules,
        meetings=applied.meetings,
        occupancies=applied.occupancies,
        resources_created=resources_created,
        demo_purged=purged,
    )
