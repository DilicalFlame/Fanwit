---
title: Installer Kit
section: Guides
order: 19
---
# Installer Kit

The Installer Kit turns installing, updating and uninstalling into part of the app (Chapter 16 of the specification). You describe the installation once in `installer.toml`, and the kit produces everything else:

- a **branded Setup app**: a themed wizard with its own uninstall and maintenance pages;
- **native packages** (NSIS and MSI on Windows, deb and rpm on Linux, a pkg on macOS) with your install steps compiled in;
- a **portable** zip (Windows, macOS) or AppImage (Linux) that runs its steps on first launch;
- **terminal installers** (`install.sh`, `install.ps1`) and **package manager manifests** (winget, Scoop, Homebrew, AUR).

Every one of these runs the same engine, `fanwit-install`, so a step behaves the same whichever way the user installs.

<Callout kind="why">

Installers are usually written separately for each format, so the MSI, the deb and the Homebrew formula slowly disagree about what "installed" means, and uninstalling leaves things behind. Here every <Term name="install step" /> is written once and run by one engine. Each step can check, plan, apply, roll back and uninstall, and the engine keeps a <Term name="receipt" /> of what it changed. Repair and a clean uninstall then work from any install format. A plan you can read before anything runs (`fw installer plan`) means a change to the installer can be reviewed like code.

</Callout>

