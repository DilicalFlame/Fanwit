//! File system sandbox (Section 12.4.1). The webview may only touch the app's own directories
//! and folders the user chose (picked in a dialog, created through the app, or passed on the
//! command line). Paths are canonicalised, so `..` and symlinks pointing outside are rejected.

use super::{err, Result};
use std::path::{Path, PathBuf};
use std::sync::RwLock;
use tauri::{AppHandle, Runtime};

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
        use super::{app_dir, Dir};
        let dirs = [app_dir(app, Dir::Config), app_dir(app, Dir::Data), app_dir(app, Dir::Cache), app_dir(app, Dir::Log)];
        let mut roots = self.app_roots.write().unwrap();
        for d in dirs.into_iter().flatten() {
            std::fs::create_dir_all(&d).map_err(err)?;
            roots.push(canon(&d));
        }
        let file = app_dir(app, Dir::Data)?.join("roots.json");
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

    /// Like `check`, but also inside remembered folders not yet activated this session: lets the
    /// recent vault list and startup restore see whether a vault still exists before opening it.
    pub fn check_known(&self, path: &str) -> Result<PathBuf> {
        self.check(path).or_else(|e| {
            let c = canon(Path::new(path));
            if self.known.read().unwrap().iter().any(|k| c.starts_with(k)) {
                Ok(c)
            } else {
                Err(e)
            }
        })
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn remembered_folders_are_visible_to_exists_before_activation() {
        let dir = std::env::temp_dir().join(format!("fw-sandbox-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let sb = Sandbox::default();
        let p = dir.to_string_lossy().into_owned();
        assert!(sb.check_known(&p).is_err());
        sb.known.write().unwrap().push(canon(&dir));
        assert!(sb.check(&p).is_err(), "still not active for reads and writes");
        assert!(sb.check_known(&p).is_ok());
        assert!(sb.check_known(&std::env::temp_dir().to_string_lossy()).is_err(), "parents stay hidden");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn dot_dot_cannot_climb_out_of_a_root_even_through_missing_folders() {
        let root = std::env::temp_dir().join(format!("fw-sandbox-dots-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let sb = Sandbox::default();
        sb.app_roots.write().unwrap().push(canon(&root));
        let s = |p: std::path::PathBuf| p.to_string_lossy().into_owned();
        assert!(sb.check(&s(root.join("notes/a.md"))).is_ok(), "a file that does not exist yet, inside");
        assert!(sb.check(&s(root.join("..").join("secret.txt"))).is_err());
        assert!(sb.check(&s(root.join("missing/../../secret.txt"))).is_err(), ".. after a missing folder");
        assert!(sb.check(&s(root.join("missing/../ok.txt"))).is_ok(), ".. that stays inside");
        let _ = std::fs::remove_dir_all(&root);
    }
}
