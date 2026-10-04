//! Window manager (Chapter 9): windows from kind specs, parent ownership, focus lock with
//! blocked-focus feedback, and window state keyed by identity (Section 9.6).

use super::{err, Result, State};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, PhysicalPosition, Runtime, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, Window, WindowEvent,
};

#[derive(Serialize, Deserialize, Clone, Copy, Default, Debug)]
pub struct Rect {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
pub struct MonitorInfo {
    name: String,
    scale: f64,
    work: [i32; 4],
}

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
pub struct Saved {
    normal: Option<Rect>,
    #[serde(default)]
    maximized: bool,
    #[serde(default)]
    fullscreen: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    monitor: Option<MonitorInfo>,
}

struct Lock {
    child: String,
    effects: Vec<String>,
    /// Windows: the hook on the parent that replaces the system beep (see `blocked_hook`).
    #[cfg(windows)]
    hook: Option<blocked_hook::Hook>,
}

#[derive(Default)]
pub struct WindowsState {
    /// parent label -> lock held by a child
    locks: Mutex<HashMap<String, Lock>>,
    /// label -> state key (identity)
    keys: Mutex<HashMap<String, String>>,
    saved: Mutex<HashMap<String, Saved>>,
    file: Mutex<Option<PathBuf>>,
    generation: AtomicU64,
    last_blocked: Mutex<HashMap<String, Instant>>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct OpenOpts {
    label: String,
    url: String,
    title: String,
    width: Option<f64>,
    height: Option<f64>,
    min_width: Option<f64>,
    min_height: Option<f64>,
    x: Option<f64>,
    y: Option<f64>,
    center: Option<bool>,
    parent: Option<String>,
    focus: Option<String>,
    always_on_top: Option<bool>,
    skip_taskbar: Option<bool>,
    decorations: Option<bool>,
    transparent: Option<bool>,
    shadow: Option<bool>,
    resizable: Option<bool>,
    maximizable: Option<bool>,
    minimizable: Option<bool>,
    closable: Option<bool>,
    visible: Option<bool>,
    state_key: Option<String>,
    #[allow(dead_code)]
    background_color: Option<String>,
    on_blocked: Option<Vec<String>>,
    /// "cursor" (palette) or "tray": placed at the pointer instead of centred.
    position: Option<String>,
}

pub fn init<R: Runtime>(app: &AppHandle<R>) -> Result<()> {
    let state = app.state::<State>();
    let file = super::app_dir(app, super::Dir::Config)?.join("windows.toml");
    if let Ok(text) = std::fs::read_to_string(&file) {
        if let Ok(map) = saved_file::parse(&text) {
            *state.windows.saved.lock().unwrap() = map;
        }
    }
    *state.windows.file.lock().unwrap() = Some(file);
    Ok(())
}


/// windows.toml reader through toml_edit (avoids another dependency).
mod saved_file {
    pub fn parse(text: &str) -> Result<std::collections::HashMap<String, super::Saved>, ()> {
        let doc: toml_edit::DocumentMut = text.parse().map_err(|_| ())?;
        let mut out = std::collections::HashMap::new();
        for (k, item) in doc.iter() {
            let Some(t) = item.as_table_like() else { continue };
            let num = |t: &dyn toml_edit::TableLike, key: &str| {
                t.get(key).and_then(|v| v.as_float().or_else(|| v.as_integer().map(|i| i as f64)))
            };
            let normal = t.get("normal").and_then(|n| n.as_table_like()).and_then(|n| {
                Some(super::Rect { x: num(n, "x")?, y: num(n, "y")?, w: num(n, "w")?, h: num(n, "h")? })
            });
            out.insert(
                k.to_string(),
                super::Saved {
                    normal,
                    maximized: t.get("maximized").and_then(|v| v.as_bool()).unwrap_or(false),
                    fullscreen: t.get("fullscreen").and_then(|v| v.as_bool()).unwrap_or(false),
                    monitor: None,
                },
            );
        }
        Ok(out)
    }
}

fn persist<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<State>();
    let gen = state.windows.generation.fetch_add(1, Ordering::SeqCst) + 1;
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(500));
        let state = handle.state::<State>();
        if state.windows.generation.load(Ordering::SeqCst) != gen {
            return;
        }
        write_now(&state);
    });
}

