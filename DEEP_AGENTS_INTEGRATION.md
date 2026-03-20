# Deep Agents Integration Plan — Darksol Studio

## What is Deep Agents?

LangChain's `deepagents` (JS/TS) is an opinionated agent harness inspired by Claude Code. It provides:

1. **Planning** — `write_todos` tool for task breakdown and progress tracking
2. **Filesystem** — `read_file`, `write_file`, `edit_file`, `ls`, `glob`, `grep`
3. **Shell** — `execute` for running commands (with sandboxing)
4. **Sub-agents** — `task` tool for spawning isolated agents with their own context windows
5. **Summarization** — Auto-summarizes when conversations get long, offloads history to files
6. **Skills** — Progressive disclosure skill system (SKILL.md frontmatter, lazy loading)
7. **Memory** — AGENTS.md-based persistent memory injection into system prompt
8. **Prompt Caching** — Anthropic cache_control breakpoints for cost reduction

## Architecture (from source review)

### Core: `createDeepAgent()`
Factory function that composes middleware into a LangGraph agent:
- Accepts: model, tools, systemPrompt, middleware, subagents, responseFormat, backend, skills, memory
- Returns: compiled LangGraph graph with all middleware baked in

### Middleware Stack (order matters):
1. `todoListMiddleware` — task planning/tracking
2. `createFilesystemMiddleware` — read/write/edit/ls/glob/grep with pluggable backends
3. `createSubAgentMiddleware` — spawns ephemeral child agents via `task` tool
4. `createSummarizationMiddleware` — auto-compacts conversation when approaching context limits
5. `anthropicPromptCachingMiddleware` — cache_control for Anthropic models
6. `createPatchToolCallsMiddleware` — normalizes tool calls across providers
7. `createSkillsMiddleware` — progressive disclosure skill loading
8. `createMemoryMiddleware` — AGENTS.md persistent context injection

### Backends (pluggable storage):
- `StateBackend` — in-memory (LangGraph state)
- `StoreBackend` — LangGraph checkpoint store
- `FilesystemBackend` — real filesystem
- `CompositeBackend` — combines multiple backends
- `LocalShellBackend` — local shell execution
- `BaseSandbox` — sandboxed execution

### Sub-agents:
- General-purpose agent (inherits all tools from parent)
- Custom named agents with own tools/prompts/skills
- Parallel execution supported
- Isolated context windows
- State filtering (messages, todos, structuredResponse excluded from child)

### Summarization:
- Fraction-based triggers (85% of context window)
- Keeps 10% of context after summarization
- Offloads history to markdown files
- Tool argument truncation for old messages
- ContextOverflowError catch with emergency re-summarization
- Token estimation calibration multiplier

---

## Integration Plan for Darksol Studio

### Phase 1: Core Agent Loop (Priority: HIGH)
**Goal:** Replace Studio's simple request/response with a Deep Agent loop

**What to build:**
- `src/agent/deep-agent.js` — Main `createDarksolAgent()` factory
- Port the middleware composition pattern from `createDeepAgent()`
- Wire into Studio's existing `darksol serve` and `darksol run` commands
- Agent runs as a persistent loop during `serve`, one-shot during `run`

**Key decisions:**
- **No LangChain dependency** — We rewrite the patterns in vanilla JS/ESM to keep Studio dependency-free
- Agent loop: prompt → tool calls → execution → response → repeat
- Tool call format: OpenAI-compatible function calling (already supported by our LLM backends)

### Phase 2: Filesystem Backend (Priority: HIGH)
**Goal:** Give the agent full filesystem access

**What to build:**
- `src/agent/backends/filesystem.js` — Real filesystem backend
  - `ls(path)` — directory listing with file/dir type
  - `read(path, offset?, limit?)` — paginated file reading (100 lines default)
  - `write(path, content)` — create/overwrite files
  - `edit(path, oldText, newText)` — surgical text replacement
  - `glob(pattern)` — file pattern matching
  - `grep(pattern, path?, options?)` — content search
- `src/agent/backends/state.js` — In-memory backend for sandboxed mode

**Port from deepagents:**
- Line-numbered output formatting
- Large result truncation/eviction
- Binary file detection and base64 handling
- Path sanitization

### Phase 3: Shell Execution (Priority: HIGH)
**Goal:** Agent can run commands

**What to build:**
- `src/agent/backends/shell.js` — Command execution
  - Timeout support
  - stdout/stderr capture
  - Working directory control
  - Environment variable passthrough
- Safety: command allowlist/denylist configurable in `~/.darksol/agent-config.json`

### Phase 4: Planning System (Priority: MEDIUM)
**Goal:** Agent can break down complex tasks

**What to build:**
- `src/agent/middleware/todos.js` — Todo/planning tool
  - `write_todos(todos)` — create/update task list
  - Task states: pending, in_progress, completed
  - Injected into system prompt as context
  - Persisted to `~/.darksol/agent-todos.json`

### Phase 5: Sub-Agent Spawning (Priority: MEDIUM)
**Goal:** Agent can delegate tasks to isolated child agents

