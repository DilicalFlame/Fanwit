# Schemas, tests and CI

Every chapter of this rebuild ended with a checkpoint, a test you could run. This chapter builds the machinery around those tests: the JSON schemas for the TOML files, the test runners' setup, the end to end helpers, the performance budgets, and the GitHub Actions workflows that run all of it on every push.

<Callout kind="why">

A template is only as good as what still works after someone changes it. FaNWiT's answer is to check everything that can be checked mechanically, on every push: types and Svelte warnings (accessibility included), unit tests, end to end tests in a real browser, the security setup, the docs, performance budgets, Rust lints and tests on three operating systems, and a dependency audit. Writing this rebuild found and fixed real bugs by adding tests: an empty layout crashed the reducer, a rename's undo left tabs pointing at nothing, Escape did not cancel a shortcut recording, and more. Each fix is now held in place by its test.

</Callout>

## Schemas for TOML

Users edit `workspace.toml`, `settings.toml`, `keys.toml` and `menus.toml` by hand, so their editor should help. `schemas/` holds a JSON schema for each:

<Source path=".taplo.toml" />

With the Even Better TOML extension (which uses Taplo), the `.taplo.toml` file above associates each file with its schema, so every key autocompletes, every value is checked, and every setting shows its description on hover. Each live TOML file the app writes also begins with a `#:schema` comment (chapter 20's header), which does the same in editors that read it.

The settings schema is **generated** from every module's setting definitions (`pnpm fw schema`), and a test keeps it up to date (chapter 30). Add a setting, and the test fails until you regenerate, so the schema can never fall behind the code:

<Source path="schemas/keys.schema.json" />

<Source path="schemas/menus.schema.json" />

<Source path="schemas/workspace.schema.json" />

## Unit tests

Vitest runs `src/**/*.test.ts` in Node (the `test` block of `vite.config.ts`, chapter 1). Nearly every test in this rebuild builds a kernel with `createTestKernel` on the memory host (chapters 5 and 30), so a test of the layout service or the plugin installer runs in milliseconds, with no browser and no disk.

<Source path="vitest.setup.ts" />

Some modules load WebAssembly with Vite's `?init` and `?url` imports, which become `fetch("/src/...")` calls. Node has no server for those paths, so the setup file answers them from disk. That is how the TOML merge (chapter 4) and the WebAssembly plugin tests run in Node unchanged.

## End to end tests

<Source path="playwright.config.ts" />

Playwright drives a real Chromium against two builds: the **app** project uses the production build served by `vite preview`, and the **docs** project the docs site. Tests come from `e2e/` (app wide flows) and from `*.e2e.ts` files next to the part they test, so stripping a part takes its tests along (chapter 45).

<Source path="e2e/helpers.ts" />

The helpers encode how a test talks to the app the way a person would: `boot` opens it and skips the first run tour, `cmd` runs a command by typing its title into the palette, `prompt` answers a palette step, `newVault` creates a vault in browser storage, and `apply` switches layout presets. `needsLabs()` skips a test when Labs are stripped. A test that uses only these helpers survives any redesign that keeps commands working, which is the point of "everything is a command".

<Source path="e2e/smoke.test.ts" />

<Source path="e2e/flows.test.ts" />

<Source path="e2e/i18n.test.ts" />

<Source path="e2e/showcase.test.ts" />

## Performance budgets

<Source path="e2e/budgets.test.ts" />

The app records **User Timing** measures for its hot paths: activating a module (50 ms), dispatching a key (4 ms) and resolving a menu (16 ms), in `kernel/budget.ts`. This test presses the palette shortcut and opens a context menu repeatedly in a real browser, and fails if any **median** goes over its budget. It also limits time to a usable window and the JavaScript loaded at startup, which is what keeps lazy loading honest (chapters 13, 19 and 23). Medians keep one slow CI tick from failing the build, and every worst case is printed, so a regression is visible before it crosses the line.

## Continuous integration

<Source path=".github/workflows/check.yml" />

**check** runs on every push and pull request:

- the **web** job runs the same commands AGENTS.md asks before finishing: `pnpm check` (types and every Svelte warning), `pnpm test`, `fw doctor`, `fw docs check`, a production build, the end to end tests, and `pnpm audit` for vulnerable production dependencies;
- the **rust** job runs Clippy with warnings as errors and `cargo test --workspace` on Linux, Windows and macOS, since the Rust core has platform specific code (chapter 34's window hook, chapter 35's sockets).

<Source path=".github/workflows/web.yml" />

**web** publishes to GitHub Pages: the web build of the app at the site root, and the **versioned** docs site under `/docs`. Pushes to `main` publish the docs as `next`, and a tag `v1.2.0` publishes version `1.2.0`. Earlier versions are kept on a `docs-site` branch, so each deploy carries all of them, and the docs site's version picker lists them (chapter 43).

<Source path=".github/workflows/release.yml" />

**release** runs when you push a tag (`pnpm fw release minor`, chapter 46). It builds installers for Windows, macOS (a universal binary for Intel and Apple Silicon) and Linux, signs the Windows packages when a certificate is configured as a secret, and attaches everything to a GitHub release. The Installer Kit steps in it are the next chapter.

## Checkpoint

The whole suite, as CI runs it:

```sh
pnpm check && pnpm test && node packages/fw/fw.mjs doctor && node packages/fw/fw.mjs docs check
pnpm build && pnpm exec playwright test
cargo test --manifest-path src-tauri/Cargo.toml --workspace
```

<Check question="A change makes one menu take 40 ms to resolve in a CI run, against a budget of 16 ms, while the other four take 9 ms. Does the budgets test fail?" options={["Yes: any opening over budget fails", "No: the median is checked, and the worst case is only reported", "Only on Windows"]} answer={1}>

The test compares the median of all measurements with the budget, so one slow tick on a busy CI machine does not fail the build. The worst case is still printed in the test's annotations, so a pattern of slow openings is visible early.

</Check>