fn write_now(state: &State) {
    let Some(file) = state.windows.file.lock().unwrap().clone() else { return };
    let saved = state.windows.saved.lock().unwrap().clone();
    let value = serde_json::to_value(&saved).unwrap_or_default();
    let existing = std::fs::read_to_string(&file).unwrap_or_else(|_| "# Window state, written by the app (logical pixels).\n".into());
    if let Ok(text) = super::toml::merge_text(&existing, &value) {
        let _ = super::fs::atomic_write(&file, text.as_bytes());
    }
}

/// Capture the current geometry of a window into its saved state.
fn capture<R: Runtime>(w: &Window<R>) {
    let app = w.app_handle();
    let state = app.state::<State>();
    let Some(key) = state.windows.keys.lock().unwrap().get(w.label()).cloned() else { return };
    let maximized = w.is_maximized().unwrap_or(false);
    let minimized = w.is_minimized().unwrap_or(false);
    let fullscreen = w.is_fullscreen().unwrap_or(false);
    if minimized {
        return; // never restore minimised: keep the last normal state
    }
    let scale = w.scale_factor().unwrap_or(1.0);
    let mut saved = state.windows.saved.lock().unwrap();
    let entry = saved.entry(key).or_default();
    entry.maximized = maximized;
    entry.fullscreen = fullscreen;
    if !maximized && !fullscreen {
        if let (Ok(pos), Ok(size)) = (w.outer_position(), w.inner_size()) {
            entry.normal = Some(Rect {
                x: (pos.x as f64 / scale).round(),
                y: (pos.y as f64 / scale).round(),
                w: (size.width as f64 / scale).round(),
                h: (size.height as f64 / scale).round(),
            });
        }
    }
    if let Ok(Some(m)) = w.current_monitor() {
        let wa = m.work_area();
        entry.monitor = Some(MonitorInfo {
            name: m.name().cloned().unwrap_or_default(),
            scale: m.scale_factor(),
            work: [wa.position.x, wa.position.y, wa.size.width as i32, wa.size.height as i32],
        });
    }
    drop(saved);
    persist(app);
}

/// Apply saved state: normal rect first (clamped to a monitor), then maximise.
fn restore<R: Runtime>(w: &WebviewWindow<R>, key: &str) -> bool {
    let state = w.app_handle().state::<State>();
    let Some(saved) = state.windows.saved.lock().unwrap().get(key).cloned() else { return false };
    if let Some(r) = saved.normal {
        let monitors = w.available_monitors().unwrap_or_default();
        // at least 120 x 40 logical px of the title bar must be on some monitor's work area
        let visible = monitors.iter().any(|m| {
            let s = m.scale_factor();
            let wa = m.work_area();
            let (mx, my) = (wa.position.x as f64 / s, wa.position.y as f64 / s);
            let (mw, mh) = (wa.size.width as f64 / s, wa.size.height as f64 / s);
            r.x + 120.0 > mx && r.x < mx + mw - 120.0 && r.y >= my - 10.0 && r.y + 40.0 < my + mh
        });
        let _ = w.set_size(LogicalSize::new(r.w.max(200.0), r.h.max(120.0)));
        if visible {
            let _ = w.set_position(LogicalPosition::new(r.x, r.y));
        } else {
            let _ = w.center();
        }
    }
    if saved.maximized {
        let _ = w.maximize();
    }
    if saved.fullscreen {
        let handle = w.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(300));
            let _ = handle.set_fullscreen(true);
        });
    }
    true
}

