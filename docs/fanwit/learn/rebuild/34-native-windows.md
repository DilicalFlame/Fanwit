---
title: Native windows and the tray
section: "Rebuild: the Rust core"
order: 4
summary: The desktop side of chapter 21. Windows built from kind options, size and position remembered per identity and kept on a real screen, a child that locks its parent and answers clicks on it with a bell and a shake, drag targets across windows, the Windows system menu, and the tray.
---
# Native windows and the tray

Chapter 21's window service turns a kind (`child`, `panel`, `aux`) into options, and on the desktop hands them to `host.windows.open`, which calls `fw_win_open`. This chapter builds that command and everything around it in `windows.rs`, plus the tray icon in `tray.rs`.

<Callout kind="why">

Tauri can create windows, but an app needs more from them. They should reopen where you left them, but never off screen after you unplug a monitor. A dialog should lock its parent the way native dialogs do, with the feedback people expect when they click the wrong window. Tabs should be draggable between windows. Each of these is a few dozen lines of platform aware Rust, written once here so no module ever has to.

</Callout>

## Opening a window

<Source path="src-tauri/src/fanwit/windows.rs" from="pub struct OpenOpts" to="}" />

<Source path="src-tauri/src/fanwit/windows.rs" from="pub async fn fw_win_open" to="}" />

`OpenOpts` mirrors chapter 21's `NativeWindowOptions` field by field (with `rename_all = "camelCase"`). The command:

- **Reuses** a window that already has the label: it is shown and focused instead.
- **Builds** with the kind's options. Every window is created **hidden** (`visible(false)`) and shows itself after its first paint (chapter 30), so no window ever flashes empty. Frameless by default (`decorations(false)`), since FaNWiT draws its own title bar (chapter 28). macOS keeps its traffic lights with an overlay title bar instead.
- **Panels** (`focus = "none"`) appear without taking focus from the window you were typing in.
- **Places** the window: at given coordinates, centred over its parent (a third of the way down, where dialogs look right), at the pointer for palettes, beside the tray icon for tray popups, or restored from saved state.
- **Locks** the parent for `focus = "lock"` (below).

<Callout kind="new" title="New here: binding with @ in a pattern, as_deref, and builders">

`if let Some(pos @ ("cursor" | "tray")) = opts.position.as_deref()` matches when the position is either string, and binds the matched value to `pos`. The `@` binds a name to whatever matched the pattern to its right.

`opts.position.as_deref()` turns an `Option<String>` into an `Option<&str>` without moving the string out, so it can be compared with string literals.

`WebviewWindowBuilder::new(...).title(...).inner_size(...)` is the **builder pattern**: each method takes the builder and returns it changed, and `build()` makes the window at the end. `b = b.parent(p)?` reassigns because each step consumes the old builder.

</Callout>

## Remembering where windows were

<Source path="src-tauri/src/fanwit/windows.rs" from="fn capture<R: Runtime>" to="}" />

<Source path="src-tauri/src/fanwit/windows.rs" from="fn restore<R: Runtime>" to="}" />

Every move and resize **captures** the window's geometry under its **state key**: the kind plus its identity, so the settings window and each document window remember their own place. Positions are stored in **logical** pixels (physical divided by the scale factor), so a window saved on a 4K laptop screen opens at the same visual size on a 1080p monitor. A minimised window is never captured, since restoring it minimised would look like the app failed to open.

**Restoring** sets the size, then the position, but only if at least 120 by 40 pixels of its title bar would be on some monitor's work area. Otherwise the window is centred. Without this check, a window last used on a monitor that has since been unplugged opens off screen, where nobody can reach it.

Writes are **debounced**. `persist` bumps a generation counter and starts a 500 ms timer, and only the timer whose generation is still current writes. Dragging a window fires hundreds of move events, and only the last one is written, merged into `windows.toml` with chapter 4's TOML merge.

<Callout kind="new" title="New here: debouncing with a generation counter">

`let gen = generation.fetch_add(1, SeqCst) + 1;` then, 500 ms later on another thread, `if generation.load(SeqCst) != gen { return; }`. Each event takes a new number, and only the thread whose number is still the latest does the work. No timers to cancel, no channel. `SeqCst` (sequentially consistent) is the strictest memory ordering, which keeps the reasoning simple at no noticeable cost here.

</Callout>

## A child that locks its parent

```tikz caption="focus = lock: the parent is disabled, and a click on it is answered by the child" alt="When a child opens with focus lock, Rust disables the parent and records the lock. A click on the disabled parent, or focusing it from the taskbar, calls blocked(), which focuses the child and plays its effects: a bell, a shake of the child window, or an attention request. When the child is destroyed, the parent is enabled again."
\begin{tikzpicture}[x=1mm,y=1mm,b/.style={fwnode,minimum height=10mm,font=\scriptsize,text width=26mm}]
\node[b,fwuser] (open) at (0,0) {child opens\\\texttt{focus = "lock"}};
\node[b,fwcore] (dis) at (36,0) {parent disabled\\lock recorded};
\node[b,fwgrey] (click) at (72,10) {click on parent};
\node[b,fwgrey] (task) at (72,-10) {parent focused\\(taskbar, Alt+Tab)};
\node[b,fwwarm] (blk) at (108,0) {\texttt{blocked()}\\focus child};
\node[b,fwwarm] (fx) at (144,0) {bell, shake,\\flash, attention};
\node[b,fwgrey] (done) at (36,-22) {child destroyed:\\parent enabled};
\draw[fwarrow] (open) -- (dis);
\draw[fwarrow] (dis) -- (click);
\draw[fwarrow] (dis) -- (task);
\draw[fwarrow] (click) -- (blk);
\draw[fwarrow] (task) -- (blk);
\draw[fwarrow] (blk) -- (fx);
\draw[fwdash] (dis) -- (done);
\end{tikzpicture}
```

