# Plugins

Modules (chapter 13) are compiled into your app: trusted, fast, and fixed when you build. **Plugins** are added by users after the app ships: themes, layouts, CSS snippets, a word counter, a pomodoro timer. This chapter builds `src/fanwit/plugins/`, the system that loads them, the Rust SDK for writing them, and the plugin manager.

<Callout kind="why">

A plugin system decides how much a stranger's code can do in your user's app. FaNWiT's answer has three parts. First, **data only plugins** (themes, presets, styles, menus) run no code at all. Second, **code never runs on the main thread**: it runs in a Web Worker, a WebAssembly sandbox or a separate process, and can only send messages. Third, each message is checked against the plugin's **declared permissions**. A plugin that hangs or floods the app is cut off, and one that misbehaves at startup can be skipped with safe mode. Chapter 36 built the Rust half of this. This chapter builds the rest.

</Callout>

## The manifest

A plugin is a folder with a `plugin.toml`. Here is the Word Count plugin, one of the examples in `plugins/`:

<Source path="plugins/word-count/plugin.toml" />

<Source path="src/fanwit/plugins/manifest.ts" from="export const ManifestSchema" until="export type PluginManifest" />

The manifest says what the plugin **contributes**: commands, keybindings, status items, settings, themes, menus, layout presets, styles and views. These are the same contribution kinds as a module's, as data. It also says **how** it runs (`runtime`, `isolation`), **when** it starts (`activation`, such as `onEvent:layout:activePane`), and what it may do (`permissions`):

<Source path="src/fanwit/plugins/manifest.ts" from="export const PERMISSIONS" to="};" />

The plugin manager shows each permission in plain words before you turn a plugin on. A plugin without `entry` is **data only**: it executes nothing and needs no permissions, so the Nord theme or the Blender layout is as safe as a settings file.

<Callout kind="new" title="New here: v.InferOutput and picklist">

`export type PluginManifest = v.InferOutput<typeof ManifestSchema>` derives the TypeScript type **from** the Valibot schema. The schema is written once and gives both the run-time check and the static type, so they can never disagree. `v.picklist(["js", "wasm", "sidecar"])` accepts exactly those strings and types the field as their union. `v.optional(x, "js")` supplies a default, so the output type has no `undefined` there.

</Callout>

<Source path="src/fanwit/plugins/manifest.ts" />

## Where plugin code runs

```tikz caption="One protocol, three runtimes: the app checks every message" alt="The app side, host.ts, sends activate, invoke, event and ui messages to a plugin and receives call, invoked and activated messages back. The plugin runs in a Web Worker as JavaScript or WebAssembly, or as a native sidecar process. Every call is checked against permissions, rate limited, and every invoke has a timeout."
\begin{tikzpicture}[x=1mm,y=1mm,b/.style={fwnode,minimum height=10mm,font=\scriptsize,text width=30mm}]
\node[b,fwcore,minimum height=34mm] (host) at (0,0) {\textbf{host.ts}\\[2pt]permissions\\rate limit\\timeouts, strikes\\one apply per frame};
\node[b,fwgrey] (js) at (72,14) {Web Worker\\JavaScript};
\node[b,fwgrey] (wasm) at (72,0) {Web Worker\\WebAssembly};
\node[b,fwgrey] (side) at (72,-14) {native sidecar\\(desktop, bundled)};
\draw[fwarrow] (host.east) ++(0,6) -- node[fwlabel,above,font=\tiny\ttfamily]{activate, invoke, event, ui} ++(36,6);
\draw[fwarrow] (56,-4) -- node[fwlabel,below,font=\tiny\ttfamily]{call, invoked, activated} (15,-4);
\end{tikzpicture}
```

Every runtime speaks the same JSON messages, so the app side is written once, in `host.ts`. A runtime only has to supply a **port** with `post`, `onMessage` and `close`:

