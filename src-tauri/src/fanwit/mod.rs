//! Fanwit core: the Rust half of the Host contract (sandboxed file system, SQLite, windows,
//! window state, CLI bridge). Everything here is reachable from TypeScript as `fw_*` commands.

pub mod app;
pub mod cli;
pub mod db;
pub mod fs;
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

/// Normalises a path for the frontend: forward slashes, no `\\?\` prefix.
pub fn to_front(p: &std::path::Path) -> String {
    dunce::simplified(p).to_string_lossy().replace('\\', "/")
}
