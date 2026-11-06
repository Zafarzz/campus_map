"""Authentication endpoints (Unified Two-Tab Student & Staff/Admin Sign-In).

Provides:

* ``POST /api/v1/auth/login`` - Unified login supporting Option 1 (two tabs:
  ``account_type="student"`` for university Student IDs and
  ``account_type="staff"`` for Staff/Admin accounts, or automatic detection when
  ``account_type`` is omitted).
* ``POST /api/v1/auth/student-login`` - Dedicated student-only login alias.
* ``POST /api/v1/auth/staff-login`` - Dedicated staff/admin-only login alias.
* ``POST /api/v1/auth/change-password`` & ``POST /api/v1/auth/reset-password`` -
  Changes or resets a student or staff/admin password while enforcing complexity
  rules (minimum 6 characters, uppercase, lowercase, number, special character).
* ``GET /api/v1/auth/login-config`` & ``GET /api/v1/auth/password-requirements`` -
  Returns UI tab metadata (labels, placeholders, hints) and password policy rules.
* ``GET /api/v1/auth/me`` - Inspects the authenticated caller and returns full
  Student or Staff/Admin profile metadata.
* ``POST /api/v1/auth/dev-token`` - Development-only local account exchange.
"""

from __future__ import annotations

import uuid
from typing import Annotated, Literal

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
    OFFICIAL_STAFF_ACCOUNTS,
    OFFICIAL_STUDENT_ROSTER,
    PASSWORD_REQUIREMENTS,
    AccountType,
    StudentAuthResult,
    authenticate_student,
    authenticate_unified,
    change_student_password,
    get_user_profile_for_principal,
)

