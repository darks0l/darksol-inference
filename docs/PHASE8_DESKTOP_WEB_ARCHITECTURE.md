# Phase 8 Architecture: Desktop App + Web GUI Mirror Foundation

Date: 2026-03-08  
Status: Kickoff foundation (non-breaking)

## Product Boundary

- CLI remains thin and operationally focused:
  - model lifecycle (`list`, `pull`, `rm`, `ps`, `info`, `search`)
  - runtime controls (`serve`, `status`)
  - prompt execution (`run`)
- Desktop app is the primary service pack for future tool-use and gateway-rich workflows.
- Web GUI mirrors the core desktop UX and information architecture, but stays lighter in scope.

## Split Architecture

### Shared Core (existing)

- Runtime/API: `src/server/*`, `src/providers/*`, `src/models/*`, `src/engine/*`
- Contract + app metadata: `src/server/contract/*`, `src/server/routes/app.js`
- Branding/static assets: `assets/*`

### Desktop App Layer (new scaffold)

- Location: `desktop/`
- Role: host shell for full local experience, native packaging, and richer integrations.
- Current kickoff scope:
  - app entrypoint placeholder
  - preload boundary placeholder
  - packaging config placeholders for Windows/macOS channels
  - no installer/build dependency introduced yet

### Web Mirror Layer (existing + updated shell)

- Location: `web/`
- Role: lightweight mirror of the desktop core layout and navigational model.
- Current kickoff scope:
  - desktop-aligned 3-column shell skeleton
  - placeholder cards/panels for chat/workflow tools
  - branding parity with existing DARKSOL assets

## Branding and Design Assets

Primary assets (existing):

- `assets/footer-logo-darksol.png` (canonical app logo mark)
- `assets/darksol-banner.png` (banner treatment for docs/marketing)
- `assets/icons/favicon-32x32.png`
- `assets/icons/apple-touch-icon.png`
- `assets/icons/favicon.ico`
- `assets/icons/site.webmanifest`

Desktop/web shells should consume this shared asset set to prevent brand drift.

## Shared Components Plan

Kickoff layer (this phase):

- Shared navigation vocabulary: Console, Models, Sessions, Gateway, Settings
- Shared page scaffold pattern:
  - Left rail: navigation + identity
  - Center region: chat/work area
  - Right rail: diagnostics/context panel
- Shared app bootstrap metadata from `/v1/app/meta`

Follow-on layer (future phases):

- Shared design tokens (colors/spacing/type scale)
- Shared UI component library for desktop/web parity
- Shared state schema for chat/session/tool cards

## Feature Matrix (Kickoff Baseline)

| Capability | CLI | Desktop App | Web GUI |
| --- | --- | --- | --- |
| Model install/list/remove | Primary | Mirror + enhanced controls (future) | Mirror read/actions (limited) |
| API server controls | Primary | Integrated controls | Basic status surface |
| Chat/work area | Minimal (`run`) | Primary UX | Mirrored skeleton |
| Tool-use orchestration | Not targeted | Primary future surface | Deferred |
| Gateway diagnostics | Minimal | Rich panel (future) | Placeholder panel |
| Native packaging | N/A | Windows/macOS path placeholders | N/A |
| Static asset branding | N/A | Shared | Shared |

## Packaging Path (Desktop Placeholder)

- Windows path target: `desktop/config/packaging.win.json`
- macOS path target: `desktop/config/packaging.mac.json`
- Entrypoints:
  - main process: `desktop/src/main.js`
  - preload bridge: `desktop/src/preload.js`

These files intentionally avoid heavy packaging/install toolchain lock-in at kickoff.

## Runtime Stability Requirement

Phase 8 kickoff is additive only:

- no change to existing CLI command contracts
- no change to existing API route behavior
- static shell update remains under existing `/web/*` serving model

