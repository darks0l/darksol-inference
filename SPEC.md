# DARKSOL Inference Engine — Phase 1 MVP Spec

## What We're Building
A local LLM inference server — like Ollama but smarter. CLI-first, OpenAI-compatible API, hardware-aware from birth.

Package name: `darksol` (npm, unscoped)
Binary: `darksol`

## Architecture

```
darksol (CLI)
├── bin/darksol.js          — CLI entry point (commander.js)
├── src/
│   ├── cli.js              — Command registration
│   ├── server/
│   │   ├── index.js        — Fastify server (OpenAI-compatible API)
│   │   ├── routes/
│   │   │   ├── chat.js     — POST /v1/chat/completions (streaming + non-streaming)
│   │   │   ├── completions.js — POST /v1/completions
│   │   │   ├── embeddings.js  — POST /v1/embeddings
│   │   │   ├── models.js   — GET /v1/models
│   │   │   └── health.js   — GET /health
│   │   └── middleware/
│   │       └── auth.js     — Optional API key auth
│   ├── engine/
│   │   ├── loader.js       — Model loading via node-llama-cpp (GGUF files)
│   │   ├── inference.js    — Chat/completion inference with streaming
│   │   ├── embeddings.js   — Embedding generation
│   │   └── pool.js         — Model pool (load/unload, memory management, keep-alive)
│   ├── models/
│   │   ├── manager.js      — Model storage, download, delete, list
│   │   ├── registry.js     — Local model registry (~/.darksol/models/)
│   │   ├── pull.js         — Download GGUF from HuggingFace (streaming progress)
│   │   └── directory.js    — HuggingFace trending/popular model browser
│   ├── hardware/
│   │   ├── detect.js       — GPU/CPU/VRAM detection (reuse gpu-orchestrator logic)
│   │   ├── optimize.js     — Auto-configure threads, batch size, GPU layers
│   │   └── thermal.js      — Temperature monitoring
│   ├── commands/
│   │   ├── serve.js        — Start the API server
│   │   ├── run.js          — Interactive chat in terminal (like `ollama run`)
│   │   ├── pull.js         — Download a model
│   │   ├── list.js         — List installed models
│   │   ├── rm.js           — Remove a model
│   │   ├── ps.js           — Show loaded/running models
│   │   ├── info.js         — Model details
│   │   ├── browse.js       — Browse trending HuggingFace models
│   │   └── status.js       — System status (hardware + loaded models + server)
│   └── lib/
│       ├── config.js       — Config at ~/.darksol/config.json
│       ├── paths.js        — Standard paths (~/.darksol/models/, etc.)
│       └── logger.js       — Structured logging
├── test/                   — node:test suite
├── package.json
├── README.md
└── CHANGELOG.md
```

## CLI Commands

### `darksol serve`
Start the inference server.
- `--port 8080` (default: 11435 — one above Ollama)
- `--host 0.0.0.0` (default: 127.0.0.1)
- `--api-key <key>` (optional auth)
- `--model <name>` (pre-load a model on start)
- Auto-detects hardware on startup, logs GPU/VRAM/backend info
- Serves OpenAI-compatible API

### `darksol run <model>`
Interactive terminal chat (like `ollama run llama3`).
- Downloads model if not installed
- Auto-selects optimal GPU layers based on VRAM
- Streaming output in terminal
- `/exit`, `/info`, `/clear` slash commands in chat

### `darksol pull <model>`
Download a model from HuggingFace.
- Accepts: HuggingFace repo/file format (e.g., `bartowski/Llama-3-8B-GGUF/Q4_K_M`)
- Also accepts shorthand aliases (we define popular ones)
- Streaming progress bar with speed + ETA
- Stores in ~/.darksol/models/

### `darksol list`
Show installed models with size, quant, and loaded status.

### `darksol rm <model>`
Delete a model from disk.

### `darksol ps`
Show currently loaded models with memory usage, GPU/CPU split.

### `darksol info <model>`
Show model details — params, quant, context length, architecture.

