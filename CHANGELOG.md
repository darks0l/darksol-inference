# Changelog

## 0.3.1
- Added CLI alias `darksol-studio` while keeping install and package name unchanged (`npm i -g darksol`).
- Updated docs + landing examples to prefer `darksol-studio ...` commands and note `darksol ...` remains supported.
- Desktop backend boot hardening: packaged app now prioritizes bundled backend entrypoint and avoids PATH-dependent `spawn darksol ENOENT` failures.
- Desktop installer packaging now includes backend CLI/runtime resources under `resources/backend/*`.

## 0.3.0
- **Bankr LLM Gateway — full integration.** Real client for Bankr's OpenAI-compatible cloud gateway (`https://llm.bankr.bot`): model listing, usage summaries, streaming chat completions with SSE passthrough, and cost tracking. New API routes: `GET/POST /v1/bankr/config`, `GET /v1/bankr/models`, `GET /v1/bankr/usage`. Chat router supports `bankr/<model>` ids, explicit `route: "bankr"`, and config-based default route (`local`/`bankr`). Settings UI wired with enable toggle, base URL, API key, default route selector, save + usage refresh.
- **Ollama import UI.** New "Import from Ollama" modal in Models panel — multi-select your existing Ollama models and import them into Darksol via zero-copy hardlink (recommended) or full copy. New API: `POST /v1/models/import-ollama`.
- **Direct Ollama GGUF loading.** Ollama models now load directly through node-llama-cpp from filesystem GGUFs — no Ollama daemon needed for inference. Pool falls back to daemon proxy only if direct loading fails.
- **In-app model pull.** New `POST /v1/models/pull` API for pulling HuggingFace models from the UI.
- **Runtime port service.** Lightweight port management in Settings: host selector (localhost/LAN), port input, check availability, find free port, apply + restart runtime. New APIs: `GET /v1/runtime/ports`, `POST /v1/runtime/ports/find`, `POST /v1/runtime/config`.
- **Interactive Studio UI.** Wired all 4 panels to real API endpoints: Models panel (live model list, search, provider grouping, click-to-select), Chat panel (real SSE streaming inference, typing indicator, abort, message history), Settings panel (MCP toggles, runtime status, Bankr config, port service). Toast notifications, empty state placeholders, tree collapse, 30s auto-refresh.
- **Filesystem-first model discovery.** `/v1/models` now discovers Ollama models from disk before falling back to Ollama API — works without daemon.
- Added Darksol Engine Runtime Manager with managed lifecycle controls, PID ownership, health polling, and runtime status reporting.
- Added Keep-Warm scheduler with config-backed controls and periodic inference pings to keep models resident.
- Added runtime control API routes and CLI command groups for runtime and keep-warm operations.
- Added desktop IPC bridge methods for runtime and keep-warm controls.
- Added deterministic test coverage for runtime manager, keep-warm scheduler, and config persistence.
- Updated OpenAPI contract and route inventory for all new endpoints.

## 0.2.1
- npm docs cleanup: removed npm-facing README clutter around portal/web implementation details and kept README focused on install + usage.
- Added `docs/WEB.md` to house web/desktop implementation notes outside of npm package docs.

## 0.2.0
- Added MCP integration foundation: file-backed MCP server registry (`~/.darksol/mcp-servers.json`) with preconfigured CoinGecko/DexScreener/Etherscan/DefiLlama entries, OpenAI tool-schema injection, and MCP tool-call execution loop for chat completions.
- Added MCP management surfaces: CLI `darksol mcp list|enable|disable` and API routes `GET /v1/mcp/servers`, `POST /v1/mcp/servers/:name/enable`, and `POST /v1/mcp/servers/:name/disable`.
- Added deterministic tests for MCP registry, tool injection, executor, chat tool-call loop integration, and MCP CLI/API command paths.
- MVP hardening: upgraded `darksol pull <model>` HuggingFace path with explicit model/file resolution via HF API metadata, disk-space preflight checks, improved error mapping (`model_not_found`, auth/network failures, insufficient storage), and safer partial-file cleanup semantics.
- MVP hardening: added persistent local usage/cost tracking in `src/lib/cost-tracker.js`, wired completion/chat usage logging (including streaming flows), exposed `GET /v1/app/usage`, and added CLI `darksol usage`.
- MVP hardening: enhanced HuggingFace search/directory recommendations with sort options (`trending|popular|downloads|recent|likes`), optional hardware-aware fit filtering (`recommended|will_fit|might_fit|any`), and compatibility indicators (`will fit`, `might fit`, `won't fit`).
- Added deterministic test coverage for pull download/error handling, usage tracking/stat formatting, completion usage logging, and hardware-aware directory filtering; updated OpenAPI contract/docs for new query parameters and `/v1/app/usage`.
- MVP hardening: wired real embeddings execution path through `node-llama-cpp` embedding contexts (`src/engine/embeddings.js`) and upgraded `/v1/embeddings` to support both string and string-array inputs with deterministic embedding list responses.
- MVP hardening: expanded `darksol info <model>` to surface richer metadata across both darksol-installed models and Ollama local discovery, including GGUF path, size, quantization, family, and parameter size when available.
- MVP hardening: upgraded `darksol browse` with optional interactive pull selection (TTY-aware) while preserving explicit `--pull` index flow and real download installation behavior.
- MVP hardening: improved `darksol serve` startup with saved-config defaults, automatic model preloading, startup loaded-model diagnostics, and graceful SIGINT/SIGTERM shutdown cleanup.
- MVP hardening: added clearer common failure messaging for no models installed, model-too-large-for-memory scenarios, and corrupt/incompatible GGUF loading paths.
- Added deterministic tests for embeddings engine/route behavior plus expanded CLI coverage for serve config preload defaults, interactive browse flow, and Ollama-backed info metadata output.
- MVP hardening: wired robust SSE token streaming for `/v1/chat/completions` and `/v1/completions` with local `node-llama-cpp` streaming iterators, Ollama stream passthrough, and client-disconnect abort handling.
- MVP hardening: upgraded HuggingFace model pull path to real streamed GGUF downloads with auth-token headers (`HUGGINGFACE_TOKEN`/`HF_TOKEN`), temp-file safety, cleanup-on-failure, and progress callback updates.
- MVP hardening: replaced static hardware assumptions with real detection (CPU/RAM/GPU via `systeminformation` plus `node-llama-cpp` runtime GPU/VRAM/backends), and updated model optimization heuristics for `gpuLayers`, `threads`, `batchSize`, and `contextSize`.
- MVP hardening: added server runtime health route (`GET /health/runtime`) and wired `darksol ps`/`darksol status` to report live loaded models and runtime hardware from the running server (with local fallback).
- Added deterministic tests for SSE streaming responses and runtime-backed `ps` behavior.
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
- Added project landing page in `landing/` and deployed to Cloudflare Pages (`darksol-cc`) with app-matching purple/dark design.
- Updated README to remove internal favicon/web asset implementation notes from npm-facing docs and focus on product usage.

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
