---
title: Plugins
section: Guides
order: 13
---
# Plugins

A plugin is a module that arrives at runtime, with a manifest and permissions. A plugin can do anything a module can: commands, views, settings, menus, themes, layout presets and styles.

Plugins come from three places:

| Source | Where | Notes |
|---|---|---|
| **Built-in** | `plugins/<id>/` in this repository | Bundled into the app. Off until turned on (Plugins > Built-in). |
| **Installed** | `<data>/plugins/<id>/`, or `<vault>/plugins/<id>/` | From a folder or a registry. A copy with the same id shadows the built-in one. |
| **Scripts** | `scripts/*.js` | One-file worker plugins (see [User scripts](#user-scripts)). |

```fanwit-run
plugins.open
```

## Performance: plugins cost nothing until used

Obsidian gets slower as you add plugins because each one loads its code into the app at startup and runs on the UI thread. Fanwit is built so that the number of plugins doesn't matter:

1. **A scan reads manifests only.** Contributions (commands, views, status items, settings, menus) are registered as lazy stubs. No plugin code is loaded and no worker is started.
2. **Code starts on first use.** A plugin activates when one of its commands runs, one of its views opens, or an event it listed fires (`onEvent:<name>`). That first event is handed to the plugin once it subscribes. `onStartupFinished` is an explicit opt-in, and the `startup` permission is needed for anything earlier.
3. **No plugin code runs on the main thread.** JavaScript and WebAssembly plugins run in their own Web Worker, and native plugins in their own process. The UI thread only applies their requests.
4. **Updates are batched per frame.** Status bar text and widget trees from a plugin are merged into one update per animation frame, however often the plugin sends them.
5. **Events go only to subscribers.** A plugin receives an event only after calling `ctx.events.on` for it.
6. **A misbehaving plugin is stopped.**
   - A command call that gets no answer within 10 s fails.
   - Three timeouts in a row switch the plugin off ("Not responding").
   - More than 500 calls in a second are dropped.
7. **Appearance costs no code.** Styles and themes are data. Each stylesheet is a single sanitized `<style>` that is removed when the plugin is turned off.

`src/fanwit/plugins/perf.test.ts` holds this to account: it installs 50 plugins, checks that scanning starts nothing, and checks that a command starts exactly one plugin. The Plugin Manager shows each plugin's start time and flags anything over the 50 ms budget.

The one exception is `isolation = "none"`: that code runs in the app itself. The app must allow it in `app.config.ts`, and the user must turn on *Allow community code plugins*.

## Manifest

```toml
id = "word-count"
name = "Word Count"
version = "1.2.0"
author = "Kiran"
description = "Live word count and reading time in the status bar."
category = "editor"                  # a filter chip in the plugin browser
icon = "text"
entry = "main.js"                    # no entry = data only
runtime = "js"                       # js | wasm | sidecar
isolation = "worker"                 # js only: worker (default) | none
activation = ["onEvent:notes:changed"]
permissions = ["vault.read", "statusbar"]

[[contributes.commands]]
id = "wordCount.show"
title = "Show word count details"

[[contributes.views]]
id = "wordCount.panel"
title = "Word count"
ui = "widgets"                       # widgets | iframe (iframe needs entry = "ui.html")
regions = ["sidebar"]

[contributes]
styles = ["styles.css"]
themes = ["themes/x/theme.toml"]
layoutPresets = ["presets/x.toml"]
```

Also under `contributes`: `keybindings`, `statusItems`, `settings` and `menus`. `pnpm fw doctor` and the unit tests check every built-in manifest.

## Kinds of plugin

### Appearance plugins and CSS snippets

An appearance plugin is a `plugin.toml` with `styles` and nothing else. It runs no code and needs no permissions. Two hooks let you scope rules:

- `html[data-preset="blender"]` follows the active layout preset.
- `[data-fw-view="showcase.excel.sheet"]` is set on every pane for the view it shows.

Theme tokens are CSS variables (`--background`, `--primary`, `--border` and so on). CSS is sanitized: no remote `@import`, no remote `url()`, no `expression()`.

**CSS snippets** work the same way without a manifest:

- Drop `.css` files into `<config>/snippets/` (or `<vault>/snippets/`).
- Turn each one on under Plugins > CSS snippets.
- Snippets update live as you edit them.

The built-in examples `vscode-glass`, `blender-classic`, `excel-dark-grid`, `obsidian-minimal` and `discord-compact` each restyle one showcase.

### Feature plugins: pick a runtime

The contract is a message protocol, not a language. Every runtime speaks the same messages (see `src/fanwit/plugins/host.ts`), so permissions, timeouts and UI work the same everywhere.

| `runtime` | Write it in | Runs in | Use it for |
|---|---|---|---|
| `js` | JavaScript or TypeScript | Its own Web Worker | Most plugins |
| `wasm` | Rust (the SDK), or any language that targets WebAssembly | Its own Web Worker | Heavy compute: parsing, analysis, codecs |
| `sidecar` | Rust (the SDK), or any language that reads and writes JSON lines | Its own OS process (desktop) | Native libraries, real threads, GPU, existing tools |

The protocol is plain JSON in both directions.

From the plugin to the app:
- `{t:"call", id, method, args}` to call the API
- `{t:"invoked", id, value}` to answer a command
- `{t:"activated"}` when it has finished starting

From the app to the plugin:
- `{t:"activate", settings}`
- `{t:"invoke", id, command, args}`
- `{t:"event", name, payload}`
- `{t:"ui", view, action, value}`
- `{t:"result", id, value | error}` with the answer to a call

The API methods are:
- `commands.handle` and `commands.run`
- `notify.toast` and `notify.send`
- `settings.set` (only the plugin's own keys)
- `storage.get` and `storage.set`
- `vault.readText`, `vault.list` and `vault.write`
- `statusbar.set`
- `ui.render`
- `events.on` and `events.emit`
- `log`

**WebAssembly.** The module exports `fw_alloc(len)` and `fw_handle(ptr, len) -> u64`.
- `fw_handle` takes one message as JSON.
- Its result packs the pointer and length of the reply, `{"out": [messages]}`.

The Rust SDK (`packages/fanwit-plugin-rs`) implements this for you:

```rust
use fanwit_plugin::{json, Host, Plugin, Value};

#[derive(Default)]
struct Hello;

impl Plugin for Hello {
    fn activate(&mut self, host: &mut Host, _settings: &Value) {
        host.handle("hello.greet");
    }
    fn invoke(&mut self, host: &mut Host, _command: &str, _args: &Value) -> Result<Value, String> {
        host.toast("Hello from Rust");
        Ok(json!(null))
    }
}

fanwit_plugin::export_wasm!(Hello); // or, for a sidecar: fn main() { fanwit_plugin::run_stdio::<Hello>() }
```

**Sidecars** run native code with the user's rights, so:
- they only run when they ship with the app (built-in plugins);
- they only run in the desktop app;
- they need the `sidecar:<id>` permission;
- the app asks before the first run.

Rust looks only for `fanwit-plugin-<id>` next to the app executable. Plugin ids can never become paths.

### Plugin UI: widgets or your own page

**Widgets** (`ui = "widgets"`): the plugin sends a JSON tree and the app draws it with its own controls. It matches the theme, works from the keyboard, and is available to every runtime, including Rust:

```js
ctx.ui.render("pomodoro.panel", {
	type: "stack",
	children: [
		{ type: "text", text: "25:00", size: "xl", mono: true },
		{ type: "button", label: "Start", icon: "play", action: "toggle", variant: "primary" }
	]
});
ctx.ui.on("pomodoro.panel", (action, value) => { /* ... */ });
```

The node types are `stack`, `row`, `text`, `markdown`, `badge`, `icon`, `button`, `input`, `toggle`, `select`, `list`, `table` and `progress`. A tree can have up to 2000 nodes and 256 KB.

**Iframes** (`ui = "iframe"`, `entry = "ui.html"`): the plugin's own web page, built with any framework. It runs in a sandboxed frame from another origin with no network access (`connect-src 'none'`) and no app or IPC access.
- `<script src="_fw/ui.js"></script>` gives the page `window.fanwit`, the same permission-checked ctx a worker gets, with `fanwit.onReady(fn)`.
- The app's theme reaches the page as CSS variables and stays in step with it.
- On the desktop the page is served from the `fanwit-plugin:` scheme. On the web its files are inlined.

Built-in examples: `word-count` (js, status bar), `pomodoro` (js plus widgets), `sketch-pad` (js plus an iframe), `text-stats` (Rust to WebAssembly) and `sys-info` (Rust sidecar plus widgets).

### Context menus

A plugin adds menu items in `plugin.toml`, at any menu location: `statusbar/item`, `view/title`, `editor/context`, `explorer/context` and so on.
- Its own commands can go anywhere.
- Pointing an item at another plugin's or the app's command needs the `menus.global` permission.

Right-clicking a status item sets `statusItem` to that item's id, so items can show only there:

```toml
[[contributes.menus."statusbar/item"]]
command = "wordCount.mode"
label = "Show characters"
args = { mode = "chars" }
visibleWhen = "statusItem == 'wordCount.item'"
```

Word Count and Pomodoro add menus to their status items. Pomodoro, Sketch Pad and System Info add buttons to their views' title bars.

### Knowing where the user is

`layout:activePane` carries `{ pane, view, path }` for the pane in front, and fires whenever that changes, including tab switches. A plugin that subscribes gets the current value straight away. Use it to hide anything that only makes sense for one kind of view: Word Count and Text Stats hide outside notes.

## Building plugins

```sh
pnpm fw plugin new my-skin --kind appearance
pnpm fw plugin new my-tool                        # js in a worker
pnpm fw plugin new my-tool --ui widgets           # ... with a widgets panel
pnpm fw plugin new my-tool --ui iframe            # ... with its own page
pnpm fw plugin new my-fast --runtime wasm         # Rust compiled to WebAssembly
pnpm fw plugin new my-native --runtime sidecar    # a native Rust process
pnpm fw plugin build [id]                         # compile the Rust half (plugin.wasm or the binary)
pnpm fw plugin pack <id>                          # registry entry with a SHA-256 per file
pnpm fw sdk build                                 # typed plugin SDK for this app
```

A new plugin lives in `plugins/<id>`, so it ships with your app as a built-in plugin. `pnpm fw dev` and `pnpm fw build` build sidecars, and release builds bundle them next to the app executable. Use **Rescan plugins** in the Plugin Manager after you edit a plugin.

WebAssembly plugins need `rustup target add wasm32-unknown-unknown`. The built `plugin.wasm` is committed, so the app runs without the Rust toolchain.

## Isolation and trust

- **Data only** (no `entry`): themes, styles, presets and keymaps. Always safe.
- **Worker** (js or wasm): a real boundary. Every ctx call is checked against the plugin's permissions.
- **Sidecar**: a native process, built-in only, asked for once.
- **None**: the same realm as the app, with full UI power. Its permissions are a contract, not a sandbox.

Start with `--safe-mode` to turn code plugins off for one session; styles and snippets still load.

Community plugins come from registries the app lists in `app.config.ts` (`plugins.registries`). Every file is checked against its SHA-256 before install.

## User scripts

For one-off automation, drop a `.js` file in `.fanwit/scripts/` (in a vault) or in `scripts/` in the config folder. Each script is a tiny worker-isolated plugin, and header comments take the place of `plugin.toml`:

```js
// @command scripts.stats Show vault stats
// @key ctrl+alt+s scripts.stats
// @permission vault.read
export default (ctx) => {
	ctx.commands.handle("scripts.stats", async () => {
		const files = await ctx.vault.list("", { recursive: true });
		ctx.notify.toast(`${files.length} files`);
	});
};
```

Scripts show up in the Plugin Manager as "Script: name" and stay off until you turn them on, so a vault you receive from someone else can't run code when you open it. Uninstalling a script removes only that file.
