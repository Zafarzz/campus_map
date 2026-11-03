"""Authentication endpoints.

Provides:

* ``POST /api/v1/auth/login`` (and alias ``/api/v1/auth/student-login``) -
  University student sign-in using ``student_id`` and ``password`` (initially
  both equal to the student's university ID, e.g. ``202590207``). Only students
  registered in the official university roster can log in.
* ``POST /api/v1/auth/change-password`` (and alias ``/api/v1/auth/reset-password``) -
  Changes or resets a student's password while enforcing complexity requirements
  (minimum 6 characters, uppercase letter, lowercase letter, number, special
  character, and distinct from the Student ID and current password).
* ``GET /api/v1/auth/password-requirements`` - Returns the password policy rules
  for client-side display.
* ``GET /api/v1/auth/me`` - Inspects the authenticated caller and returns
  student profile metadata when signed in as a student.
* ``POST /api/v1/auth/dev-token`` - Development-only local account exchange.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import AppEnv, Settings, get_settings
from app.core.db import get_session
from app.core.errors import AuthenticationError, PermissionDeniedError, ValidationError
from app.core.logging import get_request_id
from app.core.security import (
    CurrentPrincipal,
    OptionalPrincipal,
    Role,
    create_access_token,
    verify_password,
)
from app.core.time import now
from app.domain.people import AppUser
from app.domain.platform import AuditLog
from app.services.student_auth_service import (
    MIN_PASSWORD_LENGTH,
    OFFICIAL_STUDENT_ROSTER,
    PASSWORD_REQUIREMENTS,
    StudentAuthResult,
    authenticate_student,
    change_student_password,
    get_student_profile_for_user,
)

router = APIRouter(prefix="/auth", tags=["auth"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


class StudentLoginRequest(BaseModel):
    """Flexible student sign-in request accepting ``student_id``, ``login``, or ``username``."""

    model_config = ConfigDict(extra="ignore")

    student_id: str | None = Field(
        default=None,
        description="University Student ID (e.g. '202590207').",
    )
    login: str | None = Field(
        default=None,
        description="Alias for student_id if client sends 'login'.",
    )
    username: str | None = Field(
        default=None,
        description="Alias for student_id if client sends 'username'.",
    )
    password: str = Field(
        min_length=1,
        max_length=256,
        description="Student password (initially equal to the Student ID).",
    )

    @property
    def resolved_student_id(self) -> str:
        raw = self.student_id or self.login or self.username or ""
        return raw.strip()

    @model_validator(mode="after")
    def _ensure_identifier_present(self) -> StudentLoginRequest:
        if not self.resolved_student_id:
            raise ValueError("student_id (or login) is required.")
        return self


class StudentAuthResponse(BaseModel):
    """Returned after successful student login or password change."""

    access_token: str
    token_type: str = "bearer"
    expires_in: int
    roles: list[str]
    user_id: str
    student_id: str
    display_name: str
    first_name: str
    last_name: str
    fathers_name: str
    department: str
    group_no: str
    must_change_password: bool
    message: str | None = None


class ChangePasswordRequest(BaseModel):
    """Request payload for changing or resetting a student's password."""

    model_config = ConfigDict(extra="ignore")

    student_id: str | None = Field(
        default=None,
        description="University Student ID (optional when Authorization Bearer token is provided).",
    )
    login: str | None = Field(
        default=None,
        description="Alias for student_id.",
    )
    username: str | None = Field(
        default=None,
        description="Alias for student_id.",
    )
    current_password: str | None = Field(
        default=None,
        description="Current password (or initial Student ID).",
    )
    old_password: str | None = Field(
        default=None,
        description="Alias for current_password.",
    )
    examination_no: str | None = Field(
        default=None,
        description="Optional examination number from university roster for password reset verification.",
    )
    new_password: str = Field(
        min_length=1,
        max_length=256,
        description="New password meeting university security requirements.",
    )
    confirm_password: str | None = Field(
        default=None,
        description="Optional confirmation of new_password.",
    )

    @property
    def resolved_student_id(self) -> str | None:
        raw = self.student_id or self.login or self.username
        return raw.strip() if raw else None

    @property
    def resolved_current_password(self) -> str | None:
        return self.current_password if self.current_password is not None else self.old_password


