# =============================================================================
# Quick start (first clone):
#   make setup              packages, .env.local, Postgres, schema, git hooks
#   make local              FastAPI :8000 + Vite :8011 -> http://localhost:8048
#
# Day to day:
#   make server             API only (reload on backend/app changes)
#   make frontend           Vite only (proxies /api to API_PORT)
#   make precommit          lint, then tests (same as the git hook)
#
# Hosted database (never commit the URL):
#   DATABASE_URL='postgresql://...' make database-migrate
# =============================================================================

SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c
.DELETE_ON_ERROR:
.SUFFIXES:
# Hide Make's default command echo; every recipe prints its own ⭐ line instead.
.SILENT:

# Announce a recipe step. Usage: $(star) 'Installing frontend packages'
star = printf '⭐ %s\n'

# --- Ports and process layout ------------------------------------------------
# Vite binds PORT and proxies /api to FastAPI on API_PORT.
PORT ?= 8048
API_PORT ?= 8000
API_READY_TIMEOUT ?= 30
# --- Python / uv -------------------------------------------------------------
# All Python commands use the backend project (FastAPI) so they share one
# lockfile and one virtualenv. UV_LINK_MODE=copy avoids hardlink failures on
# filesystems that do not allow cross-device links.
UV ?= uv
VENV ?= backend/.venv
UV_LINK_MODE ?= copy
export UV_PROJECT_ENVIRONMENT := $(abspath $(VENV))
export UV_LINK_MODE
UV_RUN = $(UV) run --project backend --frozen

# --- Frontend ----------------------------------------------------------------
# --loglevel=error hides EBADENGINE from transitive engines (Node 26 vs
# @renovatebot/pep440 listing 20/22/24). Install still proceeds.
NPM = npm --prefix frontend

# --quiet hides CREATE/ALTER tags; schema.sql raises client_min_messages so
# IF NOT EXISTS skips do not print NOTICE. Errors still stop the recipe.
PSQL = psql --quiet -v ON_ERROR_STOP=1

# --- Local PostgreSQL (Docker) -----------------------------------------------
# database-up / database-schema always use LOCAL_DATABASE_URL.
# database-migrate uses DATABASE_URL and is the only target that talks to a
# hosted database.
DB_CONTAINER ?= japanese-postgres
DB_IMAGE ?= postgres:17
DB_NAME ?= japanese_review
DB_USER ?= postgres
DB_PASSWORD ?= postgres
DB_PORT ?= 5432
DB_READY_TIMEOUT ?= 30
LOCAL_DATABASE_URL ?= postgresql://$(DB_USER):$(DB_PASSWORD)@localhost:$(DB_PORT)/$(DB_NAME)

# --- API container -----------------------------------------------------------
API_IMAGE ?= japanese-review-api

# FastAPI with reload. Reads DATABASE_URL and auth settings from .env.local.
UVICORN = $(UV_RUN) python -m uvicorn app.main:app --app-dir backend \
	--env-file .env.local \
	--host 127.0.0.1 --port $(API_PORT) \
	--reload --reload-dir backend/app

# Fail a recipe when a required Make variable is empty.
# Usage: $(call require,VAR,how to supply it)
require = test -n "$($(1))" || { $(star) "$(1) is required. $(2)" >&2; exit 1; }

.DEFAULT_GOAL := help

.PHONY: help setup install python-install env-local local server frontend \
	database-up database-down database-schema database-migrate \
	backend-image backend-container \
	build lint lint-js lint-py test test-js test-py \
	preview check precommit hooks clean

# =============================================================================
##@ Help
# =============================================================================

help: ## Show every available command.
	$(star) 'Available commands'
	awk 'BEGIN {FS = ":.*## "} \
		/^##@/ { printf "\n%s\n", substr($$0, 5); next } \
		/^[a-zA-Z0-9_-]+:.*## / { printf "  ⭐ %-22s %s\n", $$1, $$2 }' \
		$(MAKEFILE_LIST)
	printf "\n⭐ First clone:  make setup && make local\n"
	printf "⭐ Overrides:    make local PORT=3000 API_PORT=8001\n"
	printf "⭐ Docs:         README.md  documentation/\n\n"

# =============================================================================
##@ Setup
# =============================================================================

# install -> env-local -> database-up -> database-schema -> hooks. Safe to re-run: uv/npm
# are frozen, .env.local is not overwritten, Postgres is started if present,
# and schema.sql is idempotent.
setup: install env-local database-up database-schema hooks ## First-time local setup (packages, DB, hooks).
	$(star) 'Local setup is complete'

install: python-install ## Install frontend (npm ci) and backend (uv sync) lockfiles.
	$(star) 'Installing frontend packages with npm ci'
	$(NPM) ci --loglevel=error

