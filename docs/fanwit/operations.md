---
title: Operations
section: Operations
order: 1
---
# Operations

## Building

`pnpm fw build --all` builds the desktop installers and the static web build (`build/`).

## Releasing

`pnpm fw release minor` bumps the version everywhere, writes the changelog from conventional commits and tags. Pushing the tag runs the release workflow.

## Updates

Add `tauri-plugin-updater` with your public key and endpoints in `tauri.conf.json`; the Update window explains the flow.

## Signing

Windows: Authenticode or Azure Trusted Signing. macOS: Developer ID and notarisation through the release workflow secrets.

## Web deployment

The web build is a static SPA with a fallback page; host it anywhere.
