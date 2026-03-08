# Web Portal Notes

This document covers the web/desktop-facing implementation details that do **not** belong on the npm package page.

## Scope

- Static web shell under `web/`
- Static asset serving (`/web/*`, `/assets/*`) in the local API server
- Desktop/web architecture boundaries and layout decisions

## Canonical Architecture Doc

- `docs/PHASE8_DESKTOP_WEB_ARCHITECTURE.md`

## Why this file exists

The npm README should stay user-facing (install, quick start, commands, API usage).
Internal implementation notes for web assets and portal structure live in repo docs instead.
