<p align="center">
  <img src="https://gitlab.com/darks0l/darksol-inference/-/raw/master/assets/darksol-banner.png" alt="DARKSOL" width="600" />
</p>
<h3 align="center">Built by DARKSOL 🌑</h3>

<p align="center">
  <a href="https://www.npmjs.com/package/darksol"><img src="https://img.shields.io/npm/v/darksol?style=flat-square" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/darksol"><img src="https://img.shields.io/npm/l/darksol?style=flat-square" alt="license" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D20-3C873A?style=flat-square" alt="node >=20" />
</p>

# Darksol Studio

Local-first LLM inference engine with hardware-aware optimization, OpenAI-compatible API, MCP tool integration, and Ollama model reuse. Your Ollama alternative — built smarter.

**[Website](https://darksol.cc)** · **[GitLab](https://gitlab.com/darks0l/darksol-inference)** · **[npm](https://www.npmjs.com/package/darksol)**

## Features

- ⚡ **Hardware-aware inference** — auto-detects GPU, VRAM, CPU, RAM and optimizes settings
- 🔌 **OpenAI-compatible API** — drop-in `/v1/chat/completions`, `/v1/completions`, `/v1/models`, `/v1/embeddings`
- 🦙 **Ollama model reuse** — finds and runs your existing Ollama models directly, no daemon required
- 🔍 **HuggingFace directory** — browse, search, and pull GGUF models with "will it fit?" indicators
- 🔧 **MCP tool integration** — connect external tools via Model Context Protocol (CoinGecko, DexScreener, Etherscan, DefiLlama pre-configured)
- 💰 **Cost tracking** — every local inference is $0.00, track usage and savings vs cloud
- 🌡️ **Thermal monitoring** — real-time GPU/CPU temperature tracking
- 📡 **SSE streaming** — real-time token streaming with abort support

## Install

```bash
npm i -g darksol
```

## Quick Start

```bash
# Search for models (with hardware fit check)
darksol search llama --limit 5

# Pull a model from HuggingFace
darksol pull llama-3.2-3b-gguf

# Run a prompt
darksol run llama-3.2-3b "Write a haiku about local inference."

# Use an existing Ollama model directly
darksol run ollama/llama3.2:latest "hello world"

# Start the API server
darksol serve
# → http://127.0.0.1:11435
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `darksol serve` | Start the OpenAI-compatible API server |
| `darksol run <model> <prompt>` | Run a one-shot inference |
| `darksol pull <model>` | Download a GGUF model from HuggingFace |
| `darksol list` | List installed models (local + Ollama) |
| `darksol search <query>` | Search HuggingFace with hardware-aware fit |
| `darksol ps` | Show loaded model processes |
| `darksol status` | System and server status |
| `darksol usage` | Show inference stats and cost tracking |
| `darksol rm <model>` | Remove a downloaded model |
| `darksol browse` | Interactive model browser |
| `darksol doctor` | System diagnostics |
| `darksol mcp list` | List MCP server registry |
| `darksol mcp enable <name>` | Enable an MCP server |
| `darksol mcp disable <name>` | Disable an MCP server |

## API Endpoints

Default: `http://127.0.0.1:11435`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Service liveness and metadata |
| `/v1/models` | GET | Installed models (OpenAI format) |
| `/v1/chat/completions` | POST | Chat completions with SSE streaming |
| `/v1/completions` | POST | Text completions |
| `/v1/embeddings` | POST | Text embeddings |
| `/v1/ollama/models` | GET | Ollama local model inventory |
| `/v1/directory/models` | GET | HuggingFace model search (`q`, `limit`, `task`, `sort`) |
| `/v1/app/usage` | GET | Inference stats and cost tracking |
| `/v1/app/meta` | GET | App metadata and route inventory |
| `/v1/mcp/servers` | GET | MCP server registry |
| `/v1/mcp/servers/:name/enable` | POST | Enable an MCP server |
| `/v1/mcp/servers/:name/disable` | POST | Disable an MCP server |
| `/v1/bankr/health` | GET | Bankr gateway status |

### Example: Chat Completion

```bash
curl -X POST http://127.0.0.1:11435/v1/chat/completions \
  -H "content-type: application/json" \
  -d '{
    "model": "llama-3.2-3b",
    "messages": [
      { "role": "user", "content": "Hello from Darksol." }
    ]
  }'
```

### Example: Search Models

```bash
curl "http://127.0.0.1:11435/v1/directory/models?q=llama&limit=3&sort=popular"
```

## MCP Integration

Darksol supports the [Model Context Protocol](https://modelcontextprotocol.io/) for connecting external tools to your models. Pre-configured servers:

- **CoinGecko** — crypto prices and market data
- **DexScreener** — DEX trading pairs and analytics
- **Etherscan** — Ethereum blockchain data
- **DefiLlama** — DeFi protocol TVL and yields

All servers are disabled by default. Enable them with `darksol mcp enable <name>`.

Config: `~/.darksol/mcp-servers.json`

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `HUGGINGFACE_TOKEN` | — | Auth token for private HuggingFace models |
| `DARKSOL_OLLAMA_ENABLED` | `true` | Enable Ollama interop |
| `DARKSOL_OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Ollama endpoint |
| `BANKR_BASE_URL` | — | Bankr LLM gateway URL |
| `BANKR_API_KEY` | — | Bankr API key |

Runtime config: `~/.darksol/config.json`

## Desktop App

Darksol Studio desktop app is coming soon with a full GUI for model management, chat, MCP settings, and cloud gateway access.

- **Windows** — installer (.exe)
- **macOS** — universal .dmg (Intel + Apple Silicon)

Visit [darksol.cc](https://darksol.cc) for downloads when available.

## License

MIT

Built with teeth. 🌑
