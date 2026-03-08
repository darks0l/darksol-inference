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

Pull a model:

```bash
node bin/darksol.js pull llama-3.2-3b
```

Run a one-shot prompt:

```bash
node bin/darksol.js run llama-3.2-3b "Write a haiku about local inference."
```

List loaded model processes:

```bash
node bin/darksol.js ps
```

Search HuggingFace model directory:

```bash
node bin/darksol.js search "llama" --limit 5 --task text-generation
```

## API

Default base URL: `http://127.0.0.1:11435`

- `GET /health` - service liveness and metadata.
- `GET /v1/models` - list installed models in OpenAI list format.
- `GET /v1/directory/models` - search HuggingFace model directory with `q`, `limit`, and `task`.
- `GET /v1/bankr/health` - Bankr gateway scaffold status (`configured`/`sandbox`) without secrets.
- `GET /v1/app/meta` - app shell bootstrap metadata (name/version/routes + branding asset paths).
- `POST /v1/chat/completions` - OpenAI-compatible chat completions.
- `POST /v1/completions` - OpenAI-compatible text completions.
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

## Web Shell

A minimal local static shell is provided for future downloadable app UX:

- `web/index.html`
- `web/styles.css`

These files are served by Fastify at `/web/*`, and branding files are served at `/assets/*`.

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
  footer-logo-darksol.png # source branding asset
  icons/                  # generated favicon/web icon pack
web/
  index.html              # static phase-3 app shell
  styles.css              # app shell styles
docs/
  API_CONTRACT_SYNC.md    # route inventory + OpenAPI source-of-truth workflow
  PHASE3_AUDIT.md         # commit-span audit + risks + next milestones
test/
  cli.test.js             # command-level CLI tests (registration + serve/status/list/info/search)
  server.test.js          # API integration tests
```
