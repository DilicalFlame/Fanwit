# What Tauri is

You now know both halves of FaNWiT: a web interface in Svelte, and a core in Rust. **Tauri** is what joins them into a desktop app. It is a Rust library: your Rust program uses it to open native windows, and in each window it shows a web page, rendered by the browser engine the operating system already has.

<Callout kind="why">

Shipping a whole browser with every app (what Electron does) makes even a small app a few hundred megabytes and keeps a copy of Chromium in memory per app. Tauri uses the system's own web view (WebView2 on Windows, WebKit on macOS and Linux), so a FaNWiT app is a few megabytes, and the code that touches the computer is Rust, with nothing reachable from the page that you did not choose to expose.

</Callout>

## Two processes, one app

```tikz caption="A Tauri app: one Rust process, and a web view per window that can only reach it through IPC" alt="A Rust core process on the left with the file system, SQLite and OS windows; three web view windows on the right; arrows labelled invoke go from the windows to the core and events come back"
\begin{tikzpicture}[x=1mm,y=1mm,
  win/.style={fwnode,fwuser,text width=34mm,minimum height=12mm},
  os/.style={fwnode,fill=fwPaper,draw=fwSlate,font=\scriptsize,text width=17mm}]
% the Rust process
\fill[fwInk!10,rounded corners=3pt] (0.8,-2.8) rectangle (50.8,41.2);
\filldraw[fill=fwBrandSoft!70,draw=fwBrand,rounded corners=3pt] (0,-2) rectangle (50,42);
\node[font=\small\bfseries,text=fwInk] at (25,37.5) {\faIcon{cog}\ Rust core};
\node[font=\scriptsize,text=fwSlate] at (25,33) {src-tauri: one process};
\node[os] at (12.5,24) {sandboxed files};
\node[os] at (37.5,24) {SQLite};
\node[os] at (12.5,13) {OS windows};
\node[os] at (37.5,13) {tray, menus};
\node[os] at (25,3) {file watchers, sidecars};
% the windows
\node[win] (w1) at (100,34) {\faIcon[regular]{window-maximize}\ main window\\[1pt]{\scriptsize Svelte page}};
\node[win] (w2) at (100,18) {\faIcon[regular]{window-maximize}\ Settings\\[1pt]{\scriptsize Svelte page}};
\node[win] (w3) at (100,2) {\faIcon[regular]{window-maximize}\ Manual\\[1pt]{\scriptsize Svelte page}};
\foreach \w in {w1,w2,w3} {
  \begin{scope}[packet]\draw[fwarrow] (\w.west) -- ++(-29,0);\end{scope}
}
\node[fwlabel,fill=white] at (66,26) {invoke("fw\_fs\_read\_text")};
\node[fwlabel,fill=white] at (66,10) {events: "fw://fs"};
\end{tikzpicture}
```

- The **core** is one Rust program (`src-tauri/`). It owns everything that touches the computer.
- Each **window** is a native window with a web view inside, showing the same Svelte app at a different URL (the *SvelteKit basics* routes).
- They talk through **IPC** (inter-process communication): the page calls Rust **commands** and gets their results as promises; Rust sends **events** to pages. The page cannot do anything else: it has no file system, no shell, no way around the commands it is given.

## The project

<FileTree>

- src-tauri/
  - Cargo.toml (the Rust crate and its dependencies)
  - tauri.conf.json (app name, windows, security, bundling)
  - capabilities/ (which windows may call which commands)
  - build.rs (generates code at build time)
  - icons/
  - src/
    - main.rs (calls run())
    - lib.rs (builds the app: plugins, state, commands)
    - fanwit/ (FaNWiT's core: one file per area)

</FileTree>

`tauri.conf.json` says how to find the web side: while developing, load `http://localhost:3000` (and start it with `pnpm dev` first); when building, take the files in `../build` (made by `pnpm build`). `pnpm tauri dev` does both and opens the app.

## lib.rs, line by line

Here is FaNWiT's `run()`, shortened. Every construct is from Rust basics.

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let argv: Vec<String> = std::env::args().collect();
    let launch = fanwit::cli::LaunchArgs::parse(&argv);      // --profile, --safe-mode, paths

    let mut builder = tauri::Builder::default();
    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_single_instance::init(fanwit::cli::on_second_instance))
            .plugin(tauri_plugin_global_shortcut::Builder::new().build());
    }
    builder
        .plugin(tauri_plugin_dialog::init())                  // open and save dialogs
        .plugin(tauri_plugin_notification::init())            // OS notifications
        .manage(fanwit::State::new(launch))                   // the shared state, for every command
        .register_uri_scheme_protocol(fanwit::plugin_scheme::SCHEME, fanwit::plugin_scheme::handle)
        .invoke_handler(tauri::generate_handler![
            fanwit::fs::fw_fs_read_text,                      // the commands the page may call
            fanwit::fs::fw_fs_write_text,
            fanwit::db::fw_db_query,
            // ... about 40 more
        ])
        .setup(|app| fanwit::app::setup(app).map_err(|e| e.into()))   // once, before windows open
        .on_window_event(fanwit::windows::on_window_event)    // moved, resized, focused, closed
        .build(tauri::generate_context!())                    // reads tauri.conf.json at compile time
        .expect("error while building tauri application")
        .run(|app, event| { /* app events: exit, macOS dock click */ });
}
```

It is one long chain of **builder** calls: each method adds something and returns the builder, and `build` turns it into an app. The next chapters take the pieces in turn: commands, state and events, windows, and security.

<Lab id="tauri-1-lab" title="Run FaNWiT as a desktop app">

Do this on your own computer. It installs everything the rest of this part needs.

<Steps>

1. Install the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your system: Rust (through `rustup`), and on Windows the C++ build tools and WebView2, on macOS Xcode's command line tools, on Linux the listed packages.
2. In your clone of FaNWiT, run `pnpm install`, then `pnpm tauri dev`. The first build compiles every crate and takes a few minutes; later ones take seconds.
3. When the window opens, open its developer tools (right click, **Inspect**, or Ctrl+Shift+I) and type `await window.__TAURI_INTERNALS__.invoke("fw_app_info")` in the console. That is the page calling a Rust command by hand.
4. Change the window title in `src-tauri/src/fanwit/windows.rs` (look for `.title(&title)` on the main window builder), save, and watch Tauri rebuild and restart the app.

</Steps>

Mark it done when the app runs and you have seen the command answer.

</Lab>

<Check question="The page in a FaNWiT window wants to read a file. How does it do it?" options={["With the browser's own file APIs", "It calls a Rust command (invoke), which checks the path and reads the file", "Tauri gives every page full disk access"]} answer={1}>

The page has no file access of its own. It invokes `fw_fs_read_text`, and the Rust side checks the path against the sandbox before reading.

</Check>

<Callout kind="learn-more">

Tauri's [what is Tauri](https://v2.tauri.app/start/), [process model](https://v2.tauri.app/concept/process-model/) and [architecture](https://v2.tauri.app/concept/architecture/) pages.

</Callout>
