# DARKSOL

Local LLM inference engine with a CLI and OpenAI-compatible API server.

## Install

```bash
npm install
```

Run from source:

```bash
node bin/darksol.js --help
```

Optional global install:

```bash
npm install -g .
darksol --help
```

## CLI Commands

General help:

```bash
node bin/darksol.js --help
```

Serve API:

```bash
node bin/darksol.js serve --host 127.0.0.1 --port 11435
```

List local models:

```bash
node bin/darksol.js list
```

Pull model:

```bash
node bin/darksol.js pull llama-3.2-3b
```

Run a prompt:

```bash
node bin/darksol.js run llama-3.2-3b "Write a haiku about local inference."
```

Show loaded model processes:

```bash
node bin/darksol.js ps
```

## API Endpoints

Base URL: `http://127.0.0.1:11435`

- `GET /health`: server liveness and metadata.
- `GET /v1/models`: list installed models in OpenAI model-list format.
- `POST /v1/chat/completions`: OpenAI-compatible chat completions.
- `POST /v1/completions`: OpenAI-compatible text completions.
- `POST /v1/embeddings`: OpenAI-compatible embeddings.

Example chat completion:

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

Example models list:

```bash
curl http://127.0.0.1:11435/v1/models
```

## Project Structure

```text
bin/
  darksol.js              # CLI entrypoint
src/
  cli.js                  # command registration
  commands/               # CLI command handlers
  engine/                 # inference, embedding, model loading
  hardware/               # device detection and optimization
  lib/                    # config, paths, logging
  models/                 # model registry, pull, aliases
  server/                 # Fastify API server + routes
test/
  cli.test.js             # CLI unit tests
  server.test.js          # API integration tests
```