A native modal dialog makes its parent unusable until it closes, and answers a click on the parent with a beep and a flash. `focus = "lock"` gives FaNWiT's child windows the same behaviour:

1. `fw_win_open` **disables** the parent (`set_enabled(false)`), records the lock with the kind's `onBlocked` effects, and tells the parent's page (`fw://lock`), which dims itself.
2. When the user **clicks the parent** or focuses it from the taskbar, `blocked` focuses the child and plays its effects, at most once per 400 ms, since one click can arrive both as a blocked click and as a focus change.
3. When the child is **destroyed**, `release_lock` enables the parent again, focuses it, and tells its page.

<Source path="src-tauri/src/fanwit/windows.rs" from="fn shake<R: Runtime>" to="}" />

The shake is a damped sine: 8 pixels at first, shrinking to nothing over 280 ms, so it says "no" rather than "error". On Linux under Wayland, apps may not move their own windows, so the page shakes its content instead (`fw://blocked`). The bell is the OS's own sound (`MessageBeep` on Windows). Where Rust has no portable beep, the page plays one through Web Audio (chapter 14).

### Windows needs a hook

On Windows, clicking a disabled owner window makes the **system** beep and flash the child, whatever the kind asked for. To replace that with the kind's own effects, FaNWiT **subclasses** the parent window: it inserts a function in front of the parent's window procedure. That function catches the message Windows sends for a click on a disabled window (`WM_SETCURSOR` with `HTERROR`), calls `blocked`, and swallows the message:

<Source path="src-tauri/src/fanwit/windows.rs" from="mod blocked_hook" />

<Callout kind="new" title="New here: unsafe, extern &quot;system&quot; and raw pointers">

Calling the Windows API means calling C functions, which Rust cannot check. That code goes in `unsafe` blocks, a promise from the programmer that the rules Rust normally enforces hold here.

`unsafe extern "system" fn proc(...)` defines a function with the calling convention Windows expects of a window procedure.

The callback (a boxed closure) must survive as long as the hook, so `Box::into_raw` turns it into a raw pointer, stored as a plain number, that Rust no longer frees automatically. `remove` turns it back with `Box::from_raw` and drops it. Every `into_raw` needs exactly one matching `from_raw`, or the memory leaks or is freed twice. That pairing is the "proof" the `unsafe` block promises.

`run_on_main_thread` matters too: Windows only lets a window's own thread install or remove its subclasses, and Tauri's main thread owns every window.

</Callout>

## Between windows

- **`fw_win_at`** answers "which other layout window is under the cursor?" for chapter 27's dock drag. It returns the cursor position inside that window, in CSS pixels, and the dragging window then sends `fw:dock-drop` to it.
- **`fw_win_system_menu`** shows the Windows system menu (Restore, Move, Size, Minimise, Maximise, Close) at the cursor when the custom title bar is right clicked (chapter 28), then runs whatever was chosen.
- **`on_window_event`** connects it all: moves and resizes are captured, focus on a locked parent is blocked, and a destroyed window releases its lock, saves state and tells every window (`fw://window-destroyed`), which settles any `result` promise still waiting for it (chapter 21).

<Source path="src-tauri/src/fanwit/windows.rs" from="pub fn on_window_event" to="}" />

The main window is created by `create_main` at setup, not by `fw_win_open`, since there is no web side to ask yet. It restores its saved place, starts hidden, and has a safety net: if the kernel has not reported ready after 5 seconds (30 in development, while Vite warms up), Rust shows the window anyway, so a boot failure shows its error page instead of an invisible app.

<Source path="src-tauri/src/fanwit/windows.rs" />

## The tray

<Source path="src-tauri/src/fanwit/tray.rs" />

The tray menu's item ids are **command ids**. Choosing one emits `fw://tray` to the main window, whose core handlers run that command (chapter 25). The tray thus goes through the same pipeline as everything else. **Quit** asks about unsaved work, and **Quick capture** opens its palette window without bringing the main window forward. A left click on the icon shows the main window, which is how the app comes back when it was started headless at login.

## Checkpoint

<Source path="src-tauri/src/fanwit/windows.rs" from="#[cfg(test)]" />

```sh
cargo test --manifest-path src-tauri/Cargo.toml --lib
pnpm tauri dev
```

In the desktop app, open **About** (a child window that takes focus) and **Settings** (an auxiliary window). Move and resize Settings, close it and reopen it: it comes back in the same place. Open the **Window Lab**, open a child with `focus = lock`, and click its parent.

<Check question="A window was last closed on a second monitor, which is now unplugged. What happens when it opens?" options={["It opens at its saved position, off screen", "restore finds that its title bar would not be on any monitor's work area, keeps the saved size and centres it", "Its saved state is deleted"]} answer={1}>

`restore` checks the saved rectangle against every monitor's work area before moving the window. If no monitor would show at least 120 by 40 pixels of its title bar, it keeps the size but centres the window. The saved position stays in `windows.toml`, so it is used again once the monitor is back.

</Check>
