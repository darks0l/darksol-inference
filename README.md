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
- `POST /v1/chat/completions` - OpenAI-compatible chat completions.
- `POST /v1/completions` - OpenAI-compatible text completions.
- `POST /v1/embeddings` - OpenAI-compatible embeddings.

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
test/
  cli.test.js             # CLI unit tests
  server.test.js          # API integration tests
```
