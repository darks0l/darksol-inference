# Changelog

## Unreleased
- Workstream 2: added local-only Ollama model discovery in `src/providers/ollama-local.js` by scanning manifests/blobs under `~/.ollama/models` (`%USERPROFILE%\\.ollama\\models` on Windows).
- Workstream 2: updated `darksol list` to show locally installed Ollama models without requiring the Ollama daemon.
- Workstream 2: updated `darksol run ollama/<model>` to resolve and load GGUF files directly from local Ollama storage via native inference path.
- Workstream 2: added deterministic filesystem-mocked tests for local Ollama discovery and GGUF resolution (`test/ollama-local.test.js`).
- Workstream 1: wired real local GGUF loading/inference via `node-llama-cpp` in `src/engine/{loader,inference,pool}.js` with configurable models directory override (`DARKSOL_MODELS_DIR`), pool load/unload lifecycle management, and LRU-style memory guardrails (`DARKSOL_MAX_LOADED_MODELS`, `DARKSOL_MAX_LOADED_MODEL_BYTES`).
- Added smoke coverage for graceful startup failure when a registry model exists but its GGUF file is missing (`test/inference-smoke.test.js`).
- Phase 8 kickoff: added desktop/web architecture spec at `docs/PHASE8_DESKTOP_WEB_ARCHITECTURE.md` with product boundary, shared components, branding references, and feature matrix.
- Phase 8 kickoff: added non-breaking `desktop/` scaffold with entrypoint placeholders (`src/main.js`, `src/preload.js`) and Windows/macOS packaging path configs.
- Phase 8 kickoff: upgraded web shell to desktop-mirror three-panel layout (`left nav`, `center chat/work area`, `right diagnostics`) using DARKSOL branding assets.
- Expanded `/v1/app/meta` metadata to include desktop scaffold references plus additional branding/web layout fields.
- Updated integration tests for app metadata references and refreshed web shell static content markers.
- Phase 7 hardening: API provider routing now prefers local DARKSOL models for unprefixed model ids and automatically falls back to Ollama when local model is missing and Ollama is enabled.
- Added deterministic server integration tests for unprefixed local-miss fallback behavior in `/v1/completions` and `/v1/chat/completions`.
- Phase 7 reliability baseline: added shared inference queue controls for `/v1/completions` + `/v1/chat/completions` with configurable `inferenceConcurrency` (default `1`).
- Phase 7 reliability baseline: added provider call timeout/retry wrapper (`providerTimeoutMs` default `15000`, `providerRetryCount` default `1`) and OpenAI-style `provider_timeout` error mapping.
- Added deterministic integration tests for queue serialization, transient provider retry, and timeout/retry behavior.

## 0.1.2
- README aligned to DARKSOL package treatment used across other repos/pages (banner, badges, footer voice).
- Added `assets/darksol-banner.png` for consistent brand presentation.
- npm page/docs refresh only; runtime behavior unchanged.

## 0.1.0
- Phase 1 MVP scaffold
- CLI commands for serve/run/pull/list/rm/ps/info/browse/status
- OpenAI-compatible endpoints
- HuggingFace GGUF model browser and downloader
- Hardware detection and inference optimization

## 0.1.1
- Packaging hardening: added npm `files` allowlist to ship only runtime CLI/app assets (trimmed tarball footprint and excluded dev/docs/test workflows).
- Phase 7 quality: expanded deterministic CLI + provider error-path coverage (`pull`, `rm`, `ps`, `browse`, and run/list/status offline/invalid states).
- Phase 7 kickoff: added `darksol run <model> [prompt...]` one-shot mode for both local and `ollama/<model>` targets while preserving interactive chat mode.
- Phase 7 kickoff: expanded CLI tests to cover one-shot local + Ollama run flows with deterministic dependency stubs.
- Phase 6: added Ollama provider client with configurable base URL (`DARKSOL_OLLAMA_BASE_URL` / config `ollamaBaseUrl`) and enable flag (`DARKSOL_OLLAMA_ENABLED` / config `ollamaEnabled`).
- Phase 6: added Ollama model discovery route `GET /v1/ollama/models` and integrated Ollama inventory into `GET /v1/models` when enabled.
- Phase 6: added OpenAI-compatible chat/completion routing for explicit `ollama/<model>` ids and OpenAI-style API error envelopes for Ollama connectivity/model failures.
- Phase 6: updated `darksol list` and `darksol run` to support Ollama local models with explicit provider tagging.
- Phase 6: added deterministic integration tests for Ollama model listing, prompt execution, and failure scenarios (offline/model missing).
- Phase 5: replaced hardcoded `/v1/app/meta` route inventory with shared contract source (`src/server/contract/routes.js`).
- Phase 5: added generated OpenAPI source module (`src/server/contract/openapi.js`) and `npm run generate:openapi` to write `docs/openapi.json`.
- Phase 5: extended contract tests to assert `/v1/app/meta`, generated contract, and `docs/openapi.json` all stay synchronized.
- Phase 5: expanded CLI command-level tests with deterministic stubs for `serve`, `status`, `list`, and `info`.
- Phase 5: added lint/typecheck gates (`npm run lint`, `npm run typecheck`) and CI workflow now runs `npm ci`, lint, typecheck, and test.
- Added `docs/API_CONTRACT_SYNC.md` and README contributor notes for route inventory/OpenAPI synchronization workflow.
- Served local static assets from Fastify at `/web/*` and `/assets/*` with loopback-only access restrictions.
- Added integration tests for static web/icon delivery, content types, and non-loopback static access rejection.
- Replaced placeholder favicon generation with true multi-size ICO output (16/32/48) in `scripts/generate-icons.mjs`.
- Added `png-to-ico` and regenerated `assets/icons/favicon.ico` as a valid ICO binary container.
- Added API-key auth integration tests for missing/invalid bearer token behavior on `/v1/*` and explicit `/health` public access.
- Added GitHub Actions CI workflow running `npm ci` and `npm test` on push and pull requests.
- Added OpenAPI contract at `docs/openapi.json` for current endpoints.
- Added integration test that verifies `/v1/app/meta` route inventory aligns with OpenAPI paths.
- Updated README and Phase 3 audit documentation for static serving, API contract usage, CI, and remaining risks.
- Added `GET /v1/directory/models` with HuggingFace-backed search (`q`, `limit`, `task`) and normalized item schema.
- Added robust directory upstream error handling with OpenAI-style error envelopes.
- Added `darksol search <query> [--limit <n>] [--task <tag>]` CLI command for concise model search output.
- Added Bankr gateway scaffolding with env-based config and `GET /v1/bankr/health` status endpoint.
- Added integration tests for directory route happy/error paths and Bankr health endpoint.
- Added CLI test coverage for `search` command registration and output shape.
- Added Phase 3 icon generation script `scripts/generate-icons.mjs` using `assets/footer-logo-darksol.png`.
- Added generated web icon pack under `assets/icons/` and `assets/icons/site.webmanifest`.
- Added Phase 3 static web shell placeholders in `web/index.html` and `web/styles.css`.
- Added `GET /v1/app/meta` endpoint for app bootstrap metadata (name/version/routes/branding paths).
- Added integration test coverage for `GET /v1/app/meta`.
- Added `docs/PHASE3_AUDIT.md` documenting current surface area, gaps/risks, and recommended milestones.
- Expanded README with favicon/web asset workflow, app meta route docs, and project structure updates.
