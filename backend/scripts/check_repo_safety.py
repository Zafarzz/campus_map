#!/usr/bin/env python3
"""Repository safety guard (MASTER_PROMPT.md section 0.2 rule 6).

Compares the working tree with the recorded baseline commit and fails if any path
outside ``backend/`` was added, modified, deleted or renamed, unless that path is
listed as an approved exception in ``repo_safety_baseline.json``.

The backend is built next to an existing 3D front end that must stay untouched, so
this check is the mechanical proof that nothing outside ``backend/`` moved. Run it
before every commit, at the end of every phase, and in CI.

Usage::

    python backend/scripts/check_repo_safety.py
    python backend/scripts/check_repo_safety.py --baseline <commit-ish>
    python backend/scripts/check_repo_safety.py --json

Exit codes: ``0`` nothing outside ``backend/`` changed, ``1`` violations found,
``2`` the check itself could not run (not a git repository, unknown baseline, ...).

Deliberately dependency-free and read-only: it never writes to the working tree and
never runs a git command that can modify it.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

CONFIG_NAME = "repo_safety_baseline.json"
PROTECTED_PREFIX = "backend/"

EXIT_OK = 0
EXIT_VIOLATIONS = 1
EXIT_CANNOT_RUN = 2


class CheckError(Exception):
    """The guard could not run; this is not the same as finding violations."""


@dataclass(frozen=True)
class Baseline:
    commit: str
    branch: str | None
    allowed_outside_backend: tuple[str, ...]
    note: str | None = None


@dataclass
class Findings:
    changed: list[tuple[str, str]] = field(default_factory=list)
    untracked: list[str] = field(default_factory=list)
    waived: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.changed and not self.untracked


def git(repo_root: Path, *args: str) -> str:
    """Run a read-only git command and return stdout."""
    try:
        completed = subprocess.run(
            ["git", *args],
            cwd=repo_root,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
    except FileNotFoundError as exc:  # pragma: no cover - environment specific
        raise CheckError("git executable not found on PATH") from exc
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout).strip()
        raise CheckError(f"git {' '.join(args)} failed: {detail}")
    return completed.stdout


def find_repo_root(start: Path) -> Path:
    try:
        completed = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            cwd=start,
            capture_output=True,
            text=True,
            encoding="utf-8",
            check=False,
        )
    except FileNotFoundError as exc:  # pragma: no cover - environment specific
        raise CheckError("git executable not found on PATH") from exc
    if completed.returncode != 0:
        raise CheckError(f"{start} is not inside a git repository")
    return Path(completed.stdout.strip())


def load_baseline(config_path: Path, override: str | None) -> Baseline:
    if not config_path.exists():
        raise CheckError(
            f"baseline config missing: {config_path}\n"
            "Create it (or pass --baseline <commit>) before running the guard."
        )
    try:
        raw = json.loads(config_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise CheckError(f"baseline config is not valid JSON: {config_path}: {exc}") from exc

    commit = override or raw.get("commit")
    if not commit:
        raise CheckError(f"baseline config has no 'commit' field: {config_path}")

    allowed = raw.get("allowed_outside_backend", [])
    if not isinstance(allowed, list) or not all(isinstance(item, str) for item in allowed):
        raise CheckError("'allowed_outside_backend' must be a list of path strings")

    return Baseline(
        commit=str(commit),
        branch=raw.get("branch"),
        allowed_outside_backend=tuple(allowed),
        note=raw.get("note"),
    )


def resolve_commit(repo_root: Path, commit: str) -> str:
    try:
        return git(repo_root, "rev-parse", "--verify", f"{commit}^{{commit}}").strip()
    except CheckError as exc:
        raise CheckError(
            f"baseline commit {commit!r} is unknown in this repository. "
            "Fetch it, or update the baseline config if the branch was rebased."
        ) from exc


def is_waived(path: str, baseline: Baseline) -> bool:
    """True when the path is inside ``backend/`` or an approved exception."""
    if path == "backend" or path.startswith(PROTECTED_PREFIX):
        return True
    for allowed in baseline.allowed_outside_backend:
        allowed = allowed.rstrip("/")
        if path == allowed or path.startswith(f"{allowed}/"):
            return True
    return False


def collect_findings(repo_root: Path, baseline_sha: str, baseline: Baseline) -> Findings:
    findings = Findings()

    # Tracked differences between the baseline commit and the working tree
    # (staged and unstaged alike). --no-renames reports a rename as delete + add,
    # so both the old and the new path are checked.
    diff = git(repo_root, "diff", "--no-renames", "--name-status", baseline_sha)
    for line in diff.splitlines():
        if not line.strip():
            continue
        status, _, rest = line.partition("\t")
        path = rest.strip().strip('"')
        if not path:
            continue
        if is_waived(path, baseline):
            findings.waived.append(path)
        else:
            findings.changed.append((status.strip(), path))

    # Untracked, non-ignored files. Ignored files (node_modules/, dist/, .venv/, ...)
    # are intentionally out of scope: they are not part of the repository's content.
    others = git(repo_root, "ls-files", "--others", "--exclude-standard")
    for line in others.splitlines():
        path = line.strip().strip('"')
        if not path:
            continue
        if is_waived(path, baseline):
            findings.waived.append(path)
        else:
            findings.untracked.append(path)

    findings.changed.sort(key=lambda item: item[1])
    findings.untracked.sort()
    findings.waived.sort()
    return findings


STATUS_WORDS = {
    "A": "added",
    "M": "modified",
    "D": "deleted",
    "T": "type changed",
    "C": "copied",
    "R": "renamed",
    "U": "unmerged",
}


def report_text(baseline_sha: str, baseline: Baseline, findings: Findings) -> str:
    lines = [
        "repo safety check",
        f"  baseline commit : {baseline_sha[:12]}"
        + (f" (recorded branch {baseline.branch})" if baseline.branch else ""),
        f"  protected scope : everything except {PROTECTED_PREFIX}"
        + (
            f" and {len(baseline.allowed_outside_backend)} approved exception(s)"
            if baseline.allowed_outside_backend
            else ""
        ),
        f"  paths inside backend/ touched: {len(findings.waived)}",
    ]
    if findings.ok:
        lines.append("")
        lines.append("PASS - nothing outside backend/ was added, changed or deleted.")
        return "\n".join(lines)

    lines.append("")
    lines.append("FAIL - the following paths outside backend/ changed:")
    for status, path in findings.changed:
        word = STATUS_WORDS.get(status[:1], status)
        lines.append(f"  [{word}] {path}")
    for path in findings.untracked:
        lines.append(f"  [untracked] {path}")
    lines.append("")
    lines.append(
        "Revert these paths, or ask the repository owner to approve them and add them\n"
        f"to 'allowed_outside_backend' in backend/scripts/{CONFIG_NAME}."
    )
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--baseline", help="override the recorded baseline commit")
    parser.add_argument("--json", action="store_true", dest="as_json", help="machine-readable output")
    args = parser.parse_args(argv)

    try:
        repo_root = find_repo_root(Path(__file__).resolve().parent)
        baseline = load_baseline(Path(__file__).resolve().parent / CONFIG_NAME, args.baseline)
        baseline_sha = resolve_commit(repo_root, baseline.commit)
        findings = collect_findings(repo_root, baseline_sha, baseline)
    except CheckError as exc:
        print(f"repo safety check could not run: {exc}", file=sys.stderr)
        return EXIT_CANNOT_RUN

    if args.as_json:
        print(
            json.dumps(
                {
                    "ok": findings.ok,
                    "baseline": baseline_sha,
                    "changed": [{"status": s, "path": p} for s, p in findings.changed],
                    "untracked": findings.untracked,
                    "inside_backend": findings.waived,
                },
                indent=2,
            )
        )
    else:
        print(report_text(baseline_sha, baseline, findings))

    return EXIT_OK if findings.ok else EXIT_VIOLATIONS


if __name__ == "__main__":
    sys.exit(main())
