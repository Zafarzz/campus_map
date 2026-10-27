#!/usr/bin/env python3
"""Measure the room-state engine's latency against the brief's target.

The brief (section 10.2) asks for a measured p95 for a full-building query, with
a target **under 100 ms on a 1,000-room campus**. The seeded demo campus has
101 rooms, so this script can synthesise a larger one to measure the target
honestly rather than extrapolating from a campus a tenth of the size.

Usage::

    python scripts/measure_state_performance.py                  # as seeded
    python scripts/measure_state_performance.py --synthetic 1000 # the brief's scale
    python scripts/measure_state_performance.py --runs 200

The synthetic campus is created in a transaction that is **rolled back**, so
nothing is left behind and the development data is untouched.

What is measured is the full path a request takes: load the rooms and their
occupancies for the campus-local day, bucket them, and evaluate every room
through the pure engine. The HTTP layer is excluded deliberately - it is the
same for every endpoint and would hide the thing under test.
"""

from __future__ import annotations

import argparse
import asyncio
import statistics
import sys
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import init_database
from app.core.time import campus_instant_at_minutes
from app.domain.base import new_uuid
from app.domain.spatial import Building, Floor, Room
from app.engines.room_state import StateOptions
from app.services import campus_service, state_service

#: The brief's target for a full-building query.
TARGET_P95_MS = 100.0


async def _synthesise(
    session: AsyncSession,
    campus_id: str,
    timezone: ZoneInfo,
    rooms: int,
    *,
    rooms_per_building: int,
) -> list[str]:
    """Create a synthetic campus of ``rooms`` rooms, with a full timetable.

    Spread across buildings of ``rooms_per_building``, because that is the shape
    the brief's target describes: *"p95 latency for a 1,000-room campus ... under
    100 ms for a full-building query"*. A thousand rooms in **one** building is
    not that campus - the largest real building here has 25 rooms - and
    measuring it would answer a harder question than the one asked while leaving
    the actual one unanswered. Both figures are reported.

    Rolled back by the caller. Every room gets six lessons on the measured day,
    which is the worst realistic case: every room has occupancies to sift
    through rather than returning early on an empty list.
    """
    from app.domain.academic import Meeting

    prefix = f"perf-{new_uuid().hex[:8]}"
    day = date.today()  # noqa: DTZ011 - a calendar date for the measured window
    slots = [(9, 0), (10, 30), (12, 0), (14, 0), (15, 30), (17, 0)]

    building_ids: list[str] = []
    room_ids: list[str] = []

    remaining = rooms
    index = 0
    while remaining > 0:
        count = min(rooms_per_building, remaining)
        building_id = f"{prefix}-b{index:02d}"
        building_ids.append(building_id)
        session.add(
            Building(
                id=building_id,
                campus_id=campus_id,
                name=f"Synthetic building {index}",
                short_name=f"P{index}",
                floor_count=1,
                provenance="demo",
                sort_order=9000 + index,
                is_demo=True,
            )
        )
        floor_id = f"{building_id}-f1"
        session.add(
            Floor(
                id=floor_id,
                building_id=building_id,
                level=1,
                name="Floor 1",
                is_demo=True,
            )
        )
        room_ids.extend(f"{floor_id}-p{n:04d}" for n in range(count))
        remaining -= count
        index += 1

    await session.flush()

    # Rooms before meetings, in their own flush. ``meeting.room_id`` is a
    # nullable foreign key, so leaving both in one flush means relying on
    # SQLAlchemy's table ordering to insert the parent first - and it does not
    # guarantee that for a nullable FK with no declared relationship.
    for position, room_id in enumerate(room_ids):
        session.add(
            Room(
                id=room_id,
                floor_id=room_id.rsplit("-p", 1)[0],
                number=f"P{position:04d}",
                room_kind="classroom",
                capacity=30,
                provenance="demo",
                sort_order=position,
                is_demo=True,
            )
        )
    await session.flush()

    for room_id in room_ids:
        for hour, minute in slots:
            start = campus_instant_at_minutes(day, hour * 60 + minute, timezone)
            session.add(
                Meeting(
                    id=new_uuid(),
                    room_id=room_id,
                    starts_at=start,
                    ends_at=start + timedelta(minutes=80),
                    original_starts_at=start,
                    subject="Synthetic lesson",
                    is_demo=True,
                )
            )
    await session.flush()
    return building_ids


async def _time_calls(
    session: AsyncSession,
    *,
    building_id: str | None,
    instant: datetime,
    timezone: ZoneInfo,
    options: StateOptions,
    runs: int,
) -> list[float]:
    """Run the query ``runs`` times and return the latencies in milliseconds."""
    samples: list[float] = []
    for _ in range(runs):
        started = time.perf_counter()
        if building_id is not None:
            await state_service.state_for_building(
                session, building_id, instant, timezone=timezone, options=options
            )
        else:
            await state_service.state_for_campus(session, instant, timezone=timezone, options=options)
        samples.append((time.perf_counter() - started) * 1000.0)
    return samples


