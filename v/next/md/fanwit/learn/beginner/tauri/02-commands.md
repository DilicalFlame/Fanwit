# Commands: calling Rust from the page

A **Tauri command** is a Rust function the page may call. You mark it `#[tauri::command]`, list it in `generate_handler!`, and JavaScript calls it with `invoke("name", { arguments })`, which returns a promise. Almost everything FaNWiT's Rust side offers is a command named `fw_*`.

<Callout kind="why">

Commands are the only door between the page and the computer, so they are where every check happens. Each one says exactly what it accepts (Rust types, checked by serde) and what it returns. FaNWiT keeps them all in one place in TypeScript too, the **host** (`src/fanwit/host/tauri.ts`): the rest of the interface never calls `invoke` directly, it calls `host.fs.readText(path)`. On the web, a different host does the same job with browser storage, and nothing else changes.

</Callout>

## Both sides of one command

The Rust side, from `src-tauri/src/fanwit/fs.rs`:

```rust
#[tauri::command]
pub fn fw_fs_read_text(state: tauri::State<State>, path: String) -> Result<String> {
    let p = state.sandbox.check(&path)?;               // refused if outside the allowed folders
    std::fs::read_to_string(&p).map_err(err)            // the text, or the error's message
}
```

The JavaScript side, from `src/fanwit/host/tauri.ts`:

```ts
readText = (path: string) => invoke<string>("fw_fs_read_text", { path });
```

```tikz caption="One invoke: arguments go to Rust as JSON, the Result comes back as a resolved or rejected promise" alt="JavaScript calls invoke with path; serde turns the JSON into a String; the Rust function checks and reads; Ok becomes a resolved promise, Err a rejected one"
\begin{tikzpicture}[x=1mm,y=1mm,
  js/.style={fwnode,fwuser,text width=38mm,minimum height=11mm,font=\scriptsize},
  rs/.style={fwnode,fwcore,text width=38mm,minimum height=11mm,font=\scriptsize}]
\node[js] (call) at (0,20) {\texttt{invoke("fw\_fs\_read\_text",}\\\texttt{\{ path: "/vault/a.md" \})}};
\node[rs] (fn) at (75,20) {\texttt{fw\_fs\_read\_text(state, path)}\\check, then read};
\node[js] (ok) at (0,0) {promise resolves with the text};
\node[js,fill=fwRedSoft,draw=fwRed] (no) at (0,-14) {promise rejects with the message};
\begin{scope}[packet]\draw[fwarrow] (call) -- node[fwlabel,above]{JSON, serde: \texttt{path: String}} (fn);\end{scope}
\draw[fwarrow] (fn.south) |- node[fwlabel,above,pos=0.75]{\texttt{Ok(text)}} (ok);
\draw[fwarrow,fwRed] (fn.south) |- node[fwlabel,below,pos=0.75]{\texttt{Err("Access denied: ...")}} (no);
\end{tikzpicture}
```

What happens in between:

1. `invoke` sends the command name and arguments as JSON.
2. Tauri finds the command (listed in `generate_handler!`), and serde turns each JSON argument into the parameter's Rust type, by name. A missing or wrong-typed argument is rejected before your function runs.
3. Your function runs. Its `Result` comes back: `Ok(value)` is serialised to JSON and resolves the promise; `Err(message)` rejects it, which in JavaScript becomes an error you `catch`.

Argument names are written in camelCase in JavaScript and snake_case in Rust; Tauri converts (`{ lockPath }` arrives as `lock_path`).

## Parameters Tauri fills in

Some parameters do not come from JavaScript. Tauri recognises them by type and passes them in:

| Parameter | What it is |
|---|---|
| `state: tauri::State<State>` | the value given to `.manage(...)`: FaNWiT's shared `State` |
| `app: AppHandle<R>` | the running app: find windows, emit events, reach paths |
| `window: WebviewWindow<R>` | the window that called: its label, to know who asked |
| `on_event: Channel<T>` | a stream the command can keep sending messages into |

So `fw_vault_lock(app, window, state, path)` takes one argument from the page (`path`) and three from Tauri.

## Async commands

A command marked `async` runs without holding up other commands. FaNWiT's database commands are async and move the SQLite work to a blocking thread (the concurrency chapter showed `spawn_blocking`). Rule of thumb: anything that may take more than a few milliseconds (a query, a big file, a dialog) is async.

## Streams with Channel

A one-off answer is a promise. For a stream of messages (a process printing lines, a long job reporting progress), the page passes a `Channel` and the command keeps sending into it. FaNWiT's native plugin sidecars use one:

```ts
const ch = new Channel<{ line?: string; exit?: number | null }>();
ch.onmessage = (m) => (m.line !== undefined ? onLine(m.line) : onExit(m.exit ?? null));
await invoke("fw_sidecar_spawn", { id, onEvent: ch });
```

<Lab id="tauri-2-lab" title="Add your own command">

On your own machine, in a branch of FaNWiT:

<Steps>

1. In `src-tauri/src/fanwit/app.rs`, add a command that greets someone and fails for an empty name:
   `#[tauri::command] pub fn fw_greet(name: String) -> Result<String> { if name.trim().is_empty() { return Err("Say who to greet".into()); } Ok(format!("Hello, {name}, from Rust!")) }`
2. Add `fanwit::app::fw_greet,` to the list in `generate_handler!` in `src-tauri/src/lib.rs`.
3. Run `pnpm tauri dev`. In the window's developer tools: `await window.__TAURI_INTERNALS__.invoke("fw_greet", { name: "Ada" })`, then the same with `name: ""` and see the promise reject with your message.
4. Try `{ nom: "Ada" }`: Tauri rejects it before your code runs, because the argument `name` is missing.

</Steps>

In FaNWiT you would then add it to the host (`src/fanwit/host/tauri.ts` and the `Host` type in `src/fanwit/host/types.ts`), so the rest of the app calls `host.greet(name)` and the web host can offer its own version. Mark this lab done when both calls behaved as described.

</Lab>

<Check question="A command returns Err(&quot;Access denied&quot;). What does the JavaScript code see?" options={["undefined", "The promise from invoke rejects with that message", "The app crashes"]} answer={1}>

`Err` rejects the promise. `try { await invoke(...) } catch (e) { ... }`, or FaNWiT's notifications, show the message.

</Check>

<Callout kind="learn-more">

Tauri's guide to [calling Rust from the frontend](https://v2.tauri.app/develop/calling-rust/), including [async commands](https://v2.tauri.app/develop/calling-rust/#async-commands) and [channels](https://v2.tauri.app/develop/calling-frontend/#channels).

</Callout>
