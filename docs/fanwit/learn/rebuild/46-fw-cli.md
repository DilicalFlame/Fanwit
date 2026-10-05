---
title: The fw developer CLI
section: "Rebuild: tools and shipping"
order: 1
summary: The command line for working on a FaNWiT app. Generators that write a module, command, view or window the way the conventions say, a doctor that checks the security setup, renames and versions, plugin building and signing, parts you can strip and restore, and the docs commands. Every command can show what it would change first.
---
# The fw developer CLI

The app is complete. This stage builds what you use **around** it: tools, tests, continuous integration and the installer. It starts with `packages/fw/fw.mjs`, the developer CLI you run as `pnpm fw <command>`. Its CLI cousin from chapters 24 and 35 runs commands **inside** your app, while `fw` works **on** your app's source code.

<Callout kind="why">

AGENTS.md (chapter 1) lists golden paths: "new feature: `pnpm fw add module <id>`", "a window: `pnpm fw add window <kind> --base child`". A convention that is written down is followed sometimes. A convention that a command writes for you is followed every time: the right folder, the module with a lazy `activate`, a test that passes, a docs page with its why callout, the capability for a new window kind. `fw` is where the conventions of this whole rebuild are encoded.

</Callout>

`fw` is one plain Node file, with no build step and one dependency (`smol-toml`), so it runs before `pnpm install` has finished anything else, and in CI. It is a `switch` over the first argument:

<Source path="packages/fw/fw.mjs" from="const HELP = `" until="Every command accepts --dry-run" />

## Safe by default

<Source path="packages/fw/fw.mjs" from="const ROOT = process.env.FW_ROOT" until="function report()" />

Every command records the files it would change, and `--dry-run` prints that list without writing anything:

```sh
$ pnpm fw add module todo --dry-run
Would change:
  create src/app/modules/todo/module.ts
  create src/app/modules/todo/activate.ts
  create src/app/modules/todo/todo.test.ts
  create docs/app/guides/todo.md
```

`FW_ROOT` points the CLI at another checkout, which is how its tests run against a throwaway folder. And `--help` or `-h`, anywhere on the line, prints help and exits before any command runs. That rule was added while writing this chapter: `fw strip --help` used to take `--help` as no argument, and stripped every part.

<Source path="packages/fw/fw.mjs" from="// --help anywhere means help" until="	process.exit(0);" />

## Generators

<Source path="packages/fw/fw.mjs" from="const GEN = {" until="	view(idArg) {" />

Each generator writes what the conventions call for, and nothing more:

- **`add module <id>`**: `module.ts` with a lazy `activate`, `activate.ts` with one handler, a test using `createTestKernel` (chapter 30), and a guide in `docs/app/guides/` that already has its why callout. Nothing is registered, because the glob finds it (chapter 45).
- **`add command <module>.<verbObject>`**: the declaration (with `cli: true`) and a handler stub.
- **`add view <module>.<name>`**: a component whose starting point is an `EmptyState` (chapter 26), since a view that forgets its empty state is the most common gap.
- **`add window <kind> --base child`**: the window kind, its view, and the capability pattern for its base (chapter 31), so a new child window cannot end up without permissions.
- **`add setting`, `menu-location`, `menu-kind`, `layout-node`, `theme`, `migration`, `rust-command`, `status-item`**: the same idea for each contribution point.

Edits to existing files are small text replacements at known anchors (`commands: [`, `contributes: {`). That keeps the user's formatting and comments, but it relies on the shapes the generators wrote in the first place.

## Doctor

<Source path="packages/fw/fw.mjs" from="function doctor()" to="}" />

`pnpm fw doctor` checks what is easy to break and hard to notice:

- **Toolchains**: Node, pnpm, Rust, and WebView2 on Windows.
- **The security setup** from chapter 31: a content security policy with no remote origins and no `unsafe-eval` in release, the isolation pattern, `withGlobalTauri` off, and a capability for every window base kind.
- **Identity**: the bundle identifier is valid, and `fanwit.app.toml` agrees with `tauri.conf.json`.
- **The host boundary**: no `@tauri-apps/*` import outside `src/fanwit/host` (AGENTS.md's rule, checked rather than trusted).
- **Presets, plugins and installer downloads**: every layout preset names only views that exist, every bundled plugin's manifest parses and matches its folder, and installer downloads are pinned by SHA-256.

## Identity, versions, releases

- **`fw rename`** renames the app everywhere at once: product name, slug, bundle identifier, URL scheme, the generated `identity.ts` and `gen_identity.rs` (chapter 31), and `tauri.conf.json`.
- **`fw version patch|minor|major|pre`** bumps the version in every file that carries it, keeps a history so `fw version pop` can step back, and with `--changelog` writes `CHANGELOG.md` from conventional commit messages (`feat:`, `fix:`, `perf:`, `docs:`). That is one reason this rebuild's commits are written that way.
- **`fw release <level>`** is `version --changelog --tag`. Pushing the tag runs the release workflow (chapter 47).

## Plugins and the SDK

`fw plugin new <id>` writes a plugin folder for a runtime (`js`, `wasm` or `sidecar`) and a UI (`widgets` or `iframe`). `fw plugin build` compiles a plugin's Rust half to `plugin.wasm` or to the sidecar binary next to the app. `fw plugin pack` writes the registry entry with each file's SHA-256 and the Ed25519 signature that chapter 41 verifies. `fw sdk build` emits the typed plugin SDK for your app's own API.

## Parts

<Source path="packages/fw/fw.mjs" from="function strip()" to="}" />

Parts (chapter 45) move to `.trash/<part>/` with their original paths inside, never deleted. Each strip or restore is written to a **journal**, which is what `fw strip --undo` reverses, including file edits such as turning Labs off. A part that others `require` cannot be stripped alone unless you pass `--with-dependents`, and restoring a part brings back what it requires.

## Docs

`fw docs check` is chapter 42's checker. `fw docs build` and `fw docs serve` build and serve the static docs site (`--version` and `--base` for versioned sites under a path), `fw docs publish` adds a version to an existing site, and `fw docs new <id>` starts a docset.

The installer commands (`fw installer ...`) belong to the next chapters.

<Source path="packages/fw/fw.mjs" />

## Checkpoint

<Source path="packages/fw/fw.test.mjs" />

```sh
node --test packages/fw/fw.test.mjs
pnpm fw doctor
```

`pnpm test` runs these too, after Vitest.

<Check question="You run pnpm fw add window export --base child. What does it change besides the module?" options={["Nothing else", "It adds the view the window shows, and the child-* pattern to the child windows capability if it is missing", "It edits tauri.conf.json to declare the window"]} answer={1}>

The generator adds the window kind and its view, and makes sure a capability covers windows of that base. Windows are created at run time from kinds (chapter 34), so `tauri.conf.json` declares none.

</Check>