class PasswordRequirementsResponse(BaseModel):
    min_length: int
    require_uppercase: bool = True
    require_lowercase: bool = True
    require_digit: bool = True
    require_special_char: bool = True
    disallow_student_id: bool = True
    requirements: list[str]
    total_registered_students: int


class DevTokenRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: Annotated[str, Field(min_length=3, max_length=254)]
    password: Annotated[str, Field(min_length=1, max_length=256)]


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    roles: list[str]


class PrincipalResponse(BaseModel):
    """Who the caller is, plus student profile metadata when applicable."""

    subject: str
    roles: list[str]
    effective_roles: list[str]
    student_id: str | None = None
    display_name: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    fathers_name: str | None = None
    department: str | None = None
    group_no: str | None = None
    must_change_password: bool | None = None


def _to_auth_response(
    result: StudentAuthResult,
    *,
    message: str | None = None,
) -> StudentAuthResponse:
    p = result.profile
    return StudentAuthResponse(
        access_token=result.access_token,
        expires_in=result.expires_in,
        roles=list(p.roles),
        user_id=str(p.user_id),
        student_id=p.student_id,
        display_name=p.display_name,
        first_name=p.first_name,
        last_name=p.last_name,
        fathers_name=p.fathers_name,
        department=p.department,
        group_no=p.group_no,
        must_change_password=p.must_change_password,
        message=message,
    )


@router.post(
    "/login",
    response_model=StudentAuthResponse,
    status_code=status.HTTP_200_OK,
    summary="Sign in with university Student ID and password",
    responses={
        401: {"description": "Unknown Student ID or wrong password."},
    },
)
@router.post(
    "/student-login",
    response_model=StudentAuthResponse,
    status_code=status.HTTP_200_OK,
    summary="Sign in with university Student ID and password (alias)",
    include_in_schema=False,
)
async def student_login(
    payload: StudentLoginRequest,
    session: SessionDep,
    settings: SettingsDep,
) -> StudentAuthResponse:
    result = await authenticate_student(
        session,
        student_id=payload.resolved_student_id,
        password=payload.password,
        settings=settings,
        request_id=get_request_id(),
    )
    msg = (
        "Please change your initial password for security purposes."
        if result.profile.must_change_password
        else "Signed in successfully."
    )
    return _to_auth_response(result, message=msg)


@router.post(
    "/change-password",
    response_model=StudentAuthResponse,
    status_code=status.HTTP_200_OK,
    summary="Change or reset student password with complexity validation",
    responses={
        401: {"description": "Invalid current password or unauthenticated."},
        422: {"description": "New password does not meet security requirements."},
    },
)
@router.post(
    "/reset-password",
    response_model=StudentAuthResponse,
    status_code=status.HTTP_200_OK,
    summary="Reset student password with complexity validation (alias)",
    include_in_schema=False,
)
async def update_student_password(
    payload: ChangePasswordRequest,
    principal: OptionalPrincipal,
    session: SessionDep,
    settings: SettingsDep,
) -> StudentAuthResponse:
    auth_user_id: uuid.UUID | None = None
    if principal is not None:
        try:
            auth_user_id = uuid.UUID(principal.subject)
        except ValueError as exc:
            raise ValidationError(
                "Authenticated token subject is not a valid user UUID.",
                code="invalid_user_subject",
            ) from exc

    result = await change_student_password(
        session,
        new_password=payload.new_password,
        confirm_password=payload.confirm_password,
        current_password=payload.resolved_current_password,
        examination_no=payload.examination_no,
        student_id=payload.resolved_student_id,
        authenticated_user_id=auth_user_id,
        settings=settings,
        request_id=get_request_id(),
    )
    return _to_auth_response(
        result,
        message="Password has been changed successfully.",
    )


