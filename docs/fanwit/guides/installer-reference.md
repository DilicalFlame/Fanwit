---
title: Installer Kit reference
section: Installer
kind: reference
order: 20
---
# Installer Kit reference

This page lists every key, flag and file of the Installer Kit. For how to use them, see the [Installer Kit guide](manual://guides/installer).

## installer.toml

The file lives at the repo root, and `schemas/installer.schema.json` gives you completion in the editor. App id, name, slug and version come from `fanwit.app.toml`; `fw installer` injects them as an `[app]` table into `src-tauri/gen/installer/installer.toml`, the copy that ships.

### [installer]

| Key | Values | Meaning |
|---|---|---|
| `preset` | `classic`, `branded`, `one-click`, `dev-tool`, `enterprise`, `portable` | A starting point. `fw installer init --preset` sets `artefacts`, `scope` and `pages` from it |
| `artefacts` | `native`, `setup`, `portable`, `pkg`, `scripts`, `managers` | What `fw installer build` produces |
| `scope` | `user`, `machine`, `ask` | Default install scope. `user` needs no admin rights |
| `theme` | theme id | The app theme the Setup app uses |
| `pages` | page ids | Order of the Setup app's pages: `welcome`, `license`, `scope`, `components`, `options`, `prereqs`, `summary`, `progress`, `finish`, plus custom ids |
| `languages` | codes | Reserved for the language picker |
| `license` | path | A Markdown licence shown on the `license` page (in builds) |
| `downloads` | URL | Where release assets live. `{version}` is replaced. Used by the terminal scripts, the manifests and online Setup apps |

The `scope` value also sets the NSIS install mode: `ask` builds `both` (Setup passes `/AllUsers` or `/CurrentUser`) and `machine` builds `perMachine`. An explicit `bundle.windows.nsis.installMode` in tauri.conf.json wins.

### [installer.payload]

| Key | Meaning |
|---|---|
| `mode` | `offline` (default: the Setup app embeds the package) or `online` (it downloads it) |
| `url`, `sha256`, `size` | For online mode. `fw installer build` fills `sha256` and `size` from the package it built, and the URL from `downloads` when `url` is not set |

The `one-click` preset shows a single progress screen that starts at once.

### [[component]]

| Key | Meaning |
|---|---|
| `id` | Referenced by steps (`component = "id"`) and by `when` clauses (`component.id`) |
| `title` | Shown on the Components page |
| `required` | Always selected, and locked in the UI |
| `default` | Selected unless the user unticks it |
| `size` | Shown next to it, for example `"45 MB"` |

### [[option]]

| Key | Meaning |
|---|---|
| `id` | camelCase. Also a `--set id=value` flag, an MSI property (`ID` in upper case), an environment variable (`<SLUG>_<ID_IN_SCREAMING_CASE>`) and an answer file key |
| `title` | Label on the Options page |
| `type` | `boolean` (a switch) or `string` (a text field) |
| `default` | Initial value |
| `when` | Only shown, and only meaningful, when this clause holds |

### [[step]]: keys for every type

| Key | Meaning |
|---|---|
| `id` | Unique, camelCase |
| `type` | One of the step types below |
| `title` | Shown in the plan, on Prerequisites and in Progress |
| `phases` | Where it may run: `bootstrap`, `package`, `firstRun`, `update`, `uninstall`. The earliest phase available to the artefact wins; later phases skip it when its check passes |
| `platforms` | `windows`, `macos`, `linux`. Empty means all |
| `component` | Runs only when this component is selected |
| `when` | A clause over options and components |
| `after` | Step ids that must run first. The steps form a graph, and a cycle fails validation |
| `requires` | `{ network = true, elevation = true, reboot = true, disk = "60 MB" }` |
| `uninstall` | `"only-if-installed-by-us"` (the default) or `"never"`, or for `run` steps `{ remove = "path" }` or `{ command = "..." }` |

### Step types

**`prereq`**: detects a tool; if it is missing or too old, installs it.

| Key | Meaning |
|---|---|
| `detect` | `{ command = "uv --version", parse = 'uv (\d+\.\d+\.\d+)', require = ">=0.5" }`. `parse` captures the version, and `require` is a semver range |
| `strategies` | Tried in order: `existing` (use what is installed), `sidecar` (copy the bundled binary), `download` (pinned download) |
| `sidecar` | `binaries/uv`. The build phase downloads and places it for Tauri `externalBin` |
| `install_to` | Destination folder, for example `{tools}/uv` |
| `bin` | Binary name inside the tool (default: the step id) |
| `expose` | Name under which the resolved absolute path is recorded, for example `UV_BIN`. Later steps use `{env.UV_BIN}` |
| `[step.download.<target>]` | `url`, `sha256` (64 hex characters, required) and `size`. `<target>` is `<os>-<arch>` (for example `windows-x86_64`), `<os>`, or `any`. Archives (`.zip`, `.tar.gz`, `.tgz`, `.tar.xz`, `.tar.zst`) are extracted |

**`download`**: fetches one verified file to `install_to`, using `[step.download.<target>]` like `prereq`.

**`sidecar`**: copies the bundled binary named by `sidecar` into `install_to` (default `{tools}`), and can `expose` its path.

**`run`**: runs a command.

| Key | Meaning |
|---|---|
| `check` | `{ command = "...", success = 0 }`. When it exits with `success`, the step is satisfied and skipped |
| `apply` | `{ command = "...", env = { NAME = "{appData}/x" } }` |

A command whose `{env.X}` is not known yet (for example, uv was deferred) waits instead of running.

**`path`**: exposes a binary on PATH. On Windows it adds the folder of `target` to the user PATH (the machine PATH for machine scope). On macOS and Linux it links `target` into `{binDir}`.

The system integration types share these keys: `target` (the program), `args`, `name` (display name; default the app name), `icon` and `description`. "Admin" means the step asks for administrator rights.

| Type | Keys | Windows | macOS | Linux |
|---|---|---|---|---|
| `shortcut` | `location`: `startMenu`, `desktop` | `.lnk` (machine scope: all users, admin) | link in Applications or on the Desktop | `.desktop` file |
| `fileAssociation` | `ext`, `progId`, `mime` | `Software\Classes` ProgId and open command | not applicable (Info.plist at build time) | shared-mime-info XML, a handler `.desktop`, `xdg-mime default` |
| `urlScheme` | `scheme` | `Software\Classes\<scheme>` with `URL Protocol` | not applicable (`plugins.deep-link` at build time) | `x-scheme-handler` `.desktop`, `xdg-mime default` |
| `autostart` | | `Run` key | LaunchAgent plist | XDG autostart `.desktop` |
| `service` | `name`, `user` | Windows service via `sc.exe` (admin; the program must be a service) | LaunchDaemon (admin) or LaunchAgent (`user = true`) | systemd unit, system (admin) or `--user` |
| `env` | `name`, `value` | user or machine variable | LaunchAgent that runs `launchctl setenv` at login | `environment.d` file |
| `registry` | `key`, `name`, `value`, `valueType` | the value (`REG_SZ`, or `REG_DWORD` for numbers); `HKLM` asks for admin | not applicable | not applicable |
| `plist` | `domain`, `key`, `value` | not applicable | `defaults write` | not applicable |
| `desktopEntry` | `name`, `[step.entry]` keys | not applicable | not applicable | the `.desktop` file |
| `firewallRule` | `program`, `port`, `protocol` | `netsh advfirewall` rule (admin) | not applicable (macOS asks at run time) | `ufw` or `firewalld` port (admin) |
| `font` | `file`, `name` | per user font folder and registry entry | `~/Library/Fonts` | `~/.local/share/fonts` and `fc-cache` |
| `certificate` | `file`, `subject` | `certutil` Root store (per user shows a Windows confirmation) | `security add-trusted-cert` | system CA bundle (admin) |
| `custom` | `runtime` (`rust` or `ts`), `handler` | see below | | |

A step whose files or values are already in place is satisfied and skipped. Undo restores what was there before: an earlier value, or an earlier file's content. Keys and files the step created are deleted.

**`custom`, runtime `rust`**: `handler` is an id in `REGISTRY` in `src-tauri/install/src/custom.rs`. A step implements `CustomStep` with `check` (satisfied, missing, outdated or blocked), `actions`, and optionally `undo` and `elevation`. `Ctx` gives it the system, its own `Step` (any key from installer.toml), `path()` for placeholders, `command()`, `os()` and `machine()`.

**`custom`, runtime `ts`**: `handler` is the `id` given to `defineInstallStep` in a file under `src-setup/steps/`. `check(ctx)` returns `"satisfied"`, `"missing"` or `{ status, detail }`. `apply(ctx)` queues `ctx.download`, `extract`, `copy`, `writeFile`, `remove` and `run`, and `ctx.undo.remove` or `ctx.undo.run` for extra undo. To look at the system, use `ctx.path`, `exists`, `sha256` and `probe`.

### Placeholders

Paths and commands use placeholders, which resolve per OS and scope:

| Placeholder | Windows (user) | macOS (user) | Linux (user) |
|---|---|---|---|
| `{installDir}` | `%LOCALAPPDATA%\Programs\<Name>` | `~/Applications` | `~/.local/share/<slug>` |
| `{appData}` | `%APPDATA%\<id>` | `~/Library/Application Support/<id>` | `~/.local/share/<id>` |
| `{binDir}` | `{installDir}\bin` | `~/.local/bin` | `~/.local/bin` |
| `{tools}` | `{appData}\tools` | `{appData}/tools` | `{appData}/tools` |
| `{startMenu}`, `{desktop}`, `{home}`, `{temp}` | system folders | system folders | system folders |
| `{id}`, `{name}`, `{slug}` | from `fanwit.app.toml` | same | same |
| `{env.NAME}` | a value an earlier step exposed, else the environment variable | same | same |

Machine scope uses `Program Files`, `/Applications` and `/opt/<slug>`, with `{binDir}` as `/usr/local/bin` or `/usr/bin`. An install folder the user chose (`--install-dir`, or the Install to field) replaces `{installDir}`.

### when clauses

These are the same clauses as elsewhere in the app: identifiers, `!`, `&&`, `||` and parentheses. The identifiers are:

- `component.<id>`;
- an option id (`addToPath` or `option.addToPath`);
- `os.windows`, `os.macos`, `os.linux`;
- `machine` (machine scope);
- `silent`.

## Scenario files

Scenario files in `installer/scenarios/*.toml` describe a simulated computer. Use them with `--scenario a,b`; later files win.

| Key | Meaning |
|---|---|
| `os`, `arch` | `windows`, `macos` or `linux`; `x86_64` or `aarch64` |
| `network` | `false` simulates offline |
| `admin` | Whether the user has admin rights |
| `env` | Environment variables |
| `programs` | Program names found on PATH |
| `[commands]` | `"uv --version" = { code = 0, stdout = "uv 0.5.4" }`. Keyed by program name and arguments |
| `sidecars` | Names of binaries that are bundled |
| `files` | `{ "<path>" = "<sha256 or empty>" }`: files that exist |
| `texts` | `{ "<path>" = "<content>" }`: text files that exist, so file based steps can be satisfied |
| `registry` | `{ "KEY\\name" = "value" }`: registry values that exist |
| `decline_elevation` | The user declines the administrator prompt |
| `fail` | Any action whose description contains this text fails, to test rollback |

## fw installer

Every command accepts `--dry-run`.

| Command | What it does |
|---|---|
| `init [--preset p]` | Creates `installer.toml`, or applies a preset to the existing one |
| `plan [--os --arch --scenario a,b --phase P --scope --components a,b --set k=v --answers f.toml --with uv --json]` | Prints what would happen. With no `--os` or `--scenario`, it checks this computer (read only) |
| `run --phase P [--step id]` | Runs a phase through the engine (same flags as `plan`). Simulated when `--os` or `--scenario` is given |
| `add-step <prereq\|download\|sidecar\|run\|path> <id>` | Appends a step template to `installer.toml` |
| `dev [--scenario a,b] [--with uv] [--uninstall] [--real]` | The Setup app with hot reload, on a simulated computer unless `--real` |
| `build [--artefacts native,setup,portable,pkg,scripts,managers] [--no-bundle] [--assets dir]` | Validates, fetches and verifies sidecars, builds the engine, writes the glue, runs `tauri build` with the kit, then builds the Setup app, the portable build and the pkg, signing each when signing is configured. `--assets` reads release hashes from a folder |
| `explain <nsis\|wix\|deb\|rpm\|pkg\|scripts\|managers\|conf>` | Prints the generated glue, so nothing is magic |
| `test [--windows \| --linux [--distros a,b]]` | Engine tests and a plan per OS (plus `sandbox.wsb` for Windows Sandbox); `--windows` a real per user install and uninstall here; `--linux` real installs and elevation in Docker |

`--with uv` merges `installer/examples/uv.toml` for that command only.

## fanwit-install

The engine ships next to the app, and every artefact calls it.

```
fanwit-install plan      [--phase P] [--json]
fanwit-install run       --phase P [--step id] [--dry-run]
fanwit-install uninstall [--purge]
fanwit-install receipt
fanwit-install validate
fanwit-install elevated --plan FILE --sha256 HEX     # internal: the elevated helper
```

`--no-elevate` tells the engine its caller is already elevated (the package hooks use it). Without it, a `run` or `uninstall` with the machine scope relaunches itself elevated once and streams its log back. Per user runs ask only for the steps that need it.

| Flags | Meaning |
|---|---|
| `--scope user\|machine`, `--components a,b`, `--set key=value` (repeatable), `--answers file.toml`, `--silent` | Choices |
| `--manifest path` | Default: `installer.toml` next to the binary, then the current folder |
| `--install-dir DIR` | Where the app lives, and where the receipt goes |
| `--log file` | Also write the output to a file |
| `--scenario a.toml,b.toml`, `--os`, `--arch` | Simulate; nothing changes |

Choices can also come from the environment:

- `<SLUG>_SCOPE`
- `<SLUG>_COMPONENTS`
- `<SLUG>_<OPTION>`, for example `FANWIT_ADD_TO_PATH=false`

Empty values keep the default. The precedence is: manifest defaults, then the receipt, then the answer file, then the environment, then flags.

An answer file (`--answers`) uses the same keys:

```toml
scope = "user"
components = ["core", "cli"]
installDir = 'D:\Apps\Fanwit'
[options]
addToPath = false
```

## Setup app

| Input | Meaning |
|---|---|
| `--uninstall` | Open the uninstall page (what Apps and features runs) |
| `--engine ...` | Run the `fanwit-install` command line; the Setup app is its own elevated helper |
| `--worker JOB --sha256 HEX --events FILE` | Internal: the elevated half of a machine wide install or uninstall. Refuses a job file that changed, and writes progress as JSON lines |
| `FW_SETUP_PRETEND_NO_WEBVIEW2=1` | Show the WebView2 pre-stage, to test it |
| `--install-dir DIR` | Maintain the install in DIR |
| `FW_SETUP_SCENARIO=a.toml,b.toml` | Simulate a computer (dev) |
| `FW_SETUP_UNINSTALL=1` | Same as `--uninstall`; in a simulation it pretends the app is installed |
| `FW_SETUP_MANIFEST`, `FW_SETUP_PAYLOAD`, `FW_SETUP_LICENSE` | Build time: the files embedded in the exe (`fw installer build` sets them) |

Started from its copy inside an install folder, Setup relaunches from the temp folder and deletes that temp copy when it exits.

The front end lives in `src-setup/`:

- `installer.svelte.ts` holds the shared state (`useInstaller()`) and the page registry (`defineInstallerPage`).
- `pages/` holds the built-in pages, and `pages/custom.ts` is where your own pages are registered.
- `theme.ts` applies the app theme.
- `tsconfig.json` makes the `$lib` and `$fanwit` aliases work.

The Rust side lives in `src-tauri/setup`.

`useInstaller()` exposes:

- `info`, `options`, `components`, `scope`, `installDir`, `plan`, `steps`, `log` and `result`;
- `next()`, `back()`, `go(i)`, `refreshPlan()`, `browse()`, `install()`, `cancel()`, `repair()` and `uninstall(purge)`.

## Generated files

`src-tauri/gen/installer/` is gitignored and written by `fw installer build`:

| File | Used by |
|---|---|
| `installer.toml` | Every artefact (the shipped copy, with `[app]`) |
| `hooks.nsh` | NSIS: runs the package phase after install; registers the Setup copy as the uninstaller and Modify entry; reverses the receipt before uninstall |
| `fanwit-install.wxs` | MSI: deferred custom actions and the MSI properties |
| `deb-postinst.sh`, `deb-prerm.sh`, `rpm-post.sh`, `rpm-preun.sh` | Linux packages |
| `install.sh`, `install.ps1` | Terminal installers (they verify SHA-256 and refuse when it is missing) |
| `managers/` | winget, Scoop, Homebrew cask, AUR, and a Flathub note |
| `tauri.installer.conf.json` | Passed to `tauri build --config`; your `tauri.conf.json` is never rewritten |
| `pkg/postinstall`, `pkg/uninstall.sh` | macOS pkg: the package phase as root, and an uninstaller script shipped next to the pkg |
| `sandbox.wsb` | Windows Sandbox test (`fw installer test`) |
| `linux/` | The Linux engine built by `fw installer test --linux` |

Sidecars and the engine binary are placed in `src-tauri/binaries/`, which is also gitignored.

## On the installed system

| What | Where |
|---|---|
| Receipt | `{installDir}/.install/receipt.toml`: version, scope, components, options, exposed values, and every step with its actions, its undo and an `ours` flag |
| Journal | `{installDir}/.install/journal.jsonl`: one line before and after every action |
| Log | `{installDir}/.install/install.log` (NSIS package phase) |
| First-run marker | `<app data>/.install-phase`: the version whose `firstRun` or `update` steps already ran |
| Windows registry | `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\<Name>`: `UninstallString` and `ModifyPath` point at `<slug>-setup.exe`; `QuietUninstallString` is the silent NSIS uninstaller |

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Done |
| 1602 | Cancelled; everything from this run was rolled back |
| 1603 | Failed (blocked, a failed action, or needs admin rights); everything from this run was rolled back |
| 3010 | Done, restart required |

Unix shells only see the low byte (1603 shows as 67).
