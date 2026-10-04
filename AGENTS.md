# AGENTS.md

Guidance for AI coding assistants working in this repository (Section 20.9).

## Architecture in one minute

- `src/fanwit` is the core; `src/app` is the app (`src/app/modules/*` and `src/app/showcase/*` are found by glob, never listed by hand). Extend the core through **contributions** in `defineModule`, not by editing it.
- **Everything is a command.** Add a command (`contributes.commands`) and a handler (`ctx.commands.handle`) instead of wiring click handlers to logic. Menus, keys, the palette, the CLI and tests all run commands.
- **State is data.** Layout, keybindings, menus, settings and themes are TOML files that stay live. Change them through their services (`ctx.layout.dispatch`, `ctx.settings.set`, `ctx.menus.patch`), never by rewriting files directly.
- **The Host is the only platform seam.** Do not import `@tauri-apps/*` outside `src/fanwit/host` (and `startup.svelte.ts` for deep links). Check `ctx.host.caps` instead of "am I in Tauri".
- **Rust owns the sandbox.** File and database access from the webview go through `fw_*` commands in `src-tauri/src/fanwit`, which check paths against app dirs and user chosen roots.

## Golden paths

| Task | Do this |
|---|---|
| New feature | `pnpm fw add module <id>` |
| Action | `pnpm fw add command <module>.<verbObject>` |
| UI | `pnpm fw add view <module>.<name>` (handle empty, loading and error states) |
| Window | `pnpm fw add window <kind> --base child` |
| Preference | `pnpm fw add setting <module>.<key>` |
| Right click menu | `pnpm fw add menu-location <loc> --module <id>`, then `use:menu` |
| Install step | `pnpm fw installer add-step <type> <id>`, then `pnpm fw installer plan --scenario ...` (never hand edit generated installer glue) |
| Installer page | A Svelte page in `src-setup/pages/` registered in `src-setup/pages/custom.ts`; preview with `pnpm fw installer dev` (docs/guides/installer.md) |
| Data | `ctx.storage`, `ctx.persisted`, `ctx.db.sql({ scope })` with `<module>__` table prefixes |
| Plugin | `pnpm fw plugin new <id> [--kind appearance] [--runtime js\|wasm\|sidecar] [--ui widgets\|iframe]`; plugin code never runs on the main thread, UI is widgets (`ctx.ui.render`) or a sandboxed iframe (docs/guides/plugins.md) |
| Restyle something | An appearance plugin or a CSS snippet scoped with `html[data-preset=...]` / `[data-fw-view=...]`, not edits to the view |
| Remove or restore demo code | `pnpm fw parts`, `pnpm fw strip <part>`, `pnpm fw restore <part>`, `pnpm fw strip --undo`. A part is a folder with `part.toml`; keep each showcase app self contained in `src/app/showcase/<part>` |

## Conventions

- Command ids `<module>.<verbObject>` (camel case); categories title case; titles sentence case.
- Svelte 5 runes; services are classes with `$state` fields in `.svelte.ts` files. Bump `version` counters with `untrack` (see existing services) so effects do not subscribe to their own writes.
- Tabs for indentation, double quotes, explicit types at module boundaries.
- Errors are `FanwitError(code, { message, hint, docs })`.
- Tests that exercise a part live inside it (`*.test.ts`, `*.e2e.ts` next to the code, helpers from `e2e/helpers.ts`), so stripping the part takes its tests along. Tests of Labs call `needsLabs()`.
- Every interactive element is keyboard reachable; destructive items go in the `danger` group.
- Motion lives in `src/fanwit/motion/motion.ts`: `use:enter={"pop"}` for entrances, `out:leave` for exits, `haptic()` for touch feedback. Buttons get press feedback automatically (`data-no-press` opts out). Measure layout with offset sizes, not `getBoundingClientRect`, on anything that animates in. Everything must respect reduced motion (the helpers do).

## Checks before you finish

```sh
pnpm check && pnpm test && node packages/fw/fw.mjs doctor && node packages/fw/fw.mjs docs check
cargo test --manifest-path src-tauri/Cargo.toml --workspace
```