- **JavaScript** (`isolation = "worker"`, the default): the plugin's file runs in a Web Worker, with `worker-prelude.ts` prepended. The worker has no DOM and no Tauri IPC.
- **WebAssembly** (`runtime = "wasm"`): a Rust (or other) plugin compiled to `wasm32` runs in a worker too, at near native speed.
- **Native sidecar** (`runtime = "sidecar"`): a bundled program, started by Rust (chapter 36), speaking the protocol over stdin and stdout.

<Source path="src/fanwit/plugins/host.ts" from="// ponytail: fixed limits" until="export function deny" />

The app side enforces the rules, whatever the runtime:

- **Permissions.** Each API method checks the permission it needs (`need("vault.read")`), and a denied call fails with `PERMISSION_DENIED` and a hint naming the line to add to `plugin.toml`. Settings are limited to the plugin's own keys.
- **Plain data only.** Arguments and results pass through a JSON round trip, so a plugin never receives a live object from the app.
- **Timeouts and strikes.** A command handled by a plugin must answer within 10 seconds. Three timeouts and the plugin is declared dead and disabled, with a notification saying why.
- **A rate limit.** More than 500 calls in a second, and the rest of that second's calls are dropped, with one warning.
- **One apply per frame.** Status bar text and widget trees from a plugin are coalesced, and applied once per animation frame. A plugin updating its status item on every keystroke costs the main thread one small update per frame, however fast it sends.

<Source path="src/fanwit/plugins/host.ts" />

The other end of the protocol is the **prelude**, the `ctx` a plugin sees. Every method is a message, `ctx.vault.readText(path)` is `call("vault.readText", [path])`, and the answer resolves a promise when the app replies:

<Source path="src/fanwit/plugins/worker-prelude.ts" />

The Word Count plugin, all of it. Notice it only uses `ctx`: it listens for the active pane and note edits, and sets its status item's text:

<Source path="plugins/word-count/main.js" />

## Loading and activation

<Source path="src/fanwit/plugins/plugins.svelte.ts" from="	private async blocked(" to="	}" />

The plugin service scans three places: built in plugins (bundled with `import.meta.glob`, chapter 23), global plugins in the app's data folder, and vault plugins in the vault's config folder. An installed copy shadows a built in one with the same id. Each enabled plugin becomes a **module** (`toModule`), so everything from chapter 13 applies: contributions are registered, `activate` runs on an activation event, and disabling disposes it all. `blocked` gives a readable reason when a plugin may not run here: a version range that does not match, a runtime the app's config does not accept, a sidecar that did not ship with the app, or a sidecar the user has not agreed to start.

<Source path="src/fanwit/plugins/plugins.svelte.ts" from="	private eventActivation(" to="	}" />

`onEvent:` activation starts a plugin on the first event it cares about, then hands it that event once it has subscribed. Events that arrive while it starts are queued, not lost. Word Count therefore costs nothing until the first note is opened.

## Plugin UI

A plugin view is either **widgets** or an **iframe**.

<Source path="src/fanwit/plugins/widgets.ts" from="export type Widget" until="export const WIDGET_LIMITS" />

**Widgets** are a JSON tree the plugin sends with `ui.render(view, tree)`. The app draws it with its own components (`WidgetNode.svelte`), so it is themed, keyboard reachable and accessible for free, and the plugin's code never touches the DOM. Buttons, inputs, toggles and list items send actions back as `ui` messages. Trees are limited to 2,000 nodes and 256 KB.

<Source path="src/fanwit/plugins/widgets.ts" />

<Source path="src/fanwit/plugins/WidgetNode.svelte" />

An **iframe** view is the plugin's own HTML page, for UI that widgets cannot express (the Sketch Pad's canvas). It is loaded from the `fanwit-plugin:` scheme with its strict content security policy (chapter 36), or inlined as `srcdoc` on hosts without the scheme. The frame is **cross origin and sandboxed**: it cannot reach the app's page, and talks to its plugin only through a `MessagePort` the app hands it, under the same permissions. The app also sends the theme's CSS variables, so the page can match the app's look:

<Source path="src/fanwit/plugins/PluginView.svelte" />

<Source path="src/fanwit/plugins/frames.ts" />

<Callout kind="new" title="New here: MessageChannel and transferring ports">