pub fn create_main<R: Runtime>(app: &AppHandle<R>) -> Result<WebviewWindow<R>> {
    let title = app.package_info().name.clone();
    let mut b = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("/".into()))
        .title(&title)
        .inner_size(1280.0, 800.0)
        .min_inner_size(560.0, 360.0)
        .visible(false);
    #[cfg(target_os = "macos")]
    {
        b = b.title_bar_style(tauri::TitleBarStyle::Overlay).hidden_title(true);
    }
    #[cfg(not(target_os = "macos"))]
    {
        b = b.decorations(false);
    }
    let w = b.build().map_err(err)?;
    let state = app.state::<State>();
    state.windows.keys.lock().unwrap().insert("main".into(), "main".into());
    if !restore(&w, "main") {
        let _ = w.center();
    }
    // safety net: show the window if its kernel never boots. A booted page decides itself
    // (it stays hidden on purpose while first run onboarding is open).
    if !state.launch.headless {
        let handle = w.clone();
        let app = app.clone();
        std::thread::spawn(move || {
            // dev builds wait on a cold Vite server (dependency optimisation) on first load
            std::thread::sleep(Duration::from_secs(if cfg!(debug_assertions) { 30 } else { 5 }));
            let booted = app.state::<State>().cli.ready.load(std::sync::atomic::Ordering::SeqCst);
            if !booted && !handle.is_visible().unwrap_or(true) {
                log::warn!("main window did not report ready in time; showing it");
                let _ = handle.show();
            }
        });
    }
    Ok(w)
}

#[tauri::command]
pub async fn fw_win_open<R: Runtime>(app: AppHandle<R>, opts: OpenOpts) -> Result<()> {
    let state = app.state::<State>();
    if let Some(existing) = app.get_webview_window(&opts.label) {
        existing.show().map_err(err)?;
        existing.set_focus().map_err(err)?;
        return Ok(());
    }
    let mut b = WebviewWindowBuilder::new(&app, &opts.label, WebviewUrl::App(opts.url.clone().into()))
        .title(&opts.title)
        .inner_size(opts.width.unwrap_or(800.0), opts.height.unwrap_or(600.0))
        .visible(opts.visible.unwrap_or(false))
        .resizable(opts.resizable.unwrap_or(true))
        .maximizable(opts.maximizable.unwrap_or(true))
        .minimizable(opts.minimizable.unwrap_or(true))
        .closable(opts.closable.unwrap_or(true))
        .always_on_top(opts.always_on_top.unwrap_or(false))
        .skip_taskbar(opts.skip_taskbar.unwrap_or(false))
        .decorations(opts.decorations.unwrap_or(false))
        .shadow(opts.shadow.unwrap_or(true))
        // focus = "none" (panels): appear without taking focus from the opener
        .focused(opts.focus.as_deref() != Some("none"));
    #[cfg(not(target_os = "macos"))]
    {
        b = b.transparent(opts.transparent.unwrap_or(false));
    }
    if let (Some(w), Some(h)) = (opts.min_width, opts.min_height) {
        b = b.min_inner_size(w, h);
    }
    let parent = opts.parent.as_ref().and_then(|p| app.get_webview_window(p));
    if let Some(p) = &parent {
        b = b.parent(p).map_err(err)?;
    }
    match (opts.x, opts.y) {
        (Some(x), Some(y)) => b = b.position(x, y),
        _ => {
            if opts.center.unwrap_or(true) && parent.is_none() {
                b = b.center();
            }
        }
    }
    let w = b.build().map_err(err)?;
    // centre over the parent's visible rectangle, not the screen
    if let (Some(p), None) = (&parent, opts.x) {
        if let (Ok(pp), Ok(ps), Ok(cs)) = (p.outer_position(), p.outer_size(), w.outer_size()) {
            let x = pp.x + (ps.width as i32 - cs.width as i32) / 2;
            let y = pp.y + (ps.height as i32 - cs.height as i32) / 3;
            let _ = w.set_position(PhysicalPosition::new(x, y.max(pp.y)));
        }
    }
    if let Some(key) = &opts.state_key {
        state.windows.keys.lock().unwrap().insert(opts.label.clone(), key.clone());
        restore(&w, key);
    }
    if let Some(pos @ ("cursor" | "tray")) = opts.position.as_deref() {
        place_at_cursor(&app, &w, pos == "tray");
    }
    if opts.focus.as_deref() == Some("lock") {
        if let Some(p) = &parent {
            #[cfg(windows)]
            let hook = blocked_hook::install(&app, p);
            state.windows.locks.lock().unwrap().insert(
                p.label().to_string(),
                Lock {
                    child: opts.label.clone(),
                    effects: opts.on_blocked.clone().unwrap_or_else(|| vec!["bell".into(), "shake".into()]),
                    #[cfg(windows)]
                    hook,
                },
            );
            let _ = p.set_enabled(false);
            let _ = app.emit_to(p.label(), "fw://lock", serde_json::json!({ "locked": true, "child": opts.label }));
        }
    }
    Ok(())
}