### `darksol browse`
Browse trending/popular models from HuggingFace.
- `--category chat|code|vision|embed`
- `--sort trending|downloads|recent`
- `--limit 20`
- Shows: name, downloads, size, quant options, description
- `darksol pull` integration — select and download from browse results

### `darksol status`
System overview — hardware, loaded models, server status, VRAM usage.

## API Endpoints (OpenAI-Compatible)

### POST /v1/chat/completions
```json
{
  "model": "llama3-8b-q4",
  "messages": [{"role": "user", "content": "Hello"}],
  "stream": true,
  "temperature": 0.7,
  "max_tokens": 2048
}
```
Returns SSE stream or JSON response matching OpenAI format exactly.

### POST /v1/completions
Text completion (non-chat format).

### POST /v1/embeddings
```json
{
  "model": "nomic-embed-text",
  "input": "Hello world"
}
```

### GET /v1/models
List available models (installed + loaded status).

### GET /health
Server health check.

## Model Storage

```
~/.darksol/
├── config.json          — user preferences
├── models/
│   ├── registry.json    — installed model metadata
│   ├── llama3-8b-q4/
│   │   ├── model.gguf
│   │   └── metadata.json
│   └── nomic-embed/
│       ├── model.gguf
│       └── metadata.json
└── logs/
```

## Model Aliases (Built-in Shorthand)

Instead of typing full HuggingFace paths, users can use aliases:
```
darksol pull llama3:8b        → bartowski/Meta-Llama-3.1-8B-Instruct-GGUF Q4_K_M
darksol pull llama3:70b       → bartowski/Meta-Llama-3.1-70B-Instruct-GGUF Q4_K_M
darksol pull mistral:7b       → bartowski/Mistral-7B-Instruct-v0.3-GGUF Q4_K_M
darksol pull qwen2.5:14b      → bartowski/Qwen2.5-14B-Instruct-GGUF Q4_K_M
darksol pull codestral:22b    → bartowski/Codestral-22B-v0.1-GGUF Q4_K_M
darksol pull phi3:3.8b        → bartowski/Phi-3.5-mini-instruct-GGUF Q4_K_M
darksol pull gemma2:9b        → bartowski/gemma-2-9b-it-GGUF Q4_K_M
darksol pull nomic-embed       → nomic-ai/nomic-embed-text-v1.5-GGUF Q8_0
```

## Hardware Auto-Configuration

On model load:
1. Detect GPU(s) + available VRAM
2. Calculate optimal GPU layers for the model size
3. Set thread count based on physical cores
4. Set batch size based on available memory
5. Enable flash attention if supported
6. Log the configuration choices

## Dependencies

```json
{
  "node-llama-cpp": "latest",    // Core inference engine
  "commander": "^14.0.0",        // CLI framework
  "fastify": "^5.0.0",           // API server
  "chalk": "^5.0.0",             // Terminal colors
  "ora": "^9.0.0",               // Spinners
  "cli-table3": "^0.6.0",        // Tables
  "systeminformation": "^5.0.0", // Hardware detection
  "node-fetch": "^3.0.0"         // HuggingFace API calls (if needed)
}
```

## What NOT to Build in Phase 1
- Desktop app (Phase 3)
- Bankr gateway integration (Phase 2)
- Smart routing / hybrid inference (Phase 2)
- Cost tracking (Phase 2)
- Modelfile format (maybe Phase 2)
- Multi-model concurrent serving (Phase 2)
- Web dashboard (Phase 3)

## Success Criteria for Phase 1
1. `darksol pull llama3:8b` downloads a model
2. `darksol run llama3:8b` opens interactive chat with streaming
3. `darksol serve` starts OpenAI-compatible API
4. `curl localhost:11435/v1/chat/completions` returns valid streaming response
5. `darksol browse` shows trending HuggingFace models
6. `darksol list` / `darksol ps` / `darksol rm` work
7. Auto-detects GPU and configures layers optimally
8. Works on Windows, Linux, macOS
