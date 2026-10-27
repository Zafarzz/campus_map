"""Application settings.

Loaded once from the environment (and ``backend/.env`` locally) through
pydantic-settings. Two rules worth knowing:

* **Required means required.** ``CAMPUS_TZ`` and ``JWT_SECRET`` have no defaults.
  The brief (section 24 Q1) forbids assuming a campus timezone, and a default
  signing secret is a security bug waiting to be shipped. The app refuses to
  start without them rather than guessing.
* **Production refuses unsafe values.** Local password accounts, debug mode and a
  placeholder secret are development conveniences and are rejected outright when
  ``APP_ENV`` is staging or production.
"""

from __future__ import annotations

import re
from enum import StrEnum
from functools import lru_cache
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import Field, SecretStr, computed_field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_DIR.parent

_PLACEHOLDER_SECRETS = {
    "replace-me-with-a-long-random-value",
    "change-me",
    "secret",
    "changeme",
}


class AppEnv(StrEnum):
    development = "development"
    test = "test"
    staging = "staging"
    production = "production"

    @property
    def is_deployed(self) -> bool:
        """True for environments where development shortcuts are unacceptable."""
        return self in {AppEnv.staging, AppEnv.production}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # ----------------------------------------------------------------- identity
    app_env: AppEnv = AppEnv.development
    app_debug: bool = True
    app_name: str = "Campus Digital Twin"

    # ----------------------------------------------------------------- time
    # No default: the brief forbids assuming a campus timezone.
    campus_tz: str = Field(description="IANA timezone of the campus, e.g. Asia/Tashkent")

    # ----------------------------------------------------------------- database
    database_url: str = Field(description="Async SQLAlchemy URL used by the application role")
    database_migration_url: str | None = Field(
        default=None, description="Async URL for the owner role; falls back to database_url"
    )
    database_test_url: str | None = Field(
        default=None, description="Base URL for tests; the database name gets a _test suffix"
    )
    database_schema: str = "campus"
    database_pool_size: int = Field(default=10, ge=1, le=100)
    database_max_overflow: int = Field(default=5, ge=0, le=100)
    database_echo: bool = False

    # ----------------------------------------------------------------- api
    api_prefix: str = "/api/v1"
    cors_allow_origins: str = ""

    # ----------------------------------------------------------------- auth
    jwt_secret: SecretStr = Field(description="HMAC signing key for access tokens")
    jwt_algorithm: str = "HS256"
    jwt_access_ttl_seconds: int = Field(default=1800, ge=60, le=86_400)
    auth_allow_local_accounts: bool = True

    oidc_issuer: str = ""
    oidc_client_id: str = ""
    oidc_client_secret: SecretStr = SecretStr("")
    oidc_allowed_email_domains: str = ""

    # ----------------------------------------------------------------- behaviour
    #: Clean-API "starts soon" window (brief section 10.2 default).
    starts_soon_minutes: int = Field(default=15, ge=0, le=240)
    #: Compatibility-layer window. The front end uses 60 (src/config/mapConfig.ts),
    #: and a different value would visibly change colours on the map.
    compat_upcoming_window_minutes: int = Field(default=60, ge=0, le=240)
    #: Smallest aggregate that may be published (brief section 9, privacy).
    small_cell_min_count: int = Field(default=10, ge=1)
    demo_random_seed: int = 20261017

    # ----------------------------------------------------------------- sources
    edupage_base_url: str = "https://aut.edupage.org"
    edupage_timetable_number: str = ""
    frontend_src_dir: str = "../src"

    # ----------------------------------------------------------------- optional
    redis_url: str = ""
    log_level: str = "INFO"
    log_json: bool = False

    # ----------------------------------------------------------------- validation

    @field_validator("campus_tz")
    @classmethod
    def _validate_timezone(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("CAMPUS_TZ is required and must be an IANA timezone name")
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError(f"CAMPUS_TZ {value!r} is not a known IANA timezone") from exc
        return value

    @field_validator("database_url", "database_migration_url", "database_test_url")
    @classmethod
    def _require_async_postgres(cls, value: str | None) -> str | None:
        """PostgreSQL only, async driver only (brief section 0.4 rule 1)."""
        if value is None or not value.strip():
            return None
        if not value.startswith("postgresql+asyncpg://"):
            raise ValueError(
                "database URLs must start with 'postgresql+asyncpg://'. "
                "PostgreSQL is the only supported database, including for tests; "
                "SQLite and in-memory substitutes are not an option because the design "
                "relies on tstzrange, btree_gist exclusion constraints and row locks."
            )
        return value

    @field_validator("database_schema")
    @classmethod
    def _validate_schema_name(cls, value: str) -> str:
        if not re.fullmatch(r"[a-z_][a-z0-9_]{0,62}", value):
            raise ValueError("DATABASE_SCHEMA must be a lowercase unquoted SQL identifier")
        return value

    @field_validator("api_prefix")
    @classmethod
    def _validate_prefix(cls, value: str) -> str:
        value = value.rstrip("/")
        if value and not value.startswith("/"):
            raise ValueError("API_PREFIX must start with '/'")
        return value

    @field_validator(
        "redis_url",
        "edupage_timetable_number",
        "oidc_issuer",
        "oidc_client_id",
        "cors_allow_origins",
        "oidc_allowed_email_domains",
        mode="before",
    )
    @classmethod
    def _blank_out_inline_comments(cls, value: object) -> object:
        """Treat a value that is only a dotenv comment as blank.

        ``python-dotenv`` strips a trailing ``# comment`` only when the value
        before it is non-empty. For a deliberately blank setting written as::

            REDIS_URL=                  # blank = in-process fallback

        the *comment* becomes the value. ``LOG_JSON=false  # ...`` is unaffected,
        which is why this went unnoticed: it only bites the settings whose
        normal value is empty - and those are exactly the optional ones, so the
        result was a Redis URL of ``'# blank = ...'`` and a crash on startup
        rather than the intended fallback.

        The comments have been moved onto their own lines in ``.env.example``,
        but this guard stays: a hand-edited ``.env`` will reintroduce the
        pattern sooner or later, and the failure it causes is far from obvious.
        """
        if isinstance(value, str) and value.strip().startswith("#"):
            return ""
        return value

    @field_validator("redis_url")
    @classmethod
    def _validate_redis_url(cls, value: str) -> str:
        """Blank, or a URL Redis will actually accept.

        Checked here so a typo fails at startup with a clear message, rather
        than deep inside the broker where the traceback says nothing about which
        setting was wrong.
        """
        url = value.strip()
        if not url:
            return ""
        if not url.startswith(("redis://", "rediss://", "unix://")):
            raise ValueError(
                f"REDIS_URL must start with redis://, rediss:// or unix://, got {url!r}. "
                "Leave it empty to use the in-process fallback (single worker only)."
            )
        return url

    @field_validator("log_level")
    @classmethod
    def _validate_log_level(cls, value: str) -> str:
        allowed = {"CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG"}
        upper = value.upper()
        if upper not in allowed:
            raise ValueError(f"LOG_LEVEL must be one of {sorted(allowed)}")
        return upper

    @model_validator(mode="after")
    def _refuse_unsafe_production(self) -> Settings:
        if not self.app_env.is_deployed:
            return self
        problems: list[str] = []
        if self.jwt_secret.get_secret_value() in _PLACEHOLDER_SECRETS:
            problems.append("JWT_SECRET is still the placeholder value")
        if len(self.jwt_secret.get_secret_value()) < 32:
            problems.append("JWT_SECRET must be at least 32 characters")
        if self.auth_allow_local_accounts:
            problems.append("AUTH_ALLOW_LOCAL_ACCOUNTS must be false outside development")
        if self.app_debug:
            problems.append("APP_DEBUG must be false outside development")
        if not self.cors_allow_origins.strip():
            problems.append("CORS_ALLOW_ORIGINS must list explicit origins outside development")
        if problems:
            raise ValueError(f"unsafe configuration for APP_ENV={self.app_env}: " + "; ".join(problems))
        return self

    # ----------------------------------------------------------------- derived

    @computed_field  # type: ignore[prop-decorator]
    @property
    def timezone(self) -> ZoneInfo:
        """The campus timezone. Validated at startup, so this never raises."""
        return ZoneInfo(self.campus_tz)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def migration_url(self) -> str:
        """Owner-role URL for Alembic; falls back to the application URL."""
        return self.database_migration_url or self.database_url

    @computed_field  # type: ignore[prop-decorator]
    @property
    def cors_origins(self) -> list[str]:
        return [item.strip() for item in self.cors_allow_origins.split(",") if item.strip()]

    @computed_field  # type: ignore[prop-decorator]
    @property
    def allowed_email_domains(self) -> list[str]:
        raw = self.oidc_allowed_email_domains
        return [item.strip().lower().lstrip("@") for item in raw.split(",") if item.strip()]

    @property
    def frontend_src_path(self) -> Path:
        """Absolute path to the front-end sources. Read-only, always."""
        candidate = Path(self.frontend_src_dir)
        if candidate.is_absolute():
            return candidate
        return (BACKEND_DIR / candidate).resolve()

    def test_database_url(self) -> str:
        """URL of the throwaway test database.

        Derived by appending ``_test`` to the database name so tests can never
        be pointed at development or production data by accident
        (brief section 0.4 rule 3).
        """
        base = self.database_test_url or self.migration_url
        head, _, name = base.rpartition("/")
        if not name:
            raise ValueError("cannot derive a test database name from the configured URL")
        name = name.split("?", 1)[0]
        if name.endswith("_test"):
            return base
        return f"{head}/{name}_test"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Process-wide settings singleton.

    Cached so that importing modules do not each re-read the environment. Tests
    that need different values should call ``get_settings.cache_clear()``.
    """
    # Required fields come from the environment, not from arguments, which mypy
    # cannot see - but pydantic-settings' own stubs already model that, so no
    # ignore is needed here.
    return Settings()
