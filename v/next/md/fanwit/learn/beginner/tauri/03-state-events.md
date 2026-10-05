# State and events

Commands answer questions the page asks. Two things are still missing: data that lives as long as the app (open databases, allowed folders, running file watchers), and a way for Rust to speak first, when something happens that no page asked about. Tauri's answers are **managed state** and **events**.

<Callout kind="why">

When you edit `settings.toml` in another editor, FaNWiT's window updates by itself. No page asked; a file watcher in Rust noticed the change and *told* the pages. And the watcher itself must live somewhere between commands: in the app's state, so that a later command can stop it.

</Callout>

## Managed state

`.manage(value)` in the builder hands Tauri one value of a type; any command can then ask for it with a `tauri::State<Type>` parameter. FaNWiT manages exactly one, `fanwit::State`, which holds a field per area:

```rust
pub struct State {
    pub launch: cli::LaunchArgs,      // what the app was started with: never changes
    pub sandbox: sandbox::Sandbox,    // allowed folders, behind RwLocks
    pub fs: fs::FsState,              // file watchers and vault locks, behind Mutexes
    pub db: db::DbState,              // open databases
    pub windows: windows::WindowsState,
    pub sidecars: sidecar::Sidecars,
    // ...
}
```

Tauri shares this one value with every command on every thread, so it only gives out `&State`, a shared reference. Anything that changes is therefore inside a `Mutex`, `RwLock` or atomic, as the concurrency chapter explained. Outside commands, code with an `AppHandle` reaches it as `app.state::<State>()`.

## Events: Rust speaks first

An **event** has a name and a JSON payload. Rust sends it with `emit`; pages listen with `listen`.

The Rust side, the file watcher in `src-tauri/src/fanwit/fs.rs`, shortened:

```rust
let handle = app.clone();
let mut debouncer = new_debouncer(Duration::from_millis(50), None, move |result: DebounceEventResult| {
    let events = /* turn the changes into FsEvent values */;
    if !events.is_empty() {
        let _ = handle.emit("fw://fs", FsPayload { id, events });
    }
})?;
debouncer.watch(&path, RecursiveMode::Recursive)?;
state.fs.watchers.lock().unwrap().insert(id, debouncer);    // kept alive in State
```

The page side, in `src/fanwit/host/tauri.ts`, listens once and hands each change to whoever asked to watch:

```ts
import { listen } from "@tauri-apps/api/event";
listen<FsPayload>("fw://fs", (e) => deliver(e.payload));
```

Every piece is familiar: a `move` closure that the watcher calls on its own thread, `emit` with a serde-serialisable payload, the watcher stored in a `Mutex<HashMap>` so `fw_fs_unwatch` can drop it later, and dropping it stops the watching.

```tikz caption="A change on disk reaches every window through an event" alt="The disk changes; the Rust watcher debounces and emits fw://fs; three windows listening update"
\begin{tikzpicture}[x=1mm,y=1mm,
  b/.style={fwnode,text width=30mm,minimum height=11mm,font=\scriptsize}]
\node[b,fill=fwPaper,draw=fwSlate] (disk) at (0,8) {\faIcon{save}\ \texttt{settings.toml}\\changed by another editor};
\node[b,fwcore] (watch) at (45,8) {watcher thread\\waits 50 ms, then \texttt{emit}};
\node[b,fwuser] (w1) at (95,20) {main window};
\node[b,fwuser] (w2) at (95,8) {Settings window};
\node[b,fwuser] (w3) at (95,-4) {Manual window};
\draw[fwarrow] (disk) -- (watch);
\begin{scope}[flow]
\draw[fwarrow] (watch.east) -- (w1.west);
\draw[fwarrow] (watch.east) -- (w2.west);
\draw[fwarrow] (watch.east) -- (w3.west);
\end{scope}
\node[fwlabel,fill=white] at (70,14) {\texttt{"fw://fs"}};
\end{tikzpicture}
```

## Commands, events or channels?

| You need | Use |
|---|---|
| the page asks, Rust answers once | a command |
| Rust reports something to every page, whenever it happens | an event (`app.emit`) |
| Rust reports to one window | `app.emit_to(label, ...)` |
| one request, many answers (progress, output lines) | a `Channel` passed to a command |

<Lab id="tauri-3-lab" title="A heartbeat event">

On your own machine:

<Steps>

1. In `fanwit::app::setup` (`src-tauri/src/fanwit/app.rs`), start a thread that emits an event every second:
   `let h = app.handle().clone(); std::thread::spawn(move || { let mut n = 0u64; loop { std::thread::sleep(std::time::Duration::from_secs(1)); n += 1; let _ = h.emit("fw://tick", n); } });`
   (add `use tauri::Emitter;` at the top if the compiler asks for it).
2. Run `pnpm tauri dev`. In the developer tools: `window.__TAURI_INTERNALS__` has no listen helper, so in the app's code temporarily add, for example in `src/routes/+page.svelte`: `import { listen } from "@tauri-apps/api/event"; listen("fw://tick", (e) => console.log("tick", e.payload));`
3. Watch the console count. Then remove both changes: an endless thread is a good experiment and a bad feature.

</Steps>

</Lab>

<Check question="Why are the fields of FaNWiT's State wrapped in Mutex and RwLock?" options={["Tauri requires every field to be a lock", "Commands run on several threads at once and only get a shared &State; changing shared data needs a lock", "For speed"]} answer={1}>

A shared reference only allows reading, and several commands may hold one at the same time. Locks (or atomics) are the safe way to change something through it.

</Check>

<Callout kind="learn-more">

Tauri's guides to [state management](https://v2.tauri.app/develop/state-management/) and [calling the frontend from Rust](https://v2.tauri.app/develop/calling-frontend/) (events and channels).

</Callout>
