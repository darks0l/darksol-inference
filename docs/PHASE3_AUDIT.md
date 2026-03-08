# Phase 3 Audit (First Commit -> HEAD)

## Scope

Audit date: 2026-03-08  
Repository span reviewed: `e10f44e` (init) through current `HEAD`.

## What Exists

### CLI

- Entrypoint: `bin/darksol.js`, command registration in `src/cli.js`.
- Commands currently registered:
  - `serve`
  - `run`
  - `pull`
  - `list`
  - `rm`
  - `ps`
  - `info`
  - `browse`
  - `status`
  - `search`
- Current CLI tests (`test/cli.test.js`) cover:
  - command registration
  - `search` output formatting

### API

- Server bootstrap: `src/server/index.js` (Fastify).
- Auth middleware for `/v1/*` when API key configured.
- Routes currently present:
  - `GET /health`
  - `GET /v1/models`
  - `GET /v1/directory/models`
  - `GET /v1/bankr/health`
  - `GET /v1/app/meta`
  - `POST /v1/chat/completions`
  - `POST /v1/completions`
  - `POST /v1/embeddings`
- Error helpers:
  - OpenAI-style error envelope helper
  - route-level mapping for model-not-found and internal errors

### Features

- Local model install/list/remove and one-shot run flow.
- OpenAI-compatible surface for chat/completions/embeddings.
- HuggingFace directory lookup via REST + normalized result schema.
- Bankr gateway config/status scaffold.
- Hardware discovery and optimization scaffolding.
- Phase 3 app bootstrap endpoint (`/v1/app/meta`) for web shell clients.

### Tests

- Test runner: Node built-in test runner (`node --test`).
- `test/server.test.js` integration coverage includes:
  - health and models routes
  - chat validation errors
  - directory happy path and upstream failure behavior
  - bankr health status
  - app metadata bootstrap endpoint
- `test/cli.test.js` unit coverage for command registration and search rendering.

### Assets and Web

- Source brand asset: `assets/footer-logo-darksol.png`.
- Asset notes: `assets/ASSETS.md`.
- Generated icon pack:
  - `assets/icons/favicon-32x32.png`
  - `assets/icons/apple-touch-icon.png`
  - `assets/icons/favicon.ico` (placeholder copy of `favicon-32x32.png`)
  - `assets/icons/site.webmanifest`
- Local static shell:
  - `web/index.html`
  - `web/styles.css`

### Packaging Metadata

- `package.json` includes:
  - package name/version/bin metadata
  - runtime dependencies
  - dev dependency `sharp` for icon generation
  - scripts:
    - `npm test`
    - `npm run generate:icons`
- `package-lock.json` is present and current.

## Missing Pieces / Risks

- Static files are not served by the API server yet. `/v1/app/meta` exposes paths, but `/web/*` and `/assets/*` are local file references only.
- `favicon.ico` is currently a placeholder PNG copy with `.ico` extension, not a true multi-resolution ICO.
- No CI workflow currently enforces `npm test` on push/merge.
- No explicit API schema/OpenAPI document for route contracts.
- Route list in `/v1/app/meta` is static; risk of drift if new routes are added without updating this list.
- CLI tests focus on registration/search; other command behaviors (serve/run/pull/rm/status/info) remain lightly tested.
- Security/auth behavior is only lightly tested (no API-key-required integration cases).

## Recommended Next Milestones

1. Serve local static assets from Fastify:
   - expose `/web/*` and `/assets/*` directly for local dashboard use
   - add route tests to verify static delivery and MIME types
2. Replace placeholder `.ico` with true multi-size ICO output:
   - add deterministic ICO generation (16/32/48/64) in icon script
   - add script-level validation step
3. Expand test depth:
   - add API-key auth tests (missing/invalid token cases)
   - add CLI integration tests for serve/run/pull/rm/status/info paths
4. Introduce CI baseline:
   - GitHub/GitLab pipeline for `npm ci`, `npm test`, and lint checks
5. Add API contract docs:
   - OpenAPI spec or route reference with request/response examples
   - keep `/v1/app/meta` and docs generated from one source of truth
