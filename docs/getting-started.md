---
title: Getting started
section: Getting started
order: 1
---
# Getting started

Fanwit is a template you clone, rename and own. It is also a working app ("Fanwit") that demonstrates every system and doubles as this manual.

## Clone to running app

1. Copy the template: `pnpm fw create my-app` (or clone and delete `.git`).
2. Rename: `pnpm fw rename` asks for the display name, slug, developer and bundle identifier, and updates `fanwit.app.toml`, `package.json`, `Cargo.toml`, `tauri.conf.json`, the deep link scheme and the generated identity files.
3. Install: `pnpm install`.
4. Run the desktop app: `pnpm tauri dev`. Run the web build: `pnpm dev`.

## Tour

- **Title bar**: menu bar, search (opens the palette), layout toggles.
- **Activity bar**: Explorer, Search, Commands, Labs, Plugins, Manual.
- **Main area**: tabs you can split, float, pop out into windows or drag anywhere.
- **Status bar**: vault, chord hint, problems, layout preset, theme, notifications.

Try the palette now:

```fanwit-run
palette.open
```

## Project structure

| Path | What lives there |
|---|---|
| `src/fanwit` | The core: kernel, host, systems, workbench. Upgradable with `fw upgrade`. |
| `src/app` | Your app: modules, themes, layouts. |
| `src-tauri/src/fanwit` | Rust core: sandboxed fs, SQLite, windows, CLI bridge. |
| `src/lib/components/ui` | shadcn-svelte components you own. |
| `docs` | This manual. |
| `plugins` | Sample runtime plugins. |
| `packages/fw` | The developer CLI. |

## Your first feature

Run `pnpm fw add module notes` and `pnpm fw add command notes.archive`. See [Modules](manual://modules) and [Commands](manual://commands).

When you are ready to ship your own app, `pnpm fw strip` removes the Labs and samples and keeps every system.
