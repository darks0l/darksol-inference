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

Local-first AI agent engine with autonomous tool calling, hardware-aware inference, OpenAI-compatible API, and MCP integration. One `npm install` — your models, your machine, your agent.

**[Website](https://darksol.cc)** · **[GitLab](https://gitlab.com/darks0l/darksol-inference)** · **[npm](https://www.npmjs.com/package/darksol)**

---

## What's New in v0.4.0

**Deep Agent** — a full autonomous coding agent system built into the engine. Zero external dependencies. Works with any OpenAI-compatible model (local or remote).

```bash
# Give it a task — it plans, reads files, writes code, runs commands
darksol agent "Build a REST API with user authentication"

# Interactive mode — persistent conversation with tool access
darksol agent --interactive

# Use any model
darksol agent --model ollama/qwen3:30b "Refactor src/ to use TypeScript"
```

The agent has access to filesystem tools (read, write, edit, glob, grep), shell execution, a planning system (persistent todos), auto-summarization when context gets long, a skills library, persistent memory via AGENTS.md, and sub-agent spawning for parallel work.

All of this also works through the API (`POST /v1/agent/run`) and the web shell (🤖 toggle in the chat header).

---

## Install

```bash
npm i -g darksol
```

## Quick Start

```bash
# Run the agent on a task
darksol agent "Analyze this codebase and write a summary"

# Search for models (with hardware fit check)
darksol search llama --limit 5

# Pull a model from HuggingFace
darksol pull llama-3.2-3b-gguf

# Run a one-shot prompt
darksol run llama-3.2-3b "Write a haiku about local inference."

# Use an existing Ollama model directly
darksol run ollama/llama3.2:latest "hello world"

# Start the API server + web shell
darksol serve
# → http://127.0.0.1:11435
```

> Both command aliases work: `darksol-studio` and `darksol`.

---

## Deep Agent

The agent system gives your local models the ability to plan, read and write files, execute commands, and break complex tasks into sub-tasks — all autonomously.

### How It Works

1. You give it a task
2. It creates a plan (write_todos)
3. It uses tools to complete each step (read_file, write_file, edit_file, execute, glob, grep)
4. It auto-summarizes when context gets long
5. It returns the final result

### Agent Tools

| Tool | Description |
|------|-------------|
| `ls` | List directory contents |
| `read_file` | Read files with pagination (offset + limit) |
| `write_file` | Create or overwrite files |
| `edit_file` | Surgical find-and-replace edits |
| `glob` | Find files by pattern |
| `grep` | Search file contents with regex |
| `execute` | Run shell commands (with timeout + safety) |
| `write_todos` | Create and update task lists |
| `task` | Spawn sub-agents for parallel work |

### Middleware Stack

The agent ships with a full middleware pipeline — each piece is opt-in and composable:

- **Planning** — Persistent task lists (`write_todos`) injected into system prompt each turn. Tasks track pending → in_progress → completed.
- **Auto-Summarization** — Monitors context usage (85% threshold). When triggered, old messages are compressed into a summary, full history is offloaded to `~/.darksol/conversation_history/`, and the agent keeps working with a fresh context.
- **Skills** — Discovers `SKILL.md` files from `~/.darksol/skills/` and `./skills/`. Uses progressive disclosure: names + descriptions in the prompt, full instructions loaded on demand. Compatible with the [Agent Skills spec](https://agentskills.io/specification).
- **Memory** — Loads `AGENTS.md` files as persistent context. The agent can update its own memory via `edit_file`. Compatible with the [agents.md spec](https://agents.md/).
- **Sub-Agents** — The `task` tool spawns isolated child agents with fresh context windows. Each sub-agent gets the same tools but its own conversation. Supports parallel execution.

### CLI Usage

```bash
# One-shot: give a task, get a result
darksol agent "Create a Node.js Express server with health check endpoint"

# Interactive: persistent conversation with planning
darksol agent --interactive

# Choose your model
darksol agent --model ollama/qwen3:30b "Review this PR for security issues"

# Set working directory
darksol agent --cwd ./my-project "Add unit tests for src/utils.js"

# Verbose mode: see every tool call
darksol agent --verbose "What files are in this project?"
```

### API Usage

```bash
# Non-streaming
curl -X POST http://127.0.0.1:11435/v1/agent/run \
  -H "content-type: application/json" \
  -d '{
    "message": "List all JavaScript files and count lines of code",
    "model": "llama-3.2-3b",
    "planning": true
  }'

# Streaming (SSE events: thinking, tool_call, tool_result, response, done)
curl -X POST http://127.0.0.1:11435/v1/agent/run \
  -H "content-type: application/json" \
  -d '{
    "message": "Build a calculator module with tests",
    "stream": true
  }'

# List available tools
curl http://127.0.0.1:11435/v1/agent/tools
```

### Web Shell

Start the server with `darksol serve`, open `http://127.0.0.1:11435`, and click the 🤖 **Agent** toggle in the chat header. You'll see real-time tool calls, results, and thinking indicators as the agent works.

### Programmatic Usage

```javascript
import { createDarksolAgent } from "darksol/src/agent/deep-agent.js";

const agent = createDarksolAgent({
  model: "llama-3.2-3b",
  apiBase: "http://127.0.0.1:11435",
  planning: true,
  skills: true,
  memory: true,
  subagents: true,
  cwd: "./my-project",
});

const result = await agent.run("Build a REST API with CRUD endpoints");
console.log(result.response);
console.log(`Completed in ${result.iterations} iterations`);
```

---

## Features

- 🤖 **Deep Agent** — autonomous task completion with planning, filesystem, shell, and sub-agents
- ⚡ **Hardware-aware inference** — auto-detects GPU, VRAM, CPU, RAM and optimizes settings
- 🔌 **OpenAI-compatible API** — drop-in `/v1/chat/completions`, `/v1/completions`, `/v1/models`, `/v1/embeddings`
- 🦙 **Ollama model reuse** — finds and runs your existing Ollama models directly, no daemon required
- 🔍 **HuggingFace directory** — browse, search, and pull GGUF models with "will it fit?" indicators
- 🔧 **MCP tool integration** — connect external tools via Model Context Protocol
- 🧠 **Skills system** — progressive disclosure skill loading (Agent Skills spec compatible)
- 📝 **AGENTS.md memory** — persistent context across sessions
- 🗜️ **Auto-summarization** — never hit context limits, history offloaded to disk
- 💰 **Cost tracking** — every local inference is $0.00, track usage and savings vs cloud
- 📡 **SSE streaming** — real-time token streaming with abort support

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `darksol agent <prompt>` | Run the deep agent on a task |
| `darksol agent -i` | Interactive agent session |
| `darksol serve` | Start the API server + web shell |
| `darksol run <model> <prompt>` | Run a one-shot inference |
| `darksol pull <model>` | Download a GGUF model from HuggingFace |
| `darksol list` | List installed models (local + Ollama) |
| `darksol search <query>` | Search HuggingFace with hardware-aware fit |
| `darksol ps` | Show loaded model processes |
| `darksol status` | System and server status |
| `darksol usage` | Show inference stats and cost tracking |
| `darksol rm <model>` | Remove a downloaded model |
| `darksol browse` | Interactive model browser |
| `darksol mcp list` | List MCP server registry |
| `darksol mcp enable <name>` | Enable an MCP server |
| `darksol mcp disable <name>` | Disable an MCP server |

## API Endpoints

Default: `http://127.0.0.1:11435`

### Agent

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/agent/run` | POST | Execute a deep agent task (streaming SSE or JSON) |
| `/v1/agent/tools` | GET | List available agent tools |

### Chat & Inference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/chat/completions` | POST | Chat completions with SSE streaming |
| `/v1/completions` | POST | Text completions |
| `/v1/embeddings` | POST | Text embeddings |
| `/v1/models` | GET | Installed models (OpenAI format) |

### Models & Discovery

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/ollama/models` | GET | Ollama local model inventory |
| `/v1/directory/models` | GET | HuggingFace model search |
| `/v1/models/pull` | POST | Pull a model from HuggingFace |
| `/v1/models/import-ollama` | POST | Import an Ollama model |

### Runtime & Config

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Service liveness and metadata |
| `/v1/app/usage` | GET | Inference stats and cost tracking |
| `/v1/app/meta` | GET | App metadata and route inventory |
| `/v1/runtime/status` | GET | Engine runtime status |
| `/v1/runtime/start` | POST | Start managed runtime |
| `/v1/runtime/stop` | POST | Stop managed runtime |
| `/v1/runtime/restart` | POST | Restart managed runtime |
| `/v1/runtime/ports` | GET | Check port availability |
| `/v1/runtime/ports/find` | POST | Find a free port |
| `/v1/runtime/config` | POST | Update runtime host/port config |
| `/v1/runtime/keepwarm` | GET/POST | Keep-warm scheduler config |

### MCP

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/mcp/servers` | GET | MCP server registry |
| `/v1/mcp/servers/:name/enable` | POST | Enable an MCP server |
| `/v1/mcp/servers/:name/disable` | POST | Disable an MCP server |

### Bankr Gateway

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/bankr/health` | GET | Bankr gateway status |
| `/v1/bankr/config` | GET/POST | Bankr gateway config |
| `/v1/bankr/models` | GET | Bankr cloud model list |
| `/v1/bankr/usage` | GET | Bankr usage summary |

---

## MCP Integration

Darksol supports the [Model Context Protocol](https://modelcontextprotocol.io/) for connecting external tools to your models. Pre-configured servers:

- **CoinGecko** — crypto prices and market data
- **DexScreener** — DEX trading pairs and analytics
- **Etherscan** — Ethereum blockchain data
- **DefiLlama** — DeFi protocol TVL and yields

Enable with `darksol mcp enable <name>`. Config: `~/.darksol/mcp-servers.json`.

---

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `HUGGINGFACE_TOKEN` | — | Auth token for private HuggingFace models |
| `DARKSOL_OLLAMA_ENABLED` | `true` | Enable Ollama interop |
| `DARKSOL_OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Ollama endpoint |
| `BANKR_BASE_URL` | — | Bankr LLM gateway URL |
| `BANKR_API_KEY` | — | Bankr API key |

Runtime config: `~/.darksol/config.json`

---

## Desktop + Web Shell

### Web Shell

Start the server and open `http://127.0.0.1:11435` for the interactive web shell with:
- Model browser with hardware-fit indicators
- Chat panel with SSE streaming
- Agent mode toggle (🤖) with real-time tool event display
- Settings panel with runtime controls, MCP toggles, Bankr config

### Desktop App

```bash
# Dev mode
npm run desktop:dev

# Build installers
npm run desktop:build:win   # Windows NSIS
npm run desktop:build:mac   # macOS DMG (Intel + Apple Silicon)
```

---

## License

MIT

Built with teeth. 🌑
