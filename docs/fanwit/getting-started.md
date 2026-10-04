---
title: Getting started
section: Getting started
order: 1
summary: From a clone to a running app you own, a tour, and what to remove when you are ready.
---
# Getting started

FaNWiT is a template you clone, rename and own. It is also a working app ("Fanwit") that demonstrates every system, and it doubles as this manual.

<Callout kind="why">

Starter kits usually hand you either an empty skeleton (and every decision still ahead) or a framework you can't change. FaNWiT gives you a finished app instead, and the code is yours. Every system is already working, so you can see each one in action before you build on it, and every demo is a separate *part* you can remove in one command when you no longer need it.

</Callout>

## Clone to running app

<Steps>

1. Copy the template: `pnpm fw create my-app` (or clone and delete `.git`).
2. Rename it: `pnpm fw rename` asks for the display name, slug, developer and bundle identifier, and updates `fanwit.app.toml`, `package.json`, `Cargo.toml`, `tauri.conf.json`, the deep link scheme and the generated identity files.
3. Install: `pnpm install`.
4. Run the desktop app with `pnpm tauri dev`, or the web build with `pnpm dev`.

</Steps>

## Tour

- **Title bar**: menu bar, search (opens the palette), layout toggles.
- **Activity bar**: Explorer, Search, Commands, Labs, Plugins, Manual.
- **Main area**: tabs you can split, float, pop out into windows or drag anywhere.
- **Status bar**: vault, chord hint, problems, layout preset, theme, notifications.

Three keys get you everywhere: the palette (<Keys command="palette.open" />) runs any command, the keyboard overlay (<Keys command="keys.showOverlay" />) shows what every key does here, and this manual is <Keys command="manual.open" />. Try the palette now:

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
| `docs/fanwit` | This manual (development builds only). |
| `docs/app` | Your app's manual, which ships to your users. |
| `plugins` | Built-in plugins: they ship with the app and stay off until turned on. |
| `packages/fanwit-plugin-rs` | Rust SDK for WebAssembly and native sidecar plugins. |
| `packages/fw` | The developer CLI. |

Keep your code in `src/app` and leave `src/fanwit` alone. Then `fw upgrade` can bring in new versions of the core without touching your work.

## Your first feature

Run `pnpm fw add module notes`, then `pnpm fw add command notes.archive`. The first writes the module, its `activate.ts`, a test and a page in `docs/app/guides/`; the second adds the command's declaration and a handler to fill in. Read [Modules](manual://fanwit/guides/modules) and [Commands](manual://fanwit/guides/commands) next; the [learning paths](manual://fanwit/learn) give a reading order.

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
