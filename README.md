<p align="center">
  <img src="https://gitlab.com/darks0l/darksol-inference/-/raw/master/assets/darksol-banner.png" alt="DARKSOL" width="600" />
</p>
<h3 align="center">Built by DARKSOL 🌑</h3>

<p align="center">
  <a href="https://www.npmjs.com/package/darksol"><img src="https://img.shields.io/npm/v/darksol?style=flat-square" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/darksol"><img src="https://img.shields.io/npm/l/darksol?style=flat-square" alt="license" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D20-3C873A?style=flat-square" alt="node >=20" />
</p>

# DARKSOL Inference

`darksol` is a local LLM inference engine with a CLI and an OpenAI-compatible API server.

## Install

From source:

```bash
npm install
```

Run CLI directly:

```bash
node bin/darksol.js --help
```

Optional global install from this repository:

```bash
npm install -g .
darksol --help
```

## CLI

Show global help:

```bash
node bin/darksol.js --help
```

Start the API server:

```bash
node bin/darksol.js serve --host 127.0.0.1 --port 11435
```

List installed local models:

```bash
node bin/darksol.js list
```

List installed models including Ollama local inventory (when enabled):

```bash
node bin/darksol.js list
```

Pull a model:

```bash
node bin/darksol.js pull llama-3.2-3b
```

Run a one-shot prompt:

```bash
node bin/darksol.js run llama-3.2-3b "Write a haiku about local inference."
```

Run against an Ollama-downloaded model explicitly:

```bash
node bin/darksol.js run ollama/llama3.2:latest
```

List loaded model processes:

```bash
node bin/darksol.js ps
```

Search HuggingFace model directory:

```bash
node bin/darksol.js search "llama" --limit 5 --task text-generation
```

Manage MCP server registry:

```bash
node bin/darksol.js mcp list
node bin/darksol.js mcp enable CoinGecko
node bin/darksol.js mcp disable CoinGecko
```

## API

Default base URL: `http://127.0.0.1:11435`

- `GET /health` - service liveness and metadata.
- `GET /v1/models` - list installed models in OpenAI list format.
- `GET /v1/ollama/models` - list Ollama local models in OpenAI list format.
- `GET /v1/directory/models` - search HuggingFace model directory with `q`, `limit`, and `task`.
- `GET /v1/bankr/health` - Bankr gateway scaffold status (`configured`/`sandbox`) without secrets.
- `GET /v1/app/meta` - app shell bootstrap metadata (name/version/routes + branding + desktop/web scaffold references).
- `GET /v1/mcp/servers` - list configured MCP servers.
- `POST /v1/mcp/servers/:name/enable` - enable an MCP server.
- `POST /v1/mcp/servers/:name/disable` - disable an MCP server.
- `POST /v1/chat/completions` - OpenAI-compatible chat completions.
  - MCP integration foundation: if enabled MCP servers expose tool schemas, DARKSOL injects OpenAI-compatible tool definitions into Ollama chat requests, executes returned tool calls against configured MCP endpoints, appends tool results, and continues completion in a bounded multi-turn loop.
- `POST /v1/completions` - OpenAI-compatible text completions.
  - Provider policy: explicit `ollama/<model>` ids always use Ollama; unprefixed model ids prefer local DARKSOL models and fall back to Ollama only when the local model is not installed and Ollama is enabled.
  - Runtime policy: both inference routes share a request queue with configurable concurrency (`inferenceConcurrency`, default `1`) plus provider timeout/retry guards (`providerTimeoutMs`, default `15000`; `providerRetryCount`, default `1` retry for transient errors).
- `POST /v1/embeddings` - OpenAI-compatible embeddings.

API contract:

- OpenAPI 3.1 document: `docs/openapi.json`
- Contract source of truth: `src/server/contract/routes.js` and `src/server/contract/openapi.js`
- Regenerate OpenAPI document from source contract: `npm run generate:openapi`
- Validate route inventory + OpenAPI sync by running `npm test` (`/v1/app/meta` and `docs/openapi.json` are both checked against the generated contract).

Chat completion example:

```bash
curl -X POST http://127.0.0.1:11435/v1/chat/completions \
  -H "content-type: application/json" \
  -d '{
    "model": "llama-3.2-3b",
    "messages": [
      { "role": "user", "content": "Hello from DARKSOL." }
    ]
  }'
```

Model list example:

```bash
curl http://127.0.0.1:11435/v1/models
```

Ollama model list example:

```bash
curl http://127.0.0.1:11435/v1/ollama/models
```

Completion using an Ollama model id:

```bash
curl -X POST http://127.0.0.1:11435/v1/completions \
  -H "content-type: application/json" \
  -d '{
    "model": "ollama/llama3.2:latest",
    "prompt": "Summarize local-first inference in one sentence."
  }'
```

Directory search example:

```bash
curl "http://127.0.0.1:11435/v1/directory/models?q=llama&limit=3&task=text-generation"
```

App shell metadata example:

```bash
curl http://127.0.0.1:11435/v1/app/meta
```

## Favicon / Web Assets

Source logo:

- `assets/footer-logo-darksol.png` (canonical branding source for web icon generation)

Generate icons and manifest:

```bash
npm run generate:icons
```

Generated outputs:

- `assets/icons/favicon-32x32.png`
- `assets/icons/apple-touch-icon.png`
- `assets/icons/favicon.ico` (true ICO container with 16/32/48 icon sizes)
- `assets/icons/site.webmanifest`

`scripts/generate-icons.mjs` uses `sharp` and `png-to-ico` to generate PNG variants plus a multi-resolution `.ico`.

## Desktop + Web GUI Foundation (Phase 8)

Desktop scaffold (primary service pack path):

- `desktop/src/main.js` (desktop entrypoint placeholder)
- `desktop/src/preload.js` (desktop bridge placeholder)
- `desktop/config/packaging.win.json` (Windows packaging path placeholder)
- `desktop/config/packaging.mac.json` (macOS packaging path placeholder)

Web mirror shell (lighter UX scope):

- `web/index.html`
- `web/styles.css`

The web shell now mirrors the desktop three-panel layout skeleton (left navigation, center chat/work area, right diagnostics panel). Files are served by Fastify at `/web/*`, and branding files are served at `/assets/*`.

Static serving safety at this phase:

- static assets are restricted to loopback clients only
- path traversal is prevented by Fastify static file serving rooted in `web/` and `assets/`

## CI

Current CI provider: GitHub Actions.

- Workflow: `.github/workflows/ci.yml`
- Triggers: push and pull request
- Jobs: `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`

## Contributor Notes

Route inventory and OpenAPI sync:

- Update route definitions in `src/server/contract/routes.js`.
- Regenerate `docs/openapi.json` with `npm run generate:openapi`.
- `/v1/app/meta` consumes route inventory from the same contract source (`getRouteInventory()`), so runtime route metadata and OpenAPI remain aligned.
- `test/openapi-contract.test.js` fails if `docs/openapi.json` drifts from generated contract output.

## Environment

- `HUGGINGFACE_TOKEN` (optional): auth token for private/rate-limited HuggingFace directory access.
- `BANKR_BASE_URL` (optional): Bankr gateway base URL.
- `BANKR_API_KEY` (optional): Bankr API key.
- `BANKR_SANDBOX` (optional, default `true`): mark Bankr client as sandbox mode.
- `DARKSOL_OLLAMA_ENABLED` (optional, default `true`): enable/disable Ollama interoperability.
- `DARKSOL_OLLAMA_BASE_URL` (optional, default `http://127.0.0.1:11434`): Ollama HTTP endpoint.

MCP registry file (created on first MCP command/API use):

- `~/.darksol/mcp-servers.json`

`~/.darksol/config.json` runtime controls (optional):

- `inferenceConcurrency` (default `1`): max concurrent in-flight requests across `/v1/completions` and `/v1/chat/completions`.
- `providerTimeoutMs` (default `15000`): per-attempt provider call timeout.
- `providerRetryCount` (default `1`): retry count for transient provider errors (timeouts, upstream `5xx`, connectivity faults).

Remote Ollama host example:

```bash
DARKSOL_OLLAMA_BASE_URL=http://10.0.0.25:11434 node bin/darksol.js serve
```

## Project Structure

```text
bin/
  darksol.js              # CLI entrypoint
src/
  cli.js                  # command registration
  commands/               # CLI command handlers
  engine/                 # inference, embeddings, model loading
  hardware/               # device detection and optimization
  lib/                    # config, paths, logging
  models/                 # model registry, pull, aliases
  server/                 # Fastify API server + routes
scripts/
  generate-icons.mjs      # icon + webmanifest generation from source logo
assets/
  darksol-banner.png      # DARKSOL treatment banner
  footer-logo-darksol.png # source branding asset
  icons/                  # generated favicon/web icon pack
web/
  index.html              # desktop-mirror web shell
  styles.css              # desktop-mirror shell styles
docs/
  API_CONTRACT_SYNC.md    # route inventory + OpenAPI source-of-truth workflow
  PHASE8_DESKTOP_WEB_ARCHITECTURE.md # desktop/web split architecture + feature matrix
  PHASE3_AUDIT.md         # commit-span audit + risks + next milestones
desktop/
  src/main.js             # desktop app entrypoint placeholder
  src/preload.js          # desktop preload bridge placeholder
  config/                 # desktop packaging placeholders (win/macos)
test/
  cli.test.js             # deterministic command-level CLI tests (serve/run/pull/list/rm/ps/info/browse/status/search + provider error paths)
  server.test.js          # API integration tests
```

Built with teeth. 🌑
