# The Installer Kit: setup and shipping

Chapter 48 built the engine. This chapter connects it to what people actually download: the native packages, a branded Setup app, and the app's own first launch. It also builds the tools that keep the installer honest, and then it is done: you will have rebuilt all of FaNWiT.

<Callout kind="why">

An installer is the first thing a user sees of your app, and the last thing that runs on their machine when they leave. It is also the code least likely to be tested, because testing it means installing and uninstalling on real machines. FaNWiT's answer is to generate everything that can be generated from `installer.toml`, run everything else through one engine that can simulate a machine, and still install for real in CI on Windows, macOS and three Linux distributions.

</Callout>

## Generated native glue

<Source path="packages/fw/fw.mjs" from="function glue(doc, app, hashes)" until="const header = (c)" />

`pnpm fw installer build` generates the **glue** each package format needs from `installer.toml`, and never asks you to edit it:

- **NSIS** (`hooks.nsh`), included by Tauri's NSIS bundler, runs `fanwit-install run --phase package` after install and `uninstall` before removal, passing the scope the user chose.
- **MSI** (WiX fragments): custom actions with each `[[option]]` as an MSI property, so `msiexec /i app.msi ADDTOPATH=0` works the way enterprise admins expect.
- **deb and rpm** (`postinst`, `prerm`, and the rpm scriptlets) do the same for Linux packages, and the macOS `.pkg` scripts for installs from a package.
- **`install.sh`, `install.ps1`**, plus Homebrew, Scoop, winget and AUR manifests (and notes for Flathub), with download URLs and SHA-256 hashes filled in from the release assets.

Each generated file starts with a header saying it was generated from `installer.toml`, so nobody edits the copy by mistake. The steps themselves stay in the engine, and the glue only calls it.

## The Setup app

<Source path="src-tauri/setup/src/main.rs" from="//! The Setup app" until="use fanwit_install::*;" />

The **Setup app** is a small Tauri program of its own (`src-tauri/setup` for Rust, `src-setup` for the UI) for the `branded` and `one-click` presets: a themed wizard instead of the OS's default installer UI. It **embeds** the resolved `installer.toml`, the licence and the native package itself, at build time:

<Source path="src-tauri/setup/build.rs" />

It runs the bootstrap steps (prerequisites, for example), then installs the embedded native package silently with the options chosen in the wizard, then confirms the package steps. The native package remains the source of truth for files, registration and updates, and the Setup app is a friendlier way to drive it. A copy of the Setup exe in the install folder serves as the uninstaller and the **Modify** entry in Windows' Apps and features.

For a machine wide install, the visible Setup runs unelevated, and starts an elevated **worker** copy of itself with no window, which writes progress to a file as JSON lines that the visible one follows. You get a single UAC prompt, and the wizard stays responsive.

<Source path="src-tauri/setup/src/main.rs" />

The UI is Svelte, and it reuses FaNWiT's own pieces: `when` clauses (chapter 7), themes (chapter 18), motion (chapter 18) and shadcn components. Pages are components chosen by `pages` in `installer.toml`:

<Source path="src-setup/installer.svelte.ts" />

<Source path="src-setup/App.svelte" />

<Source path="src-setup/pages/Summary.svelte" />

<Source path="src-setup/pages/Progress.svelte" />

An app can add its own pages (`src-setup/pages/custom.ts`) and its own install steps written in TypeScript, which check and queue actions the engine then journals like any other:

<Source path="src-setup/pages/custom.ts" />

<Source path="src-setup/steps/example.ts" />

`pnpm fw installer dev` runs the Setup app with hot reload against a simulated machine, so you design the wizard without installing anything.

## Finishing on first launch

<Source path="src-tauri/src/fanwit/install.rs" />

Some steps cannot run at install time. A macOS drag install runs nothing at all, and per user steps cannot run from a machine wide Linux package. Those steps declare the `firstRun` phase, and the app runs them itself. At setup (chapter 31), `run_pending_phases` checks a marker in the data folder. On the first launch of each version it runs the bundled engine in the background, with `firstRun` (or `update` after an update), then writes the version to the marker. Development builds and copies running from `target/` never do this, so building the app can never change your machine.

