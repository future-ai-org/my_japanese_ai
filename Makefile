# =============================================================================
# AI Code Review -- repository command interface
# =============================================================================
#
# Quick start (first clone):
#   make setup              packages, .env.local, Postgres, schema, git hooks
#   make local              FastAPI :8000 + Vite :8022 -> http://localhost:8022
#
# Day to day:
#   make server             API only (reload on backend/app changes)
#   make frontend           Vite only (proxies /api to API_PORT)
#   make precommit          lint, then tests (same as the git hook)
#
# Cloud inference (Modal):
#   make modal-setup && make modal-key
#   INFERENCE_API_KEY='...' make modal-secret
#   make modal-deploy
#
# Hosted database (never commit the URL):
#   DATABASE_URL='postgresql://...' make database-migrate
#
# =============================================================================

SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c
.DELETE_ON_ERROR:
.SUFFIXES:
# Hide Make's default command echo; every recipe prints its own 🐟 line instead.
.SILENT:

# Announce a recipe step. Usage: $(fish) 'Installing frontend packages'
fish = printf '🐟 %s\n'

# --- Ports and process layout ------------------------------------------------
# Vite binds PORT and proxies /api to FastAPI on API_PORT.
PORT ?= 8022
API_PORT ?= 8000
API_READY_TIMEOUT ?= 30
# --- Python / uv -------------------------------------------------------------
# All Python commands use the backend project (FastAPI + Modal GPU service)
# so they share one lockfile and one virtualenv. UV_LINK_MODE=copy avoids
# hardlink failures on filesystems that do not allow cross-device links.
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
DB_CONTAINER ?= ai-postgres
DB_IMAGE ?= postgres:17
DB_NAME ?= ai_review
DB_USER ?= postgres
DB_PASSWORD ?= postgres
DB_PORT ?= 5432
DB_READY_TIMEOUT ?= 30
LOCAL_DATABASE_URL ?= postgresql://$(DB_USER):$(DB_PASSWORD)@localhost:$(DB_PORT)/$(DB_NAME)

# --- Modal inference ---------------------------------------------------------
# modal-install is kept as a documented alias of python-install: the Modal CLI
# is a backend dev dependency, not a separate toolchain.
MODAL_APP ?= ai-tinyswallow-inference
MODAL_SECRET ?= ai-inference
MODAL_LOGS_SINCE ?= 15m

# --- API container -----------------------------------------------------------
API_IMAGE ?= ai-review-api

# FastAPI with reload. Reads DATABASE_URL and inference keys from .env.local.
UVICORN = $(UV_RUN) python -m uvicorn app.main:app --app-dir backend \
	--env-file .env.local \
	--host 127.0.0.1 --port $(API_PORT) \
	--reload --reload-dir backend/app

# Fail a recipe when a required Make variable is empty.
# Usage: $(call require,VAR,how to supply it)
require = test -n "$($(1))" || { $(fish) "$(1) is required. $(2)" >&2; exit 1; }

.DEFAULT_GOAL := help

.PHONY: help setup install python-install env-local local server frontend \
	database-up database-down database-schema database-migrate \
	modal-install modal-setup modal-key modal-secrets \
	modal-secret modal-secret-force modal-deploy modal-logs \
	backend-image backend-container \
	build lint lint-js lint-py test test-js test-py test-inference \
	preview check precommit hooks clean

# =============================================================================
##@ Help
# =============================================================================

help: ## Show every available command.
	$(fish) 'Available commands'
	awk 'BEGIN {FS = ":.*## "} \
		/^##@/ { printf "\n%s\n", substr($$0, 5); next } \
		/^[a-zA-Z0-9_-]+:.*## / { printf "  🐟 %-22s %s\n", $$1, $$2 }' \
		$(MAKEFILE_LIST)
	printf "\n🐟 First clone:  make setup && make local\n"
	printf "🐟 Overrides:    make local PORT=3000 API_PORT=8001\n"
	printf "🐟 Docs:         README.md  backend/README.md  backend/inference/README.md\n\n"

# =============================================================================
##@ Setup
# =============================================================================

