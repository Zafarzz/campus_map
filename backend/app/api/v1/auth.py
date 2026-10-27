"""Authentication endpoints.

Phase 1 ships the skeleton: inspect the current principal, and - in development
only - exchange a local account's password for an access token. Real OIDC
sign-in through Authlib is later-phase work; this is enough to exercise the
role-based dependencies and the audit log now.

The ``/auth/dev-token`` route is refused unless ``APP_ENV`` is development *and*
``AUTH_ALLOW_LOCAL_ACCOUNTS`` is on, and ``Settings`` additionally refuses to
start at all with local accounts enabled outside development. Two independent
checks, because a single flag flipped by accident should not be enough to open a
password endpoint in production.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import AppEnv, Settings, get_settings
from app.core.db import get_session
from app.core.errors import AuthenticationError, PermissionDeniedError
from app.core.logging import get_request_id
from app.core.security import CurrentPrincipal, Role, create_access_token, verify_password
from app.core.time import now
from app.domain.people import AppUser
from app.domain.platform import AuditLog

router = APIRouter(prefix="/auth", tags=["auth"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


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
    """Who the caller is.

    Returns the pseudonymous subject and the roles, and nothing else: the token
    carries no name or email, so there is nothing identifying to echo back.
    """

    subject: str
    roles: list[str]
    effective_roles: list[str]


@router.get(
    "/me",
    response_model=PrincipalResponse,
    summary="The authenticated caller",
    responses={401: {"description": "Missing, expired or invalid token."}},
)
async def me(principal: CurrentPrincipal) -> PrincipalResponse:
    return PrincipalResponse(
        subject=principal.subject,
        roles=sorted(r.value for r in principal.roles),
        effective_roles=sorted(r.value for r in principal.effective_roles()),
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