/// Palette: centred under the pointer. Tray: beside the pointer, towards the middle of the screen
/// (the tray icon sits in a corner: bottom right on Windows, top right on macOS). Kept on screen.
fn place_at_cursor<R: Runtime>(app: &AppHandle<R>, w: &WebviewWindow<R>, tray: bool) {
    let (Ok(c), Ok(size)) = (app.cursor_position(), w.outer_size()) else { return };
    let (cw, ch) = (size.width as f64, size.height as f64);
    let Ok(Some(m)) = app.monitor_from_point(c.x, c.y) else { return };
    let wa = m.work_area();
    let (ax, ay, aw, ah) = (wa.position.x as f64, wa.position.y as f64, wa.size.width as f64, wa.size.height as f64);
    let (x, y) = if tray {
        (if c.x > ax + aw / 2.0 { c.x - cw } else { c.x }, if c.y > ay + ah / 2.0 { c.y - ch } else { c.y })
    } else {
        (c.x - cw / 2.0, c.y - 16.0)
    };
    let x = x.clamp(ax, (ax + aw - cw).max(ax));
    let y = y.clamp(ay, (ay + ah - ch).max(ay));
    let _ = w.set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32));
}

fn release_lock<R: Runtime>(app: &AppHandle<R>, child: &str) {
    let state = app.state::<State>();
    let parent = {
        let mut locks = state.windows.locks.lock().unwrap();
        let p = locks.iter().find(|(_, l)| l.child == child).map(|(p, _)| p.clone());
        #[allow(unused_variables)]
        if let Some(lock) = p.as_ref().and_then(|p| locks.remove(p)) {
            #[cfg(windows)]
            if let Some(h) = lock.hook {
                blocked_hook::remove(app, h);
            }
        }
        p
    };
    if let Some(p) = parent.and_then(|p| app.get_webview_window(&p)) {
        let _ = p.set_enabled(true);
        let _ = p.set_focus();
        let _ = app.emit_to(p.label(), "fw://lock", serde_json::json!({ "locked": false, "child": child }));
    }
}

pub fn bell() {
    #[cfg(windows)]
    unsafe {
        windows_sys::Win32::System::Diagnostics::Debug::MessageBeep(windows_sys::Win32::UI::WindowsAndMessaging::MB_OK);
    }
    // ponytail: macOS NSBeep and gdk beep need native bindings; the child page plays a Web Audio tick there
}

fn shake<R: Runtime>(w: WebviewWindow<R>) {
    std::thread::spawn(move || {
        let Ok(origin) = w.outer_position() else { return };
        let scale = w.scale_factor().unwrap_or(1.0);
        let frames = 20u32;
        for i in 0..=frames {
            let t = i as f64 / frames as f64;
            // damped sine: amplitude 8 px, 6 half cycles, 280 ms
            let dx = (8.0 * scale) * (1.0 - t) * (t * 3.0 * std::f64::consts::TAU).sin();
            let _ = w.set_position(PhysicalPosition::new(origin.x + dx.round() as i32, origin.y));
            std::thread::sleep(Duration::from_millis(14));
        }
        let _ = w.set_position(origin);
    });
}