# install -> env-local -> database-up -> database-schema -> hooks. Safe to re-run: uv/npm
# are frozen, .env.local is not overwritten, Postgres is started if present,
# and schema.sql is idempotent.
setup: install env-local database-up database-schema hooks ## First-time local setup (packages, DB, hooks).
	$(fish) 'Local setup is complete'

install: python-install ## Install frontend (npm ci) and backend (uv sync) lockfiles.
	$(fish) 'Installing frontend packages with npm ci'
	$(NPM) ci --loglevel=error

python-install: ## Create backend/.venv and install locked Python deps, including Modal.
	$(fish) 'Checking that uv is on PATH'
	command -v $(UV) >/dev/null || { $(fish) 'uv is required. Install it from https://docs.astral.sh/uv/' >&2; exit 1; }
	$(fish) "Syncing Python deps into $(VENV)"
	$(UV) sync --frozen --project backend

# Copies .env.example only when .env.local is missing. Never overwrites a
# developer's existing secrets.
env-local: ## Create .env.local from .env.example if it does not exist.
	if test -f .env.local; then \
		$(fish) '.env.local already exists; leaving it unchanged'; \
	else \
		$(fish) 'Creating .env.local from .env.example'; \
		cp .env.example .env.local; \
	fi

# =============================================================================
##@ Develop
# =============================================================================

# Starts Uvicorn in the background, waits until /healthz succeeds, then blocks
# on Vite. Ctrl-C / EXIT kills the API. Open http://localhost:$(PORT).
# Sign-in, history, and cloud reviews also need Postgres (make database-up);
# browser-only reviews do not.
# The --reload parent prints "Uvicorn running" before the worker binds, so
# starting Vite immediately races the first /api requests (ECONNREFUSED).
local: env-local ## Run FastAPI and Vite together.
	$(fish) "Starting FastAPI on port $(API_PORT)"
	$(UVICORN) & api_pid=$$!; \
	trap 'kill $$api_pid 2>/dev/null || true' EXIT INT TERM; \
	$(fish) "Waiting for FastAPI /healthz on port $(API_PORT)"; \
	i=0; \
	until python3 -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:$(API_PORT)/healthz', timeout=1)" >/dev/null 2>&1; do \
		i=$$((i + 1)); \
		if [ $$i -ge $(API_READY_TIMEOUT) ]; then \
			$(fish) "API did not become ready on port $(API_PORT) within $(API_READY_TIMEOUT)s." >&2; \
			exit 1; \
		fi; \
		sleep 1; \
	done; \
	$(fish) "Starting Vite on port $(PORT) (API at http://127.0.0.1:$(API_PORT))"; \
	BACKEND_DEV_ORIGIN=http://127.0.0.1:$(API_PORT) $(NPM) run dev -- --port $(PORT)

server: env-local ## Run only the FastAPI backend with reload.
	$(fish) "Starting FastAPI with reload on port $(API_PORT)"
	$(UVICORN)

frontend: ## Run only Vite; proxies /api to FastAPI on API_PORT.
	$(fish) "Starting Vite on port $(PORT) (proxying /api to :$(API_PORT))"
	BACKEND_DEV_ORIGIN=http://127.0.0.1:$(API_PORT) $(NPM) run dev -- --port $(PORT)

# =============================================================================
##@ Database
# =============================================================================

# Reuses a stopped container, or creates postgres:17 the first time. Data lives
# in the container volume until `docker rm` (not done here). Times out instead
# of looping forever if Postgres never becomes ready.
database-up: ## Start local PostgreSQL in Docker and wait until it accepts connections.
	$(fish) "Starting PostgreSQL container $(DB_CONTAINER)"
	docker start $(DB_CONTAINER) >/dev/null 2>&1 || docker run \
		--name $(DB_CONTAINER) \
		-e POSTGRES_USER=$(DB_USER) \
		-e POSTGRES_PASSWORD=$(DB_PASSWORD) \
		-e POSTGRES_DB=$(DB_NAME) \
		-p $(DB_PORT):5432 \
		-d $(DB_IMAGE)
	$(fish) 'Waiting for PostgreSQL to accept connections'
	i=0; until docker exec $(DB_CONTAINER) pg_isready -U $(DB_USER) -d $(DB_NAME) >/dev/null 2>&1; do \
		i=$$((i + 1)); \
		if [ $$i -ge $(DB_READY_TIMEOUT) ]; then \
			$(fish) "PostgreSQL did not become ready within $(DB_READY_TIMEOUT)s." >&2; \
			exit 1; \
		fi; \
		sleep 1; \
	done
	$(fish) "PostgreSQL is available at $(LOCAL_DATABASE_URL)"

