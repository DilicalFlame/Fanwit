---
title: The sandbox and the file system
section: "Rebuild: the Rust core"
order: 2
summary: How the desktop app lets the webview read and write files without letting it read everything. Allowed roots that only the user can add, paths resolved before they are checked, atomic writes, the OS trash, vault locks that cannot go stale, a watcher that pairs renames, and the TypeScript host that calls it all.
---
# The sandbox and the file system

Chapter 3 defined `HostFs`: read, write, list, watch, trash. Chapter 5 implemented it in the browser, on top of OPFS. This chapter implements it on the desktop, where the same calls reach your real disk. That is exactly why they need a sandbox.

<Callout kind="why">

A desktop webview with unrestricted file access is one injected script away from uploading your SSH keys. Tauri's own `fs` plugin can be scoped, but its scopes are fixed when the app is built, while FaNWiT's vaults are folders the user picks at run time. So FaNWiT does not use the `fs` plugin. It ships its own `fw_fs_*` commands, and every one of them starts with the same line: resolve the path, and check it against the folders the app owns or the user chose.

</Callout>

## Which folders are allowed

```tikz caption="Three lists of roots, and what each check allows" alt="App roots (config, data, cache, log) are always allowed. Known roots are folders the user ever chose, saved in roots.json. Active roots are known roots opened this session. check() allows app and active roots; check_known() also allows known roots, for exists only. A folder outside every list is denied."
\begin{tikzpicture}[x=1mm,y=1mm]
\draw[fill=fwBrandSoft,draw=fwBrand,rounded corners=3pt] (0,0) rectangle (44,30);
\node[anchor=north west,font=\scriptsize\bfseries] at (2,29) {app roots};
\node[anchor=north west,font=\scriptsize,text width=40mm] at (2,24) {config, data, cache, log\\created at setup};
\draw[fill=fwWarmSoft,draw=fwWarm,rounded corners=3pt] (52,0) rectangle (122,30);
\node[anchor=north west,font=\scriptsize\bfseries] at (54,29) {known roots (\texttt{roots.json})};
\node[anchor=north west,font=\scriptsize,text width=28mm] at (54,24) {picked in a dialog, created by the app, or passed on the command line};
\draw[fill=fwGreenSoft,draw=fwGreen,rounded corners=3pt] (86,3) rectangle (119,21);
\node[anchor=north west,font=\scriptsize\bfseries] at (88,20) {active roots};
\node[anchor=north west,font=\scriptsize,text width=29mm] at (88,15) {open vaults, this session};
\node[font=\scriptsize,text=fwSlate] at (150,15) {\texttt{\textasciitilde/.ssh}: denied};
\draw[decorate,decoration={brace,amplitude=4pt,mirror}] (0,-3) -- (44,-3);
\draw[decorate,decoration={brace,amplitude=4pt,mirror}] (86,-3) -- (119,-3);
\node[font=\scriptsize] at (60,-11) {\texttt{check()}: reads and writes};
\draw[fwarrow] (40,-11) -- (22,-7);
\draw[fwarrow] (80,-11) -- (102,-7);
\draw[decorate,decoration={brace,amplitude=4pt}] (52,32) -- (122,32);
\node[font=\scriptsize] at (87,39) {\texttt{check\_known()}: \texttt{exists} only};
\end{tikzpicture}
```

<Source path="src-tauri/src/fanwit/sandbox.rs" />

- **App roots** (config, data, cache and log) are always allowed. `init` creates them at startup.
- **Known roots** are folders the user has chosen: picked in the native folder dialog (`fw_fs_pick_folder`), passed on the command line, or created by the app. They are saved in `roots.json`, so a vault opened last week can be reopened today.
- **Active roots** are known roots opened in this session. `allow` activates one, and only if it is a known root or inside one. The webview cannot add a folder by naming it: the only way in is the user choosing it in a native dialog that Rust shows.
- `check` (every read and write) accepts app and active roots. `check_known` also accepts known roots, but is used only by `exists`, so the recent vaults list can see whether a vault still exists without opening it.

### Resolving before checking