**What to build:**
- `src/agent/middleware/subagents.js` — Sub-agent orchestration
  - `task(description, subagent_type)` tool
  - General-purpose default agent
  - Named custom agents with own system prompts
  - Parallel execution via Promise.all
  - State isolation (filtered state passing)
  - Context window isolation (each child gets fresh context)

**Key design:**
- Children inherit model config from parent unless overridden
- Children can use all filesystem/shell tools
- Result returned as single message to parent
- No inter-agent communication (fire and forget)

### Phase 6: Auto-Summarization (Priority: MEDIUM)
**Goal:** Handle long conversations without context overflow

**What to build:**
- `src/agent/middleware/summarization.js` — Context management
  - Token counting (approximate, using char/4 heuristic)
  - Configurable triggers (fraction-based: 85% of model's context)
  - Keep policy (fraction-based: 10% retained)
  - History offloading to `~/.darksol/conversation_history/`
  - Summary generation using the same model
  - Safe cutoff point detection (don't split AI/Tool pairs)
  - Tool argument truncation for old messages
  - Emergency summarization on ContextOverflowError

### Phase 7: Skills System (Priority: MEDIUM)
**Goal:** Progressive disclosure skill loading

**What to build:**
- `src/agent/middleware/skills.js` — Skill discovery and injection
  - SKILL.md frontmatter parsing (YAML)
  - Multi-source skill loading with priority
  - System prompt injection (name + description only)
  - `read_file` to load full skill on demand
  - Skill validation per Agent Skills spec

**Skill sources (default):**
- `~/.darksol/skills/` — User skills
- `./skills/` — Project skills
- Built-in skills bundled with Studio

### Phase 8: Memory/Context (Priority: LOW)
**Goal:** Persistent memory across sessions

**What to build:**
- `src/agent/middleware/memory.js` — AGENTS.md loading
  - Load from configurable paths
  - Inject into system prompt
  - `edit_file` to update memory
  - Guidelines for when to save vs skip

**Memory sources (default):**
- `~/.darksol/AGENTS.md` — Global memory
- `./AGENTS.md` — Project memory

---

## File Structure (New)

```
src/agent/
├── deep-agent.js          # createDarksolAgent() factory
├── tool-runner.js          # Tool call execution loop
├── prompts.js              # System prompts (base, task, skills, memory)
├── backends/
│   ├── filesystem.js       # Real filesystem backend
│   ├── state.js            # In-memory backend
│   └── shell.js            # Command execution
├── middleware/
│   ├── todos.js            # Planning/task management
│   ├── subagents.js        # Sub-agent spawning
│   ├── summarization.js    # Auto-summarization
│   ├── skills.js           # Skill loading
│   └── memory.js           # AGENTS.md memory
└── config.js               # Agent configuration
```

## CLI Integration

```bash
# One-shot agent run
darksol agent "Research the latest Base L2 developments and write a report"

# Interactive agent session (within serve)
# In the web shell or CLI, agent mode becomes the default interaction

# Agent with custom skills
darksol agent --skills ./my-skills/ "Build a smart contract"

# Agent with sandboxed execution
darksol agent --sandbox "Analyze this codebase"
```

## API Integration (serve mode)

```
POST /v1/agent/run
{
  "message": "Research and write a report on...",
  "model": "claude-sonnet-4-5-20250929",
  "tools": ["filesystem", "shell", "web_search"],
  "skills": ["/skills/research/"],
  "stream": true
}
```

## Key Differences from deepagents

| Feature | deepagents | Darksol Studio |
|---------|-----------|----------------|
| Runtime | LangGraph | Custom vanilla JS loop |
| Dependencies | langchain, langgraph, zod | Zero external agent deps |
| Models | Any LangChain chat model | node-llama-cpp + any OpenAI-compat API |
| Backends | LangGraph state/store | Custom filesystem + state |
| Skills | Agent Skills spec | Same spec, compatible |
| Memory | AGENTS.md | Same spec, compatible |
| Shell | Sandboxed | Configurable safety |
| Streaming | LangGraph streaming | SSE (already built) |

## Implementation Priority

1. **Phase 1+2+3** (Core + FS + Shell) — This IS the MVP. Agent can think, read/write files, run commands.
2. **Phase 4** (Planning) — Makes complex tasks actually work.
3. **Phase 5** (Sub-agents) — Parallel task execution, context isolation.
4. **Phase 6** (Summarization) — Long conversations without crashing.
5. **Phase 7** (Skills) — Extensibility, community skills.
6. **Phase 8** (Memory) — Cross-session persistence.

## Estimated LOC

- Phase 1: ~400 lines
- Phase 2: ~600 lines  
- Phase 3: ~200 lines
- Phase 4: ~150 lines
- Phase 5: ~500 lines
- Phase 6: ~600 lines
- Phase 7: ~400 lines
- Phase 8: ~300 lines
- **Total: ~3,150 lines** (vs deepagents JS at ~4,000+ lines with tests)

## Notes

- MIT licensed — we can study and reimplement freely
- No LangChain/LangGraph dependency — pure Node.js ESM
- Compatible with Agent Skills spec and AGENTS.md spec
- All tools use OpenAI function calling format (works with any provider)
- Sub-agents use the same model infrastructure we already have
- Summarization reuses our existing LLM inference pipeline
