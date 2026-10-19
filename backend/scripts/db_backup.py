#!/usr/bin/env python3
"""Back up the development database (MASTER_PROMPT.md 0.4 rule 7).

Runs ``pg_dump`` inside the ``db`` container, so no PostgreSQL client tools are
needed on the host, and writes a custom-format dump to ``backend/backups/``
(gitignored).

Usage::

    python scripts/db_backup.py
    python scripts/db_backup.py --out backups/before-migration.dump
    python scripts/db_backup.py --keep 5        # delete older dumps beyond the newest 5

Restore with ``scripts/db_restore.py``. The restore path is tested by
``scripts/db_restore.py --self-test``, which round-trips into a scratch database
and compares row counts - a backup nobody has restored is a hope, not a backup.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import BACKEND_DIR, get_settings

BACKUP_DIR = BACKEND_DIR / "backups"
CONTAINER_SERVICE = "db"


def compose(*args: str, capture: bool = False) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run(
        ["docker", "compose", *args],
        cwd=BACKEND_DIR,
        capture_output=capture,
        check=False,
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--out", help="output path (default: backups/campus-<timestamp>.dump)")
    parser.add_argument("--keep", type=int, help="keep only the newest N dumps")
    args = parser.parse_args(argv)

    settings = get_settings()
    if settings.app_env.is_deployed:
        print(
            f"refusing to run: APP_ENV={settings.app_env.value}. This script targets the local "
            "development container; use the production backup procedure in docs/runbooks/.",
            file=sys.stderr,
        )
        return 2

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    target = Path(args.out) if args.out else BACKUP_DIR / f"campus-{stamp}.dump"
    target.parent.mkdir(parents=True, exist_ok=True)

    print(f"dumping campus -> {target}")
    result = compose(
        "exec",
        "-T",
        CONTAINER_SERVICE,
        "pg_dump",
        "-U",
        "campus_owner",
        "-d",
        "campus",
        "-Fc",
        capture=True,
    )
    if result.returncode != 0:
        print(result.stderr.decode(errors="replace"), file=sys.stderr)
        print("backup failed (is the db container running? try 'make up-db')", file=sys.stderr)
        return 1

    target.write_bytes(result.stdout)
    size_mb = target.stat().st_size / 1024 / 1024
    print(f"wrote {target} ({size_mb:.2f} MiB)")

    if args.keep:
        dumps = sorted(BACKUP_DIR.glob("campus-*.dump"), key=lambda p: p.stat().st_mtime, reverse=True)
        for stale in dumps[args.keep :]:
            stale.unlink()
            print(f"removed {stale.name}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
