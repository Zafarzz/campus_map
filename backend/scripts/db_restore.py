#!/usr/bin/env python3
"""Restore a dump, and prove the restore path works.

The brief requires a restore script **and** that the restore is tested
(0.4 rule 7). ``--self-test`` is that test: it backs up the development database,
restores it into a scratch database, compares row counts, and drops the scratch.
An untested restore is a hope, not a backup.

Usage::

    python scripts/db_restore.py --file backups/campus-20261017T120000Z.dump
    python scripts/db_restore.py --self-test
    python scripts/db_restore.py --file <dump> --into campus_scratch

Refuses to run when ``APP_ENV`` is staging or production (0.4 rule 6).
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import BACKEND_DIR, get_settings

CONTAINER_SERVICE = "db"
OWNER = "campus_owner"
COUNTED_TABLES = ("campus", "building", "floor", "room", "room_alias", "connector")


def run(args: list[str], stdin: bytes | None = None) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run(
        ["docker", "compose", *args],
        cwd=BACKEND_DIR,
        input=stdin,
        capture_output=True,
        check=False,
    )


def psql(database: str, sql: str) -> tuple[int, str]:
    result = run(["exec", "-T", CONTAINER_SERVICE, "psql", "-U", OWNER, "-d", database, "-tA", "-c", sql])
    return result.returncode, result.stdout.decode(errors="replace").strip()


def row_counts(database: str, schema: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for table in COUNTED_TABLES:
        code, out = psql(database, f'SELECT count(*) FROM "{schema}"."{table}"')
        counts[table] = int(out) if code == 0 and out.isdigit() else -1
    return counts


def restore(dump: Path, database: str) -> int:
    print(f"restoring {dump.name} -> {database}")
    result = run(
        [
            "exec",
            "-T",
            CONTAINER_SERVICE,
            "pg_restore",
            "-U",
            OWNER,
            "-d",
            database,
            "--clean",
            "--if-exists",
            "--no-owner",
        ],
        stdin=dump.read_bytes(),
    )
    stderr = result.stderr.decode(errors="replace")
    # pg_restore exits non-zero for benign "does not exist" notices from --clean
    # on a fresh database, so judge by whether real errors appeared.
    real_errors = [
        line
        for line in stderr.splitlines()
        if "error:" in line.lower() and "does not exist" not in line.lower()
    ]
    if real_errors:
        print("\n".join(real_errors[:20]), file=sys.stderr)
        return 1
    return 0


def self_test(schema: str) -> int:
    """Back up, restore elsewhere, compare, clean up."""
    from scripts.db_backup import main as backup_main

    scratch = "campus_restore_test"
    dump = BACKEND_DIR / "backups" / "self-test.dump"

    print("1/5 backing up the development database")
    if backup_main(["--out", str(dump)]) != 0:
        return 1

    print("2/5 reading source row counts")
    source = row_counts("campus", schema)
    print(f"      {source}")

    print(f"3/5 creating scratch database {scratch}")
    psql("postgres", f'DROP DATABASE IF EXISTS "{scratch}" WITH (FORCE)')
    code, _ = psql("postgres", f'CREATE DATABASE "{scratch}"')
    if code != 0:
        print("could not create the scratch database", file=sys.stderr)
        return 1

    try:
        print("4/5 restoring into the scratch database")
        if restore(dump, scratch) != 0:
            return 1

        print("5/5 comparing row counts")
        restored = row_counts(scratch, schema)
        print(f"      {restored}")

        if restored != source:
            print("\nRESTORE MISMATCH", file=sys.stderr)
            for table in COUNTED_TABLES:
                if source[table] != restored[table]:
                    print(f"  {table}: source={source[table]} restored={restored[table]}", file=sys.stderr)
            return 1
    finally:
        psql("postgres", f'DROP DATABASE IF EXISTS "{scratch}" WITH (FORCE)')
        dump.unlink(missing_ok=True)

    print("\nPASS - the backup restored cleanly and every table matched.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--file", help="dump to restore")
    parser.add_argument("--into", default="campus", help="target database (default: campus)")
    parser.add_argument("--self-test", action="store_true", help="prove the backup/restore cycle works")
    args = parser.parse_args(argv)

    settings = get_settings()
    if settings.app_env.is_deployed:
        print(
            f"refusing to run: APP_ENV={settings.app_env.value}. Restoring over a deployed "
            "database is a manual procedure; see docs/runbooks/.",
            file=sys.stderr,
        )
        return 2

    if args.self_test:
        return self_test(settings.database_schema)

    if not args.file:
        parser.error("either --file or --self-test is required")

    dump = Path(args.file)
    if not dump.is_file():
        print(f"no such dump: {dump}", file=sys.stderr)
        return 2

    if args.into == "campus":
        print("This will REPLACE the contents of the development database 'campus'.")
    return restore(dump, args.into)


if __name__ == "__main__":
    sys.exit(main())
