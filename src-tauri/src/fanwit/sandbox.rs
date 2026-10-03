//! File system sandbox (Section 12.4.1). The webview may only touch the app's own directories
//! and folders the user chose (picked in a dialog, created through the app, or passed on the
//! command line). Paths are canonicalised, so `..` and symlinks pointing outside are rejected.

use super::{err, Result};
use std::path::{Path, PathBuf};
use std::sync::RwLock;
use tauri::{AppHandle, Manager, Runtime};

#[derive(Default)]
pub struct Sandbox {
    /// App config, data, cache and log dirs.
    app_roots: RwLock<Vec<PathBuf>>,
    /// Folders the user chose; persisted in `<data>/roots.json`.
    known: RwLock<Vec<PathBuf>>,
    /// Known roots activated for this session (open vaults).
    active: RwLock<Vec<PathBuf>>,
    file: RwLock<Option<PathBuf>>,
}

fn canon(p: &Path) -> PathBuf {
    // canonicalise the deepest existing ancestor, then re-append the rest
    let mut existing = p.to_path_buf();
    let mut rest: Vec<std::ffi::OsString> = Vec::new();
    while !existing.exists() {
        match (existing.file_name(), existing.parent()) {
            (Some(name), Some(parent)) => {
                rest.push(name.to_os_string());
                existing = parent.to_path_buf();
            }
            _ => break,
        }
    }
    let mut out = dunce::canonicalize(&existing).unwrap_or(existing);
    for r in rest.into_iter().rev() {
        if r == ".." {
            out.pop();
        } else if r != "." {
            out.push(r);
        }
    }
    out
}

impl Sandbox {
    pub fn init<R: Runtime>(&self, app: &AppHandle<R>) -> Result<()> {
        let p = app.path();
        let dirs = [p.app_config_dir(), p.app_data_dir(), p.app_cache_dir(), p.app_log_dir()];
        let mut roots = self.app_roots.write().unwrap();
        for d in dirs.into_iter().flatten() {
            std::fs::create_dir_all(&d).map_err(err)?;
            roots.push(canon(&d));
        }
        let file = p.app_data_dir().map_err(err)?.join("roots.json");
        if let Ok(text) = std::fs::read_to_string(&file) {
            if let Ok(list) = serde_json::from_str::<Vec<String>>(&text) {
                *self.known.write().unwrap() = list.into_iter().map(PathBuf::from).collect();
            }
        }
        *self.file.write().unwrap() = Some(file);
        Ok(())
    }

    /// Remember a folder the user chose so it may be opened again later.
    pub fn remember(&self, path: &Path) {
        let c = canon(path);
        let mut known = self.known.write().unwrap();
        if !known.contains(&c) {
            known.push(c);
            if let Some(f) = self.file.read().unwrap().as_ref() {
                let list: Vec<String> = known.iter().map(|k| super::to_front(k)).collect();
                let _ = std::fs::write(f, serde_json::to_string_pretty(&list).unwrap_or_default());
            }
        }
    }

    /// Activate a root for this session. Allowed only for remembered folders or their children.
    pub fn allow(&self, path: &Path) -> Result<PathBuf> {
        let c = canon(path);
        let ok = self.known.read().unwrap().iter().any(|k| c.starts_with(k));
        if !ok {
            return Err(format!(
                "\"{}\" was not chosen by the user. Open it through the folder picker first.",
                super::to_front(&c)
            ));
        }
        let mut active = self.active.write().unwrap();
        if !active.contains(&c) {
            active.push(c.clone());
        }
        Ok(c)
    }

    /// Resolve and check a path coming from the webview.
    pub fn check(&self, path: &str) -> Result<PathBuf> {
        let c = canon(Path::new(path));
        let inside = |roots: &RwLock<Vec<PathBuf>>| roots.read().unwrap().iter().any(|r| c.starts_with(r));
        if inside(&self.app_roots) || inside(&self.active) {
            Ok(c)
        } else {
            Err(format!("Access denied: \"{}\" is outside the app and open vault folders.", path))
        }
    }
}
