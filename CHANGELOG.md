# Changelog

## 0.1.0
- Phase 1 MVP scaffold
- CLI commands for serve/run/pull/list/rm/ps/info/browse/status
- OpenAI-compatible endpoints
- HuggingFace GGUF model browser and downloader
- Hardware detection and inference optimization

## Unreleased
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
