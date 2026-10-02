//! Tray icon (Section 7.8 `tray` location, Figure 17.17). Items are forwarded to the main window
//! as commands so they stay scriptable; quitting goes through the kernel for shutdown vetoes.

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Runtime};

pub fn init<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let name = app.package_info().name.clone();
    let show = MenuItem::with_id(app, "app.show", format!("Show {name}"), true, None::<&str>)?;
    let capture = MenuItem::with_id(app, "app.quickCapture", "Quick capture", true, None::<&str>)?;
    let vaults = MenuItem::with_id(app, "vault.switch", "Recent vaults…", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "app.quit", "Quit", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&show, &capture, &vaults, &sep, &quit])?;
    let mut b = TrayIconBuilder::with_id("main").tooltip(&name).menu(&menu).show_menu_on_left_click(false);
    if let Some(icon) = app.default_window_icon() {
        b = b.icon(icon.clone());
    }
    b.on_menu_event(|app, e| {
        let id = e.id().as_ref().to_string();
        if let Some(w) = app.get_webview_window("main") {
            if id != "app.quickCapture" {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }
        let _ = app.emit_to("main", "fw://tray", id);
    })
    .on_tray_icon_event(|tray, e| {
        if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
            if let Some(w) = tray.app_handle().get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }
    })
    .build(app)?;
    Ok(())
}
