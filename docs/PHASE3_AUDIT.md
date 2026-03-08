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

## Missing Pieces / Risks (Updated After Phase 4)

- Static files are now served by Fastify at `/web/*` and `/assets/*`, including loopback-only access controls and integration tests.
- `favicon.ico` is now generated as a true multi-resolution ICO (16/32/48) via `scripts/generate-icons.mjs`.
- CI now runs `npm ci` and `npm test` on push and pull requests via GitHub Actions.
- API contract now exists at `docs/openapi.json`, with integration tests verifying alignment against `/v1/app/meta` route inventory.
- API-key auth integration tests now cover missing/invalid bearer token cases and explicit `/health` public behavior.
- Remaining risk: `/v1/app/meta` route inventory is still manually maintained in code and can drift if routes are added without updating that list and OpenAPI together.
- Remaining risk: CLI tests still focus on registration/search; broader command integration depth is still limited.

## Recommended Next Milestones

1. Reduce route contract drift:
   - generate `/v1/app/meta` route inventory from registered routes and generate OpenAPI from one source of truth
2. Expand CLI integration tests:
   - add command-level tests for serve/run/pull/rm/status/info flows
3. Add lint/typecheck gates in CI:
   - include static analysis alongside `npm test`
