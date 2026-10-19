#!/usr/bin/env python3
"""Fetch the university's published timetable from EduPage.

Read-only, unauthenticated, against the same endpoints the public timetable page
itself calls (see docs/adr/0010-timetable-source-edupage.md).

Snapshots are written to ``backend/data/snapshots/``, which is **gitignored**:
the payload contains 75 teachers' real names. See ``docs/privacy/timetable.md``.

Usage::

    python scripts/fetch_edupage_timetable.py                 # current timetable
    python scripts/fetch_edupage_timetable.py --list          # what is published
    python scripts/fetch_edupage_timetable.py --number 154
    python scripts/fetch_edupage_timetable.py --summary       # inspect, don't save
    python scripts/fetch_edupage_timetable.py --rooms         # room codes only (no personal data)
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx

from app.core.config import BACKEND_DIR, get_settings
from app.core.time import now

SNAPSHOT_DIR = BACKEND_DIR / "data" / "snapshots"

#: The page sends this literal value; it is not a credential.
GSH = "00000000"
TIMEOUT = httpx.Timeout(30.0)


async def _post(client: httpx.AsyncClient, path: str, args: list[Any]) -> dict[str, Any]:
    response = await client.post(path, json={"__args": args, "__gsh": GSH})
    response.raise_for_status()
    payload: dict[str, Any] = response.json()
    if "r" not in payload:
        raise RuntimeError(f"unexpected response shape from {path}: {sorted(payload)}")
    return payload


async def list_timetables(client: httpx.AsyncClient, year: int) -> dict[str, Any]:
    payload = await _post(client, "/timetable/server/ttviewer.js?__func=getTTViewerData", [None, year])
    regular: dict[str, Any] = payload["r"]["regular"]
    return regular


async def fetch_timetable(client: httpx.AsyncClient, number: str) -> dict[str, Any]:
    return await _post(client, "/timetable/server/regulartt.js?__func=regularttGetData", [None, number])


def tables_of(payload: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    return {table["id"]: table.get("data_rows", []) for table in payload["r"]["dbiAccessorRes"]["tables"]}


def summarise(payload: dict[str, Any]) -> str:
    tables = tables_of(payload)
    lines = ["table                rows", "-" * 26]
    for name, rows in tables.items():
        lines.append(f"{name:<20} {len(rows):>4}")

    periods = tables.get("periods", [])
    if periods:
        lines += ["", "lesson slots (the real grid, not mapConfig's):"]
        for period in periods:
            lines.append(f"  {period['period']}: {period['starttime']}-{period['endtime']}")

    days = tables.get("days", [])
    if days:
        lines += ["", "teaching days: " + ", ".join(d["name"] for d in days)]

    cards = tables.get("cards", [])
    lessons = tables.get("lessons", [])
    if cards:
        lines += [
            "",
            f"{len(lessons)} lesson definitions placed as {len(cards)} weekly occurrences",
        ]
    return "\n".join(lines)


def room_report(payload: dict[str, Any]) -> str:
    """Room codes and capacities only - deliberately excludes personal data."""
    rooms = tables_of(payload).get("classrooms", [])
    lines = [f"{len(rooms)} classrooms published in the timetable", ""]
    by_block: dict[str, list[str]] = {}
    for room in rooms:
        short = str(room.get("short", "")).strip()
        name = str(room.get("name", "")).strip()
        block = short.split("-", 1)[0] if "-" in short else "?"
        by_block.setdefault(block, []).append(f"{short:<14} {name}")
    for block in sorted(by_block):
        lines.append(f"block {block} ({len(by_block[block])} rooms):")
        lines += [f"  {entry}" for entry in sorted(by_block[block])]
        lines.append("")
    return "\n".join(lines)


async def run(args: argparse.Namespace) -> int:
    settings = get_settings()
    base_url = args.base_url or settings.edupage_base_url

    async with httpx.AsyncClient(base_url=base_url, timeout=TIMEOUT) as client:
        try:
            if args.list:
                regular = await list_timetables(client, args.year)
                print(f"default: {regular.get('default_num')}")
                for entry in regular.get("timetables", []):
                    flag = "hidden" if entry.get("hidden") else "published"
                    print(
                        f"  {entry['tt_num']:>4}  {entry.get('datefrom', '?'):<12} "
                        f"{flag:<10} {entry.get('text', '')}"
                    )
                return 0

            number = args.number or settings.edupage_timetable_number
            if not number:
                regular = await list_timetables(client, args.year)
                number = str(regular.get("default_num") or "")
                if not number:
                    print("could not determine the current timetable number", file=sys.stderr)
                    return 1
                print(f"using EduPage's current timetable: {number}")

            payload = await fetch_timetable(client, number)
        except httpx.HTTPError as exc:
            print(f"fetch failed: {exc}", file=sys.stderr)
            return 1
        except (KeyError, RuntimeError, json.JSONDecodeError) as exc:
            print(
                f"unexpected payload: {exc}\n"
                "EduPage may have changed its response shape; see "
                "docs/adr/0010-timetable-source-edupage.md before adapting the parser.",
                file=sys.stderr,
            )
            return 1

    if args.rooms:
        print(room_report(payload))
        return 0

    print(summarise(payload))

    if args.summary:
        print("\n(--summary: nothing written)")
        return 0

    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = now().strftime("%Y%m%dT%H%M%SZ")
    target = SNAPSHOT_DIR / f"edupage-tt{number}-{stamp}.json"
    target.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    print(
        f"\nwrote {target}\n"
        "NOT committed (data/snapshots/ is gitignored): this payload contains teachers' "
        "real names. See docs/privacy/timetable.md."
    )
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--base-url", help="override EDUPAGE_BASE_URL")
    parser.add_argument("--number", help="timetable number (tt_num); default is EduPage's current one")
    parser.add_argument("--year", type=int, default=now().year, help="school year to list (default: current)")
    parser.add_argument("--list", action="store_true", help="list published timetables and exit")
    parser.add_argument("--summary", action="store_true", help="print a summary without saving")
    parser.add_argument("--rooms", action="store_true", help="print room codes only (no personal data)")
    args = parser.parse_args(argv)
    return asyncio.run(run(args))


if __name__ == "__main__":
    sys.exit(main())
