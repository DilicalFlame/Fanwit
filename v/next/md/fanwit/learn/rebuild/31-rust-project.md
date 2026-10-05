# The Rust project

Everything so far runs in a browser. This stage builds the other half: the Rust program in `src-tauri/` that becomes the desktop app. It implements the Tauri host's side of chapter 3's `Host` contract, with a sandboxed file system, SQLite, native windows, the tray, the CLI socket, plugin sidecars and the installer.

If Rust or Tauri are new to you, the [Rust basics](manual://fanwit/learn/beginner/rust/01-first-program) and [Tauri basics](manual://fanwit/learn/beginner/tauri/01-what-is-tauri) chapters cover the language and the framework. The Tauri chapters already walk through a minimal `lib.rs` line by line, so this chapter focuses on what FaNWiT adds.

<Callout kind="why">

The web side treats Rust as a **server it trusts and that does not trust it back**. Every request from the webview arrives as a `fw_*` command with plain arguments. It passes three gates before touching the system: an isolation hook that drops unknown commands, the window's **capabilities**, and Rust's own path checks against the folders the user chose. A bug or an injected script in the webview can therefore never read `~/.ssh` or delete your home folder. The rest of this stage explains how each gate works.

</Callout>

```tikz caption="Three gates between the page and the operating system" alt="A call from the webview passes the isolation hook in a sandboxed iframe, which rejects unknown commands and oversized payloads, then Tauri's capability check for the window's label, then the fw command in Rust, which checks the path against the sandbox before the file system call."
\begin{tikzpicture}[x=1mm,y=1mm,b/.style={fwnode,minimum height=12mm,font=\scriptsize,text width=24mm}]
\node[b,fwuser] (page) at (0,0) {webview\\\texttt{invoke(...)}};
\node[b,fwwarm] (iso) at (34,0) {\textbf{1} isolation hook\\known command?\\size limit};
\node[b,fwwarm] (cap) at (68,0) {\textbf{2} capabilities\\allowed for this\\window label?};
\node[b,fwwarm] (sb) at (102,0) {\textbf{3} sandbox\\path inside an\\allowed root?};
\node[b,fwcore] (os) at (136,0) {operating system\\\texttt{std::fs}};
\draw[fwarrow] (page) -- (iso);
\draw[fwarrow] (iso) -- (cap);
\draw[fwarrow] (cap) -- (sb);
\draw[fwarrow] (sb) -- (os);
\end{tikzpicture}
```

## Cargo

<Source path="src-tauri/Cargo.toml" />

- **One workspace.** The app, the installer engine (`install`), the setup program (`setup`), the Rust plugin SDK, the TOML merge library (chapter 4) and native plugins build together and share one `Cargo.lock` and one `target/` folder. `default-members` limits what plain `cargo build` builds, so the setup program, which embeds a finished app, is built only when asked for.
- **A library and a binary.** The app's code is a library (`fanwit_lib`), and `main.rs` only calls `run()`. Tauri needs this for mobile builds (`staticlib` and `cdylib`), and it also lets `src-tauri/src/bin/fanwit-cli.rs` (chapter 35) live in the same crate.
- **Small release builds.** `opt-level = "z"` optimises for size, `lto` optimises across crates, `codegen-units = 1` gives the optimiser everything at once, `strip` removes symbols, and `panic = "abort"` drops the unwinding machinery. Release builds take longer, and the app comes out a fraction of the size.
- **Platform specific dependencies.** `[target."cfg(windows)".dependencies]` is only compiled on Windows. The single instance, global shortcut and autostart plugins are desktop only.

<Callout kind="new" title="New here: features and cfg">

A crate can offer optional **features**. `rusqlite` with `"bundled"` compiles SQLite itself instead of linking the system's copy, so every user gets the same version. `tauri` with `"tray-icon"` includes the tray code.

`#[cfg(windows)]` on an item compiles it only on Windows. `cfg!(debug_assertions)` is the same test as an expression that is `true` or `false`, so both branches must compile. `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]` at the top of `main.rs` applies an attribute only in release builds. There it stops Windows from opening a console window next to the app. [The Cargo Book: features](https://doc.rust-lang.org/cargo/reference/features.html)

</Callout>

<Source path="src-tauri/src/main.rs" />

<Source path="src-tauri/build.rs" />

`build.rs` runs before the crate compiles. Besides Tauri's own build step, it copies the bundle identifier into an environment variable that `env!("FW_IDENTIFIER")` reads at compile time. That way the CLI client binary can find the running app's socket, which is named after the identifier.

## Configuration

<Source path="src-tauri/tauri.conf.json" />

- **`"windows": []`.** No window is declared here. The main window is created in code (chapter 34), with its saved size and position, so it can open exactly where you left it.
- **`removeUnusedCommands`.** Plugin commands that no capability allows are left out of the build, so code nothing may call is not shipped.
- **The content security policy** says what the webview may load. Scripts, styles and fonts come from the app itself, plus `blob:` (the playgrounds) and the `fanwit-plugin:` scheme (plugin files, chapter 36). Connections go to the app, Tauri's IPC and the plugin scheme. Nothing loads from the internet, and `object-src 'none'` forbids plugins of the old kind. The development policy additionally allows Vite's dev server and its hot reload socket.
- **The isolation pattern** puts a hidden, sandboxed iframe between the page and Tauri's IPC. Every message passes through `isolation-src/isolation.js` before it reaches Rust:

<Source path="isolation-src/isolation.js" />

The hook allows only FaNWiT's own `fw_*` commands and plugin commands, and rejects payloads over 16 MB. The page cannot reach into the iframe, so even a script injected into the app's page cannot remove the hook. [Tauri: Isolation pattern](https://v2.tauri.app/concept/inter-process-communication/isolation/)

## Capabilities

A capability grants permissions to windows matched by **label**. FaNWiT labels windows by kind (chapter 21: `main`, `aux-…`, `child-…`), so permissions follow the kind of window:

<Source path="src-tauri/capabilities/default.json" />

<Source path="src-tauri/capabilities/child-windows.json" />

<Source path="src-tauri/capabilities/desktop.json" />

Main and auxiliary windows get the full workbench set. Child windows (dialogs, panels, palettes) cannot control the process or handle deep links: an About box has no business quitting the app. Only the main window can register OS wide shortcuts and autostart. FaNWiT's own `fw_*` commands are allowed by default, and their safety comes from the sandbox checks inside each command (chapter 32).

## The run function

<Source path="src-tauri/src/lib.rs" />

Read it in order:

1. **Launch arguments** are parsed first (chapter 35), since they decide the profile, safe mode and headless mode.
2. **Plugins.** The single instance plugin must come first: when the app is launched a second time, it forwards that launch's arguments to the running instance and exits before anything else starts. Autostart launches with `--headless`, so the app starts in the tray.
3. **`.manage(State::new(launch))`** gives every command access to FaNWiT's shared state (below).
4. **`register_uri_scheme_protocol`** serves plugin files from a custom scheme (chapter 36).
5. **`generate_handler!`** lists every `fw_*` command. There are about 45, grouped by module. A command that is not listed here simply does not exist for the webview.
6. **`setup`** runs once the app is built (below). **`on_window_event`** handles focus, moves and closing for all windows (chapter 34).
7. **The run loop** kills plugin sidecars on exit, and reopens the main window when the macOS dock icon is clicked.

## Shared state and helpers

<Source path="src-tauri/src/fanwit/mod.rs" />

- **`Result<T>` is `Result<T, String>`.** A command's error is sent to the webview, which turns it into a `FanwitError` (chapter 6). `err` turns any displayable error into that string, so `.map_err(err)?` ends most calls.
- **`State`** holds each subsystem's state: the sandbox's allowed roots, file watchers, open databases, window state, the CLI connections, launch paths, served plugin files and running sidecars. Each part guards its own data with a `Mutex`, so commands running on different threads never block each other more than needed.
- **`app_dir`** resolves the config, data, cache and log folders. With `--profile work`, each becomes `<dir>/profiles/work`, so you can keep separate settings for testing. The profile name is filtered down to letters, digits, `-` and `_`, so `--profile ../../x` cannot escape.
- **`to_front`** gives the webview paths with forward slashes and without Windows' `\\?\` prefix (via the `dunce` crate), so TypeScript path code works the same on every OS.

<Callout kind="new" title="New here: type aliases, generic functions over Runtime, and Mutex in shared state">

`pub type Result<T> = std::result::Result<T, String>;` is a **type alias**: a short name for a longer type, with its own generic parameter.

`fn app_dir<R: tauri::Runtime>(app: &tauri::AppHandle<R>, ...)` is generic over Tauri's runtime. In practice it is always the real webview runtime, but Tauri's mock runtime for tests is a different type, so library code that takes `R` works with both.

Tauri runs commands on several threads at once, and `State` is shared by all of them. A `Mutex<T>` allows one thread at a time to `lock()` it and get the `T` inside. The lock is released when the guard goes out of scope. The [Rust basics chapter on threads](manual://fanwit/learn/beginner/rust/08-concurrency) covers this in detail.

</Callout>

## Setup, secrets and crash reports

<Source path="src-tauri/src/fanwit/app.rs" />

`setup` runs in the order the rest depends on:

1. **The sandbox** learns the app's own folders (chapter 32).
2. **Paths from the command line** count as chosen by the user. `fanwit ~/notes` makes that folder accessible, just as picking it in a dialog would.
3. **The panic hook** is installed.
4. **Windows**: saved state is loaded and the main window is created.
5. **The CLI socket server** starts (chapter 35).
6. **Pending installer phases** run (in "Rebuild: tools and shipping").
7. **The tray** is created, unless the app started headless.
8. **Deep link schemes** are registered with the OS.

`fw_app_info` is what the web side's `host.app()` returns: name, version, Tauri and webview versions, OS and architecture. It also includes the `--set` overrides and `FANWIT_*` environment variables, which become a settings layer (chapter 16).

**Secrets** (API keys and tokens a module stores) go to the OS keychain through the `keyring` crate: Windows Credential Manager, macOS Keychain, or the Secret Service on Linux. Never into TOML, never into logs.

**A panic** writes `crash.json` to the log folder before the process dies. On the next launch, `mainStartup` finds it and offers the crash report window (chapter 30).

<Callout kind="new" title="New here: serde rename_all, match guards and or-patterns, and move closures">

`#[serde(rename_all = "camelCase")]` makes `tauri_version` arrive in TypeScript as `tauriVersion`, so each side keeps its own naming convention.

In `fw_secret_set`, `Some(v) if !v.is_empty() => ...` is a match arm with a **guard**: it matches only when the condition also holds. `Ok(()) | Err(keyring::Error::NoEntry) => Ok(())` is an **or-pattern**: deleting a secret that does not exist counts as success.

`std::panic::set_hook(Box::new(move |info| { ... }))` stores a closure that runs on any panic. `move` makes the closure take ownership of `dir` and `prev`, since it outlives the function that created it. `Box` puts the closure on the heap, because the hook's type is "some function" (`Box<dyn Fn(...)>`) rather than one specific closure type.

</Callout>

## Logging

<Source path="src-tauri/src/utils/logger.rs" />

<Source path="src-tauri/src/constants.rs" />

<Source path="src-tauri/src/utils.rs" />

One log, three outputs:

- **The terminal** gets colour coded levels with file and line, for development.
- **A plain text file** in the log folder is rotated at 5 MB, with five files kept. It is what the diagnostics bundle (chapter 25) collects.
- **The webview** receives Rust's records too, for the Log Viewer. Records that came **from** the webview are filtered out of this target, so they are not echoed back.

The web side's logger (chapter 6) tags its records with `[FRONTEND_LOC:file:line]`, and `extract_clean_metadata` turns that tag back into a file and line. A log line from a Svelte component therefore points at the component, not at the bridge that carried it.

<Source path="src-tauri/src/gen_identity.rs" />

`gen_identity.rs` holds the app's name, slug and vault folder name. It is generated by `pnpm fw rename`, which renames FaNWiT to your app everywhere at once (chapter 1's `src/fanwit/gen/identity.ts` is its TypeScript twin).

## Checkpoint

```sh
cargo check --manifest-path src-tauri/Cargo.toml
pnpm tauri dev
```

The first command compiles everything without producing a binary, which is the fastest way to see type errors. The second starts Vite and the desktop app together, and opens the same workbench as chapter 30, now in a native window. File access, windows and the tray only work fully once the chapters ahead are written.

<Check question="A script injected into the page calls invoke(&quot;plugin:shell|execute&quot;, ...) to run a program. Which gate stops it?" options={["None; Tauri allows any plugin command", "The capabilities: no capability grants shell permissions to any window, and the shell plugin is not even installed", "The content security policy"]} answer={1}>

The isolation hook lets plugin commands through by their shape, so the capability check is what stops this one. No FaNWiT capability grants a shell permission, and the shell plugin is not in `Cargo.toml` at all, so there is nothing to call. The content security policy governs what the page loads, not which IPC commands it may send.

</Check>