## The Installer Lab and fw installer

<Source path="src/fanwit/views/labs/InstallerLab.svelte" />

The **Installer Lab** (chapter 40) puts it all on one screen: `installer.toml` on the left, presets, a target OS, scope, phase and simulated machines to toggle, and the plan on the right, with each step's status, actions and whether it needs elevation, plus the generated glue next to it. Plans run in the real engine against a simulated machine, so nothing on your computer changes.

From the terminal, the same is available as commands (chapter 46):

```sh
pnpm fw installer init --preset branded            # write installer.toml
pnpm fw installer plan --os macos --scenario offline
pnpm fw installer add-step service sync            # a step of a built in or custom type
pnpm fw installer explain setup                    # what an artefact contains and why
pnpm fw installer build --artefacts native,setup   # glue, engine, Setup app, packages
pnpm fw installer test                             # engine tests and the plan for every scenario
```

## Real installs in CI

<Source path=".github/workflows/installer.yml" />

Unit tests on simulated machines catch logic errors. They cannot catch what a real OS does differently. So when the installer changes, the **installer** workflow builds the engine and installs, checks and uninstalls for real: on Windows, macOS and Linux runners, as a standard user and elevated, and in Ubuntu, Fedora and Debian containers. The test scripts check the end state, that the command is on `PATH` and that uninstall leaves nothing behind:

<Source path="installer/tests/e2e.sh" />

<Source path="installer/tests/e2e.toml" />

## Checkpoint

```sh
cargo test --manifest-path src-tauri/install/Cargo.toml
pnpm fw installer plan --os windows --scenario no-admin
pnpm fw installer build --artefacts native,setup
```

The last command produces real installers in `src-tauri/target/release/bundle/` and the Setup exe next to them. Install the app, run it, open the Command Line tool from a new terminal, and uninstall it again.

<Check question="A user installs your app by dragging it to Applications on macOS. installer.toml has a step that links the CLI into ~/.local/bin. When does it run?" options={["Never: drag installs run no code", "At the app's first launch: the step declares the firstRun phase, and the app runs pending phases with the bundled engine", "The next time the user runs the Setup app"]} answer={1}>

A drag install cannot run anything, so the step lists `firstRun` among its phases. On the first launch of that version, `run_pending_phases` finds the engine bundled inside the app and runs the `firstRun` steps in the background.

</Check>

## What you built

That was the last piece. Starting from an empty folder, you have built:

- **foundations**: disposables, the host contract with a browser and a memory host, TOML that keeps its comments, errors and logs, `when` clauses and context keys;
- **a kernel**: commands with a full pipeline, keybindings and chords, events and a lifecycle, modules with contributions and lazy activation;
- **services**: notifications, jobs, translations, storage, SQLite, settings in layers, vaults with indexes, themes, motion, the layout as data, windows, menus and the palette;
- **a window**: every view, overlay and piece of chrome a desktop app needs, with keyboard access throughout;
- **a Rust core**: a sandbox that trusts nothing the page says, native windows that remember their place, SQLite, a CLI socket, plugin hosting, and a security setup checked on every build;
- **features**: files and editors, editors for every kind of user state, labs, plugins with permissions and signed registries, this manual with its playgrounds, and your own app's modules;
- **tools**: the `fw` CLI, schemas, tests and CI, and an installer for every OS.

Along the way, the tests written for this rebuild found and fixed real bugs: an empty layout crashed the reducer, denied plugin reads lost their error code, a rename's undo stranded open tabs, the crash dialog's safe mode button did not start in safe mode, Escape could not cancel a shortcut recording, a docs site playground could reach the docs site's own kernel, and `fw strip --help` stripped everything. Each one is now held in place by a test.

Go back to [the plan](manual://fanwit/learn/rebuild/00-plan) and the stages will read differently now. Then build your own app: `pnpm fw add module <your-idea>`.
