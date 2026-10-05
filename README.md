# Fanwit

> **F**ast **A**nd **N**atural **W**indow **I**n **T**auri: a hackable template for production ready desktop and web apps with Tauri 2, Svelte 5 and shadcn-svelte.

Clone it and you start with an app that already behaves like Obsidian, VS Code or Figma, and that you can reshape into anything, for the desktop and the web, from one codebase. The template is also a working app ("Fanwit") that demonstrates every system and doubles as the manual.

## Quick start

```sh
pnpm install
pnpm fw rename          # display name, slug, developer, bundle identifier
pnpm tauri dev          # desktop
pnpm dev                # web build in the browser
```

`pnpm fw doctor` checks toolchains, capabilities, CSP and presets. `pnpm fw strip` moves the showcase, samples and bundled plugins to `.trash/` (restorable with `pnpm fw restore`) when you are ready to build your own app.

## What is in the box

| System | Highlights |
|---|---|
| Kernel | Modules with static contributions and lazy activation, typed services and events, context keys with `when` clauses, lifecycle with shutdown vetoes, scoped logger with a ring buffer |
| Commands | One pipeline for palette, keys, menus, toolbar, CLI, deep links and plugins: argument schemas, prompts, interceptors, undo and redo, user commands and macros |
| Shortcuts | Chords, layout aware keys, precedence tiers, `keys.toml`, global shortcuts, Shortcuts editor with conflict resolution, keyboard overlay |
| Context menus | Menus as data with custom item kinds (colour swatches, sliders, icon rows…), patches in `menus.toml`, Context Menu Editor, *Edit this menu* on any element in developer mode |
| Layout | One live document in `workspace.toml` (comments preserved), splits, tabs, stacks, grids, floats, drawers, overlays, drag and drop docking, pop out windows, presets, responsive rules |
| Windows | Window kinds with a result promise, focus lock with bell and shake, identity keyed window state with monitor recovery, virtual windows on the web |
| Notifications | Routing policy, channels, toasts, centre, progress with cancellation, OS notifications, badges |
| Themes | TOML themes with shadcn tokens, flash free start, Theme Studio with OKLCH generation and contrast checks |
| Data | Vaults with a sandboxed file system, storage scopes, SQLite with migrations and plugin namespacing, OS keychain secrets |
| Settings | Schema declared, layered (default, app, user, vault, window, CLI), generated Settings window |
| Plugins | Data only, worker isolated and in realm plugins, permissions, safe mode, Plugin Manager, registry install with SHA-256 checks |
| CLI | `fanwit-cli` talks to the running app (or starts it headless) with `--json` and stable exit codes; `fw` developer CLI |
| Developer tools | Element inspector, Log viewer, event monitor, command log, scripting console, module profiler, Labs, in app Manual |

## Project structure

```
fanwit.app.toml        identity (single source of truth)
app.config.ts          which core modules are on, data strategies, plugin policy
src/fanwit/            the core (kernel, host, systems, workbench)
src/app/               your modules, themes, layouts
src/lib/components/ui  shadcn-svelte components you own
src-tauri/src/fanwit/  Rust core: sandbox, fs, TOML merge, SQLite, windows, CLI bridge
docs/fanwit/           the FaNWiT manual (development builds only)
docs/app/              your app's manual (ships to your users)
plugins/               sample runtime plugins
packages/fw/           developer CLI
```

## Testing

```sh
pnpm test              # Vitest: kernel, commands, layout, settings, menus, CLI
pnpm test:e2e          # Playwright against the web build
cargo test --manifest-path src-tauri/Cargo.toml
```

## Documentation

Read the docs online at https://dilicalflame.github.io/Fanwit/docs/. Or press **F1** in the app, run `pnpm docs` for the docs site, or read [docs/fanwit/getting-started.md](docs/fanwit/getting-started.md). The full specification is in `FANWIT-Specification.pdf`.

## Known limitations

- The web build keeps vaults in browser storage (OPFS or a picked folder); SQL runs in a SQLite WASM worker and needs a browser with OPFS.
- Cross window tab dragging pops the tab out on release outside the window; live hand off between OS windows is not implemented.
- On macOS the custom menu bar is used; the native application menu is not generated from the menu model.
- No warm window pool: child windows boot the kernel on open.
- The updater is not configured (no endpoint or key ships with the template).
