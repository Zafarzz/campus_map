# Canonical runtime for the backend: Python 3.13 (see docs/adr/0002-runtime.md).
#
# Python 3.13 is the newest interpreter with full wheel coverage for the solver
# and modelling libraries later phases need (OR-Tools, LightGBM). The host has
# only 3.14 and 3.11 installed and winget could not install 3.13 without
# administrator rights, so the container - not the host - is authoritative.

FROM python:3.13-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /srv

# Minimal build tooling. asyncpg ships wheels, but keep gcc available so a
# pinned dependency without a wheel for this platform still installs.
RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential libpq-dev curl \
 && rm -rf /var/lib/apt/lists/*

# Dependency layer: copy only the manifest first so edits to app/ do not
# invalidate the install cache.
COPY pyproject.toml ./
COPY app/__init__.py ./app/__init__.py
RUN pip install --upgrade pip \
 && pip install -e .

# ----------------------------------------------------------------------- dev

FROM base AS dev
RUN pip install -e ".[dev]"
COPY . .
# Run as a non-root user even in development.
RUN useradd --create-home --uid 10001 appuser && chown -R appuser /srv
USER appuser
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# ----------------------------------------------------------------------- prod

FROM base AS prod
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./
COPY locales ./locales
COPY scripts ./scripts
RUN useradd --create-home --uid 10001 appuser && chown -R appuser /srv
USER appuser
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8000/healthz || exit 1
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
