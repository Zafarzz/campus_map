# Campus Digital Twin backend. Run every target from backend/.
#
# Docker is the canonical runtime (docs/adr/0002-runtime.md), so the default
# targets go through docker compose. The *-local targets use a host virtualenv
# in backend/.venv for editor integration; they are a convenience, not the
# contract.

SHELL := /bin/sh
COMPOSE := docker compose
DC_RUN := $(COMPOSE) run --rm --no-deps
DC_RUN_DB := $(COMPOSE) run --rm

.DEFAULT_GOAL := help
.PHONY: help env up up-db down logs ps shell psql migrate downgrade revision \
        seed extract fetch-timetable test lint format typecheck check safety grants \
        backup restore i18n-extract i18n-compile clean nuke venv install-local \
        test-local lint-local

help:  ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
	  | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

env: .env  ## Create backend/.env from the example if missing
.env:
	@cp .env.example .env
	@echo "Created backend/.env from .env.example."
	@echo "Set POSTGRES_OWNER_PASSWORD, POSTGRES_APP_PASSWORD and JWT_SECRET before 'make up'."

# ------------------------------------------------------------------ stack

up: env  ## Start PostgreSQL and the API
	$(COMPOSE) up -d --build
	@echo "API      http://127.0.0.1:8000/docs"
	@echo "Health   http://127.0.0.1:8000/healthz"

up-db: env  ## Start PostgreSQL only
	$(COMPOSE) up -d db

down:  ## Stop the stack (keeps the data volume)
	$(COMPOSE) down

logs:  ## Follow logs
	$(COMPOSE) logs -f --tail=100

ps:  ## Show container status
	$(COMPOSE) ps

shell:  ## Shell inside the api container
	$(COMPOSE) exec api bash

psql:  ## psql against the development database
	$(COMPOSE) exec db psql -U campus_owner -d campus

# ------------------------------------------------------------------ database

migrate: up-db  ## Apply all migrations, then re-grant the app role
	$(DC_RUN_DB) api alembic upgrade head
	$(MAKE) grants

grants: up-db  ## Re-grant the application role (idempotent; needed after any schema recreation)
	$(DC_RUN_DB) api python scripts/grant_app_privileges.py

downgrade: up-db  ## Roll back one migration
	$(DC_RUN_DB) api alembic downgrade -1

revision: up-db  ## Autogenerate a migration: make revision m="add tickets"
	@test -n "$(m)" || (echo "usage: make revision m=\"message\"" && exit 1)
	$(DC_RUN_DB) api alembic revision --autogenerate -m "$(m)"

extract:  ## Re-extract the campus inventory from the (read-only) front end
	$(DC_RUN) api python scripts/extract_frontend_campus.py --out data/frontend_campus_inventory.json

seed: migrate  ## Load the demo campus into the development database
	$(DC_RUN_DB) api python scripts/seed_demo_campus.py

fetch-timetable:  ## Download the public EduPage timetable snapshot (not committed)
	$(DC_RUN) api python scripts/fetch_edupage_timetable.py

backup: up-db  ## Dump the development database to backups/
	@mkdir -p backups
	$(COMPOSE) exec -T db pg_dump -U campus_owner -d campus -Fc \
	  > backups/campus-$$(date -u +%Y%m%dT%H%M%SZ).dump
	@ls -lh backups | tail -n 1

restore: up-db  ## Restore a dump: make restore f=backups/campus-....dump
	@test -n "$(f)" || (echo "usage: make restore f=backups/<file>.dump" && exit 1)
	$(COMPOSE) exec -T db pg_restore -U campus_owner -d campus --clean --if-exists < $(f)

# ------------------------------------------------------------------ quality

test: up-db  ## Run the test suite against a throwaway *_test database
	$(DC_RUN_DB) api pytest

lint:  ## ruff check
	$(DC_RUN) api ruff check .

format:  ## ruff format + import sort
	$(DC_RUN) api ruff format .
	$(DC_RUN) api ruff check --fix .

typecheck:  ## mypy
	$(DC_RUN) api mypy app scripts

safety:  ## Prove nothing outside backend/ changed
	python scripts/check_repo_safety.py

check: lint typecheck test safety  ## Everything CI would run

# ------------------------------------------------------------------ i18n

i18n-extract:  ## Collect translatable strings into locales/messages.pot
	$(DC_RUN) api pybabel extract -F babel.cfg -o locales/messages.pot app

i18n-compile:  ## Compile .po catalogues to .mo
	$(DC_RUN) api pybabel compile -d locales

# ------------------------------------------------------------------ host venv

venv: .venv/pyvenv.cfg  ## Create backend/.venv (editor convenience only)
.venv/pyvenv.cfg:
	python -m venv .venv
	@echo "Created backend/.venv. Docker remains the canonical runtime."

install-local: venv  ## Install dependencies into backend/.venv
	.venv/bin/python -m pip install --upgrade pip
	.venv/bin/python -m pip install -e ".[dev]"

test-local:  ## Run tests from the host venv (needs 'make up-db')
	.venv/bin/python -m pytest

lint-local:
	.venv/bin/python -m ruff check .

# ------------------------------------------------------------------ cleanup

clean:  ## Remove caches and build artefacts
	rm -rf .pytest_cache .mypy_cache .ruff_cache htmlcov .coverage coverage.xml
	find . -type d -name __pycache__ -prune -exec rm -rf {} +

nuke:  ## Stop the stack AND DELETE the local database volume
	@echo "This deletes the local development database. Ctrl-C to abort."
	@sleep 4
	$(COMPOSE) down -v
