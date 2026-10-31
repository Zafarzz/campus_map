#!/usr/bin/env python3
"""Synchronise the live AUT EduPage timetable into PostgreSQL.

Safe and idempotent in all environments (development, staging, production):
unlike ``seed_demo_campus.py``, this loads **confirmed official timetable data**
from ``https://aut.edupage.org/timetable/`` and purges any generated ``is_demo``
lessons so fake schedule entries never appear on the map.

Usage::

    python scripts/sync_edupage_timetable.py
    python scripts/sync_edupage_timetable.py --force
    python scripts/sync_edupage_timetable.py --number 154
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import get_settings
from app.core.db import init_database
from app.services.edupage_sync_service import sync_edupage_timetable


async def run(args: argparse.Namespace) -> int:
    settings = get_settings()
    database = init_database(settings.database_url, settings)
    try:
        async with database.sessionmaker() as session:
            result = await sync_edupage_timetable(
                session,
                settings=settings,
                tt_number=args.number,
                force=args.force,
            )
            if args.dry_run:
                await session.rollback()
                print(result.summary())
                print("\nDRY RUN - rolled back, nothing was committed.")
                return 0
            await session.commit()
            print(result.summary())
            return 0
    except Exception as exc:
        print(f"EduPage sync failed: {exc}", file=sys.stderr)
        return 1
    finally:
        await database.dispose()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--number", help="explicit EduPage tt_num override (default: live default_num)")
    parser.add_argument("--force", action="store_true", help="re-apply even if version hash matches")
    parser.add_argument("--dry-run", action="store_true", help="validate and preview, then roll back")
    args = parser.parse_args(argv)
    return asyncio.run(run(args))


if __name__ == "__main__":
    sys.exit(main())
