"""Authentication and role-based access control.

Phase 1 ships the skeleton the brief asks for: the role set, JWT verification,
and FastAPI dependencies for requiring authentication or a role. Real OIDC
sign-in through Authlib arrives with the auth work in a later phase; until then
``APP_ENV=development`` can mint local tokens, and that path is refused outright
in staging and production by ``Settings``.

Design notes:

* **Identity never comes from the request body.** It is read from the verified
  token only. This matters later for the LLM assistant, which must never be able
  to assert a user ID or a role (brief section 20.2).
* Tokens carry a pseudonymous subject (``sub``) - the ``user.id`` UUID - never a
  name or an email, so a leaked token reveals nothing about a person.
* Passwords use PBKDF2-HMAC-SHA256 from the standard library. Local accounts are
  a development convenience, so a vetted KDF with no extra dependency is the
  right trade; if local accounts ever become a production feature this must
  become Argon2id.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
from dataclasses import dataclass, field
from datetime import timedelta
from enum import StrEnum
from typing import Annotated, Any

import jwt
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import Settings, get_settings
from app.core.errors import AuthenticationError, PermissionDeniedError
from app.core.time import now

_PBKDF2_ROUNDS = 600_000
_PBKDF2_SALT_BYTES = 16


class Role(StrEnum):
    """Roles from the brief (section 9), plus ``service`` for machine clients."""

    student = "student"
    teacher = "teacher"
    staff = "staff"
    facilities = "facilities"
    safety_officer = "safety_officer"
    analyst = "analyst"
    admin = "admin"
    service = "service"


#: Roles that imply another role's read access. Kept explicit rather than
#: hierarchical: a safety officer is not a facilities manager, and flattening
#: them into levels is how privilege creep starts.
ROLE_IMPLIES: dict[Role, frozenset[Role]] = {
    Role.admin: frozenset(Role),
}


@dataclass(frozen=True, slots=True)
class Principal:
    """The authenticated caller.

    Deliberately minimal: an ID, roles, and nothing that identifies a person.
    """

    subject: str
    roles: frozenset[Role]
    token_id: str | None = None
    claims: dict[str, Any] = field(default_factory=dict, compare=False)

    @property
    def is_service(self) -> bool:
        return Role.service in self.roles

    def effective_roles(self) -> frozenset[Role]:
        effective = set(self.roles)
        for role in self.roles:
            effective |= ROLE_IMPLIES.get(role, frozenset())
        return frozenset(effective)

    def has_role(self, *roles: Role) -> bool:
        return bool(self.effective_roles() & set(roles))

    def require(self, *roles: Role) -> None:
        if not self.has_role(*roles):
            raise PermissionDeniedError(
                details={
                    "required": sorted(r.value for r in roles),
                    "held": sorted(r.value for r in self.roles),
                }
            )


# --------------------------------------------------------------------- passwords


def hash_password(password: str) -> str:
    """Hash a development-account password as ``pbkdf2_sha256$rounds$salt$hash``."""
    if not password:
        raise ValueError("password must not be empty")
    salt = secrets.token_bytes(_PBKDF2_SALT_BYTES)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _PBKDF2_ROUNDS)
    return f"pbkdf2_sha256${_PBKDF2_ROUNDS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    """Constant-time password check. Returns False on any malformed input."""
    try:
        algorithm, rounds_raw, salt_hex, digest_hex = encoded.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        rounds = int(rounds_raw)
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(digest_hex)
    except (ValueError, AttributeError):
        return False
    candidate = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, rounds)
    return hmac.compare_digest(candidate, expected)


# --------------------------------------------------------------------- tokens


def create_access_token(
    subject: str,
    roles: frozenset[Role] | set[Role] | list[Role],
    *,
    settings: Settings | None = None,
    ttl: timedelta | None = None,
    extra_claims: dict[str, Any] | None = None,
) -> str:
    """Mint a short-lived access token for ``subject``."""
    cfg = settings or get_settings()
    issued = now()
    lifetime = ttl or timedelta(seconds=cfg.jwt_access_ttl_seconds)
    payload: dict[str, Any] = {
        "sub": subject,
        "roles": sorted(Role(role).value for role in roles),
        "iat": int(issued.timestamp()),
        "exp": int((issued + lifetime).timestamp()),
        "jti": secrets.token_urlsafe(16),
        "iss": cfg.app_name,
    }
    if extra_claims:
        # Never let a caller override identity or lifetime claims.
        reserved = {"sub", "roles", "iat", "exp", "jti", "iss"}
        payload.update({k: v for k, v in extra_claims.items() if k not in reserved})
    return jwt.encode(payload, cfg.jwt_secret.get_secret_value(), algorithm=cfg.jwt_algorithm)


def decode_access_token(token: str, *, settings: Settings | None = None) -> Principal:
    """Verify a token and return the principal it describes."""
    cfg = settings or get_settings()
    try:
        claims = jwt.decode(
            token,
            cfg.jwt_secret.get_secret_value(),
            algorithms=[cfg.jwt_algorithm],
            options={"require": ["exp", "sub"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise AuthenticationError("Access token has expired.", code="token_expired") from exc
    except jwt.InvalidTokenError as exc:
        raise AuthenticationError("Access token is not valid.", code="token_invalid") from exc

    subject = str(claims.get("sub", "")).strip()
    if not subject:
        raise AuthenticationError("Access token has no subject.", code="token_invalid")

    roles: set[Role] = set()
    for raw in claims.get("roles", []) or []:
        try:
            roles.add(Role(raw))
        except ValueError:
            # An unknown role grants nothing; dropping it is safer than failing
            # the request, and it keeps old tokens working after a rename.
            continue

    return Principal(
        subject=subject,
        roles=frozenset(roles),
        token_id=claims.get("jti"),
        claims=claims,
    )


# --------------------------------------------------------------------- dependencies

_bearer = HTTPBearer(auto_error=False, description="Access token issued by this API")


async def current_principal(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)] = None,
) -> Principal:
    """Require an authenticated caller."""
    if credentials is None or not credentials.credentials:
        raise AuthenticationError("Authentication required.")
    principal = decode_access_token(credentials.credentials)
    # Available to the audit log without threading it through every signature.
    request.state.principal = principal
    return principal


async def optional_principal(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)] = None,
) -> Principal | None:
    """Identify the caller when a token is present, without requiring one.

    Used by endpoints that are public but behave differently for signed-in
    users. An invalid token is still an error - silently treating it as
    anonymous would hide expiry bugs from clients.
    """
    if credentials is None or not credentials.credentials:
        return None
    principal = decode_access_token(credentials.credentials)
    request.state.principal = principal
    return principal


def require_roles(*roles: Role) -> Any:
    """Dependency factory: require any one of ``roles``.

    ::

        @router.get("/headcount", dependencies=[Depends(require_roles(Role.safety_officer))])
    """
    if not roles:
        raise ValueError("require_roles needs at least one role")

    async def _dependency(
        principal: Annotated[Principal, Depends(current_principal)],
    ) -> Principal:
        principal.require(*roles)
        return principal

    return _dependency


CurrentPrincipal = Annotated[Principal, Depends(current_principal)]
OptionalPrincipal = Annotated[Principal | None, Depends(optional_principal)]
