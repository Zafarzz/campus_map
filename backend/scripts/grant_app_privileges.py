#!/usr/bin/env python3
"""Grant the application role exactly the data rights it needs.

Idempotent, and safe to run after every migration. ``make migrate`` does.

Why this exists as a script rather than only in ``docker/initdb``: the init
script's ``ALTER DEFAULT PRIVILEGES ... IN SCHEMA campus`` is recorded against
the schema's OID, so dropping and recreating the schema - something that happens
routinely while developing migrations - silently discards both it and the schema
``USAGE`` grant. Nothing fails at that moment; the next request just gets
``permission denied for schema campus``, or worse, ``relation "campus" does not
exist``, which looks like a missing migration rather than a missing grant.

Running this after each migration makes the grants a derived, repeatable fact
instead of a one-time side effect of container initialisation.

Least privilege is the point (MASTER_PROMPT.md 0.4 rule 5): the application role
gets SELECT/INSERT/UPDATE/DELETE on tables and USAGE on sequences, and **no**
DDL rights. Migrations run as the owner.

Usage::

    python scripts/grant_app_privileges.py
    python scripts/grant_app_privileges.py --app-role campus_app --dry-run
"""

from __future__ import annotations

import argparse
import asyncio
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import get_settings

IDENTIFIER = re.compile(r"^[a-z_][a-z0-9_]{0,62}$")


def statements(schema: str, app_role: str) -> list[str]:
    """The grant statements, in dependency order.

    Identifiers are validated against :data:`IDENTIFIER` before interpolation -
    they come from configuration rather than from a request, but a DDL string
    built by concatenation deserves the check regardless.
    """
    return [
        # Reach into the schema at all.
        f'GRANT USAGE ON SCHEMA "{schema}" TO "{app_role}"',
        # Data rights on everything that exists now.
        f'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "{schema}" TO "{app_role}"',
        f'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "{schema}" TO "{app_role}"',
        # And on everything a future migration creates.
        f'ALTER DEFAULT PRIVILEGES IN SCHEMA "{schema}" '
        f'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "{app_role}"',
        f'ALTER DEFAULT PRIVILEGES IN SCHEMA "{schema}" GRANT USAGE, SELECT ON SEQUENCES TO "{app_role}"',
        # Resolve unqualified names without every query naming the schema.
        f'ALTER ROLE "{app_role}" SET search_path TO "{schema}", public',
    ]


async def run(app_role: str, dry_run: bool) -> int:
    settings = get_settings()
    schema = settings.database_schema

    for name in (schema, app_role):
        if not IDENTIFIER.fullmatch(name):
            print(f"refusing to build DDL with unsafe identifier {name!r}", file=sys.stderr)
            return 2

    sql = statements(schema, app_role)

    if dry_run:
        print(f"-- against {_redact(settings.migration_url)}")
        for statement in sql:
            print(f"{statement};")
        return 0

    # Owner connection: only the owner may grant on its own objects.
    engine = create_async_engine(settings.migration_url)
    try:
        async with engine.begin() as conn:
            role_exists = await conn.scalar(
                text("SELECT 1 FROM pg_roles WHERE rolname = :role"), {"role": app_role}
            )
            if not role_exists:
                print(
                    f"role {app_role!r} does not exist. Either the container was initialised "
                    "without docker/initdb, or the role name is wrong.",
                    file=sys.stderr,
                )
                return 1

            for statement in sql:
                await conn.execute(text(statement))

        # Report what the role can actually see, so a silent no-op is visible.
        async with engine.connect() as conn:
            tables = await conn.scalar(
                text(
                    "SELECT count(*) FROM information_schema.role_table_grants "
                    "WHERE table_schema = :schema AND grantee = :role AND privilege_type = 'SELECT'"
                ),
                {"schema": schema, "role": app_role},
            )
            usage = await conn.scalar(
                text("SELECT has_schema_privilege(:role, :schema, 'USAGE')"),
                {"role": app_role, "schema": schema},
            )
    finally:
        await engine.dispose()

    print(f"granted on schema {schema!r} to {app_role!r}: USAGE={bool(usage)}, SELECT on {tables} table(s)")
    return 0 if usage and tables else 1


def _redact(url: str) -> str:
    if "://" not in url or "@" not in url:
        return url
    scheme, rest = url.split("://", 1)
    creds, host = rest.rsplit("@", 1)
    return f"{scheme}://{creds.split(':', 1)[0]}:***@{host}"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--app-role", default="campus_app", help="role to grant to (default: campus_app)")
    parser.add_argument("--dry-run", action="store_true", help="print the statements without running them")
    args = parser.parse_args(argv)
    return asyncio.run(run(args.app_role, args.dry_run))


if __name__ == "__main__":
    sys.exit(main())
