# DARKSOL Inference — Notes & Forward Plan (2026-03-08)

## Current State (Complete + Green)

- Phase 1–5 foundation complete (CLI/API scaffolding, OpenAI-compatible routes, static app shell, icon pipeline, contract sync, CI gates).
- Phase 6 delivered Ollama interoperability:
  - Discover/list already-downloaded Ollama models
  - Include Ollama inventory in `/v1/models`
  - Explicit provider targeting via `ollama/<model>` in CLI/API run paths
  - Offline/missing-model error-path coverage
- Current quality gates pass:
  - `npm run lint`
  - `npm run typecheck`
  - `npm test` (27 passing)

## Notable Recent Commits

- `e2cb4ec` feat(run): add one-shot prompt mode for local and ollama models
- `04d74df` docs: document ollama interoperability and update OpenAPI
- `75cc2be` feat(cli): support explicit ollama model targets in list and run
- `a6e0d36` feat(ollama): add provider client and API route integration
- `294edde` chore(ci): add lint and typecheck gates with contributor docs
- `568d1a1` test(cli): add deterministic coverage for serve status list info

## Phase 7 Plan (Production Runtime Backbone)

1. **Provider Router Hardening**
   - Formal provider selection policy (local darksol vs ollama vs Bankr LLM Gateway)
   - Add explicit fallback order + failure behavior

2. **Queue / Concurrency Controls**
   - Request queue and per-provider concurrency limits
   - Timeout/retry/circuit-breaker guards for provider outages

3. **Streaming + Session Lifecycle**
   - Unified streaming behavior for completions/chat
   - Cancellation + trace IDs for requests

4. **Bankr LLM Gateway Integration (LLM-only)**
   - Implement provider adapter for Bankr LLM Gateway endpoint/auth/model routing
   - Keep scope strictly inference gateway (no wallet transfer surface)

5. **Observability**
   - Latency/error/provider metrics and structured logs
   - Health/status surfaces for app shell diagnostics

6. **Release Hardening**
   - Fresh-install smoke checks
   - Publish/release checklist automation and artifact validation

## Immediate Next Tasks

- Expand deterministic CLI integration tests for `pull`, `rm`, `ps`, `browse`
- Tighten error assertion matrix across providers (especially mixed-provider run edge cases)
- Begin Bankr LLM gateway provider adapter behind env flag