database-down: ## Stop local PostgreSQL without deleting its data.
	$(fish) "Stopping PostgreSQL container $(DB_CONTAINER)"
	docker stop $(DB_CONTAINER)

# Does not start Docker. Run database-up first, or point LOCAL_DATABASE_URL at an
# already-running instance. database/schema.sql is the full idempotent schema, not a
# numbered migration series.
database-schema: ## Apply database/schema.sql to local PostgreSQL.
	$(fish) 'Applying database/schema.sql to local PostgreSQL'
	$(PSQL) "$(LOCAL_DATABASE_URL)" -f database/schema.sql

# Production/hosted only. FastAPI never applies DDL on startup; run this (or
# paste database/schema.sql into the provider editor) before auth, history, or cloud
# inference traffic.
database-migrate: ## Apply database/schema.sql to DATABASE_URL (hosted databases).
	$(fish) 'Checking DATABASE_URL'
	$(call require,DATABASE_URL,Example: DATABASE_URL='postgresql://...' make database-migrate)
	$(fish) 'Applying database/schema.sql to hosted DATABASE_URL'
	$(PSQL) "$(DATABASE_URL)" -f database/schema.sql

# =============================================================================
##@ Modal
# =============================================================================

modal-install: python-install ## Alias of python-install (Modal lives in the backend lockfile).
	$(fish) 'Modal CLI is already in the backend lockfile'

modal-setup: python-install ## Authenticate this machine with Modal (opens a browser).
	$(fish) 'Authenticating this machine with Modal'
	$(UV_RUN) python -m modal setup

modal-key: ## Print a random INFERENCE_API_KEY (save it; Modal cannot show it later).
	$(fish) 'Generating a random INFERENCE_API_KEY (save it; Modal cannot show it later)'
	openssl rand -hex 32

modal-secrets: python-install ## List Modal secrets (sanity-check CLI access).
	$(fish) 'Listing Modal secrets'
	$(UV_RUN) python -m modal secret list

# Put the printed key in two places: the Modal secret (this target) and
# MODAL_API_KEY in .env.local. They must match or FastAPI gets HTTP 401.
modal-secret: python-install ## Create the Modal API secret from INFERENCE_API_KEY.
	$(fish) 'Checking INFERENCE_API_KEY'
	$(call require,INFERENCE_API_KEY,Generate one with: make modal-key)
	$(fish) "Creating Modal secret $(MODAL_SECRET)"
	$(UV_RUN) python -m modal secret create $(if $(FORCE),--force )$(MODAL_SECRET) \
		INFERENCE_API_KEY="$(INFERENCE_API_KEY)"

modal-secret-force: ## Replace the Modal API secret (rotation). Requires INFERENCE_API_KEY.
	$(fish) "Replacing Modal secret $(MODAL_SECRET)"
	$(MAKE) --no-print-directory modal-secret FORCE=1

modal-deploy: python-install ## Deploy the TinySwallow vLLM service to Modal.
	$(fish) 'Deploying TinySwallow vLLM service to Modal'
	cd backend && $(UV) run --frozen python -m modal deploy inference/modal_app.py

modal-logs: python-install ## Show recent logs for the TinySwallow inference app.
	$(fish) "Showing Modal logs for $(MODAL_APP) since $(MODAL_LOGS_SINCE)"
	$(UV_RUN) python -m modal app logs $(MODAL_APP) --since $(MODAL_LOGS_SINCE)

# =============================================================================
##@ Checks
# =============================================================================

# lint-js and lint-py run in parallel. Safe: they touch disjoint trees.
lint: ## Run frontend and Python linters in parallel.
	$(fish) 'Running frontend and Python linters in parallel'
	$(MAKE) --no-print-directory -j2 lint-js lint-py

lint-js: ## ESLint (zero warnings) and TypeScript `tsc`.
	$(fish) 'Linting frontend with ESLint'
	$(NPM) run lint
	$(fish) 'Type-checking frontend with tsc'
	$(NPM) run typecheck

