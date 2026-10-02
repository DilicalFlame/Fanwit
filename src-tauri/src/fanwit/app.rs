//! App information, launch handling and setup.

use super::{err, Result, State};
use serde::Serialize;
use std::collections::HashMap;
use tauri::{App, AppHandle, Manager, Runtime};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    name: String,
    version: String,
    identifier: String,
    tauri_version: String,
    webview: String,
    os: String,
    arch: String,
    /// `--set` overrides and `<SLUG>_*` environment variables (raw; the settings service maps them).
    overrides: HashMap<String, String>,
    env: HashMap<String, String>,
    safe_mode: bool,
    headless: bool,
    devtools: bool,
}

#[tauri::command]
pub fn fw_app_info<R: Runtime>(app: AppHandle<R>, state: tauri::State<State>) -> AppInfo {
    let info = app.package_info();
    let prefix = format!("{}_", info.crate_name.to_uppercase().replace('-', "_"));
    let env = std::env::vars().filter_map(|(k, v)| k.strip_prefix(&prefix).map(|s| (s.to_string(), v))).collect();
    AppInfo {
        name: info.name.clone(),
        version: info.version.to_string(),
        identifier: app.config().identifier.clone(),
        tauri_version: tauri::VERSION.to_string(),
        webview: tauri::webview_version().unwrap_or_default(),
        os: format!("{} {}", std::env::consts::OS, os_version()),
        arch: std::env::consts::ARCH.to_string(),
        overrides: state.launch.sets.iter().cloned().collect(),
        env,
        safe_mode: state.launch.safe_mode,
        headless: state.launch.headless,
        devtools: cfg!(debug_assertions) || state.launch.devtools,
    }
}

fn os_version() -> String {
    #[cfg(windows)]
    {
        // ponytail: coarse; RtlGetVersion would give the build number
        return "Windows".into();
    }
    #[allow(unreachable_code)]
    String::new()
}

/// Write the crash marker; the next launch offers the crash report (Section 21.1).
pub fn install_panic_hook<R: Runtime>(app: &AppHandle<R>) {
    let dir = app.path().app_log_dir().ok();
    let prev = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        if let Some(d) = &dir {
            let _ = std::fs::create_dir_all(d);
            let _ = std::fs::write(
                d.join("crash.json"),
                serde_json::json!({ "time": chrono::Local::now().to_rfc3339(), "message": info.to_string(), "source": "rust" }).to_string(),
            );
        }
        log::error!("panic: {info}");
        prev(info);
    }));
}

pub fn setup<R: Runtime>(app: &mut App<R>) -> Result<()> {
    let handle = app.handle().clone();
    let state = handle.state::<State>();
    state.sandbox.init(&handle)?;
    // paths given on the command line count as user chosen
    let cwd = std::env::current_dir().unwrap_or_default();
    let mut paths = Vec::new();
    for p in &state.launch.paths {
        if p.contains("://") {
            paths.push(p.clone());
            continue;
        }
        let abs = cwd.join(p);
        state.sandbox.remember(&abs);
        paths.push(super::to_front(&abs));
    }
    *state.pending_paths.lock().unwrap() = paths;
    install_panic_hook(&handle);
    super::windows::init(&handle)?;
    super::windows::create_main(&handle)?;
    super::cli::start_server(&handle);
    #[cfg(desktop)]
    if !state.launch.headless {
        super::tray::init(&handle).map_err(err)?;
    }
    #[cfg(desktop)]
    {
        use tauri_plugin_deep_link::DeepLinkExt;
        let _ = app.deep_link().register_all();
    }
    Ok(())
}