@router.get(
    "/password-requirements",
    response_model=PasswordRequirementsResponse,
    status_code=status.HTTP_200_OK,
    summary="Get password complexity rules and registered student count",
)
async def password_requirements() -> PasswordRequirementsResponse:
    return PasswordRequirementsResponse(
        min_length=MIN_PASSWORD_LENGTH,
        requirements=list(PASSWORD_REQUIREMENTS),
        total_registered_students=len(OFFICIAL_STUDENT_ROSTER),
    )


@router.get(
    "/me",
    response_model=PrincipalResponse,
    summary="The authenticated caller",
    responses={401: {"description": "Missing, expired or invalid token."}},
)
async def me(
    principal: CurrentPrincipal,
    session: SessionDep,
) -> PrincipalResponse:
    profile = None
    try:
        uid = uuid.UUID(principal.subject)
        profile = await get_student_profile_for_user(session, uid)
    except ValueError:
        profile = None

    return PrincipalResponse(
        subject=principal.subject,
        roles=sorted(r.value for r in principal.roles),
        effective_roles=sorted(r.value for r in principal.effective_roles()),
        student_id=profile.student_id if profile else None,
        display_name=profile.display_name if profile else None,
        first_name=profile.first_name if profile else None,
        last_name=profile.last_name if profile else None,
        fathers_name=profile.fathers_name if profile else None,
        department=profile.department if profile else None,
        group_no=profile.group_no if profile else None,
        must_change_password=profile.must_change_password if profile else None,
    )


@router.post(
    "/dev-token",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Exchange a local development account for an access token",
    description=(
        "**Development only.** Refused with 403 unless `APP_ENV=development` and "
        "`AUTH_ALLOW_LOCAL_ACCOUNTS=true`. Production sign-in will go through OIDC; "
        "`Settings` refuses to start with local accounts enabled outside development."
    ),
    responses={
        401: {"description": "Unknown account or wrong password."},
        403: {"description": "Local accounts are not enabled in this environment."},
    },
)
async def dev_token(
    payload: DevTokenRequest,
    request: Request,
    session: SessionDep,
    settings: SettingsDep,
) -> TokenResponse:
    if settings.app_env is not AppEnv.development or not settings.auth_allow_local_accounts:
        raise PermissionDeniedError(
            "Local password accounts are only available in development.",
            code="local_accounts_disabled",
        )

    result = await session.execute(select(AppUser).where(AppUser.email == payload.email.strip().lower()))
    user = result.scalar_one_or_none()

    # Same error and roughly the same work whether the account is missing or the
    # password is wrong, so the endpoint does not enumerate accounts.
    password_ok = bool(user and user.password_hash and verify_password(payload.password, user.password_hash))
    if not user or not user.is_active or not password_ok:
        session.add(
            AuditLog(
                at=now(),
                action="auth.dev_token.failed",
                actor_label=payload.email,
                outcome="denied",
                request_id=get_request_id(),
            )
        )
        raise AuthenticationError("Email or password is incorrect.", code="invalid_credentials")

    roles = user.role_set or frozenset({Role.student})
    token = create_access_token(str(user.id), roles, settings=settings)

    user.last_seen_at = now()
    session.add(
        AuditLog(
            at=now(),
            actor_id=user.id,
            action="auth.dev_token.issued",
            target_type="app_user",
            target_id=str(user.id),
            request_id=get_request_id(),
            details={"roles": sorted(r.value for r in roles)},
        )
    )

    return TokenResponse(
        access_token=token,
        expires_in=settings.jwt_access_ttl_seconds,
        roles=sorted(r.value for r in roles),
    )
