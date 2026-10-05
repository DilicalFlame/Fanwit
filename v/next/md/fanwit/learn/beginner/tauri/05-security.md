# Security: capabilities and the sandbox

FaNWiT runs plugins, renders Markdown from your vault and loads pages into many windows. Any of that could, through a bug or on purpose, try something it should not. So the design assumes the page might be hostile, and puts several walls between it and your computer. Each is small; together they are the reason a plugin cannot read your SSH keys.

<Callout kind="why">

A desktop app with a web interface is only as safe as the narrowest door between the two. If any page could call any command with any path, one malicious note or plugin could read or delete anything you can. FaNWiT narrows the door four times: which windows may call which commands, what pages may load, a check on every message, and a check on every path.

</Callout>

```tikz caption="Four walls between a page and your files" alt="A request from the page passes the content security policy, the isolation script, the capability check and the sandbox path check before reaching the disk"
\begin{tikzpicture}[x=1mm,y=1mm,
  wall/.style={fwnode,fwwarm,text width=27mm,minimum height=16mm,font=\scriptsize}]
\node[fwnode,fwuser,text width=20mm,minimum height=16mm,font=\scriptsize] (page) at (0,0) {a page\\(maybe a plugin)};
\node[wall] (csp) at (32,0) {\textbf{CSP}\\what it may load and connect to};
\node[wall] (iso) at (64,0) {\textbf{isolation}\\every IPC message checked};
\node[wall] (cap) at (96,0) {\textbf{capabilities}\\this window may call this command};
\node[wall,fwcore,font=\scriptsize] (sb) at (128,0) {\textbf{sandbox}\\this path is inside a chosen folder};
\node[fwnode,fill=fwPaper,draw=fwSlate,text width=16mm,minimum height=16mm,font=\scriptsize] (disk) at (156,0) {\faIcon{hdd}\\your files};
\draw[fwarrow] (page) -- (csp); \draw[fwarrow] (csp) -- (iso); \draw[fwarrow] (iso) -- (cap); \draw[fwarrow] (cap) -- (sb); \draw[fwarrow] (sb) -- (disk);
\end{tikzpicture}
```

## Capabilities: which window may do what

Tauri allows nothing by default. Files in `src-tauri/capabilities/` grant **permissions** to windows, matched by label:

```json
{
  "identifier": "fanwit-child-windows",
  "description": "Owned windows (child, panel, ...): no process control or deep links.",
  "windows": ["child-*", "panel-*", "sheet-*", "palette-*", "splash-*", "tray-*"],
  "permissions": [
    "core:default",
    "core:window:allow-close",
    "core:window:allow-set-title",
    "dialog:default",
    "notification:default"
  ]
}
```

This is why window labels follow patterns: a `child-*` window gets fewer permissions than `main`, so a dialog cannot restart the app or register deep links. A plugin's JavaScript API works only where its permission is granted (`dialog:default` here).

## The content security policy

`tauri.conf.json` sets a **CSP**, the browser's own list of what a page may load: scripts only from the app itself (and the plugin scheme), connections only to the IPC and the dev server, no `<object>` at all. Injected script tags from a note, or a plugin trying to send your data to a server, are blocked by the web view before any of FaNWiT's code is involved.

## The isolation pattern

With `"pattern": { "use": "isolation" }`, every IPC message from a page passes through a tiny, separate page (`isolation-src/`) in its own sandboxed frame before it reaches Rust. It sees each command name and its arguments, and can refuse or check them. Because it runs apart from the app's own code, a compromised page cannot change it.

## FaNWiT's sandbox

Even an allowed command from an allowed window is not trusted with paths. Every file command starts with `state.sandbox.check(&path)?`, which you read in the Rust part:

1. **Canonicalise**: resolve `..`, `.` and symbolic links, so `/vault/../../etc/passwd` becomes `/etc/passwd` before anything is compared.
2. **Compare** against the app's own folders and the vault folders the user chose (in the folder picker, or on the command line). Anything else is refused with a message.
3. **Remember** chosen folders in `roots.json`, so a vault opened yesterday can be reopened, but only after the user opened it through the app once.

Native plugin programs (sidecars) are validated the same way: only executables that ship with the app, by id, never a path from the page.

<Lab id="tauri-5-lab" title="Try to escape the sandbox">

On your own machine, with `pnpm tauri dev` running and a vault open:

<Steps>

1. In the developer tools, read a file inside your vault: `await window.__TAURI_INTERNALS__.invoke("fw_fs_read_text", { path: "<your vault>/Welcome.md" })` (use the path the Vault Manager shows).
2. Now try to climb out: the same call with `path: "<your vault>/../../somewhere-else.txt"`. The promise rejects with *Access denied*.
3. Open `src-tauri/src/fanwit/sandbox.rs` and find the line that refused it.
4. Add a test to its `tests` module that pins this, in the style of the existing one: a path with `..` that resolves outside a known root must fail `check`. Run `cargo test --manifest-path src-tauri/Cargo.toml --workspace`.

</Steps>

</Lab>

<Check question="A window labelled child-42 tries to call a command that only the main windows' capability allows. What happens?" options={["It works: all windows are the same app", "Tauri refuses the call, because no capability grants it to that label", "The sandbox refuses it"]} answer={1}>

Capabilities are matched by window label before the command runs. The sandbox is a further check on paths, for calls that are allowed.

</Check>

<Callout kind="learn-more">

Tauri's [security overview](https://v2.tauri.app/security/), [capabilities](https://v2.tauri.app/security/capabilities/), [permissions](https://v2.tauri.app/security/permissions/), [CSP](https://v2.tauri.app/security/csp/) and the [isolation pattern](https://v2.tauri.app/concept/inter-process-communication/isolation/). FaNWiT's own threat model is in the [Expert level](manual://fanwit/guides/plugins#isolation-and-trust).

</Callout>