lint-py: ## Ruff lint and format check on backend/.
	$(fish) 'Linting backend/ with Ruff'
	$(UV_RUN) python -m ruff check backend
	$(fish) 'Checking Ruff format on backend/'
	$(UV_RUN) python -m ruff format --check backend

# Vitest wipes coverage.reportsDirectory (including .tmp) at start, so JS
# reports live under .coverage/js/. pytest only writes python-summary.json.
# Combined totals need both summaries, so they print after the join.
test: ## Run frontend and backend tests; print combined coverage.
	$(fish) 'Creating .coverage directory'
	mkdir -p .coverage
	$(fish) 'Running frontend and backend tests in parallel'
	$(MAKE) --no-print-directory -j2 test-js test-py
	$(fish) 'Printing combined coverage totals'
	$(UV_RUN) python .github/scripts/print_coverage_totals.py

test-js: ## Vitest with V8 coverage -> .coverage/js/coverage-summary.json.
	$(fish) 'TypeScript coverage'
	$(NPM) test

# Run from backend/ so pyproject.toml addopts (--cov=app) apply. Extra
# --cov-report=json is the only flag the Makefile must add. pytest also
# collects inference/tests; those files are not in the app/ coverage total.
test-py: ## pytest-cov for backend/app -> .coverage/python-summary.json.
	$(fish) 'Python coverage'
	mkdir -p .coverage
	$(fish) 'Running backend pytest with coverage JSON'
	cd backend && $(UV) run --frozen python -m pytest \
		--cov-report=json:../.coverage/python-summary.json

test-inference: ## pytest for backend/inference (also included in test-py).
	$(fish) 'Inference tests'
	cd backend && $(UV) run --frozen python -m pytest inference/tests

build: ## Type-check and build the production frontend bundle.
	$(fish) 'Building the production frontend bundle'
	$(NPM) run build

# Static `vite preview` only. /api is not served; use make local for that.
preview: build ## Preview the production frontend bundle (no API).
	$(fish) "Previewing the production frontend bundle on port $(PORT)"
	$(NPM) run preview -- --port $(PORT)

# Sequential on purpose: lint must finish (and fail the commit) before tests.
precommit: ## Lint, then test (what the git hook runs).
	$(fish) 'Running pre-commit checks: lint, then test'
	$(MAKE) --no-print-directory lint
	$(MAKE) --no-print-directory test

check: lint test build ## Lint, test, and build (required before deploy).
	$(fish) 'Lint, test, and build all succeeded'

hooks: ## Point this clone at .githooks and install .git/hooks/pre-commit.
	$(fish) 'Creating .git/hooks'
	mkdir -p .git/hooks
	$(fish) 'Pointing this clone at .githooks'
	git config --local core.hooksPath .githooks 2>/dev/null || true
	$(fish) 'Installing .git/hooks/pre-commit'
	ln -sfn ../../.githooks/pre-commit .git/hooks/pre-commit
	$(fish) 'Installed git hooks. pre-commit always runs make lint, then make test.'

# =============================================================================
##@ Deploy
# =============================================================================

backend-image: ## Build the FastAPI image (no Postgres, no migrations).
	$(fish) "Building FastAPI image $(API_IMAGE)"
	docker build -t $(API_IMAGE) backend

# localhost inside the container is not the Docker host. Point DATABASE_URL at
# host.docker.internal (this run adds the host-gateway mapping) or a hosted DB.
backend-container: backend-image env-local ## Run the API image on API_PORT using .env.local.
	$(fish) "Running $(API_IMAGE) on port $(API_PORT) with .env.local"
	docker run --rm \
		--env-file .env.local \
		--add-host=host.docker.internal:host-gateway \
		-p $(API_PORT):8000 \
		$(API_IMAGE)

# -fdX removes untracked ignored files (caches, dist, venv, node_modules).
# Keeps .env*, .envrc, and NOTES. Re-run make setup afterwards.
clean: ## Remove Git-ignored files; keep local env files and NOTES.
	$(fish) 'Removing Git-ignored files (keeping .env*, .envrc, and NOTES)'
	git clean -fdX -e '!.env*' -e '!.envrc' -e '!NOTES'