router = APIRouter(prefix="/auth", tags=["auth"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


class UnifiedLoginRequest(BaseModel):
    """Unified login payload supporting both the Student tab and Staff/Admin tab."""

    model_config = ConfigDict(extra="ignore")

    account_type: AccountType | None = Field(
        default=None,
        description=(
            "Optional active tab selector ('student' or 'staff'). "
            "When omitted, automatically inferred from the identifier."
        ),
    )
    student_id: str | None = Field(
        default=None,
        description="University Student ID (e.g. '202590207') from the Student tab.",
    )
    email: str | None = Field(
        default=None,
        description=(
            "Staff or Admin email (e.g. 'admin@dev.local' or 'admin@ajou.uz') from the Staff/Admin tab."
        ),
    )
    login: str | None = Field(
        default=None,
        description="Unified login identifier (Student ID, staff email, or staff username).",
    )
    username: str | None = Field(
        default=None,
        description="Alias for login identifier.",
    )
    password: str = Field(
        min_length=1,
        max_length=256,
        description="Account password (initially Student ID for students).",
    )

    @property
    def resolved_identifier(self) -> str:
        raw = self.student_id or self.email or self.login or self.username or ""
        return raw.strip()

    @model_validator(mode="after")
    def _ensure_identifier_present(self) -> UnifiedLoginRequest:
        if not self.resolved_identifier:
            raise ValueError("student_id, email, or login is required.")
        return self


class StudentAuthResponse(BaseModel):
    """Returned after successful Student or Staff/Admin sign-in or password change."""

    access_token: str
    token_type: str = "bearer"
    expires_in: int
    account_type: Literal["student", "staff"]
    is_admin: bool
    roles: list[str]
    effective_roles: list[str]
    user_id: str
    email: str | None = None
    student_id: str | None = None
    display_name: str
    first_name: str
    last_name: str
    fathers_name: str
    department: str
    group_no: str
    must_change_password: bool
    message: str | None = None


class ChangePasswordRequest(BaseModel):
    """Request payload for changing or resetting a Student or Staff/Admin password."""

    model_config = ConfigDict(extra="ignore")

    student_id: str | None = Field(
        default=None,
        description="University Student ID (optional when Authorization Bearer token is provided).",
    )
    email: str | None = Field(
        default=None,
        description="Staff/Admin email (optional when Authorization Bearer token is provided).",
    )
    login: str | None = Field(
        default=None,
        description="Unified login identifier (Student ID or staff email).",
    )
    username: str | None = Field(
        default=None,
        description="Alias for login identifier.",
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
        description="Optional examination number from university roster for student password reset.",
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
    def resolved_identifier(self) -> str | None:
        raw = self.student_id or self.email or self.login or self.username
        return raw.strip() if raw else None

    @property
    def resolved_current_password(self) -> str | None:
        return self.current_password if self.current_password is not None else self.old_password


class LoginTabDescriptor(BaseModel):
    id: Literal["student", "staff"]
    title: str
    default_selected: bool
    input_label: str
    input_placeholder: str
    helper_text: str


class PasswordRequirementsResponse(BaseModel):
    min_length: int
    require_uppercase: bool = True
    require_lowercase: bool = True
    require_digit: bool = True
    require_special_char: bool = True
    disallow_student_id: bool = True
    requirements: list[str]
    total_registered_students: int
    total_staff_roles: int
    tabs: list[LoginTabDescriptor]


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
    """Who the caller is, plus Student or Staff/Admin profile metadata."""

    subject: str
    roles: list[str]
    effective_roles: list[str]
    account_type: Literal["student", "staff"] | None = None
    is_admin: bool = False
    email: str | None = None
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
        account_type=p.account_type,
        is_admin=p.is_admin,
        roles=list(p.roles),
        effective_roles=list(p.effective_roles),
        user_id=str(p.user_id),
        email=p.email,
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


def _login_tabs() -> list[LoginTabDescriptor]:
    return [
        LoginTabDescriptor(
            id="student",
            title="Student",
            default_selected=True,
            input_label="Student ID",
            input_placeholder="e.g. 202590207",
            helper_text="First time? Use your 9-digit Student ID as both login and password.",
        ),
        LoginTabDescriptor(
            id="staff",
            title="Staff / Admin",
            default_selected=False,
            input_label="Staff Email",
            input_placeholder="e.g. admin@ajou.uz",
            helper_text="Sign in with your university staff or administrator account.",
        ),
    ]


@router.post(
    "/login",
    response_model=StudentAuthResponse,
    status_code=status.HTTP_200_OK,
    summary="Unified sign-in for both Students (Student ID) and Staff/Admins (Email)",
    responses={
        401: {"description": "Unknown account or wrong password."},
    },
)
async def unified_login(
    payload: UnifiedLoginRequest,
    session: SessionDep,
    settings: SettingsDep,
) -> StudentAuthResponse:
    result = await authenticate_unified(
        session,
        identifier=payload.resolved_identifier,
        password=payload.password,
        account_type=payload.account_type,
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
    "/student-login",
    response_model=StudentAuthResponse,
    status_code=status.HTTP_200_OK,
    summary="Sign in exclusively as a Student using Student ID",
)
async def student_only_login(
    payload: UnifiedLoginRequest,
    session: SessionDep,
    settings: SettingsDep,
) -> StudentAuthResponse:
    result = await authenticate_student(
        session,
        student_id=payload.resolved_identifier,
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
    "/staff-login",
    response_model=StudentAuthResponse,
    status_code=status.HTTP_200_OK,
    summary="Sign in exclusively as Staff or Admin",
)
async def staff_only_login(
    payload: UnifiedLoginRequest,
    session: SessionDep,
    settings: SettingsDep,
) -> StudentAuthResponse:
    result = await authenticate_unified(
        session,
        identifier=payload.resolved_identifier,
        password=payload.password,
        account_type="staff",
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
    summary="Change or reset Student or Staff/Admin password with complexity validation",
    responses={
        401: {"description": "Invalid current password or unauthenticated."},
        422: {"description": "New password does not meet security requirements."},
    },
)
@router.post(
    "/reset-password",
    response_model=StudentAuthResponse,
    status_code=status.HTTP_200_OK,
    summary="Reset password with complexity validation (alias)",
    include_in_schema=False,
)
async def update_password(
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
        student_id=payload.resolved_identifier,
        authenticated_user_id=auth_user_id,
        settings=settings,
        request_id=get_request_id(),
    )
    return _to_auth_response(
        result,
        message="Password has been changed successfully.",
    )


@router.get(
    "/login-config",
    response_model=PasswordRequirementsResponse,
    status_code=status.HTTP_200_OK,
    summary="Get two-tab login UI configuration and password complexity rules",
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
        total_staff_roles=len(OFFICIAL_STAFF_ACCOUNTS),
        tabs=_login_tabs(),
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
        profile = await get_user_profile_for_principal(session, uid)
    except ValueError:
        profile = None

    is_admin = Role.admin in principal.effective_roles()
    return PrincipalResponse(
        subject=principal.subject,
        roles=sorted(r.value for r in principal.roles),
        effective_roles=sorted(r.value for r in principal.effective_roles()),
        account_type=profile.account_type if profile else None,
        is_admin=profile.is_admin if profile else is_admin,
        email=profile.email if profile else None,
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


@router.post(
    "/refresh",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Silently refresh an access token whose signature is valid",
    description=(
        "Verifies the HMAC signature of the provided Bearer token (allowing expired ``exp``) "
        "and issues a fresh access token if the user account is still active."
    ),
)
async def refresh_token(
    request: Request,
    session: SessionDep,
    settings: SettingsDep,
) -> TokenResponse:
    from datetime import timedelta

    import jwt

    auth_header = request.headers.get("authorization") or ""
    raw_token = ""
    if auth_header.lower().startswith("bearer "):
        raw_token = auth_header[7:].strip()

    user: AppUser | None = None

    if raw_token and not raw_token.startswith("mock-token-"):
        try:
            claims = jwt.decode(
                raw_token,
                settings.jwt_secret.get_secret_value(),
                algorithms=[settings.jwt_algorithm],
                options={"verify_exp": False, "require": ["sub"]},
            )
            subject = str(claims.get("sub", "")).strip()
            if subject:
                user = await session.get(AppUser, uuid.UUID(subject))
        except Exception:
            user = None

    # In local development, also allow recovering session from X-Session-User-Id or X-Session-Student-Id
    if user is None and settings.app_env is AppEnv.development:
        dev_uid = (request.headers.get("x-session-user-id") or "").strip()
        dev_sid = (request.headers.get("x-session-student-id") or "").strip()
        if dev_uid:
            try:
                user = await session.get(AppUser, uuid.UUID(dev_uid))
            except ValueError:
                user = None
        if user is None and dev_sid:
            from app.services.student_auth_service import _ensure_student_user
            user = await _ensure_student_user(session, dev_sid)
            if user is not None:
                await session.commit()

    if not user or not user.is_active:
        raise AuthenticationError(
            "Session could not be refreshed. Please sign in again.",
            code="token_expired",
        )

    roles = user.role_set or frozenset({Role.student})
    ttl_seconds = max(settings.jwt_access_ttl_seconds, 86400)
    new_token = create_access_token(
        str(user.id),
        roles,
        settings=settings,
        ttl=timedelta(seconds=ttl_seconds),
    )
    return TokenResponse(
        access_token=new_token,
        expires_in=ttl_seconds,
        roles=sorted(r.value for r in roles),
    )
