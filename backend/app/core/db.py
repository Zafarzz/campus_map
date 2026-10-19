"""Database access.

PostgreSQL only, async SQLAlchemy 2.x. Everything lives in a dedicated schema
(default ``campus``), set through ``search_path`` on the connection so model
definitions stay schema-agnostic and tests can run against an alternate schema.

The declarative ``Base`` carries a naming convention for every constraint type.
Without it, Alembic autogenerate produces unnamed constraints that cannot be
dropped in a downgrade - and the brief requires every migration to be tested
both up and down.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

from sqlalchemy import MetaData, text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

from app.core.config import Settings, get_settings
from app.core.logging import get_logger

log = get_logger(__name__)

NAMING_CONVENTION = {
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_N_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    """Declarative base for every model.

    ``schema`` is left unset deliberately: the schema is selected per connection
    via ``search_path``, which keeps one model definition usable for the
    development schema, a test schema, and any future tenant layout.
    """

    metadata = MetaData(naming_convention=NAMING_CONVENTION)


def create_engine(url: str, settings: Settings | None = None, *, use_pool: bool = True) -> AsyncEngine:
    """Build an async engine with the project's search_path applied.

    ``use_pool=False`` (NullPool) is for short-lived processes - seeders, the
    test harness, Alembic - where a pool would just delay shutdown.
    """
    cfg = settings or get_settings()
    kwargs: dict[str, Any] = {
        "echo": cfg.database_echo,
        "future": True,
        "connect_args": {
            "server_settings": {
                # Server-side statement caching interacts badly with migrations
                # that change column types under a long-lived connection.
                "jit": "off",
                # search_path and TIME ZONE are passed as **connection
                # parameters**, not as a `SET` statement on connect.
                #
                # This is not a style preference. `SET` is transactional in
                # PostgreSQL, so a connect-time `SET search_path` is undone by
                # any later ROLLBACK on that connection - and the connection then
                # goes back into the pool with the default search_path. The next
                # caller gets "relation \"resource\" does not exist" on a table
                # that plainly exists. It only shows up once something rolls back,
                # which is why it surfaced with the booking engine's
                # exclusion-violation handling and not before.
                "search_path": f"{cfg.database_schema},public",
                "timezone": "UTC",
            }
        },
    }
    if use_pool:
        kwargs.update(
            pool_size=cfg.database_pool_size,
            max_overflow=cfg.database_max_overflow,
            pool_pre_ping=True,
            pool_recycle=1800,
        )
    else:
        kwargs["poolclass"] = NullPool

    return create_async_engine(url, **kwargs)


class Database:
    """Owns the engine and session factory for one process."""

    def __init__(self, url: str | None = None, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._url = url or self._settings.database_url
        self._engine: AsyncEngine | None = None
        self._sessionmaker: async_sessionmaker[AsyncSession] | None = None

    @property
    def engine(self) -> AsyncEngine:
        if self._engine is None:
            self._engine = create_engine(self._url, self._settings)
        return self._engine

    @property
    def sessionmaker(self) -> async_sessionmaker[AsyncSession]:
        if self._sessionmaker is None:
            self._sessionmaker = async_sessionmaker(
                bind=self.engine,
                expire_on_commit=False,
                autoflush=False,
            )
        return self._sessionmaker

    async def session(self) -> AsyncIterator[AsyncSession]:
        """Yield a session, committing on success and rolling back on failure."""
        async with self.sessionmaker() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    async def ping(self) -> bool:
        """True when PostgreSQL answers. Used by the readiness probe."""
        try:
            async with self.engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            return True
        except Exception as exc:
            log.warning("database_ping_failed", error=str(exc))
            return False

    async def server_version(self) -> str | None:
        try:
            async with self.engine.connect() as conn:
                result = await conn.execute(text("SHOW server_version"))
                value = result.scalar_one_or_none()
            return str(value) if value is not None else None
        except Exception:
            return None

    async def dispose(self) -> None:
        if self._engine is not None:
            await self._engine.dispose()
            self._engine = None
            self._sessionmaker = None


#: Process-wide instance, created lazily and wired into the app lifespan in
#: ``app.main``. Kept as a module global rather than a FastAPI app attribute so
#: that seeders and scripts share the same accessor.
_database: Database | None = None


def init_database(url: str | None = None, settings: Settings | None = None) -> Database:
    """Create (or replace) the process-wide ``Database``."""
    global _database
    _database = Database(url=url, settings=settings)
    return _database


def get_database() -> Database:
    """Return the process-wide ``Database``, creating it on first use."""
    if _database is None:
        return init_database()
    return _database


async def dispose_database() -> None:
    global _database
    if _database is not None:
        await _database.dispose()
        _database = None


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency yielding a transactional session."""
    async for session in get_database().session():
        yield session