def _report(label: str, samples: list[float], *, rooms: int, target: bool) -> bool:
    """Print one row. Returns True when it is within target (or not graded)."""
    ordered = sorted(samples)
    p50 = statistics.median(ordered)
    # Nearest-rank p95: with 50 samples that is the 48th, which is a real
    # measurement rather than an interpolation between two.
    p95 = ordered[min(len(ordered) - 1, int(len(ordered) * 0.95))]

    verdict = ""
    ok = True
    if target:
        ok = p95 < TARGET_P95_MS
        verdict = f"  {'PASS' if ok else 'FAIL'} (target p95 < {TARGET_P95_MS:.0f} ms)"

    print(
        f"  {label:<34} rooms={rooms:>5}  "
        f"p50={p50:7.1f} ms  p95={p95:7.1f} ms  "
        f"min={ordered[0]:7.1f}  max={ordered[-1]:7.1f}{verdict}"
    )
    return ok


async def run(args: argparse.Namespace) -> int:
    settings = get_settings()
    if settings.app_env.is_deployed:
        print(
            f"refusing to run: APP_ENV={settings.app_env.value}. "
            "The harness writes synthetic rows (rolled back) and only runs locally.",
            file=sys.stderr,
        )
        return 2

    database = init_database(settings.migration_url, settings)

    async with database.sessionmaker() as session:
        campus = await campus_service.get_default_campus(session)
        timezone = ZoneInfo(campus.timezone)
        options = state_service.resolve_options(settings, timezone)

        # 10:45 local - the front end's default simulated instant, and squarely
        # inside the teaching day so most rooms have an active lesson.
        instant = campus_instant_at_minutes(
            date.today(),  # noqa: DTZ011
            10 * 60 + 45,
            timezone,
        )

        seeded_rooms = await session.scalar(select(func.count(Room.id))) or 0

        print(f"database   {settings.database_schema} @ {campus.id}")
        print(f"instant    {instant.isoformat()} ({timezone.key})")
        print(f"runs       {args.runs}")
        print(f"warmup     {args.warmup}")
        print()

        buildings = await campus_service.list_buildings(session)
        counts = {
            building.id: sum((await campus_service.count_rooms_per_floor(session, building.id)).values())
            for building in buildings
        }
        biggest = max(buildings, key=lambda building: counts[building.id]) if counts else None

        print("seeded campus")
        # Warm the caches and the connection so the first sample is not an
        # outlier that says more about cold start than about the query.
        if biggest is not None:
            await _time_calls(
                session,
                building_id=biggest.id,
                instant=instant,
                timezone=timezone,
                options=options,
                runs=args.warmup,
            )
            samples = await _time_calls(
                session,
                building_id=biggest.id,
                instant=instant,
                timezone=timezone,
                options=options,
                runs=args.runs,
            )
            _report(
                f"building {biggest.id} (largest)",
                samples,
                rooms=counts[biggest.id],
                target=False,
            )

        await _time_calls(
            session,
            building_id=None,
            instant=instant,
            timezone=timezone,
            options=options,
            runs=args.warmup,
        )
        samples = await _time_calls(
            session,
            building_id=None,
            instant=instant,
            timezone=timezone,
            options=options,
            runs=args.runs,
        )
        _report("whole campus", samples, rooms=int(seeded_rooms), target=False)

        passed = True
        if args.synthetic:
            print()
            print(
                f"synthetic campus ({args.synthetic} rooms in buildings of "
                f"{args.rooms_per_building}, 6 lessons each)"
            )
            building_ids = await _synthesise(
                session,
                campus.id,
                timezone,
                args.synthetic,
                rooms_per_building=args.rooms_per_building,
            )

            # The graded figure: one building on a campus of this size, which is
            # what the brief's target actually describes.
            for label, scope, room_count, graded in (
                ("full-building query", building_ids[0], args.rooms_per_building, True),
                ("whole campus (for reference)", None, int(seeded_rooms) + args.synthetic, False),
            ):
                await _time_calls(
                    session,
                    building_id=scope,
                    instant=instant,
                    timezone=timezone,
                    options=options,
                    runs=args.warmup,
                )
                samples = await _time_calls(
                    session,
                    building_id=scope,
                    instant=instant,
                    timezone=timezone,
                    options=options,
                    runs=args.runs,
                )
                result = _report(label, samples, rooms=room_count, target=graded)
                if graded:
                    passed = result

            # Nothing synthetic is kept.
            await session.rollback()
            print("  (synthetic rows rolled back)")

    await database.dispose()
    return 0 if passed else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--runs", type=int, default=50, help="samples per measurement")
    parser.add_argument("--warmup", type=int, default=5, help="discarded warm-up calls")
    parser.add_argument(
        "--synthetic",
        type=int,
        default=0,
        metavar="N",
        help="also measure a synthetic campus of N rooms (rolled back afterwards)",
    )
    parser.add_argument(
        "--rooms-per-building",
        type=int,
        default=100,
        help=(
            "rooms per synthetic building (default: 100). The brief's target is "
            "for a full-*building* query on a 1,000-room campus, so the campus is "
            "split rather than piled into one building."
        ),
    )
    args = parser.parse_args(argv)
    return asyncio.run(run(args))


if __name__ == "__main__":
    sys.exit(main())
