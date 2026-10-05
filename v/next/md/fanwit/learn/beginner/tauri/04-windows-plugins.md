# Windows and plugins

A desktop app is more than one window: Settings opens beside the main window, a child dialog locks its parent, a tray icon stays when every window is closed. This chapter shows how Tauri opens and tracks windows, and which plugins add the rest.

<Callout kind="why">

FaNWiT lets the interface *ask* for a window by kind ("a Settings window", "a child of main that locks it") and lets the Rust side decide the details: where it opens, whether one already exists, how big it was last time. Keeping that in one Rust file (`src-tauri/src/fanwit/windows.rs`) means every window behaves the same, and window state survives restarts.

</Callout>

## Opening a window

A window is built with `WebviewWindowBuilder`: a **label** (its unique name), the URL to show, and options.

```rust
// from fw_win_open, shortened
if let Some(existing) = app.get_webview_window(&opts.label) {
    existing.show().map_err(err)?;        // already open: bring it forward
    existing.set_focus().map_err(err)?;
    return Ok(());
}
let mut b = WebviewWindowBuilder::new(&app, &opts.label, WebviewUrl::App(opts.url.clone().into()))
    .title(&opts.title)
    .inner_size(opts.width.unwrap_or(800.0), opts.height.unwrap_or(600.0))
    .visible(false);                      // shown once its page has painted: no white flash
// ... position, parent, decorations from the window kind ...
b.build().map_err(err)?;
```

The URL is one of the SvelteKit routes: `/w/settings` for Settings, so `src/routes/w/[kind]/+page.svelte` shows it. Labels follow a pattern (`main`, `aux-*`, `child-*`, `panel-*`), which matters for security in the next chapter.

## Window events

`.on_window_event(fanwit::windows::on_window_event)` in the builder receives every window's events, and FaNWiT matches on them:

```rust
pub fn on_window_event<R: Runtime>(w: &Window<R>, e: &WindowEvent) {
    match e {
        WindowEvent::Moved(_) | WindowEvent::Resized(_) => capture(w),   // remember its rect
        WindowEvent::Focused(true) => blocked(w.app_handle(), w.label()), // a locked parent: refocus the child
        WindowEvent::Destroyed => { /* release its vault lock, forget it, tell the pages */ }
        _ => {}
    }
}
```

An enum, a `match` with `|` for "either", and `_ => {}` for the rest: by now this reads like prose.

## Plugins

Tauri keeps its core small; everything else is a **plugin**, a crate with a Rust side and (often) a JavaScript package. You add the crate, register it in the builder, and allow its permissions (next chapter).

| Plugin | What FaNWiT uses it for |
|---|---|
| `tauri-plugin-dialog` | open and save dialogs, message boxes |
| `tauri-plugin-notification` | OS notifications |
| `tauri-plugin-opener` | open links in the browser, reveal files |
| `tauri-plugin-single-instance` | a second launch forwards its arguments to the running app and quits |
| `tauri-plugin-deep-link` | `fanwit://` links that run commands |
| `tauri-plugin-global-shortcut` | shortcuts that work when the app is in the background |
| `tauri-plugin-autostart` | start with the computer, hidden in the tray |
| `tauri-plugin-log` | logs from Rust and the page in one file |
| `tauri-plugin-process` | relaunch and exit |

Single instance is registered first on purpose: if the app is already running, the new launch must hand over and exit before anything else starts.

The **tray** icon is core Tauri (the `tray-icon` feature in `Cargo.toml`), built in `src-tauri/src/fanwit/tray.rs` with a menu whose items run FaNWiT commands.

<Lab id="tauri-4-lab" title="Watch window events">

On your own machine:

<Steps>

1. In `on_window_event` (`src-tauri/src/fanwit/windows.rs`), add a first line: `log::info!("{} {:?}", w.label(), e);`
2. Run `pnpm tauri dev` and open Settings (Ctrl+,). Move it, resize it, focus the main window, close Settings.
3. Read the events in the terminal (or the app's log viewer): `Moved`, `Resized`, `Focused(true)`, `CloseRequested`, `Destroyed`, each with the window's label.
4. Remove the line again.

</Steps>

</Lab>

<Check question="fw_win_open is asked for a window whose label already exists. What does it do?" options={["Opens a second copy", "Shows and focuses the existing one and returns", "Fails with an error"]} answer={1}>

Labels are unique, so FaNWiT treats "open settings" as "show me Settings": it finds the existing window with `get_webview_window` and brings it forward.

</Check>

<Callout kind="learn-more">

Tauri's [window customisation](https://v2.tauri.app/learn/window-customization/), [system tray](https://v2.tauri.app/learn/system-tray/) and the [plugin list](https://v2.tauri.app/plugin/).

</Callout>
