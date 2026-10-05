# Plugin files and sidecars

Runtime plugins (installed by users, built in "Rebuild: features") never run on the app's main thread. Their code runs in a web worker, and their UI is widgets or a sandboxed iframe. Heavy native work runs in a separate program. Most of that machinery is TypeScript, built in "Rebuild: features". Two pieces need Rust, and this chapter builds them:

- `plugin_scheme.rs` serves a plugin's iframe files on `fanwit-plugin://`.
- `sidecar.rs` runs a native plugin program and connects it to the webview.

<Callout kind="why">

A plugin is code you did not write, running inside your app. The safe default is that it can do **nothing** except what FaNWiT hands it through its API. For an iframe, that means a page that cannot fetch from the network, call Tauri's IPC, or open other frames. For a native program, it means only programs that shipped with the app can run, chosen by an id that can never turn into a path. Both rules are enforced in Rust, where the plugin cannot reach.

</Callout>

```tikz caption="Where plugin code runs, and what Rust provides" alt="A plugin's logic runs in a web worker. Its UI is either widgets drawn by the app or an iframe whose files Rust serves on the fanwit-plugin scheme with a strict CSP. A native plugin is a separate process started by Rust from a bundled binary, talking JSON lines over stdin and stdout, relayed to the worker through a channel."
\begin{tikzpicture}[x=1mm,y=1mm,b/.style={fwnode,minimum height=10mm,font=\scriptsize,text width=28mm}]
\node[b,fwcore] (app) at (0,0) {app (main thread)\\plugin API};
\node[b,fwgrey] (worker) at (40,14) {plugin logic\\web worker};
\node[b,fwgrey] (frame) at (40,-14) {plugin UI\\sandboxed iframe};
\node[b,fwwarm] (scheme) at (88,-14) {Rust: \texttt{fanwit-plugin://}\\files from memory, strict CSP};
\node[b,fwwarm] (side) at (88,14) {Rust: sidecar\\\texttt{fanwit-plugin-<id>}};
\node[b,fwgrey] (proc) at (134,14) {native process\\JSON lines on stdio};
\draw[fwarrow,<->] (app) -- node[fwlabel,above,sloped]{messages} (worker);
\draw[fwarrow,<->] (app) -- node[fwlabel,below,sloped]{\texttt{postMessage}} (frame);
\draw[fwarrow] (scheme) -- node[fwlabel,above]{serves} (frame);
\draw[fwarrow,<->] (worker) -- node[fwlabel,above]{channel} (side);
\draw[fwarrow,<->] (side) -- node[fwlabel,above]{stdin, stdout} (proc);
\end{tikzpicture}
```

## Serving iframe files

<Source path="src-tauri/src/fanwit/plugin_scheme.rs" from="pub fn fw_plugin_serve" to="}" />

The web side hands Rust a plugin's files (from a built in plugin bundled into the app, or one installed from a registry) with `fw_plugin_serve`. They are kept **in memory** and served at `fanwit-plugin://localhost/<id>/<path>`. Built in and installed plugins therefore load the same way, and nothing a plugin ships is ever read from an arbitrary location on disk. The id must be lowercase letters, digits and hyphens, and file paths must be relative, with no `..`.

<Source path="src-tauri/src/fanwit/plugin_scheme.rs" from="pub fn csp()" to="}" />

<Source path="src-tauri/src/fanwit/plugin_scheme.rs" from="pub fn respond(" to="}" />

Every response carries a content security policy, separate from the app's (chapter 31):

- `default-src 'none'` denies everything not listed.
- Scripts, styles, images and fonts may come only from the plugin scheme itself, plus `data:` and `blob:` for images and fonts.
- `connect-src 'none'`: no `fetch`, no WebSocket, and no Tauri IPC, which is a `fetch` to `ipc.localhost` underneath.
- `frame-src`, `form-action` and `base-uri` are all `'none'`.

The plugin's page can only talk to the app with `postMessage`, which FaNWiT's plugin host checks. `X-Content-Type-Options: nosniff` stops the browser from treating a `.txt` file as a script, and `Cache-Control: no-store` means an updated plugin is never served stale.

