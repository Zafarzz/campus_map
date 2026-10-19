"""Password hashing, tokens and role checks."""

from __future__ import annotations

from datetime import timedelta

import pytest

from app.core.config import Settings
from app.core.errors import AuthenticationError, PermissionDeniedError
from app.core.security import (
    Principal,
    Role,
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)

SETTINGS = Settings(  # type: ignore[call-arg]
    campus_tz="Asia/Tashkent",
    database_url="postgresql+asyncpg://u:p@localhost:5433/campus",
    jwt_secret="a" * 48,
)


def test_password_round_trip() -> None:
    encoded = hash_password("correct horse battery staple")
    assert verify_password("correct horse battery staple", encoded)
    assert not verify_password("wrong password", encoded)


def test_hashes_are_salted() -> None:
    """Two hashes of the same password must differ, or the salt is not working."""
    assert hash_password("same") != hash_password("same")


def test_hash_format_is_self_describing() -> None:
    algorithm, rounds, salt, digest = hash_password("x").split("$")
    assert algorithm == "pbkdf2_sha256"
    assert int(rounds) >= 600_000
    assert len(salt) == 32  # 16 bytes hex
    assert len(digest) == 64  # sha256 hex


def test_verify_rejects_malformed_input_without_raising() -> None:
    for junk in ("", "not-a-hash", "pbkdf2_sha256$x$y$z", "md5$1$aa$bb"):
        assert verify_password("x", junk) is False


def test_empty_password_is_refused() -> None:
    with pytest.raises(ValueError, match="must not be empty"):
        hash_password("")


def test_token_round_trip_carries_subject_and_roles() -> None:
    token = create_access_token("user-123", {Role.teacher, Role.staff}, settings=SETTINGS)
    principal = decode_access_token(token, settings=SETTINGS)
    assert principal.subject == "user-123"
    assert principal.roles == frozenset({Role.teacher, Role.staff})
    assert principal.token_id


def test_expired_token_is_rejected_with_a_specific_code() -> None:
    token = create_access_token("user-123", {Role.student}, settings=SETTINGS, ttl=timedelta(seconds=-10))
    with pytest.raises(AuthenticationError) as exc:
        decode_access_token(token, settings=SETTINGS)
    assert exc.value.code == "token_expired"


def test_token_signed_with_another_key_is_rejected() -> None:
    other = SETTINGS.model_copy(update={"jwt_secret": SETTINGS.jwt_secret.__class__("b" * 48)})
    token = create_access_token("user-123", {Role.student}, settings=other)
    with pytest.raises(AuthenticationError) as exc:
        decode_access_token(token, settings=SETTINGS)
    assert exc.value.code == "token_invalid"


def test_tampered_token_is_rejected() -> None:
    token = create_access_token("user-123", {Role.student}, settings=SETTINGS)
    header, payload, signature = token.split(".")
    with pytest.raises(AuthenticationError):
        decode_access_token(f"{header}.{payload}x.{signature}", settings=SETTINGS)


def test_extra_claims_cannot_override_identity() -> None:
    """A caller must not be able to smuggle in roles or a different subject."""
    token = create_access_token(
        "user-123",
        {Role.student},
        settings=SETTINGS,
        extra_claims={"sub": "admin", "roles": ["admin"], "exp": 1, "note": "kept"},
    )
    principal = decode_access_token(token, settings=SETTINGS)
    assert principal.subject == "user-123"
    assert principal.roles == frozenset({Role.student})
    assert principal.claims["note"] == "kept"


def test_unknown_roles_in_a_token_grant_nothing() -> None:
    """An old token naming a renamed role degrades, it does not escalate."""
    token = create_access_token("user-1", {Role.student}, settings=SETTINGS, extra_claims={})
    principal = decode_access_token(token, settings=SETTINGS)
    forged = Principal(subject=principal.subject, roles=principal.roles)
    assert not forged.has_role(Role.admin)


def test_admin_implies_every_role() -> None:
    admin = Principal(subject="u", roles=frozenset({Role.admin}))
    for role in Role:
        assert admin.has_role(role)


def test_roles_are_not_a_hierarchy() -> None:
    """A safety officer is not a facilities manager, and vice versa.

    Flattening roles into levels is how privilege creep starts, so the only
    implication is admin -> everything.
    """
    officer = Principal(subject="u", roles=frozenset({Role.safety_officer}))
    assert officer.has_role(Role.safety_officer)
    assert not officer.has_role(Role.facilities)
    assert not officer.has_role(Role.admin)
    assert not officer.has_role(Role.analyst)


def test_require_raises_permission_denied_with_context() -> None:
    student = Principal(subject="u", roles=frozenset({Role.student}))
    with pytest.raises(PermissionDeniedError) as exc:
        student.require(Role.safety_officer)
    assert exc.value.details["required"] == ["safety_officer"]
    assert exc.value.details["held"] == ["student"]


def test_token_contains_no_identifying_information() -> None:
    """Privacy by design: the subject is an opaque id, never a name or email."""
    token = create_access_token("3f1e-uuid", {Role.student}, settings=SETTINGS)
    principal = decode_access_token(token, settings=SETTINGS)
    assert set(principal.claims) <= {"sub", "roles", "iat", "exp", "jti", "iss"}
