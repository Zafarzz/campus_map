"""Password hashing, tokens, role checks, and university student authentication."""

from __future__ import annotations

from datetime import timedelta

import pytest
from httpx import AsyncClient

from app.core.config import Settings
from app.core.db import Database
from app.core.errors import AuthenticationError, PermissionDeniedError
from app.core.security import (
    Principal,
    Role,
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from app.services.student_auth_service import (
    OFFICIAL_STUDENT_ROSTER,
    validate_password_strength,
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


# ------------------------------------------------------- student auth & password rules


def test_official_student_roster_loaded_complete() -> None:
    """All 112 students from the 3-page university group list are registered."""
    assert len(OFFICIAL_STUDENT_ROSTER) == 112
    assert "202590143" in OFFICIAL_STUDENT_ROSTER
    assert "202590207" in OFFICIAL_STUDENT_ROSTER
    assert "202590250" in OFFICIAL_STUDENT_ROSTER

    robiya = OFFICIAL_STUDENT_ROSTER["202590207"]
    assert robiya.first_name == "ROBIYAXON"
    assert robiya.last_name == "MUZAFFAROVA"
    assert robiya.group_no == "I25D"
    assert robiya.department == "IT-Business"
    assert robiya.examination_no == "251650638"


def test_password_strength_validation_rules() -> None:
    # 1. Valid password passes with zero violations
    assert validate_password_strength("Robiya@2026", student_id="202590207") == []

    # 2. Shorter than 6 characters
    v_short = validate_password_strength("Ro1!", student_id="202590207")
    assert any("at least 6 characters" in msg for msg in v_short)

    # 3. Missing uppercase letter
    v_upper = validate_password_strength("robiya@2026", student_id="202590207")
    assert any("uppercase" in msg for msg in v_upper)

    # 4. Missing lowercase letter
    v_lower = validate_password_strength("ROBIYA@2026", student_id="202590207")
    assert any("lowercase" in msg for msg in v_lower)

    # 5. Missing number
    v_digit = validate_password_strength("Robiya@Pass", student_id="202590207")
    assert any("number" in msg for msg in v_digit)

    # 6. Missing special character
    v_special = validate_password_strength("Robiya2026", student_id="202590207")
    assert any("special character" in msg for msg in v_special)

    # 7. Same as Student ID
    v_same_id = validate_password_strength("202590207", student_id="202590207")
    assert any("Student ID" in msg for msg in v_same_id)

    # 8. Confirm password mismatch
    v_confirm = validate_password_strength(
        "Robiya@2026",
        student_id="202590207",
        confirm_password="Different@2026",
    )
    assert any("confirmation does not match" in msg for msg in v_confirm)


@pytest.mark.db
async def test_student_login_and_password_change_lifecycle(
    clean_database: Database,
    client: AsyncClient,
) -> None:
    """Only university students in the official roster can log in; initial password
    is their Student ID, and changing password enforces complexity rules.
    """
    _ = clean_database
    prefix = "/api/v1"

    # 1. Non-university student ID is rejected with 401
    r_unknown = await client.post(
        f"{prefix}/auth/login",
        json={"student_id": "999999999", "password": "999999999"},
    )
    assert r_unknown.status_code == 401
    assert r_unknown.json()["error"]["code"] == "invalid_credentials"

    # 2. Registered student (202590207) logs in with student_id as login and password
    r_login = await client.post(
        f"{prefix}/auth/login",
        json={"student_id": "202590207", "password": "202590207"},
    )
    assert r_login.status_code == 200
    data = r_login.json()
    assert data["student_id"] == "202590207"
    assert data["first_name"] == "ROBIYAXON"
    assert data["last_name"] == "MUZAFFAROVA"
    assert data["group_no"] == "I25D"
    assert data["must_change_password"] is True
    assert "student" in data["roles"]
    token = data["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 3. Attempting to change to a weak password (no special character / no uppercase) fails with 422
    r_weak = await client.post(
        f"{prefix}/auth/change-password",
        headers=headers,
        json={
            "current_password": "202590207",
            "new_password": "weakpassword1",
        },
    )
    assert r_weak.status_code == 422
    assert r_weak.json()["error"]["code"] == "weak_password"

    # 4. Changing to a strong password (>= 6 chars, uppercase, lowercase, digit, special char) succeeds
    r_change = await client.post(
        f"{prefix}/auth/change-password",
        headers=headers,
        json={
            "current_password": "202590207",
            "new_password": "Robiya#2026",
            "confirm_password": "Robiya#2026",
        },
    )
    assert r_change.status_code == 200
    changed_data = r_change.json()
    assert changed_data["must_change_password"] is False
    new_token = changed_data["access_token"]

    # 5. Old initial password (202590207) no longer works
    r_old_login = await client.post(
        f"{prefix}/auth/login",
        json={"student_id": "202590207", "password": "202590207"},
    )
    assert r_old_login.status_code == 401

    # 6. New password works and reports must_change_password = False
    r_new_login = await client.post(
        f"{prefix}/auth/login",
        json={"login": "202590207", "password": "Robiya#2026"},
    )
    assert r_new_login.status_code == 200
    assert r_new_login.json()["must_change_password"] is False

    # 7. GET /auth/me returns student profile details
    r_me = await client.get(
        f"{prefix}/auth/me",
        headers={"Authorization": f"Bearer {new_token}"},
    )
    assert r_me.status_code == 200
    me_data = r_me.json()
    assert me_data["student_id"] == "202590207"
    assert me_data["group_no"] == "I25D"
    assert me_data["must_change_password"] is False
