# Desktop App (Phase 1 Packaging)

Electron-based desktop shell that loads the local web UI and ensures a local DARKSOL backend is available.

## Runtime behavior

- Main process: `src/main.js`
- Preload bridge: `src/preload.js`
- Backend lifecycle helper: `src/backend.js`
- Desktop config: `config/desktop.config.json`

On startup, desktop probes `${apiBaseUrl}/health`. If offline, it spawns `darksol serve`, waits for health with timeout polling, and surfaces a useful error dialog on failure. If desktop started that backend process, it is terminated on app quit.

## Scripts

```bash
# from repo root
npm --prefix desktop install
npm --prefix desktop run dev
npm --prefix desktop run build:win
```

## Installer output

- Windows NSIS installer: `desktop/dist/darksol-inference-desktop-<version>-setup.exe`