`new MessageChannel()` creates two connected ports: what is posted on one arrives at the other. `frame.contentWindow.postMessage(msg, "*", [ch.port2])` **transfers** `port2` into the frame, as the third argument. After that, only the frame holds it. The app keeps `port1`, and from then on the two sides talk only through those ports. The `"*"` target is needed because the frame's origin is opaque (sandboxed without `allow-same-origin`), and the port, not the window, is the real channel.

</Callout>

## Installing

<Source path="src/fanwit/plugins/plugins.svelte.ts" from="	async installFromFiles(" to="	}" />

Installs are **all or nothing**. Files go to a `.staging-` folder first. The old version is renamed to `.previous-`, the staging folder is renamed into place, and the old one is deleted only after that succeeds. If anything fails, the previous version comes back and no debris is left. File paths in a plugin are checked first: no `..`, no backslashes, no drive letters.

Plugins come from **registries**: static JSON files listing plugins with the SHA-256 of every file and an optional Ed25519 signature. `installFromRegistry` verifies the signature against `plugins.trustedKeys` from `app.config.ts`, downloads each file, and checks each hash before installing. An unsigned plugin installs only if the user turned on **Allow unsigned plugins**.

<Source path="src/fanwit/plugins/signature.ts" />

<Callout kind="new" title="New here: Web Crypto and Ed25519">

`crypto.subtle` is the browser's built in cryptography. `importKey("raw", bytes, { name: "Ed25519" }, false, ["verify"])` turns a 32 byte public key into a key object, and `verify` checks a signature over the exact bytes that were signed. `signedMessage` builds that byte string the same way `fw plugin pack` does ("Rebuild: tools and shipping"), covering the id, the version and every file's hash. Changing any file, or the version, invalidates the signature. [MDN: SubtleCrypto.verify](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/verify)

</Callout>

<Source path="src/fanwit/plugins/plugins.svelte.ts" />

The service also loads **CSS snippets** (Obsidian style `.css` files in a `snippets/` folder, sanitised as in chapter 18) and **user scripts** (`scripts/*.js` whose header comments declare commands and keys, each run as a tiny worker plugin).

## Writing a plugin in Rust

<Source path="packages/fanwit-plugin-rs/src/lib.rs" />

The SDK hides the protocol. Implement `Plugin` (`activate`, `invoke`, `event`, `ui`, `result`), then either export it to WebAssembly with `export_wasm!`, or run it as a sidecar with `run_stdio`. The same type works both ways, and `pnpm fw plugin new <id> --runtime wasm|sidecar` writes the skeleton ("Rebuild: tools and shipping").

## The plugin manager

<Source path="src/fanwit/core/plugins.ts" />

<Source path="src/fanwit/views/PluginManager.svelte" />

<Source path="src/fanwit/views/PluginList.svelte" />

The manager lists installed and available plugins, with filters by category. Each plugin shows its README, its permissions in plain words, its runtime, and what it added (**Show what a plugin added** opens its views, presets or themes). The sidebar list is the quick on and off switch.

## Checkpoint

```sh
pnpm vitest run src/fanwit/plugins
pnpm exec playwright test plugins --project app
```

The unit tests cover transactional installs, signature checks, WebAssembly plugins, a plugin enabled in one window coming alive in another, and the performance limits. Each example plugin has its own end to end test next to it (`plugins/<id>/<id>.e2e.ts`).

<Source path="src/fanwit/plugins/install.test.ts" />

<Check question="A plugin without the vault.write permission calls ctx.vault.write(&quot;a.md&quot;, &quot;x&quot;) from its worker. What happens?" options={["The file is written, because workers can access files", "The call reaches host.ts, which denies it with PERMISSION_DENIED and a hint naming the permission to add", "The worker crashes"]} answer={1}>

A worker has no file access of its own. `ctx.vault.write` posts a `call` message, and the app side checks the permission before doing anything. The plugin gets a rejected promise with `PERMISSION_DENIED`, and the hint says to add `vault.write` to `plugin.toml`.

</Check>
