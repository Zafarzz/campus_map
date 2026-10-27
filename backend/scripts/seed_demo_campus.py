#!/usr/bin/env python3
"""Seed the campus into PostgreSQL from the front end's own data.

Idempotent: run it again after a front-end change and it updates in place.

Usage::

    python scripts/seed_demo_campus.py
    python scripts/seed_demo_campus.py --from-snapshot     # use the committed JSON, not src/
    python scripts/seed_demo_campus.py --dry-run           # report, then roll back
    python scripts/seed_demo_campus.py --with-dev-users    # add local accounts (development only)

Safety: refuses to touch anything but the configured development or test
database, and refuses outright when ``APP_ENV`` is staging or production
(MASTER_PROMPT.md 0.4 rule 6).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.adapters.frontend.campus_extract import (
    ExtractedBuilding,
    ExtractedConnector,
    ExtractedFloor,
    ExtractedRoom,
    FrontendInventory,
    extract_inventory,
)
from app.core.config import AppEnv, get_settings
from app.core.db import init_database
from app.core.security import Role, hash_password
from app.domain.people import AppUser, UserRole
from app.services.demo_schedule_service import seed_demo_schedule
from app.services.seed_service import seed_campus
from scripts.extract_frontend_campus import DEFAULT_SNAPSHOT

#: Local accounts for exercising the role-based endpoints in development. The
#: password is intentionally well-known and useless: these accounts only exist
#: where AUTH_ALLOW_LOCAL_ACCOUNTS is on, which Settings refuses outside
#: development.
DEV_USERS: tuple[tuple[str, str, tuple[Role, ...]], ...] = (
    ("admin@dev.local", "Dev Admin", (Role.admin,)),
    ("teacher@dev.local", "Dev Teacher", (Role.teacher,)),
    ("student@dev.local", "Dev Student", (Role.student,)),
    ("facilities@dev.local", "Dev Facilities", (Role.facilities,)),
    ("safety@dev.local", "Dev Safety Officer", (Role.safety_officer,)),
    ("analyst@dev.local", "Dev Analyst", (Role.analyst,)),
)
DEV_PASSWORD = "devpassword"


def inventory_from_snapshot(path: Path) -> FrontendInventory:
    """Rebuild an inventory from the committed JSON snapshot."""
    raw = json.loads(path.read_text(encoding="utf-8"))
    inventory = FrontendInventory(
        campus_id=raw["campus"]["id"],
        campus_name=raw["campus"]["name"],
        warnings=list(raw.get("warnings", [])),
        source_files=dict(raw.get("source_files", {})),
    )
    for building in raw["buildings"]:
        inventory.buildings.append(
            ExtractedBuilding(
                id=building["id"],
                name=building["name"],
                short_name=building["short_name"],
                description=building.get("description"),
                floor_count=building["floor_count"],
                provenance=building["provenance"],
                sort_order=building.get("sort_order", 0),
                floors=tuple(
                    ExtractedFloor(
                        id=floor["id"],
                        level=floor["level"],
                        name=floor["name"],
                        rooms=tuple(
                            ExtractedRoom(
                                id=room["id"],
                                number=room["number"],
                                kind=room["kind"],
                                provenance=room["provenance"],
                                name=room.get("name"),
                                capacity=room.get("capacity"),
                                legacy_ids=tuple(room.get("legacy_ids", ())),
                                source_branch=room.get("source_branch", 0),
                            )
                            for room in floor["rooms"]
                        ),
                    )
                    for floor in building["floors"]
                ),
            )
        )
    for connector in raw.get("connectors", []):
        inventory.connectors.append(
            ExtractedConnector(
                id=connector["id"],
                kind=connector["kind"],
                building_ids=(connector["building_ids"][0], connector["building_ids"][1]),
            )
        )
    return inventory


async def seed_dev_users(session) -> int:  # type: ignore[no-untyped-def]
    """Create the development accounts if missing. Returns how many were added."""
    from sqlalchemy import select

    created = 0
    for email, display_name, roles in DEV_USERS:
        existing = await session.scalar(select(AppUser).where(AppUser.email == email))
        if existing is not None:
            continue
        user = AppUser(
            email=email,
            display_name=display_name,
            password_hash=hash_password(DEV_PASSWORD),
            is_demo=True,
        )
        session.add(user)
        await session.flush()
        for role in roles:
            session.add(UserRole(user_id=user.id, role=role))
        created += 1
    return created


async def run(args: argparse.Namespace) -> int:
    settings = get_settings()

    if settings.app_env.is_deployed:
        print(
            f"refusing to seed: APP_ENV={settings.app_env.value}. "
            "The seeder only runs against development or test databases.",
            file=sys.stderr,
        )
        return 2

    if args.from_snapshot:
        snapshot = Path(args.snapshot) if args.snapshot else DEFAULT_SNAPSHOT
        if not snapshot.exists():
            print(f"no snapshot at {snapshot}; run 'make extract' first", file=sys.stderr)
            return 2
        inventory = inventory_from_snapshot(snapshot)
        source = str(snapshot)
    else:
        try:
            inventory = extract_inventory(settings.frontend_src_path)
        except (FileNotFoundError, ValueError) as exc:
            print(f"extraction failed: {exc}", file=sys.stderr)
            return 2
        source = str(settings.frontend_src_path)

    database = init_database(settings.migration_url, settings)
    print(f"source     {source}")
    print(f"database   {_redact(settings.migration_url)}")
    print(f"timezone   {settings.campus_tz}")
    print(f"seed       {settings.demo_random_seed}")
    print()

    async with database.sessionmaker() as session:
        result = await seed_campus(
            session,
            inventory,
            timezone=settings.campus_tz,
            random_seed=settings.demo_random_seed,
        )
        schedule = None
        if not args.no_schedule:
            # The campus alone gives the map rooms but no states. Seeding a
            # timetable with parity to src/data/demo-schedule.ts is what makes
            # /state and the compat endpoints answer with something real.
            schedule = await seed_demo_schedule(
                session,
                campus_id=result.campus_id,
                timezone=settings.timezone,
                start_day=_schedule_start(args, settings.timezone),
                days=args.schedule_days,
                include_weekends=args.include_weekends,
            )

        dev_users = 0
        if args.with_dev_users:
            if settings.app_env is not AppEnv.development or not settings.auth_allow_local_accounts:
                print(
                    "skipping dev users: only created when APP_ENV=development and "
                    "AUTH_ALLOW_LOCAL_ACCOUNTS=true",
                    file=sys.stderr,
                )
            else:
                dev_users = await seed_dev_users(session)

        if args.dry_run:
            await session.rollback()
            print(result.summary())
            print("\nDRY RUN - rolled back, nothing was written.")
            return 0

        await session.commit()

    print(result.summary())
    if schedule is not None:
        print("\nschedule (demo, parity with src/data/demo-schedule.ts)")
        print(schedule.summary())
    if dev_users:
        print(f"  dev users {dev_users} created (password: {DEV_PASSWORD!r})")
    if result.warnings:
        print(f"\nwarnings ({len(result.warnings)}):")
        for warning in result.warnings:
            print(f"  - {warning}")

    await database.dispose()
    return 0


def _redact(url: str) -> str:
    """Hide the password so the seeder's output is safe to paste into a report."""
    if "://" not in url:
        return url
    scheme, rest = url.split("://", 1)
    if "@" not in rest:
        return url
    creds, host = rest.rsplit("@", 1)
    user = creds.split(":", 1)[0]
    return f"{scheme}://{user}:***@{host}"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--from-snapshot",
        action="store_true",
        help="seed from the committed JSON snapshot instead of reading src/",
    )
    parser.add_argument("--snapshot", help=f"snapshot path (default: {DEFAULT_SNAPSHOT})")
    parser.add_argument("--dry-run", action="store_true", help="report what would change, then roll back")
    parser.add_argument(
        "--with-dev-users",
        action="store_true",
        help="also create local development accounts, one per role",
    )
    parser.add_argument(
        "--no-schedule",
        action="store_true",
        help="seed the campus only, without the demo timetable",
    )
    parser.add_argument(
        "--schedule-days",
        type=int,
        default=14,
        help="how many campus-local days of demo lessons to generate (default: 14)",
    )
    parser.add_argument(
        "--schedule-from",
        help="first day to generate, YYYY-MM-DD (default: the Monday of the current week)",
    )
    parser.add_argument(
        "--include-weekends",
        action="store_true",
        help=(
            "also generate Saturday and Sunday lessons. The front end's generator does "
            "(it keys only on the date string), but a full Sunday timetable reads as a bug."
        ),
    )
    args = parser.parse_args(argv)
    if args.schedule_days <= 0:
        parser.error("--schedule-days must be positive")
    return asyncio.run(run(args))


def _schedule_start(args: argparse.Namespace, timezone: ZoneInfo) -> date:
    """First day of generated lessons.

    Defaults to the Monday of the current campus-local week, so a freshly seeded
    database always has lessons covering *today* - which is what someone opening
    the map immediately after seeding expects to see.
    """
    if args.schedule_from:
        return date.fromisoformat(args.schedule_from)
    today = datetime.now(timezone).date()
    return today - timedelta(days=today.weekday())


if __name__ == "__main__":
    sys.exit(main())
