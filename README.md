# 🤖 AI Code Review

[![Hugging Face](https://img.shields.io/badge/Hugging%20Face-SakanaAI%2FTinySwallow--1.5B--Instruct-FFD21E?logo=huggingface)](https://huggingface.co/SakanaAI/TinySwallow-1.5B-Instruct)
[![Lint](https://github.com/storyteller-13/my_japanese_ai/actions/workflows/lint.yml/badge.svg)](https://github.com/storyteller-13/my_japanese_ai/actions/workflows/lint.yml)
[![Backend Tests](https://github.com/storyteller-13/my_japanese_ai/actions/workflows/test-backend.yml/badge.svg)](https://github.com/storyteller-13/my_japanese_ai/actions/workflows/test-backend.yml)
[![Frontend Tests](https://github.com/storyteller-13/my_japanese_ai/actions/workflows/test-frontend.yml/badge.svg)](https://github.com/storyteller-13/my_japanese_ai/actions/workflows/test-frontend.yml)

<br><br>

> *A **[React](https://react.dev/)** and **[FastAPI](https://fastapi.tiangolo.com/)**
application for AI-assisted code review powered by
**[TinySwallow-1.5B](https://huggingface.co/SakanaAI/TinySwallow-1.5B-Instruct)**, where you can upload a snippet and get a structured score, metrics, and line-level findings. 
Code reviews run either locally in the browser through
**[WebGPU](https://www.w3.org/TR/webgpu/)** or on configured cloud inference providers (**[Modal](https://modal.com/)** **[vLLM](https://docs.vllm.ai/)** GPU or **[Hugging Face inference provider](https://huggingface.co/docs/inference-providers)**).
Signed-in users can save, reopen, star, and delete reviews using
**[PostgreSQL](https://www.postgresql.org/)**. The API is containerized with
**[Docker](https://docs.docker.com/)** and deployed on **[Vercel](https://vercel.com/)**.*


<br><br>

<p align="center">
  <img src="documentation/assets/website.png" alt="AI Code Review" width="90%">
</p>

<br>

## 🐟 Table of contents

<br>

- **[Browser inference](#-browser-inference)**
- **[Cloud inference](#-cloud-inference)**
- **[Backend](#-backend)**
- **[Frontend](#-frontend)**
- **[Database](#-database)**
- **[Tests and CI](#-tests-and-cicd)**
- **[Security](#-security)**
- **[Performance](#-performance-optimization)**

<br>

### Architecture

<br>

<p align="center">
  <img src="documentation/assets/archtecture.png" alt="AI Code Review" width="85%">
</p>

<br>

---

## 🐟 Browser Inference

<br>

### Demo

<br>
<p align="center">
  <video src="https://github.com/user-attachments/assets/9ecf921f-ab5e-446c-9940-875219aa041d" width="85%" controls>
    <a href="https://github.com/user-attachments/assets/9ecf921f-ab5e-446c-9940-875219aa041d"><strong>local.mp4</strong></a>
  </video>
</p>

<br>

### Overview

<br>

Local reviews run small LLMs in a
**[Web Worker](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API)**
on the user's device via
**[WebGPU](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API)**.
Source never leaves the tab for inference: the worker loads the model, runs
generation on the GPU, and posts the structured result back to the UI.

**[MLC](https://llm.mlc.ai/)** (Machine Learning Compilation) compiles an LLM
into an optimized runtime for a chosen backend. Built on Apache TVM, the same
pipeline can target CUDA, Vulkan, Metal, or the browser through WebGPU — one
conversion story, many deploy targets.

**[WebLLM](https://webllm.mlc.ai/)** is the browser frontend of that stack. It
downloads an MLC artifact, compiles WebGPU shaders, and runs generation in a
worker so the main thread stays responsive while tokens stream.

Selecting a local model downloads its shards from Hugging Face into IndexedDB
(about 870 MB on first visit for TinySwallow-1.5B). A prefetch worker can fill that cache while the
user edits, overlapping download and shader compilation so the first Review
click is not a long cold wait. Later visits reuse the cached files unless site
data is cleared.

<br>

### TinySwallow-1.5B MLC Artifact

<br>

An MLC artifact is a converted, quantized package — not the original Instruct
checkpoint. For **[TinySwallow-1.5B](https://huggingface.co/SakanaAI/TinySwallow-1.5B-Instruct-q4f32_1-MLC)**, it contains:

- 4-bit weight shards (`q4f32_1`: 4-bit weights, 32-bit activations)
- `mlc-chat-config.json` with tokenizer settings and runtime metadata
- a weight-cache manifest (`ndarray-cache.json` on the published build)
- tokenizer files

The compiled model library is a separate binary. This app uses the WebLLM
0.2.48 Qwen2 library
`Qwen2-1.5B-Instruct-q4f32_1-ctx4k_cs1k-webgpu.wasm`. 

Architecture,
quantization, 4K context, and a 1K prefill chunk are baked into that WASM file,
so `frontend/src/config/review.ts` must match it.

> [!IMPORTANT]
> Runtime, manifest, and WASM must move together — pin all three during upgrade.

> [!NOTE]
> Cloud inference does not use MLC. Modal and Hugging Face load
> `TinySwallow-1.5B-Instruct` through vLLM or Featherless, the full
> Instruct checkpoint rather than the browser-quantized artifact.

<br>

### Cache behavior

<br>

Selecting TinySwallow starts the download immediately (preload) instead of
waiting for the first Review click.

The prefetch worker pulls `mlc-chat-config.json`, the WASM library, tokenizer
files, and weight shards into the IndexedDB stores WebLLM 0.2.48 reads
(`webllm/config`, `webllm/wasm`, `webllm/model`) with eight parallel connections
instead of WebLLM's built-in four. When the engine starts, those blobs are
already local, so WebLLM mostly copies them onto the GPU and compiles shaders
rather than contending with network I/O.


> [!TIP]
> `VITE_WEBLLM_DOWNLOAD_CONCURRENCY` caps prefetch
> parallelism between 1 and 16 — raise it on fast links, lower it if the browser
> or network saturates.

> [!NOTE]
> Subsequent page
> visits can reuse IndexedDB artifacts unless the browser evicts or clears site
> data. The runtime also probes
> `navigator.gpu.requestAdapter({ powerPreference: "high-performance" })`.

> [!IMPORTANT]
> The **[MLC](https://llm.mlc.ai/)** artifact still ships
> `ndarray-cache.json`; newer **[WebLLM](https://webllm.mlc.ai/docs/)** asks
> for `tensor-cache.json`.

> [!IMPORTANT]
> The matching WASM library is the `v0_2_48`
> **[Qwen2](https://huggingface.co/Qwen/Qwen2-1.5B-Instruct)** `ctx4k_cs1k`
> build on
> **[GitHub raw](https://github.com/mlc-ai/binary-mlc-llm-libs/blob/main/web-llm-models/v0_2_48/Qwen2-1.5B-Instruct-q4f32_1-ctx4k_cs1k-webgpu.wasm)**.

> [!WARNING]
> Do not point `VITE_WEBLLM_MODEL_LIBRARY_URL` at
> **[jsDelivr](https://www.jsdelivr.com/)** — jsDelivr refuses `mlc-ai/binary-mlc-llm-libs`
> because that repository exceeds its 50 MB package limit.

> [!NOTE]
> The cache backend
> **[IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)** is set at
> `VITE_WEBLLM_CACHE_BACKEND=indexeddb`.

<br>

### Shared review contract

<br>

Browser WebLLM and every cloud provider load the same prompt files so local and
remote reviews stay comparable:

- `backend/app/prompts/review_system.txt` — system instruction
- `backend/app/prompts/review_user.txt` — compact user-prompt template used
  at the short (256) output budget; `{language}` is replaced, then the
  submitted source is appended
- `backend/app/prompts/review_user_detailed.txt` — same contract with 3-4
  sentence metric writeups
- `frontend/src/shared/review.ts` imports them for WebLLM

The model acts as a senior software engineer, writes user-facing text in
English, and returns JSON with keys in this order:

- overall `score` from 0 to 100
- `metrics` as an object with required keys Correctness, Security, and
  Maintainability. Short budgets ask for one evidence sentence per
  metric and omit snippets; medium and standard budgets ask for 3-4 sentences
- `summary` and evidence-based `rationale`
- findings with `severity` (`critical`, `warning`, `suggestion`), `title`,
  `description`, 1-based `line`, and optional `suggestion`

After generation, both runtimes normalize the payload. The post-processing makes truncated or messy
model output still render safely in the UI.

<br>

### Configs

<br>

Vite loads environment variables from the repository root (`envDir: ".."`). Browser defaults live
in `frontend/src/config/review.ts` and `frontend/src/config/app.ts`.

> [!TIP]
> Leave the browser defaults alone unless you are swapping the MLC artifact or
> mirroring downloads.

`.env.example` contains the keys you actually need for local or production setup.

> [!WARNING]
> CSP `connect-src` in `frontend/vite.config.ts` must include Hugging Face,
> `*.hf.co`, and `raw.githubusercontent.com`. Adding a mirror URL requires a
> matching CSP host or the browser will block the download even when the URL is
> correct.

<br>

---

## 🐟 Cloud Inference

<br>

FastAPI (**[`backend/app/inference.py`](backend/app/inference.py)**)
authenticates, rate-limits, and proxies to Modal, Hugging Face, or a custom
**[OpenAI-compatible](https://platform.openai.com/docs/api-reference/chat)**
URL. Credentials are added only to upstream requests and are never returned by
`GET /api/review`.

Provider requirements:

- Modal: both `MODAL_URL` and `MODAL_API_KEY`
- Hugging Face: `HUGGINGFACE_API_KEY`

<br>

### Modal Cloud Provider

<br>

Dedicated GPU inference via Modal-hosted vLLM.

Rate limits, timeouts, and retention defaults live in
`backend/app/config.py`. Modal GPU deploy defaults live in
`backend/inference/config.py`.

 The Modal GPU service lives in
`backend/inference/`; see
**[documentation/modal-vllm.md](documentation/modal-vllm.md)** for cold starts,
key rotation, and troubleshooting.

<br>

#### Demo

<br>

<p align="center">
  <video src="https://github.com/user-attachments/assets/d65c2d7c-2a99-49fa-a1b7-137d8305da64" width="85%" controls>
    <a href="https://github.com/user-attachments/assets/d65c2d7c-2a99-49fa-a1b7-137d8305da64"><strong>modal.mp4</strong></a>
  </video>
</p>

<br>

#### Modal first-time setup

<br>

Make targets use the shared `backend/.venv` created by uv.

```bash
make python-install
make modal-install
make modal-setup
```
<br>

`make modal-setup` opens a browser to authenticate the Modal CLI. Verify access
with:

```bash
make modal-secrets
```
<br>

Generate one random bearer token and save it before creating the Modal secret.
Modal cannot display the value later — if you lose it, rotate with
`make modal-key` and recreate the secret.

```bash
make modal-key
INFERENCE_API_KEY='paste-the-printed-value' make modal-secret
```

<br>

#### Modal deployment

<br>

```bash
make modal-deploy
```

<br>

The first deployment builds the vLLM/CUDA image and downloads the model, so it
can take several minutes. Modal prints a service URL ending in `modal.direct`.
Append `/v1/chat/completions` and configure FastAPI:

```env
MODAL_URL=https://YOUR-MODAL-SERVER.modal.direct/v1/chat/completions
MODAL_API_KEY=THE_GENERATED_SECRET  // bearer token
```

<br>

Restart `make local` after changing `.env.local`. `GET /api/review` lists Modal
only when both `MODAL_URL` and `MODAL_API_KEY`  are non-empty.

The server uses an L4 GPU, allows up to eight concurrent sequences, and scales
to zero after five idle minutes. 

The first request after scale-to-zero includes
a model-loading cold start that can take a few minutes and may initially
return HTTP 503 through the Modal gateway. Setting `MIN_CONTAINERS = 1` in
`backend/inference/config.py` removes that latency but continuously consumes
compute credit.

Service constants live in `backend/inference/config.py`.
`backend/inference/runtime.py` starts vLLM, waits until `/health` succeeds, and
stops the process group on shutdown. The Modal HTTP gateway is public
(`UNAUTHENTICATED = True`); vLLM still requires the bearer token from
`INFERENCE_API_KEY`.

<br>

#### Modal troubleshooting

<br>

- `modal: No such file or directory`: use the Make targets in this document.
- `Token missing`: run `make modal-setup`.
- HTTP 401 from Modal: `MODAL_API_KEY` does not match `INFERENCE_API_KEY` in the
  `ai-inference` secret.
- HTTP 502 from FastAPI with “provider is starting up”: the scale-from-zero
  container is still booting. Wait a minute and retry. Inspect Modal logs with
  `make modal-logs` if it keeps failing.
- `Could not find nvcc` in Modal logs: ensure `backend/inference/config.py`
  still sets `FLASHINFER_SAMPLER = "0"`, then run `make modal-deploy`.
- The first review is slow: wait for the scale-from-zero model load; subsequent
  requests reuse the warm container until the idle window expires.

<br>

### Hugging Face Cloud Provider

<br>

Hugging Face Inference Providers run TinySwallow through
**[Featherless](https://huggingface.co/docs/inference-providers)**:


- Requires a signed-in account. 
- Source leaves the browser and is sent to
  Featherless via Hugging Face.
- No Modal cold start. Billing is per request after Hugging Face's small
  monthly credit.
- Featherless rejects OpenAI `response_format.json_schema`. The prompt still
  asks for JSON; FastAPI parses the model text, including markdown fallbacks.

<br>

#### Demo

<br>

<p align="center">
  <video src="https://github.com/user-attachments/assets/23b479de-8afc-4c95-b479-268c51035b0b" width="85%" controls>
    <a href="https://github.com/user-attachments/assets/23b479de-8afc-4c95-b479-268c51035b0b"><strong>hf.mp4</strong></a>
  </video>
</p>

<br>

#### Hugging Face first-time setup

<br>

Create a fine-grained Hugging Face token with permission to call Inference
Providers. Put it in `.env.local`:

```env
HUGGINGFACE_API_KEY=hf_your_token
```

<br>

The Featherless router URL is the default — set `HUGGINGFACE_URL` only if you
need a different endpoint. 

Restart `make local` after changing `.env.local`.

`GET /api/review` lists Hugging Face when `HUGGINGFACE_API_KEY` is non-empty.

<br>

#### Hugging Face troubleshooting

<br>

- Hugging Face missing from `GET /api/review`: `HUGGINGFACE_API_KEY` is empty.
- HTTP 401 from Hugging Face: the token is invalid or lacks Inference
  Providers permission. Create a new fine-grained token and restart FastAPI.
- HTTP 402 or quota errors: the Hugging Face / Featherless credit is exhausted.
  Check usage on Hugging Face, then retry.
- Review fails to parse: Featherless sometimes returns markdown instead of
  JSON. FastAPI already has fallbacks; if it still fails, retry or lower
  `max_tokens`.

<br>

---

## 🐟 Backend

<br>

### How the router works

<br>

`frontend/src/services/reviewRunner.ts` sends the job either to the local WebLLM
engine or to `POST /api/review`.

 The API:

1. authenticates the HTTP-only session
2. validates the provider against the fixed allowlist (`modal`, `huggingface`,
   `custom`) and applies source and generation limits
3. reserves a request in PostgreSQL to enforce the per-user rate limit
4. POSTs to the configured provider URL with the [server-only bearer token](backend/app/inference.py)
5. returns a normalized `ReviewResult` without provider secrets

`GET /api/review` is unauthenticated and returns labels, model ids, and the
server limits (`temperature`, `maxCodeCharacters`, `maxTokens`, `maxFindings`,
`timeoutMs`, `requestsPerWindow`, `rateLimitWindowMinutes`). It never returns
URLs or keys.

Failed upstream calls return HTTP 502 with a sanitized message. Diagnostics
logs redact `authorization`, `cookie`, `proxy-authorization`, `set-cookie`, and
`x-api-key`. Reservation rows are marked `completed` or `failed` with
`duration_ms` and retained for `INFERENCE_REQUESTS_RETENTION_DAYS` (30) so
rate-limit windows and basic ops metrics stay queryable without keeping forever.

<br>

> [!NOTE]
> Source caps, rate limits, timeouts, and HTTP pool sizes are shared across
> Modal, Hugging Face, and custom, and set in `backend/app/config.py`.

<br>

### Backend routes

<br>

FastAPI mounts a small surface under `/api`:

```bash
/api/auth
/api/history
/api/history/{id}
/api/review
```

<br>

#### `POST /api/auth/register`

<br>

Creates an account, hashes the password with **[scrypt](https://en.wikipedia.org/wiki/Scrypt)**, and sets the session
cookie in the same response. Returns `{"user": <public user>}` with HTTP 201,
or 409 when the email already exists. Registration is rate-limited per IP so
bulk signup from a single address cannot flood the table.

The public user object never includes the password hash — only id, name,
email, and created time as exposed by the API serializers.

<br>

#### `POST /api/auth/login`

<br>

Verifies email and password, then sets the session cookie. Returns
`{"user": <public user>}`. Invalid credentials return 401 without revealing
which field failed, so callers cannot probe for registered emails through
error text. Repeated failures for an email or IP return 429 until the
lockout window elapses; successful login clears that pressure for the
authenticated identity.

<br>

#### `POST /api/auth/export`

<br>

Requires a valid session. Returns the public user record and every saved review
owned by that account, including full source and structured results.

<br>

#### `POST /api/auth/delete`

<br>

Requires a valid session and the current password as confirmation. Deletes the
user row; sessions, history, and inference reservations cascade with it.

<br>

#### `GET /api/auth/session`

<br>

Returns `{"user": <public user>}` from the HTTP-only session cookie, or
`{"user": null}` when no valid session exists. The SPA uses this on load to
decide whether dashboard and cloud inference are available without storing
credentials in `localStorage`.

<br>

#### `POST /api/auth/logout`

<br>

Clears the session cookie and deletes the server-side session row so a stolen
cookie cannot be reused after logout on that device.

<br>

#### `GET /api/history`

<br>

Requires a valid session. Returns up to 100 summaries owned by that user,
starred first, then newest first. Summaries include language, score, summary
text, a one-line code preview, line and character counts, and a favorite flag.
Inference fields (`provider`, `modelId`, `temperature`, `maxTokens`,
`maxFindings`, `durationMs`) appear only when present — browser-only saves may
omit them. Source and the full result payload are omitted so the list stays
cheap to render on the dashboard.

Response:

```json
[
  {
    "id": "uuid",
    "language": "python",
    "createdAt": "2026-09-09T15:30:00.000Z",
    "codePreview": "def add(a, b):",
    "score": 78,
    "summary": "Review summary",
    "starred": true,
    "lineCount": 12,
    "characterCount": 240,
    "provider": "modal",
    "modelId": "TinySwallow-1.5B-Instruct",
    "temperature": 0.2,
    "maxTokens": 512,
    "maxFindings": 3,
    "durationMs": 1500
  }
]
```

<br>

#### `GET /api/history/{id}`

<br>

Requires a valid session. Returns the full history record, including source and
structured result, only when both the entry ID and authenticated user ID match.
Returns 404 when no matching record exists — including when the id is valid but
belongs to someone else, so ownership is not leaked by status codes.

<br>

#### `POST /api/history`

<br>

Requires a valid session. Accepts `language`, `code`, and `result`. The API:

- permits Python, JavaScript, TypeScript, Go, Rust, and C++;
- rejects empty code or code over 200,000 characters;
- validates the required top-level review result fields;
- generates the history UUID on the server;
- returns the inserted record with HTTP 201.

<br>

#### `PATCH /api/history/{id}`

<br>

Requires a valid session. Accepts `{ "starred": true }` or `{ "starred": false }`
and updates only that favorite flag when both the entry ID and authenticated
user ID match. Returns the updated summary, or 404 when no matching record
exists. Source and result are never rewritten through this route.

<br>

#### `DELETE /api/history/{id}`

<br>

Requires a valid session. Deletes only when both the entry ID and authenticated
user ID match. Returns `{"deleted": true}`, or 404 when no matching record
exists.

<br>

#### `GET` and `POST /api/review`

<br>

`GET` returns configured cloud provider metadata and no credentials — labels,
model ids, and shared limits the UI needs to render the selector. `POST`
requires a valid session, accepts a fixed `modal`, `huggingface`, or `custom`
provider with generation parameters, and returns the same `ReviewResult`
contract as browser inference. Returns 429 when the per-user window is
exhausted, 503 when the provider is not configured, and 502 for sanitized
upstream failures.

Unauthenticated callers can still discover which clouds are available; only
signed-in users can spend a cloud review slot.

<br>

### Development

<br>

Local development is done with:

```bash
make setup
make local
```

<br>

- FastAPI listens on `API_PORT` (default `8000`) with reload on `backend/app/`.
- Vite listens on `PORT` (default `8022`) and proxies `/api` to
  `BACKEND_DEV_ORIGIN`.

<br>

### Demo

<br>

<p align="center">
  <video src="https://github.com/user-attachments/assets/1b44a30a-a14b-4f7b-93d7-6de1b38a7b0a" width="85%" controls>
    <a href="https://github.com/user-attachments/assets/1b44a30a-a14b-4f7b-93d7-6de1b38a7b0a"><strong>setup.mp4</strong></a>
  </video>
</p>

<br>

### Deployment

<br>

Build and host the API with
**[`backend/Dockerfile`](backend/Dockerfile)**:

```bash
make database-up
make database-schema
make backend-image
make backend-container
```

<br>

- `make backend-image` builds `ai-review-api`.
- `make backend-container` builds that image and runs it with `.env.local` on
  `API_PORT` (default `8000`).
- The container does not start Postgres and does not apply the schema.
- Inside the API container, `localhost` is the container itself, not Postgres on
  the host. Point `DATABASE_URL` at a host-reachable address such as
  `host.docker.internal` (`make backend-container` already maps that name) or
  the host IP.
- Set `APP_ENV=production` and `APP_PUBLIC_ORIGIN` to the public SPA URL.
  With `APP_ENV=production`, FastAPI warns at startup if that origin is still
  local.

<br>

---

## 🐟 Frontend

<br>

### Frontend routes

<br>

The **[Vite](https://vite.dev/)** SPA is a client-routed app:

```bash
/review
/dashboard
/account
/docs
/docs/{page}
/docs/{page}/{heading}
/sign-in
/register
```

<br>

### Development

<br>

Same as in the backend:

```bash
make setup
make local
```

<br>

### Deployment

<br>

Build the SPA and serve `frontend/dist` from any static host or reverse proxy.

Proxy `/api/*` to the FastAPI origin and fall back to `index.html` for client
routes so deep links to `/review` or `/docs/...` keep working.

```bash
make build
make preview
```

<br>

- `make preview` serves `frontend/dist` without the API proxy.
- Locally, Vite already proxies `/api` during `make local`.
- On the API host, set `APP_PUBLIC_ORIGIN` to this SPA's public URL
  (`APP_ENV=production` logs a warning if that origin is still localhost).

<br>

---

## 🐟 Database

<br>

<p align="center">
  <img src="documentation/assets/dashboard.png" alt="Saved reviews dashboard" width="85%">
</p>

<br>

PostgreSQL is a separate service for user management. **[`database/schema.sql`](database/schema.sql)** is the full idempotent schema. Apply to a hosted `DATABASE_URL` before serving traffic:

```bash
DATABASE_URL='postgresql://...'
make database-migrate
```

<br>

The default URL matches `.env.example` (local):

```text
postgresql://postgres:postgres@localhost:5432/ai_review
```

<br>

The required server key is `DATABASE_URL`. Everything else (pool size, body
limits, retention, auth lockouts) has defaults in `backend/app/config.py` —
leave them unset unless you need to change a default. `.env.example` only
lists required local keys plus cloud provider secrets.

<br>

### Database architecture

<br>

The application uses psycopg 3 with an asynchronous pool and a `DATABASE_URL`
connection string.

The schema is:

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  email TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE auth_attempts (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('login', 'register')),
  succeeded BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE review_history (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  language TEXT NOT NULL
    CHECK (language IN ('python', 'javascript', 'typescript', 'go', 'rust', 'cpp')),
  code TEXT NOT NULL,
  result JSONB NOT NULL,
  starred BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE inference_requests (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('modal', 'huggingface', 'custom')),
  status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

<br>

Indexes on `review_history (user_id, created_at DESC)` (optimizes paginated ferhing of user history chronologially) and `(user_id, starred DESC, created_at DESC)` (accelerates queries filtering for pinned/starred items first, ordered by recency).

`inference_requests (user_id, created_at DESC)` backs the cloud rate-limit
window (it supports rapid lookups over recent time windows to enforce cloud rate-limiting rules).

`user_sessions.expires_at` is indexed for the scheduled cleanup job (it enables efficient lookup and deletion queries for scheduled garabase-collection jos cleaning up stale sessions).

The history table stores the full structured result as JSONB so review finding
changes do not immediately require migrations — new optional fields can land in
the payload without altering columns.

<br>

---

## 🐟 Tests and CI/CD

<br>

### Demo 

<br>

<p align="center">
  <video src="https://github.com/user-attachments/assets/6da17575-55c7-41a4-9849-b84dddf54501" width="85%" controls>
    <a href="https://github.com/user-attachments/assets/6da17575-55c7-41a4-9849-b84dddf54501"><strong>tests.mp4</strong></a>
  </video>
</p>

<br>

### Development

<br>

Run the frontend and backend suites in parallel, then print combined coverage:

```bash
make test
```

<br>

### Local CI

<br>

In addition, `make precommit` always runs lint and the full test suite at `git commit`.

<br>

### Remote CI

<br>

**[GitHub Actions](https://docs.github.com/en/actions)** runs `make lint`,
`make test-py`, and `make test-js` on pushes to `main` and on pull requests.

<br>

---

## 🐟 Security

<br>

### API key management

<br>

> [!IMPORTANT]
> Cloud provider credentials (`MODAL_API_KEY`, `HUGGINGFACE_API_KEY`,
> `CUSTOM_INFERENCE_API_KEY`) and `DATABASE_URL` live only in server environment
> variables or Modal secrets — never in the Vite bundle, client config, or
> `GET /api/review` responses. Treat every `VITE_*` value as public.

FastAPI attaches the matching bearer token solely to the upstream provider
request; logs redact `authorization`, `cookie`, `proxy-authorization`,
`set-cookie`, and `x-api-key`.

Rotate Modal's `INFERENCE_API_KEY` together with the API host's
`MODAL_API_KEY` so they stay in sync.

  <br>

### Input handling

<br>

SQL values use parameterized queries. The API validates
  UUIDs, languages, payload shape, generation parameters, and source size
  before any write or upstream call.

<br>

### Auth

<br>

Accounts use **[scrypt](https://en.wikipedia.org/wiki/Scrypt)** password hashes and random session tokens. 

Only
  a SHA-256 hash of each token is stored in PostgreSQL; the original is sent in
  an HTTP-only, **[SameSite=Lax](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie#samesitelax)** cookie (`Secure` and a `__Host-` prefix in
  production).

<br>

### Request hardening

<br>

Cookie-authenticated mutating `/api` requests must
  present an allowed `Origin` or `Referer`.
  
   Responses set **[CSP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP)**
  `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `Referrer-Policy`,
  `Permissions-Policy`, and **[HSTS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Strict-Transport-Security)** in production.
  
   History ownership is always
  derived server-side from the session — never from a client-supplied user id.

<br>

### Data at rest / in transit

<br>

Submitted source and complete review results
  are stored unencrypted at the application layer. 
  
  Cloud review source is
  transmitted to the configured provider.

<br>

---

## 🐟 Performance Optimization

<br>

> [!CAUTION]
> *These notes contain untested ideas and are an active subject of my research and a work in progress.*

<br>

### CDN / same-origin mirror

<br>

First load is dominated by the WASM library and
  the ~870 MB `params_shard_*.bin` weight shards. 
  
  Host both on R2, Fastly, or a
  Tokyo-adjacent origin; point `VITE_WEBLLM_MODEL_URL` and
  `VITE_WEBLLM_MODEL_LIBRARY_URL` at that origin and extend CSP `connect-src`.
  
  jsDelivr
  cannot proxy `binary-mlc-llm-libs` (over its 50 MB package limit).

<br>

### q4f16 reconversion

<br>

It ships only `q4f32_1`. A `q4f16_1` build is
  smaller and faster on GPUs that advertise `shader-f16`. Probe the feature,
  prefer f16 when available, and fall back to q4f32 when the driver misreports
  support. 
  
  Requires `mlc_llm convert_weight`, `gen_config`, `compile`, and a
  matching wasm.

<br>

### WebLLM upgrade

<br>

> [!WARNING]
> Reconvert the artifact with `tensor-cache.json` before unpinning WebLLM
> 0.2.48. 

<br>

### COOP/COEP

<br>

To leverage high-performance in-browser WebLLM inference via WebAssembly (WASM), threads require access to `SharedArrayBuffer`. Browsers mandate strict cross-origin isolation headers to enable this API securely:

`Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp` can unlock SharedArrayBuffer.

> [!CAUTION]
> Measure before shipping — isolation breaks embedding and some cross-origin
> fetches unless the mirror also sends CORP.

<br>

### 4K context window

<br>

Keep context at 4K. A larger KV cache slows prefill,
  and `ctx4k` is baked into the current wasm filename.