`starts_with` on a raw path would be fooled by `vault/../../.ssh/id_rsa`. So `canon` resolves the path first: it finds the deepest part that exists, asks the OS for its real path (following symlinks), then re-applies the rest, handling `..` and `.` itself. This works for files that do not exist yet, such as a note about to be created, and a symlink inside a vault that points elsewhere resolves to where it really points, then fails the check.

<Callout kind="new" title="New here: RwLock, PathBuf and iterator chains">

`RwLock<T>` is a lock that allows **many readers or one writer**. Every file operation reads the roots and only `allow` and `remember` write them, so most calls never wait for each other. `self.known.read().unwrap()` takes a read lock. The `unwrap` would panic only if another thread had panicked while holding the lock.

`PathBuf` is an owned path and `&Path` a borrowed one, like `String` and `&str`. `c.starts_with(r)` on paths compares whole components, so `/vault-old` does not "start with" `/vault`, a mistake string comparison would make.

`dirs.into_iter().flatten()` walks four `Result`s and keeps the `Ok` values: `Result` can be iterated as zero or one item.

</Callout>

The two tests check the rules that matter most: a remembered folder is not readable until it is activated, and `..` cannot climb out, not even through folders that do not exist:

<Source path="src-tauri/src/fanwit/sandbox.rs" from="#[cfg(test)]" />

## File commands

<Source path="src-tauri/src/fanwit/fs.rs" from="pub fn atomic_write" to="}" />

**Atomic writes.** Writing a file in place can be interrupted by a crash or power cut, leaving half a file. `atomic_write` writes to a temporary file next to it, calls `sync_all` (which waits until the data is actually on disk), then renames the temporary file over the target. A rename within one folder is atomic on every OS, so a reader sees the old file or the new one, never a mix. Every TOML file from chapter 15 on is written this way.

The rest of the commands are short. Each checks its path, does one `std::fs` call, and adds the path to any error message, so "No such file" says which file:

- `fw_fs_list` walks a folder, recursively if asked. It never follows symlinked folders, which could loop forever, and it sorts the result so the explorer gets a stable order.
- `fw_fs_trash` moves to the OS trash through the `trash` crate, so a deleted note can be restored from the Recycle Bin or Trash.
- `fw_fs_pick_folder` shows the native picker and **remembers** the result. This is the only way a folder becomes known.

<Callout kind="new" title="New here: let-else and then_some">

`let Ok(m) = e.metadata() else { continue };` is **let-else**. If the pattern matches, `m` is bound and the code continues. If not, the `else` block runs, and it must leave the current block (`continue`, `return` or `break`). It keeps the normal path unindented, where `match` or `if let` would nest it.

`(!m.is_dir()).then_some(m.len())` turns a `bool` into an `Option`: `Some(len)` for files, `None` for folders.

</Callout>

## Vault locks

Two windows editing the same vault would overwrite each other's settings and indexes. So a vault belongs to one window at a time:

<Source path="src-tauri/src/fanwit/fs.rs" from="pub enum VaultLock" to="}" />

<Source path="src-tauri/src/fanwit/fs.rs" from="impl VaultLocks" to="}" />

- **Between processes**, an OS file lock on `.fanwit/lock` (`try_lock`, in the standard library since Rust 1.89). The OS releases it when the process exits, even if it crashes, so a lock can never be left behind by a dead app. Lock files that hold a process id cannot promise that.
- **Within the process**, a table maps each lock to the window that owns it. A second window asking for the vault is told which window has it, and that window is brought to the front instead (chapter 17). A window that has closed loses its claim, and a reload keeps it.

<Callout kind="new" title="New here: enums with data, serialised with a tag">

`VaultLock::Window { label: String }` is an enum variant carrying data. `#[serde(tag = "status", rename_all = "lowercase")]` serialises it as `{"status": "window", "label": "main"}`, which TypeScript can read as a discriminated union on `status`, the same pattern as chapter 19's layout nodes.

`alive: impl Fn(&str) -> bool` accepts any closure that takes a label and returns a bool. The command passes `|l| app.get_webview_window(l).is_some()`, and the test passes `|_| true` or `|_| false`, so the logic can be tested without a running app.

</Callout>

