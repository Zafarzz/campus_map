"""``POST /schedule/import`` and the batch lifecycle.

The brief's rule (section 10.1): a dry run **returns a validation report and a
diff, and nothing is saved until I confirm**. So ``dry_run`` defaults to
``true`` - the safe behaviour is what you get when you forget the flag, and
actually writing a timetable takes a deliberate ``dry_run=false``.

Imports are idempotent and reversible: every batch has an id, and
``POST /schedule/import/{id}/rollback`` deletes exactly what that batch created.
"""

from __future__ import annotations

import json
import uuid
from typing import Annotated, Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.errors import NotFoundError, ValidationError
from app.core.security import Role, require_roles
from app.domain.academic import ImportBatch
from app.services import campus_service, import_service

router = APIRouter(prefix="/schedule", tags=["schedule"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]

#: Uploads are capped so a malformed or hostile file cannot exhaust memory
#: before parsing even starts. A whole university's timetable is well under
#: this; the cap is about bounding the worst case, not about the normal one.
MAX_UPLOAD_BYTES = 16 * 1024 * 1024


@router.post(
    "/import",
    summary="Import a timetable from CSV, XLSX or ICS",
    description=(
        "**`dry_run` defaults to `true`.** A dry run parses, validates and diffs the file and "
        "writes no timetable rows, returning a report so a human can decide. Saving requires "
        "an explicit `dry_run=false`.\n\n"
        "Checks performed: unknown rooms, enrolled count above room capacity, room "
        "double-booking, teacher double-booking, meetings outside the term, times that do not "
        "exist in the campus timezone, and structural problems in the file. **Errors block; "
        "warnings do not.**\n\n"
        "A differently shaped export can be loaded without a code change by supplying "
        '`column_map` as JSON, e.g. `{"room_code": "Room No.", "weekday": "Day"}`. '
        "The report echoes the mapping that was used.\n\n"
        "Formats are detected from the filename, falling back to the content."
    ),
    responses={
        200: {"description": "A dry-run report, or the result of an applied batch."},
        422: {"description": "The file could not be read, or the import has errors."},
    },
    dependencies=[Depends(require_roles(Role.admin, Role.staff))],
)
async def import_timetable(
    session: SessionDep,
    file: Annotated[UploadFile, File(description="CSV, XLSX or ICS timetable export.")],
    dry_run: Annotated[
        bool,
        Query(description="Validate only and write nothing. Defaults to true, deliberately."),
    ] = True,
    column_map: Annotated[
        str | None,
        Form(description="JSON object mapping canonical column names to the file's headers."),
    ] = None,
    term_id: Annotated[uuid.UUID | None, Query(description="Term to import into.")] = None,
    replace_existing: Annotated[
        bool,
        Query(description="Remove this term's previously imported rules first."),
    ] = False,
    force: Annotated[
        bool,
        Query(
            description=(
                "Apply despite errors. For an operator who has read the report and "
                "accepts it - the batch records that it was forced."
            )
        ),
    ] = False,
) -> dict[str, Any]:
    payload = await file.read()
    if not payload:
        raise ValidationError("The uploaded file is empty.", code="empty_upload")
    if len(payload) > MAX_UPLOAD_BYTES:
        raise ValidationError(
            f"The file is {len(payload)} bytes, over the {MAX_UPLOAD_BYTES}-byte limit.",
            code="upload_too_large",
        )

    overrides = _parse_column_map(column_map)
    campus = await campus_service.get_default_campus(session)
    timezone = ZoneInfo(campus.timezone)

    if dry_run:
        report, batch_id = await import_service.dry_run_import(
            session,
            payload=payload,
            filename=file.filename,
            campus_id=campus.id,
            timezone=timezone,
            overrides=overrides,
            term_id=term_id,
        )
        return {
            "dry_run": True,
            "batch_id": str(batch_id) if batch_id else None,
            "applied": False,
            "report": report.as_dict(),
            "summary": report.summary(),
        }

    result = await import_service.apply_import(
        session,
        payload=payload,
        filename=file.filename,
        campus_id=campus.id,
        timezone=timezone,
        overrides=overrides,
        term_id=term_id,
        replace_existing=replace_existing,
        force=force,
    )
    return {
        "dry_run": False,
        "applied": True,
        "batch_id": str(result.batch_id),
        "created": {
            "rules": result.rules,
            "meetings": result.meetings,
            "occupancies": result.occupancies,
            "courses": result.courses,
            "sections": result.sections,
        },
        "skipped_occupancies": result.skipped_occupancies,
        "report": result.report.as_dict() if result.report else None,
        "summary": result.summary(),
    }


@router.get(
    "/imports",
    summary="List import batches, newest first",
    dependencies=[Depends(require_roles(Role.admin, Role.staff, Role.analyst))],
)
async def list_imports(
    session: SessionDep,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> dict[str, Any]:
    result = await session.execute(select(ImportBatch).order_by(ImportBatch.created_at.desc()).limit(limit))
    batches = list(result.scalars().all())
    return {
        "batches": [
            {
                "id": str(batch.id),
                "source": batch.source,
                "status": batch.status.value,
                "created_at": batch.created_at.isoformat(),
                "applied_at": batch.applied_at.isoformat() if batch.applied_at else None,
                "rolled_back_at": (batch.rolled_back_at.isoformat() if batch.rolled_back_at else None),
                "can_apply": (batch.report or {}).get("can_apply"),
                "error_count": (batch.report or {}).get("error_count"),
                "warning_count": (batch.report or {}).get("warning_count"),
            }
            for batch in batches
        ],
        "total": len(batches),
    }


@router.get(
    "/imports/{batch_id}",
    summary="One import batch and its full report",
    dependencies=[Depends(require_roles(Role.admin, Role.staff, Role.analyst))],
    responses={404: {"description": "No such batch."}},
)
async def get_import(batch_id: uuid.UUID, session: SessionDep) -> dict[str, Any]:
    batch = await session.get(ImportBatch, batch_id)
    if batch is None:
        raise NotFoundError(f"Import batch {batch_id} does not exist.", code="batch_not_found")

    counts = await import_service.count_batch_rows(session, batch_id)
    return {
        "id": str(batch.id),
        "source": batch.source,
        "source_version": batch.source_version,
        "status": batch.status.value,
        "created_at": batch.created_at.isoformat(),
        "applied_at": batch.applied_at.isoformat() if batch.applied_at else None,
        "rolled_back_at": batch.rolled_back_at.isoformat() if batch.rolled_back_at else None,
        "current_rows": counts,
        "report": batch.report,
    }


@router.post(
    "/import/{batch_id}/rollback",
    status_code=status.HTTP_200_OK,
    summary="Undo an applied import",
    description=(
        "Deletes exactly what the batch created, by batch id. The batch row itself is kept "
        "and marked `rolled_back`: the audit trail of what was once applied is the point, and "
        "erasing it would remove history the time machine depends on."
    ),
    dependencies=[Depends(require_roles(Role.admin))],
    responses={
        404: {"description": "No such batch."},
        409: {"description": "The batch was already rolled back."},
        422: {"description": "The batch was a dry run and wrote nothing."},
    },
)
async def rollback_import(batch_id: uuid.UUID, session: SessionDep) -> dict[str, Any]:
    removed = await import_service.rollback_import(session, batch_id)
    return {"batch_id": str(batch_id), "removed": removed}


def _parse_column_map(raw: str | None) -> dict[str, str] | None:
    """Parse the ``column_map`` form field.

    Rejected loudly rather than ignored: a caller who sends a malformed mapping
    and gets a silent fall-back to inference would see a confusing "missing
    column" error instead of being told their JSON is wrong.
    """
    if raw is None or not raw.strip():
        return None
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValidationError(f"column_map is not valid JSON: {exc}", code="invalid_column_map") from exc
    if not isinstance(parsed, dict):
        raise ValidationError(
            'column_map must be a JSON object, e.g. {"room_code": "Room No."}',
            code="invalid_column_map",
        )
    for key, value in parsed.items():
        if not isinstance(key, str) or not isinstance(value, str):
            raise ValidationError(
                "column_map keys and values must both be strings.",
                code="invalid_column_map",
            )
    return {str(key): str(value) for key, value in parsed.items()}
