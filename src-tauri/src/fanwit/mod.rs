//! Fanwit core: the Rust half of the Host contract (sandboxed file system, SQLite, windows,
//! window state, CLI bridge). Everything here is reachable from TypeScript as `fw_*` commands.

pub mod app;
pub mod cli;
pub mod db;
pub mod fs;
pub mod install;
pub mod sandbox;
pub mod toml;
pub mod tray;
pub mod windows;

use std::sync::Mutex;

pub type Result<T> = std::result::Result<T, String>;

/// Converts any error into the string the frontend receives.
pub fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

/// Shared state managed by Tauri.
pub struct State {
    pub launch: cli::LaunchArgs,
    pub sandbox: sandbox::Sandbox,
    pub fs: fs::FsState,
    pub db: db::DbState,
    pub windows: windows::WindowsState,
    pub cli: cli::CliState,
    pub pending_paths: Mutex<Vec<String>>,
}

impl State {
    pub fn new(launch: cli::LaunchArgs) -> Self {
        Self {
            launch,
            sandbox: sandbox::Sandbox::default(),
            fs: fs::FsState::default(),
            db: db::DbState::default(),
            windows: windows::WindowsState::default(),
            cli: cli::CliState::default(),
            pending_paths: Mutex::new(Vec::new()),
        }
    }
}

#[derive(Clone, Copy)]
pub enum Dir {
    Config,
    Data,
    Cache,
    Log,
}

/// App directories, separated per profile when started with `--profile <name>` (Section 21.1).
pub fn app_dir<R: tauri::Runtime>(app: &tauri::AppHandle<R>, d: Dir) -> Result<std::path::PathBuf> {
    use tauri::Manager;
    let p = app.path();
    let base = match d {
        Dir::Config => p.app_config_dir(),
        Dir::Data => p.app_data_dir(),
        Dir::Cache => p.app_cache_dir(),
        Dir::Log => p.app_log_dir(),
    }
    .map_err(err)?;
    let profile = app.state::<State>().launch.profile.clone().unwrap_or_default();
    let clean: String = profile.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_').collect();
    Ok(if clean.is_empty() { base } else { base.join("profiles").join(clean) })
}

/// Normalises a path for the frontend: forward slashes, no `\\?\` prefix.
pub fn to_front(p: &std::path::Path) -> String {
    dunce::simplified(p).to_string_lossy().replace('\\', "/")
}