<Source path="src-tauri/src/fanwit/fs.rs" from="#[cfg(test)]" />

## Watching

<Source path="src-tauri/src/fanwit/fs.rs" from="pub fn fw_fs_watch" to="}" />

The `notify` crate reports file system events from the OS. `notify-debouncer-full` groups them over 50 ms and pairs the two halves of a rename. The callback translates them into FaNWiT's four kinds (`created`, `deleted`, `renamed` with `from`, `modified`), drops the `.tmp` files of atomic writes, and emits one `fw://fs` event per batch. Each watch has an id, so the web side can tell its watches apart. Watching a file that does not exist yet watches its folder instead, which is how `TomlFile` (chapter 15) notices when you create `keys.toml` by hand.

<Callout kind="new" title="New here: AtomicU32">

`next: AtomicU32` hands out watch ids without a lock. `fetch_add(1, Ordering::Relaxed)` increments it and returns the old value in one indivisible step, so two threads can never get the same id. `Relaxed` is enough because the counter only has to be unique, not ordered with other memory.

</Callout>

<Source path="src-tauri/src/fanwit/fs.rs" />

## TOML merges

<Source path="src-tauri/src/fanwit/toml.rs" />

`fw_toml_merge` reads a file, merges a value into it with chapter 4's `merge_text`, and writes it back atomically, but only if something changed. The browser host runs the same Rust code compiled to WebAssembly, so comments and formatting survive identically on both.

## The Tauri host

On the web side, `host/tauri.ts` implements `Host` on top of these commands. Most methods are one line that calls `invoke`:

<Source path="src/fanwit/host/tauri.ts" from="class TauriFs implements HostFs" to="}" />

<Source path="src/fanwit/host/tauri.ts" from="function sub<T>" to="}" />

Tauri's `listen` returns a promise of an unlisten function, but FaNWiT's `events.on` must return a `Disposable` right away (chapter 2). `sub` bridges the two. It returns the disposable at once, and if it is disposed before `listen` resolves, it unlistens as soon as it can. Without the `gone` flag, a component that mounted and unmounted quickly would leave a listener behind forever.

<Callout kind="new" title="New here: invoke's argument names">

`invoke("fw_fs_write_text", { path, data, atomic })` sends a JSON object. Tauri matches its keys to the Rust function's parameter names, converting camelCase to snake_case, so `onEvent` in TypeScript fills `on_event` in Rust. Parameters such as `state`, `app` and `window` are not sent: Tauri fills them in itself (see [Tauri basics: commands](manual://fanwit/learn/beginner/tauri/02-commands)). Binary data is sent as an array of numbers, `[...data]`, the simplest encoding Tauri's JSON IPC accepts.

</Callout>

The rest of the host maps the other contracts:

- **Windows** go through Tauri's window API, plus `fw_win_*` commands for what it lacks (chapter 35).
- **Dialogs, notifications and the opener** use Tauri plugins. They are imported lazily, so they don't slow startup.
- **Global shortcuts and autostart** come from desktop only plugins.
- **SQLite** goes through `fw_db_*` (chapter 34).
- **Plugin files and sidecars** go through `fw_plugin_*` and `fw_sidecar_*` (chapter 37). Windows' WebView2 serves custom schemes as `http://fanwit-plugin.localhost`, and the other OSes as `fanwit-plugin://localhost`.

<Source path="src/fanwit/host/tauri.ts" />

## Checkpoint

```sh
cargo test --manifest-path src-tauri/Cargo.toml --lib
pnpm tauri dev
```

In the desktop app, open a folder as a vault (Ctrl+O), create a note, rename it in your OS file manager, and watch the explorer follow. Then try to open the same vault from a second window: the first window comes to the front.

<Check question="A plugin running in the webview calls invoke(&quot;fw_fs_allow_root&quot;) with the path C:/Users/me/.ssh. What happens?" options={["The folder becomes readable for the session", "It fails: allow only activates folders the user chose before, and .ssh was never chosen", "It shows a folder picker"]} answer={1}>

`allow` checks the path against the known roots, and only Rust adds to those: from the native picker, the command line, or folders the app created. Naming a folder from the webview is never enough.

</Check>
