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
| `src/app` | Your app: modules (`src/app/modules`), the showcase (`src/app/showcase/<part>`), themes, layouts. |
| `src-tauri/src/fanwit` | Rust core: sandboxed fs, SQLite, windows, CLI bridge. |
| `src/lib/components/ui` | shadcn-svelte components you own. |
| `docs` | This manual. |
| `plugins` | Sample runtime plugins. |
| `packages/fw` | The developer CLI. |

## Your first feature

Run `pnpm fw add module notes` and `pnpm fw add command notes.archive`. See [Modules](manual://modules) and [Commands](manual://commands).

## Stripping the template

Everything that only exists to demonstrate is a **part**: each showcase app, the sample modules and each built-in plugin. A part is a folder with a `part.toml` (any `plugins/<id>` folder counts too), so removing it never means editing other files.

```sh
pnpm fw parts                      # every part, present or in .trash/
pnpm fw strip showcase-blender     # one part (refuses while another part requires it)
pnpm fw strip --showcase           # every showcase app
pnpm fw strip --kind plugin        # every built-in plugin
pnpm fw strip                      # everything, and the Labs off
pnpm fw strip --undo               # reverse the last strip or restore
pnpm fw restore showcase-blender   # bring a part back, with what it requires
pnpm fw trash empty                # delete stripped parts for good
```

Stripped parts move to `.trash/` (ignored by git) under their original paths, and `.trash/journal.json` records every move so `--undo` is exact. Add `--dry-run` to see the moves first.

A `part.toml` looks like this:

```toml
id = "showcase-browser"
title = "Web browser showcase"
kind = "showcase"                  # showcase | sample | plugin
requires = ["showcase-shared"]
paths = []                         # extra repo relative paths that belong to it
```
