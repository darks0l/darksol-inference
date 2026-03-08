# Desktop Scaffold (Phase 8 Kickoff)

This folder defines the non-breaking desktop app foundation.

## Scope

- No runtime coupling to CLI/API boot path yet.
- No heavy installer/packager dependencies yet.
- Entry points and packaging configuration paths are reserved.

## Entrypoints

- Main: `src/main.js`
- Preload: `src/preload.js`

## Packaging Placeholders

- Windows: `config/packaging.win.json`
- macOS: `config/packaging.mac.json`

## Notes

Future phases can wire this scaffold to an actual desktop runtime (for example Electron/Tauri) without changing current CLI/API behavior.