<Callout kind="new" title="New here: custom URI schemes and http responses">

`register_uri_scheme_protocol("fanwit-plugin", handle)` in `run()` (chapter 31) makes the webview call `handle` for every request to that scheme, as if it were a tiny web server. `handle` receives an `http::Request` and returns an `http::Response` built with `Response::builder().header(...).body(...)`. That is the same `http` crate most Rust web servers use. On Windows, WebView2 exposes custom schemes as `http://<scheme>.localhost`, which is why both forms appear in the policies.

</Callout>

<Source path="src-tauri/src/fanwit/plugin_scheme.rs" />

## Sidecars

Some plugins need native code: an audio analyser, a fast image decoder, a language server. A **sidecar** is such a program, shipped next to the app binary as `fanwit-plugin-<id>`. Rust starts it and connects its stdin and stdout to the plugin's worker.

<Source path="src-tauri/src/fanwit/sidecar.rs" from="pub fn binary(id: &str)" to="}" />

`binary` turns an id into **one** file name next to the running executable, after checking that the id has no slashes, dots or capitals. A plugin cannot name a path, so it can only start programs that shipped with the app. `pnpm fw plugin build <id>` builds them (in "Rebuild: tools and shipping"), and the installer bundles them.

<Source path="src-tauri/src/fanwit/sidecar.rs" from="pub fn fw_sidecar_spawn" to="}" />

- **Starting** kills any previous instance of the same id, so a reloaded plugin starts fresh. On Windows, `CREATE_NO_WINDOW` stops a console window from appearing.
- **Messages out**: a thread reads stdout line by line and sends each line to the webview through a Tauri **channel**. Lines over 1 MB are dropped with a warning, so a runaway plugin cannot exhaust memory. When stdout closes, the thread waits for the exit code and sends it last.
- **Logs**: stderr goes to the app log, prefixed with the plugin id.
- **Messages in**: `fw_sidecar_send` writes one line to stdin. Newlines inside a message are replaced, so one message is always exactly one line.
- **Stopping**: `fw_sidecar_kill`, and `kill_all` when the app exits (chapter 31's run loop), so no plugin process outlives the app.

The Rust plugin SDK (`packages/fanwit-plugin-rs`, in "Rebuild: features") wraps the other end of this protocol, so a sidecar author writes handlers, not JSON parsing.

<Callout kind="new" title="New here: Channel, take and read_until">

`on_event: Channel<SidecarEvent>` is a Tauri **channel** parameter. The TypeScript side creates `new Channel()` and passes it to `invoke`, and Rust can then `send` it many messages over time, in order. Events are broadcast to everyone listening, while a channel goes to exactly one caller ([Tauri basics: streams with Channel](manual://fanwit/learn/beginner/tauri/02-commands#streams-with-channel)).

`child.stdin.take()` moves the stdin pipe out of the `Child`, leaving `None` behind, so the pipe can be stored separately from the process.

`(&mut r).take(MAX_LINE + 1).read_until(b'\n', &mut buf)` reads up to a newline, but never more than 1 MB plus one byte. That is how the line limit is enforced without ever buffering an unbounded line first.

</Callout>

<Source path="src-tauri/src/fanwit/sidecar.rs" />

## Checkpoint

Both modules have tests for their security rules: files outside a plugin's own set are not found, and ids never become paths.

```sh
cargo test --manifest-path src-tauri/Cargo.toml --lib -- plugin_scheme sidecar
```

<Check question="A plugin's iframe runs fetch(&quot;https://example.com&quot;). What happens?" options={["It works, because the app's own CSP allows https", "The browser blocks it: the plugin page's CSP has connect-src 'none'", "Rust intercepts and forwards it"]} answer={1}>

The plugin page is served with its own policy, and `connect-src 'none'` blocks every fetch, WebSocket and IPC call. A plugin that needs data asks the app through the plugin API, which decides what to allow.

</Check>