fn run_feedback<R: Runtime>(app: &AppHandle<R>, label: &str, effects: &[String]) {
    let Some(w) = app.get_webview_window(label) else { return };
    for e in effects {
        match e.as_str() {
            "bell" => bell(),
            "shake" => {
                // Wayland clients cannot move their windows: the page shakes its content instead
                if cfg!(target_os = "linux") {
                    let _ = app.emit_to(label, "fw://blocked", serde_json::json!({ "effects": ["shake"] }));
                } else {
                    shake(w.clone());
                }
            }
            "flash" => {
                let _ = app.emit_to(label, "fw://blocked", serde_json::json!({ "effects": ["flash"] }));
            }
            "attention" => {
                let _ = w.request_user_attention(Some(tauri::UserAttentionType::Informational));
            }
            _ => {}
        }
    }
}

#[tauri::command]
pub fn fw_win_feedback<R: Runtime>(app: AppHandle<R>, label: String, effects: Vec<String>) -> Result<()> {
    run_feedback(&app, &label, &effects);
    Ok(())
}

#[tauri::command]
pub fn fw_win_list<R: Runtime>(app: AppHandle<R>) -> Vec<String> {
    app.webview_windows().keys().cloned().collect()
}

#[derive(Serialize)]
pub struct WindowHit {
    label: String,
    /// Cursor in the window's client area, CSS pixels.
    x: f64,
    y: f64,
}

/// The visible layout window (main or popped out) under the cursor, other than the caller:
/// where a tab dragged out of one window lands.
// ponytail: first match wins; overlapping windows ignore z-order (needs a per OS z-order query).
#[tauri::command]
pub fn fw_win_at<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>) -> Option<WindowHit> {
    let cursor = app.cursor_position().ok()?;
    app.webview_windows().into_iter().find_map(|(label, w)| {
        if label == window.label() || !(label.starts_with("main") || label.starts_with("aux-")) {
            return None;
        }
        if !w.is_visible().unwrap_or(false) || w.is_minimized().unwrap_or(true) {
            return None;
        }
        let pos = w.inner_position().ok()?;
        let size = w.inner_size().ok()?;
        let (x, y) = (cursor.x - pos.x as f64, cursor.y - pos.y as f64);
        if x < 0.0 || y < 0.0 || x >= size.width as f64 || y >= size.height as f64 {
            return None;
        }
        let scale = w.scale_factor().unwrap_or(1.0);
        Some(WindowHit { label, x: x / scale, y: y / scale })
    })
}

/// Right click on the custom title bar opens the native system menu (Windows).
#[tauri::command]
pub fn fw_win_system_menu<R: Runtime>(window: WebviewWindow<R>) -> Result<()> {
    #[cfg(windows)]
    unsafe {
        use windows_sys::Win32::Foundation::POINT;
        use windows_sys::Win32::UI::WindowsAndMessaging::{GetCursorPos, GetSystemMenu, PostMessageW, TrackPopupMenu, TPM_RETURNCMD, TPM_RIGHTBUTTON, WM_SYSCOMMAND};
        let hwnd = window.hwnd().map_err(err)?.0 as windows_sys::Win32::Foundation::HWND;
        let menu = GetSystemMenu(hwnd, 0);
        let mut pt = POINT { x: 0, y: 0 };
        GetCursorPos(&mut pt);
        let cmd = TrackPopupMenu(menu, TPM_RETURNCMD | TPM_RIGHTBUTTON, pt.x, pt.y, 0, hwnd, std::ptr::null());
        if cmd != 0 {
            PostMessageW(hwnd, WM_SYSCOMMAND, cmd as usize, 0);
        }
    }
    #[cfg(not(windows))]
    let _ = window;
    Ok(())
}

