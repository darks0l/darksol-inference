# Changelog

## 0.1.0
- Phase 1 MVP scaffold
- CLI commands for serve/run/pull/list/rm/ps/info/browse/status
- OpenAI-compatible endpoints
- HuggingFace GGUF model browser and downloader
- Hardware detection and inference optimization

## Unreleased
- Added `GET /v1/directory/models` with HuggingFace-backed search (`q`, `limit`, `task`) and normalized item schema.
- Added robust directory upstream error handling with OpenAI-style error envelopes.
- Added `darksol search <query> [--limit <n>] [--task <tag>]` CLI command for concise model search output.
- Added Bankr gateway scaffolding with env-based config and `GET /v1/bankr/health` status endpoint.
- Added integration tests for directory route happy/error paths and Bankr health endpoint.
- Added CLI test coverage for `search` command registration and output shape.
