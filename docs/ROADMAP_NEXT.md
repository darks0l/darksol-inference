# DARKSOL Inference - Notes & Forward Plan (2026-03-08)

## Current State (Complete + Green)

- Phase 1-7 foundation complete (CLI/API scaffolding, OpenAI-compatible routes, static app shell, icon pipeline, contract sync, CI, provider routing + reliability guards).
- Phase 8 kickoff started for desktop-first product direction:
  - Architecture/spec for desktop-vs-web split and shared components
  - Non-breaking desktop scaffold with packaging path placeholders
  - Web shell upgraded to desktop-mirror 3-panel layout
- Current quality gates remain required:
  - `npm run lint`
  - `npm run typecheck`
  - `npm test`

## Phase 8 Plan (Desktop App + Web GUI Mirror)

1. Desktop Runtime Bootstrap
   - Wire scaffold to chosen desktop runtime host
   - Preserve existing CLI/API runtime boundaries

2. Shared UX Primitives
   - Design tokens and shared layout/state contract across desktop and web
   - Keep web GUI as lighter mirror of desktop core workflows

3. Gateway + Tool-Use Surfaces (Desktop Primary)
   - Expand right-panel diagnostics and tool cards in desktop shell
   - Stage controlled web parity where lightweight

4. Packaging + Release Tracks
   - Fill Windows/macOS packaging config placeholders
   - Add repeatable packaging checks and artifact validation

5. Observability + Stability
   - Continue deterministic test coverage for app metadata/static serving
   - Preserve API/CLI compatibility as shells evolve

## Completed in This Kickoff Chunk

- Added `docs/PHASE8_DESKTOP_WEB_ARCHITECTURE.md` with product boundary, split architecture, branding asset references, and a desktop/web feature matrix.
- Added `desktop/` scaffold:
  - `desktop/src/main.js`
  - `desktop/src/preload.js`
  - `desktop/config/desktop.config.json`
  - `desktop/config/packaging.win.json`
  - `desktop/config/packaging.mac.json`
  - placeholder packaging scripts and local README
- Updated `web/index.html` + `web/styles.css` to a desktop-mirror layout skeleton (left nav, center chat/work area, right diagnostics panel) using DARKSOL branding assets.
- Extended `/v1/app/meta` with desktop scaffold references and additional branding metadata while keeping route/runtime behavior compatible.
- Updated server integration tests for app-meta desktop/web references and shell content markers.