/// The user tried to use a parent locked by a child: focus the child and play the kind's effects
/// (once per 400 ms: one click can arrive both as a blocked click and as a focus change).
fn blocked<R: Runtime>(app: &AppHandle<R>, parent: &str) {
    let state = app.state::<State>();
    let Some((child, effects)) = state.windows.locks.lock().unwrap().get(parent).map(|l| (l.child.clone(), l.effects.clone())) else { return };
    let Some(c) = app.get_webview_window(&child) else { return };
    let _ = c.set_focus();
    let mut last = state.windows.last_blocked.lock().unwrap();
    let now = Instant::now();
    if last.get(&child).is_some_and(|t| now.duration_since(*t) < Duration::from_millis(400)) {
        return;
    }
    last.insert(child.clone(), now);
    drop(last);
    run_feedback(app, &child, &effects);
}

/// Windows: a click on a disabled owner window makes the system beep and flash the child,
/// whatever the kind asked for. A subclass on the parent swallows that click (WM_SETCURSOR with
/// HTERROR) and plays the kind's own effects instead; the parent stays truly disabled.
#[cfg(windows)]
mod blocked_hook {
    use tauri::{AppHandle, Runtime, WebviewWindow};
    use windows_sys::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
    use windows_sys::Win32::UI::Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass};
    use windows_sys::Win32::UI::WindowsAndMessaging::{HTERROR, WM_SETCURSOR};

    const ID: usize = 0x6677_6c6b;
    type Callback = Box<dyn Fn() + Send>;

    pub struct Hook {
        hwnd: isize,
        data: usize,
    }

    unsafe extern "system" fn proc(hwnd: HWND, msg: u32, wp: WPARAM, lp: LPARAM, _id: usize, data: usize) -> LRESULT {
        if msg == WM_SETCURSOR && (lp & 0xffff) as u16 as i16 as i32 == HTERROR {
            // high word: the mouse message that hit the disabled window (button downs only)
            if matches!(((lp >> 16) & 0xffff) as u32, 0x201 | 0x204 | 0x207 | 0xA1 | 0xA4 | 0xA7) {
                (*(data as *const Callback))();
            }
            return 1;
        }
        DefSubclassProc(hwnd, msg, wp, lp)
    }

    pub fn install<R: Runtime>(app: &AppHandle<R>, parent: &WebviewWindow<R>) -> Option<Hook> {
        let hwnd = parent.hwnd().ok()?.0 as isize;
        let (handle, label) = (app.clone(), parent.label().to_string());
        let cb: Callback = Box::new(move || {
            let (h, l) = (handle.clone(), label.clone());
            // leave the window procedure before focusing and moving windows
            let _ = handle.run_on_main_thread(move || super::blocked(&h, &l));
        });
        let data = Box::into_raw(Box::new(cb)) as usize;
        // subclasses are installed and removed on the window's own (main) thread
        let _ = app.run_on_main_thread(move || unsafe {
            SetWindowSubclass(hwnd as HWND, Some(proc), ID, data);
        });
        Some(Hook { hwnd, data })
    }

    pub fn remove<R: Runtime>(app: &AppHandle<R>, h: Hook) {
        let _ = app.run_on_main_thread(move || unsafe {
            // fails harmlessly when the parent is already gone
            RemoveWindowSubclass(h.hwnd as HWND, Some(proc), ID);
            drop(Box::from_raw(h.data as *mut Callback));
        });
    }
}

pub fn on_window_event<R: Runtime>(w: &Window<R>, e: &WindowEvent) {
    let app = w.app_handle();
    match e {
        WindowEvent::Moved(_) | WindowEvent::Resized(_) => capture(w),
        // a locked parent got focus (task bar, Alt+Tab): back to the child, with feedback
        WindowEvent::Focused(true) => blocked(app, w.label()),
        WindowEvent::CloseRequested { .. } => capture(w),
        WindowEvent::Destroyed => {
            let label = w.label().to_string();
            release_lock(app, &label);
            let state = app.state::<State>();
            state.windows.keys.lock().unwrap().remove(&label);
            write_now(&state);
            let _ = app.emit("fw://window-destroyed", serde_json::json!({ "label": label }));
        }
        _ => {}
    }
}