Every key, flag and file is listed in the [Installer Kit reference](manual://guides/installer-reference).

## The pieces

| Piece | Where | What it does |
|---|---|---|
| `installer.toml` | repo root | What to install: components, options, pages and steps |
| `fanwit-install` | `src-tauri/install` | The engine, and the only code that changes the system. It checks, plans, applies with a journal, rolls back, asks for administrator rights when a step needs them, and writes a receipt |
| `fw installer` | `packages/fw/fw.mjs` | Developer commands: plan, preview, build, explain, test |
| Setup app | `src-setup/` (UI) and `src-tauri/setup` (Rust) | The branded wizard, uninstaller and maintenance tool |
| App hook | `src-tauri/src/fanwit/install.rs` | Runs `firstRun` and `update` steps on the first launch of each version |
| Installer Lab | Labs → Installer Lab | Edit `installer.toml`, switch presets and simulated machines, read the plan and the generated glue |
| Tests | `installer/tests/` | Real installs and uninstalls per OS, used by `fw installer test` and `.github/workflows/installer.yml` |

## Quick start

```sh
pnpm fw installer plan                          # what would happen on this computer (changes nothing)
pnpm fw installer dev                           # open the Setup app on a simulated computer
pnpm fw installer build                         # build every artefact in installer.toml
```

`build` writes the artefacts into `src-tauri/target/release/bundle/`:

| Artefact | File |
|---|---|
| Setup app | `setup/<Name>_<version>_x64-Setup.exe` on Windows, `setup/<Name>_<version>_Setup.dmg` on macOS, `setup/<Name>_<version>_Setup.AppImage` on Linux |
| NSIS, MSI | `nsis/<Name>_<version>_x64-setup.exe`, `msi/<Name>_<version>_x64_en-US.msi` |
| deb, rpm, AppImage, DMG | `deb/`, `rpm/`, `appimage/`, `dmg/` (from Tauri, with the kit's hooks) |
| macOS pkg | `pkg/<Name>_<version>.pkg` and `pkg/uninstall-<slug>.sh` (artefact `pkg`, built on macOS) |
| Portable | `portable/<Name>_<version>_x64_portable.zip` (artefact `portable`) |
| Terminal scripts and manifests | `src-tauri/gen/installer/` |

Ship the Setup exe to people. Keep the NSIS and MSI files for the updater, IT departments and package managers.

## Try the Setup app without changing anything

```sh
pnpm fw installer dev                                   # the simulated computer from installer/scenarios/no-admin.toml
pnpm fw installer dev --scenario uv-missing,offline     # combine scenarios; later files win
pnpm fw installer dev --with uv                         # also merge installer/examples/uv.toml
pnpm fw installer dev --uninstall                       # preview the uninstall page
pnpm fw installer dev --real                            # talk to this computer for real (careful)
```

Dev mode hot reloads `src-setup/`. While a simulation runs, the rail shows a **Simulated machine** badge and nothing on the computer changes; actions are only recorded.

To see the plan as text instead:

```sh
pnpm fw installer plan --os windows --scenario no-admin
pnpm fw installer plan --with uv --os linux --scenario uv-missing,offline --json
```

## What the user sees

### Installing

The wizard shows the pages listed in `[installer] pages`:

1. **Welcome**: name, version and size.
2. **Licence**: shown when `[installer] license` points at a file.
3. **Install for**: just me or everyone. Leave `scope` out of `pages` until the elevation helper exists.
4. **Components**: checkboxes; required components are locked. Includes **Install to**, with a **Browse…** button that opens the system folder picker. A folder named after the app is added inside the folder the user picks, unless they picked one with that name already.
5. **Options**: one switch or field per `[[option]]`, shown only when its `when` clause holds.
6. **Prerequisites**: the live check of every step (found, will install, will update, later or blocked).
7. **Summary**: download size, disk space and whether admin rights are needed, before anything changes.
8. **Install**: a progress bar, the list of steps, **Show details** (the engine log) and **Cancel**. Cancelling rolls back what was done.
9. **Finish**: a "Launch now" checkbox.

Under the hood, Setup runs the `bootstrap` steps first. Then it copies itself into the install folder as `<slug>-setup.exe` and runs the embedded NSIS package silently with the user's choices. The package's hook runs the `package` steps. Finally Setup confirms the `package` steps. The NSIS package still owns the program files, shortcuts, the Apps and features entry and updates.

### Uninstalling

When the app was installed through Setup, Windows' **Apps and features → Uninstall** opens the branded uninstall page instead of the plain NSIS dialog. **Modify** opens the maintenance page (Repair or Uninstall).

The uninstall page lists exactly what will go:

- the program files, shortcuts and the Apps and features entry;
- each step Setup performed ("Undo: …");
- what stays: tools that were already on the computer, and the user's documents and vaults.

"Also remove settings and caches" also deletes the app data and the webview cache.

How it works:

- The NSIS hook points `UninstallString` and `ModifyPath` at `<install folder>\<slug>-setup.exe`. It runs on every install, so Tauri updates keep it.
- When that copy starts, it relaunches from the temp folder, so it can delete the install folder, and removes its temp copy when it exits.
- Uninstall first reverses the receipt (only what was ours). Then it runs the NSIS uninstaller silently for the files and registration, and removes the folder if nothing else is left in it.
- `QuietUninstallString` stays the plain silent NSIS uninstaller, for deployment tools.

Installed with the NSIS or MSI package directly (no Setup)? Then the standard uninstaller runs, and it still reverses the receipt through the hook.

## Common tasks

### Install a prerequisite only when it is missing

```sh
pnpm fw installer add-step prereq uv
```

Fill in the download URLs and their SHA-256 hashes (see `installer/examples/uv.toml` for a complete, pinned example). Then check it on simulated computers:

```sh
pnpm fw installer plan --scenario uv-present          # found, will be used, and not removed on uninstall
pnpm fw installer plan --scenario uv-missing,offline  # deferred to a later phase
```

Later steps use the resolved path through `{env.UV_BIN}`, never through PATH.

### Integrate with the system

Every built-in step type works on all three systems, using what each one has (the full table is in the [reference](manual://guides/installer-reference)):

```toml
[[step]]
id = "notes"
type = "fileAssociation"      # Windows: registry ProgId; Linux: MIME XML + .desktop; macOS: Info.plist at build time
phases = ["package", "firstRun"]
ext = ".fwn"
target = "{installDir}/{slug}"

[[step]]
id = "sync"
type = "service"              # Windows service, launchd daemon or agent, systemd unit
phases = ["package"]
target = "{installDir}/{slug}"
args = ["--sync"]
user = true                   # per user (LaunchAgent, systemd --user): no administrator rights
```

The other types are `shortcut`, `urlScheme`, `autostart`, `env`, `registry`, `plist`, `desktopEntry`, `firewallRule`, `font` and `certificate`. A step that does not apply on an OS (a registry value on Linux) is skipped there and reported as such in the plan. Uninstall puts back exactly what was there before: a file association that belonged to another app goes back to that app.

### Administrator rights

The engine never runs elevated itself. When something needs administrator rights, it asks once:

- **Everyone on this computer** (`--scope machine`, or the Scope page): the whole install runs in one elevated helper, which streams its progress back.
- **A step that needs it in a per user install** (a system service, a firewall rule, a Linux CA certificate): only those steps run elevated, batched behind one prompt. Their undo is batched the same way at uninstall.

The prompt is UAC on Windows, the authorisation dialog on macOS, and polkit (`pkexec`) on Linux. Where `sudo` already works without a password (CI, a terminal that just used sudo), it is used and no dialog appears. The helper only runs a plan file whose SHA-256 the engine put on its command line, and plans expire after ten minutes. Declining the prompt cancels the install (exit code 1602) and rolls back what was done.

To offer the Scope page, set `scope = "ask"`. The NSIS package is then built in `both` mode, and Setup passes `/AllUsers` or `/CurrentUser`. Note that in this mode Windows asks administrators for consent even for a per user install. `scope = "machine"` builds a per machine package.

### Write your own step

**In Rust**, the step runs in every phase, including inside native packages. Implement `CustomStep` in `src-tauri/install/src/custom.rs` and list it in `REGISTRY`; `example.defaultConfig` is a working example. Then use it:

```toml
[[step]]
id = "config"
type = "custom"
runtime = "rust"
handler = "example.defaultConfig"
phases = ["package", "firstRun"]
```

**In TypeScript**, the step runs in the Setup app (the `bootstrap` phase). Put a file in `src-setup/steps/`; files there are picked up automatically:

```ts
import { defineInstallStep } from "../steps";

export default defineInstallStep({
	id: "models.base",
	summary: "Download the base model (1.2 GB)",
	async check(ctx) {
		return (await ctx.sha256("{appData}/models/base.bin")) === MODEL_SHA ? "satisfied" : "missing";
	},
	apply(ctx) {
		ctx.download({ url: MODEL_URL, sha256: MODEL_SHA, to: "{appData}/models/base.bin" });
	}
});
```

Use it with `type = "custom"`, `runtime = "ts"`, `handler = "models.base"`. Neither kind changes the system itself. A step checks, then queues actions (download, extract, copy, writeFile, remove, run), and the engine performs them with the same journal, rollback, receipt and elevation as every other step. Outside the Setup app, a TypeScript step shows as deferred.

### Run a command during install

```toml
[[step]]
id = "index"
type = "run"
title = "Build the search index"
after = ["uv"]
phases = ["bootstrap", "firstRun"]
check = { command = "{installDir}/fanwit-cli index status", success = 0 }
apply = { command = "{installDir}/fanwit-cli index build" }
uninstall = { remove = "{appData}/index" }
```

`check` makes the step safe to run again: when it succeeds, the step is skipped.

### Let the user choose

```toml
[[component]]
id = "python"
title = "Python tools"
default = true
size = "45 MB"

[[option]]
id = "launchAtLogin"
title = "Start Fanwit when I sign in"
type = "boolean"
default = false
```

Give a step `component = "python"` or `when = "launchAtLogin && !machine"`. Each option is also a `--set` flag, an MSI property (`LAUNCHATLOGIN=1`) and an environment variable (`FANWIT_LAUNCH_AT_LOGIN=1`).

### Change the look

`[installer] theme` takes the id of any app theme (`src/fanwit/themes/builtin`). The Setup app uses the same tokens and shadcn components as the product, and follows the system's light or dark mode.

### Add your own page

Pages are Svelte components. Put the component in `src-setup/pages/`, then register it in `src-setup/pages/custom.ts`:

```ts
import { defineInstallerPage } from "../installer.svelte";

defineInstallerPage({
	id: "telemetry",
	title: "Privacy",
	after: "options",                 // where it goes when installer.toml pages does not list it
	component: () => import("./Telemetry.svelte"),
	when: "!silent"                   // optional when clause
});
```

```svelte
<script lang="ts">
	import { Switch } from "$lib/components/ui/switch";
	import { useInstaller } from "../installer.svelte";
	const inst = useInstaller(); // options, components, installDir, plan, next(), back()
</script>

<h1 class="text-xl font-semibold">Help us improve</h1>
<Switch checked={inst.options.crashReports === true} onCheckedChange={(v) => (inst.options.crashReports = v)} />
```

Reusing a built-in id (for example `welcome`) replaces that page. Ordering is controlled by `[installer] pages`.

### Silent and enterprise installs

```sh
Fanwit_0.0.1_x64-setup.exe /S /D=C:\Apps\Fanwit                # NSIS, silent; /D must come last
set FANWIT_COMPONENTS=core,cli && Fanwit_0.0.1_x64-setup.exe /S  # choices through the environment
msiexec /i Fanwit_0.0.1_x64_en-US.msi /qn COMPONENTS=core,cli ADDTOPATH=1
sudo FANWIT_COMPONENTS=core,cli apt install ./Fanwit_0.0.1_amd64.deb
```

Exit codes follow Windows Installer on every OS: 0 ok, 1602 cancelled, 1603 failed, 3010 ok but restart needed.

### A small download instead of a big Setup

Set `[installer.payload] mode = "online"`. The Setup app then embeds no package: it downloads it with a resumable download and checks it against the SHA-256 that `fw installer build` pinned. The URL is `[installer] downloads` plus the package's file name, or `payload.url`. Upload that package to the release.

### Release

`.github/workflows/release.yml` does this on every tag:

1. `fw installer build --artefacts native --no-bundle` generates the engine and the glue, and `tauri-action` builds the packages with them (`--config src-tauri/gen/installer/tauri.installer.conf.json`).
2. `fw installer build --artefacts setup,portable,pkg,scripts,managers` builds the rest and signs it when the secrets exist, then uploads it to the draft release.
3. To pin the terminal scripts and manifests to every OS's bundles, download the release assets into a folder and run `pnpm fw installer build --artefacts scripts,managers --assets <folder>`. A script with a missing hash refuses to run.

The signing secrets are:

| OS | Secrets |
|---|---|
| Windows | `WINDOWS_CERTIFICATE` (a base64 `.pfx`) and `WINDOWS_CERTIFICATE_PASSWORD`. Locally: `bundle.windows.signCommand`, `certificateThumbprint`, or `FW_WINDOWS_CERT_THUMBPRINT` |
| macOS | `APPLE_SIGNING_IDENTITY` and `APPLE_INSTALLER_IDENTITY`; notarisation with `APPLE_ID`, `APPLE_PASSWORD` and `APPLE_TEAM_ID` |
| Linux | `FW_GPG_KEY`, for detached `.asc` signatures |

Unsigned installers trigger SmartScreen and Gatekeeper, and `pnpm fw doctor` warns when signing is not configured.

### Test real installs

```sh
pnpm fw installer test             # engine tests and a simulated plan per OS
pnpm fw installer test --windows   # install, check, uninstall, check on this Windows machine (per user)
pnpm fw installer test --linux     # the same plus elevation, in Docker: Ubuntu 24.04 and Fedora 41
pnpm fw installer test --linux --distros debian:12,ubuntu:24.04
```

`.github/workflows/installer.yml` runs these on Windows, macOS and Linux runners, plus a matrix of distributions. A Windows Sandbox file for testing the built packages is written to `src-tauri/gen/installer/sandbox.wsb`.

## Safety

- **Check before apply.** A step whose check passes is skipped, so installs, repairs and updates can all run the same steps.
- **Journal and rollback.** Every change is written to `{installDir}/.install/journal.jsonl` before it happens. If a step fails, or the user cancels, everything done in that run is undone in reverse order.
- **Receipt.** `{installDir}/.install/receipt.toml` records each step and whether it was ours. Uninstall reverses only what was ours, so a uv that was already installed stays.
- **Pinned downloads.** Downloads must be https and pinned by SHA-256. Validation, `fw doctor` and the build all fail on a missing pin, and nothing pipes a remote script into a shell.
- **No changes from dev builds.** The app's first-run hook only runs from an installed copy, never from a debug build or `src-tauri/target`.
- **Least privilege.** The engine and the Setup window run without administrator rights. Only the actions that need them run elevated, after one prompt, from a plan whose digest cannot be changed after the prompt is shown.

## Troubleshooting

| Symptom | Fix |
|---|---|
| The installed app shows a black window after about 5 s | The production CSP blocked Tauri's isolation iframe. `frame-src` in `src-tauri/tauri.conf.json` must include `isolation: http://*.localhost` |
| The editor shows `OUT_DIR not set` in `src-tauri/setup` | Restart rust-analyzer after pulling, so it runs the new crate's build script. `cargo check --workspace` is the source of truth |
| The editor cannot find `$fanwit/...` in `src-setup` | The Setup app has its own `src-setup/tsconfig.json`. Restart the TypeScript server; `pnpm check` checks both apps |
| A step says "deferred" | It cannot run in this phase (offline, no bundled copy). It runs again in its next phase |
| A step says "blocked" | It cannot run in any remaining phase. The detail explains why: no network, no download for this OS, or needs admin rights |
| The administrator prompt never appears on Linux | There is no polkit agent and no terminal for `sudo`. Run from a terminal, install `pkexec`, or use the deb or rpm, which run as root |
| A step says "runs in the Setup app (TypeScript)" | TypeScript steps need the Setup app; install with it, or write the step in Rust |
| The Setup app says WebView2 is missing | It offers to install Microsoft's runtime (about 2 MB) and then continues |
| SmartScreen warns about the Setup exe | Sign it (`bundle.windows.certificateThumbprint` or `signCommand`) |

## What is tested where

| Area | Tested |
|---|---|
| Engine, every step type, elevation batching, digest checks | Unit tests on Windows and Linux (`cargo test -p fanwit-install`) |
| Real per user installs and uninstalls | Windows (this repo's machine and CI), Ubuntu 24.04 and Fedora 41 (Docker) |
| Elevation, per step and per machine | Linux with `sudo` (Docker). The Windows UAC and macOS dialog paths only run in CI or by hand |
| Setup app install, Apps and features uninstall | Windows, per user |
| macOS (Setup DMG, pkg, e2e) and the per machine Setup worker | Written; run them in CI (`installer.yml`) or on a Mac before relying on them |

On macOS, file associations and URL schemes come from `Info.plist` at build time, and the firewall asks the user at run time, so those step types are reported as not applicable there. Flatpak, Snap and MSIX sandboxes cannot change the host, so their steps move to first launch.
