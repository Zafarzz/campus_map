"""Configuration safety.

Two classes of bug this guards against: a missing campus timezone silently
defaulting to something, and a production deployment running with development
shortcuts enabled.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.core.config import AppEnv, Settings

BASE: dict[str, object] = {
    "campus_tz": "Asia/Tashkent",
    "database_url": "postgresql+asyncpg://u:p@localhost:5433/campus",
    "jwt_secret": "x" * 48,
}


def build(**overrides: object) -> Settings:
    """Construct Settings from explicit values only.

    ``_env_file=None`` is essential: without it pydantic-settings also reads
    ``backend/.env``, so a test that deletes ``campus_tz`` from its input would
    still find one and silently prove nothing.
    """
    return Settings(_env_file=None, **{**BASE, **overrides})  # type: ignore[arg-type]


@pytest.fixture(autouse=True)
def _isolate_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    """Remove any real configuration from the process environment.

    Same reason as ``_env_file=None``: these tests assert what happens when a
    setting is *absent*, which only means something if nothing else supplies it.
    """
    for name in (
        "APP_ENV",
        "APP_DEBUG",
        "CAMPUS_TZ",
        "DATABASE_URL",
        "DATABASE_MIGRATION_URL",
        "DATABASE_TEST_URL",
        "DATABASE_SCHEMA",
        "JWT_SECRET",
        "AUTH_ALLOW_LOCAL_ACCOUNTS",
        "CORS_ALLOW_ORIGINS",
        "STARTS_SOON_MINUTES",
        "COMPAT_UPCOMING_WINDOW_MINUTES",
    ):
        monkeypatch.delenv(name, raising=False)
        monkeypatch.delenv(name.lower(), raising=False)


def test_campus_timezone_is_required() -> None:
    """The brief forbids assuming a timezone (section 24 Q1)."""
    payload = dict(BASE)
    del payload["campus_tz"]
    with pytest.raises(ValidationError, match="campus_tz"):
        Settings(_env_file=None, **payload)  # type: ignore[arg-type]


def test_campus_timezone_must_be_a_real_iana_zone() -> None:
    with pytest.raises(ValidationError, match="not a known IANA timezone"):
        build(campus_tz="Mars/Olympus_Mons")


def test_campus_timezone_rejects_an_empty_string() -> None:
    with pytest.raises(ValidationError):
        build(campus_tz="   ")


def test_timezone_property_resolves() -> None:
    assert build().timezone.key == "Asia/Tashkent"


def test_only_postgres_async_urls_are_accepted() -> None:
    """No SQLite, not even for tests (brief section 0.4 rule 1)."""
    for bad in (
        "sqlite+aiosqlite:///./test.db",
        "sqlite:///:memory:",
        "postgresql://u:p@localhost/campus",  # sync driver
        "mysql+aiomysql://u:p@localhost/campus",
    ):
        with pytest.raises(ValidationError, match="postgresql\\+asyncpg"):
            build(database_url=bad)


def test_schema_must_be_a_safe_identifier() -> None:
    """The schema name is interpolated into DDL, so it is validated."""
    for bad in ('camp"us', "campus; DROP", "Campus", "1campus", ""):
        with pytest.raises(ValidationError):
            build(database_schema=bad)


def test_test_database_url_appends_the_test_suffix() -> None:
    settings = build()
    assert settings.test_database_url().endswith("/campus_test")


def test_test_database_url_is_idempotent() -> None:
    """Deriving twice must not produce campus_test_test."""
    settings = build(database_test_url="postgresql+asyncpg://u:p@localhost:5433/campus_test")
    assert settings.test_database_url().endswith("/campus_test")


def test_migration_url_falls_back_to_the_application_url() -> None:
    assert build().migration_url == BASE["database_url"]
    owner = "postgresql+asyncpg://owner:p@localhost:5433/campus"
    assert build(database_migration_url=owner).migration_url == owner


def test_cors_origins_are_parsed_and_trimmed() -> None:
    settings = build(cors_allow_origins=" https://a.test , https://b.test ,, ")
    assert settings.cors_origins == ["https://a.test", "https://b.test"]


def test_email_domains_are_normalised() -> None:
    settings = build(oidc_allowed_email_domains="@Ajou.UZ, example.com")
    assert settings.allowed_email_domains == ["ajou.uz", "example.com"]


def test_production_refuses_a_placeholder_secret() -> None:
    with pytest.raises(ValidationError, match="placeholder"):
        build(
            app_env=AppEnv.production,
            app_debug=False,
            auth_allow_local_accounts=False,
            cors_allow_origins="https://map.ajou.uz",
            jwt_secret="replace-me-with-a-long-random-value",
        )


def test_production_refuses_local_accounts() -> None:
    with pytest.raises(ValidationError, match="AUTH_ALLOW_LOCAL_ACCOUNTS"):
        build(
            app_env=AppEnv.production,
            app_debug=False,
            auth_allow_local_accounts=True,
            cors_allow_origins="https://map.ajou.uz",
        )


def test_production_refuses_debug_and_empty_cors() -> None:
    with pytest.raises(ValidationError) as exc:
        build(
            app_env=AppEnv.staging,
            app_debug=True,
            auth_allow_local_accounts=False,
            cors_allow_origins="",
        )
    message = str(exc.value)
    assert "APP_DEBUG" in message
    assert "CORS_ALLOW_ORIGINS" in message


def test_production_refuses_a_short_secret() -> None:
    with pytest.raises(ValidationError, match="at least 32 characters"):
        build(
            app_env=AppEnv.production,
            app_debug=False,
            auth_allow_local_accounts=False,
            cors_allow_origins="https://map.ajou.uz",
            jwt_secret="short",
        )


def test_development_allows_the_conveniences() -> None:
    """The same values that are refused in production are fine in development."""
    settings = build(app_env=AppEnv.development, app_debug=True, auth_allow_local_accounts=True)
    assert settings.app_env is AppEnv.development
    assert not settings.app_env.is_deployed


def test_compat_window_defaults_to_the_front_ends_value() -> None:
    """The front end uses 60; the brief's clean-API default is 15.

    Both are deliberate and they must not be unified by accident.
    """
    settings = build()
    assert settings.compat_upcoming_window_minutes == 60
    assert settings.starts_soon_minutes == 15