python-install: ## Create backend/.venv and install locked Python deps.
	$(star) 'Checking that uv is on PATH'
	command -v $(UV) >/dev/null || { $(star) 'uv is required. Install it from https://docs.astral.sh/uv/' >&2; exit 1; }
	$(star) "Syncing Python deps into $(VENV)"
	$(UV) sync --frozen --project backend

# Copies .env.example only when .env.local is missing. Never overwrites a
# developer's existing secrets.
env-local: ## Create .env.local from .env.example if it does not exist.
	if test -f .env.local; then \
		$(star) '.env.local already exists; leaving it unchanged'; \
	else \
		$(star) 'Creating .env.local from .env.example'; \
		cp .env.example .env.local; \
	fi

# =============================================================================
##@ Develop
# =============================================================================

# Starts Uvicorn in the background, waits until /healthz succeeds, then blocks
# on Vite. Ctrl-C / EXIT kills the API. Open http://localhost:$(PORT).
# Sign-in and history need Postgres (make database-up); browser reviews do not.
# The --reload parent prints "Uvicorn running" before the worker binds, so
# starting Vite immediately races the first /api requests (ECONNREFUSED).
local: env-local ## Run FastAPI and Vite together.
	$(star) "Starting FastAPI on port $(API_PORT)"
	$(UVICORN) & api_pid=$$!; \
	trap 'kill $$api_pid 2>/dev/null || true' EXIT INT TERM; \
	$(star) "Waiting for FastAPI /healthz on port $(API_PORT)"; \
	i=0; \
	until python3 -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:$(API_PORT)/healthz', timeout=1)" >/dev/null 2>&1; do \
		i=$$((i + 1)); \
		if [ $$i -ge $(API_READY_TIMEOUT) ]; then \
			$(star) "API did not become ready on port $(API_PORT) within $(API_READY_TIMEOUT)s." >&2; \
			exit 1; \
		fi; \
		sleep 1; \
	done; \
	$(star) "Starting Vite on port $(PORT) (API at http://127.0.0.1:$(API_PORT))"; \
	BACKEND_DEV_ORIGIN=http://127.0.0.1:$(API_PORT) $(NPM) run dev -- --port $(PORT)

server: env-local ## Run only the FastAPI backend with reload.
	$(star) "Starting FastAPI with reload on port $(API_PORT)"
	$(UVICORN)

frontend: ## Run only Vite; proxies /api to FastAPI on API_PORT.
	$(star) "Starting Vite on port $(PORT) (proxying /api to :$(API_PORT))"
	BACKEND_DEV_ORIGIN=http://127.0.0.1:$(API_PORT) $(NPM) run dev -- --port $(PORT)

# =============================================================================
##@ Database
# =============================================================================

# Reuses a stopped container, or creates postgres:17 the first time. Data lives
# in the container volume until `docker rm` (not done here). Times out instead
# of looping forever if Postgres never becomes ready.
database-up: ## Start local PostgreSQL in Docker and wait until it accepts connections.
	$(star) "Starting PostgreSQL container $(DB_CONTAINER)"
	docker start $(DB_CONTAINER) >/dev/null 2>&1 || docker run \
		--name $(DB_CONTAINER) \
		-e POSTGRES_USER=$(DB_USER) \
		-e POSTGRES_PASSWORD=$(DB_PASSWORD) \
		-e POSTGRES_DB=$(DB_NAME) \
		-p $(DB_PORT):5432 \
		-d $(DB_IMAGE)
	$(star) 'Waiting for PostgreSQL to accept connections'
	i=0; until docker exec $(DB_CONTAINER) pg_isready -U $(DB_USER) -d $(DB_NAME) >/dev/null 2>&1; do \
		i=$$((i + 1)); \
		if [ $$i -ge $(DB_READY_TIMEOUT) ]; then \
			$(star) "PostgreSQL did not become ready within $(DB_READY_TIMEOUT)s." >&2; \
			exit 1; \
		fi; \
		sleep 1; \
	done
	$(star) "PostgreSQL is available at $(LOCAL_DATABASE_URL)"

database-down: ## Stop local PostgreSQL without deleting its data.
	$(star) "Stopping PostgreSQL container $(DB_CONTAINER)"
	docker stop $(DB_CONTAINER)

# Does not start Docker. Run database-up first, or point LOCAL_DATABASE_URL at an
# already-running instance. database/schema.sql is the full idempotent schema, not a
# numbered migration series.
database-schema: ## Apply database/schema.sql to local PostgreSQL.
	$(star) 'Applying database/schema.sql to local PostgreSQL'
	$(PSQL) "$(LOCAL_DATABASE_URL)" -f database/schema.sql

# Production/hosted only. FastAPI never applies DDL on startup; run this (or
# paste database/schema.sql into the provider editor) before auth or history
# traffic.
database-migrate: ## Apply database/schema.sql to DATABASE_URL (hosted databases).
	$(star) 'Checking DATABASE_URL'
	$(call require,DATABASE_URL,Example: DATABASE_URL='postgresql://...' make database-migrate)
	$(star) 'Applying database/schema.sql to hosted DATABASE_URL'
	$(PSQL) "$(DATABASE_URL)" -f database/schema.sql

# =============================================================================
##@ Checks
# =============================================================================

# lint-js and lint-py run in parallel. Safe: they touch disjoint trees.
lint: ## Run frontend and Python linters in parallel.
	$(star) 'Running frontend and Python linters in parallel'
	$(MAKE) --no-print-directory -j2 lint-js lint-py

lint-js: ## ESLint (zero warnings) and TypeScript `tsc`.
	$(star) 'Linting frontend with ESLint'
	$(NPM) run lint
	$(star) 'Type-checking frontend with tsc'
	$(NPM) run typecheck

lint-py: ## Ruff lint and format check on backend/.
	$(star) 'Linting backend/ with Ruff'
	$(UV_RUN) python -m ruff check backend
	$(star) 'Checking Ruff format on backend/'
	$(UV_RUN) python -m ruff format --check backend

# Vitest wipes coverage.reportsDirectory (including .tmp) at start, so JS
# reports live under .coverage/js/. pytest only writes python-summary.json.
# Combined totals need both summaries, so they print after the join.
test: ## Run frontend and backend tests; print combined coverage.
	$(star) 'Creating .coverage directory'
	mkdir -p .coverage
	$(star) 'Running frontend and backend tests in parallel'
	$(MAKE) --no-print-directory -j2 test-js test-py
	$(star) 'Printing combined coverage totals'
	$(UV_RUN) python .github/scripts/print_coverage_totals.py

test-js: ## Vitest with V8 coverage -> .coverage/js/coverage-summary.json.
	$(star) 'TypeScript coverage'
	$(NPM) test

# Run from backend/ so pyproject.toml addopts (--cov=app) apply. Extra
# --cov-report=json is the only flag the Makefile must add.
test-py: ## pytest-cov for backend/app -> .coverage/python-summary.json.
	$(star) 'Python coverage'
	mkdir -p .coverage
	$(star) 'Running backend pytest with coverage JSON'
	cd backend && $(UV) run --frozen python -m pytest \
		--cov-report=json:../.coverage/python-summary.json

build: ## Type-check and build the production frontend bundle.
	$(star) 'Building the production frontend bundle'
	$(NPM) run build

# Static `vite preview` only. /api is not served; use make local for that.
preview: build ## Preview the production frontend bundle (no API).
	$(star) "Previewing the production frontend bundle on port $(PORT)"
	$(NPM) run preview -- --port $(PORT)

# Sequential on purpose: lint must finish (and fail the commit) before tests.
precommit: ## Lint, then test (what the git hook runs).
	$(star) 'Running pre-commit checks: lint, then test'
	$(MAKE) --no-print-directory lint
	$(MAKE) --no-print-directory test

check: lint test build ## Lint, test, and build (required before deploy).
	$(star) 'Lint, test, and build all succeeded'

hooks: ## Point this clone at .githooks and install .git/hooks/pre-commit.
	$(star) 'Creating .git/hooks'
	mkdir -p .git/hooks
	$(star) 'Pointing this clone at .githooks'
	git config --local core.hooksPath .githooks 2>/dev/null || true
	$(star) 'Installing .git/hooks/pre-commit'
	ln -sfn ../../.githooks/pre-commit .git/hooks/pre-commit
	$(star) 'Installed git hooks. pre-commit always runs make lint, then make test.'

# =============================================================================
##@ Deploy
# =============================================================================

backend-image: ## Build the FastAPI image (no Postgres, no migrations).
	$(star) "Building FastAPI image $(API_IMAGE)"
	docker build -t $(API_IMAGE) backend

# localhost inside the container is not the Docker host. Point DATABASE_URL at
# host.docker.internal (this run adds the host-gateway mapping) or a hosted DB.
backend-container: backend-image env-local ## Run the API image on API_PORT using .env.local.
	$(star) "Running $(API_IMAGE) on port $(API_PORT) with .env.local"
	docker run --rm \
		--env-file .env.local \
		--add-host=host.docker.internal:host-gateway \
		-p $(API_PORT):8000 \
		$(API_IMAGE)

# -fdX removes untracked ignored files (caches, dist, venv, node_modules).
# Keeps .env*, .envrc, and NOTES. Re-run make setup afterwards.
clean: ## Remove Git-ignored files; keep local env files and NOTES.
	$(star) 'Removing Git-ignored files (keeping .env*, .envrc, and NOTES)'
	git clean -fdX -e '!.env*' -e '!.envrc' -e '!NOTES'
