//! Host file system for the webview: sandboxed, atomic writes, OS trash and a debounced watcher
//! that pairs renames (Section 12.4).

use super::{err, to_front, Result, State};
use notify::RecursiveMode;
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, RecommendedCache};
use serde::Serialize;
use std::collections::HashMap;
use std::io::Write;
use std::path::Path;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;
use std::time::{Duration, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, Runtime};

#[derive(Default)]
pub struct FsState {
    next: AtomicU32,
    watchers: Mutex<HashMap<u32, Debouncer<notify::RecommendedWatcher, RecommendedCache>>>,
    vaults: VaultLocks,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(tag = "status", rename_all = "lowercase")]
pub enum VaultLock {
    /// This window owns the vault now.
    Ok,
    /// Another window of this app has it open: focus that one instead.
    Window { label: String },
    /// Another process holds it (a second copy of the app, possibly another build).
    Busy,
}

/// Vault ownership (Section 12.3): an OS file lock on `<vault>/.appname/lock`, which the OS
/// releases when the process exits or crashes, so a lock is never stale. Inside this process
/// each vault belongs to one window.
#[derive(Default)]
pub struct VaultLocks(Mutex<HashMap<std::path::PathBuf, (std::fs::File, String)>>);

impl VaultLocks {
    /// `alive` says whether a window label still exists: a closed window's claim is taken over.
    pub fn claim(&self, lock: &Path, window: &str, alive: impl Fn(&str) -> bool) -> Result<VaultLock> {
        let mut map = self.0.lock().unwrap();
        if let Some((_, owner)) = map.get_mut(lock) {
            if owner != window && alive(owner) {
                return Ok(VaultLock::Window { label: owner.clone() });
            }
            *owner = window.to_string();
            return Ok(VaultLock::Ok);
        }
        let mut f = std::fs::OpenOptions::new().create(true).truncate(false).write(true).open(lock).map_err(err)?;
        match f.try_lock() {
            Ok(()) => {}
            Err(std::fs::TryLockError::WouldBlock) => return Ok(VaultLock::Busy),
            Err(std::fs::TryLockError::Error(e)) => return Err(err(e)),
        }
        // for people looking at the folder; the OS lock is what counts
        let _ = f.set_len(0).and_then(|_| write!(f, "{{\"pid\":{}}}", std::process::id()));
        map.insert(lock.to_path_buf(), (f, window.to_string()));
        Ok(VaultLock::Ok)
    }

    pub fn release(&self, lock: &Path, window: &str) {
        let mut map = self.0.lock().unwrap();
        if map.get(lock).is_some_and(|(_, owner)| owner == window) {
            map.remove(lock); // dropping the file releases the OS lock
            let _ = std::fs::remove_file(lock);
        }
    }
}

#[tauri::command]
pub fn fw_vault_lock<R: Runtime>(app: AppHandle<R>, window: tauri::WebviewWindow<R>, state: tauri::State<State>, path: String) -> Result<VaultLock> {
    let p = state.sandbox.check(&path)?;
    let r = state.fs.vaults.claim(&p, window.label(), |l| app.get_webview_window(l).is_some())?;
    // bring the window that has it to the front (set_focus alone skips minimized windows)
    if let VaultLock::Window { label } = &r {
        if let Some(w) = app.get_webview_window(label) {
            let _ = w.unminimize();
            let _ = w.show();
            let _ = w.set_focus();
        }
    }
    Ok(r)
}

#[tauri::command]
pub fn fw_vault_unlock<R: Runtime>(window: tauri::WebviewWindow<R>, state: tauri::State<State>, path: String) -> Result<()> {
    state.fs.vaults.release(&state.sandbox.check(&path)?, window.label());
    Ok(())
}

#[derive(Serialize)]
pub struct Entry {
    name: String,
    path: String,
    dir: bool,
    size: Option<u64>,
    mtime: Option<u64>,
}

#[derive(Serialize)]
pub struct Stat {
    dir: bool,
    size: u64,
    mtime: u64,
}

#[derive(Serialize, Clone)]
struct FsEvent {
    kind: &'static str,
    path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    from: Option<String>,
}

#[derive(Serialize, Clone)]
struct FsPayload {
    id: u32,
    events: Vec<FsEvent>,
}

fn mtime(m: &std::fs::Metadata) -> u64 {
    m.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Write via a temp file, fsync, then rename over the target (replaces atomically on every OS).
pub fn atomic_write(path: &Path, data: &[u8]) -> Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(err)?;
    }
    let tmp = path.with_extension(format!(
        "{}.tmp",
        path.extension().and_then(|e| e.to_str()).unwrap_or("fw")
    ));
    {
        let mut f = std::fs::File::create(&tmp).map_err(err)?;
        f.write_all(data).map_err(err)?;
        f.sync_all().map_err(err)?;
    }
    std::fs::rename(&tmp, path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        err(e)
    })
}

#[tauri::command]
pub fn fw_fs_read_text(state: tauri::State<State>, path: String) -> Result<String> {
    std::fs::read_to_string(state.sandbox.check(&path)?).map_err(|e| format!("{path}: {e}"))
}

#[tauri::command]
pub fn fw_fs_read(state: tauri::State<State>, path: String) -> Result<Vec<u8>> {
    std::fs::read(state.sandbox.check(&path)?).map_err(|e| format!("{path}: {e}"))
}

#[tauri::command]
pub fn fw_fs_write_text(state: tauri::State<State>, path: String, data: String, atomic: bool) -> Result<()> {
    let p = state.sandbox.check(&path)?;
    if atomic {
        atomic_write(&p, data.as_bytes())
    } else {
        if let Some(parent) = p.parent() {
            std::fs::create_dir_all(parent).map_err(err)?;
        }
        std::fs::write(p, data).map_err(err)
    }
}

#[tauri::command]
pub fn fw_fs_write(state: tauri::State<State>, path: String, data: Vec<u8>) -> Result<()> {
    atomic_write(&state.sandbox.check(&path)?, &data)
}

#[tauri::command]
pub fn fw_fs_exists(state: tauri::State<State>, path: String) -> Result<bool> {
    Ok(state.sandbox.check_known(&path)?.exists())
}

#[tauri::command]
pub fn fw_fs_stat(state: tauri::State<State>, path: String) -> Result<Stat> {
    let m = std::fs::metadata(state.sandbox.check(&path)?).map_err(|e| format!("{path}: {e}"))?;
    Ok(Stat { dir: m.is_dir(), size: m.len(), mtime: mtime(&m) })
}

fn walk(dir: &Path, recursive: bool, out: &mut Vec<Entry>) -> Result<()> {
    for e in std::fs::read_dir(dir).map_err(err)? {
        let e = e.map_err(err)?;
        let Ok(m) = e.metadata() else { continue };
        let path = e.path();
        out.push(Entry {
            name: e.file_name().to_string_lossy().into_owned(),
            path: to_front(&path),
            dir: m.is_dir(),
            size: (!m.is_dir()).then_some(m.len()),
            mtime: Some(mtime(&m)),
        });
        if recursive && m.is_dir() && !m.file_type().is_symlink() {
            walk(&path, true, out)?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn fw_fs_list(state: tauri::State<State>, dir: String, recursive: bool) -> Result<Vec<Entry>> {
    let mut out = Vec::new();
    walk(&state.sandbox.check(&dir)?, recursive, &mut out).map_err(|e| format!("{dir}: {e}"))?;
    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
}

#[tauri::command]
pub fn fw_fs_mkdir(state: tauri::State<State>, path: String) -> Result<()> {
    std::fs::create_dir_all(state.sandbox.check(&path)?).map_err(err)
}

#[tauri::command]
pub fn fw_fs_remove(state: tauri::State<State>, path: String, recursive: bool) -> Result<()> {
    let p = state.sandbox.check(&path)?;
    if p.is_dir() {
        if recursive {
            std::fs::remove_dir_all(p).map_err(err)
        } else {
            std::fs::remove_dir(p).map_err(err)
        }
    } else {
        std::fs::remove_file(p).map_err(err)
    }
}

#[tauri::command]
pub fn fw_fs_rename(state: tauri::State<State>, from: String, to: String) -> Result<()> {
    let (f, t) = (state.sandbox.check(&from)?, state.sandbox.check(&to)?);
    if let Some(parent) = t.parent() {
        std::fs::create_dir_all(parent).map_err(err)?;
    }
    std::fs::rename(f, t).map_err(err)
}

#[tauri::command]
pub fn fw_fs_trash(state: tauri::State<State>, path: String) -> Result<()> {
    trash::delete(state.sandbox.check(&path)?).map_err(err)
}

#[tauri::command]
pub fn fw_fs_allow_root(state: tauri::State<State>, path: String) -> Result<String> {
    Ok(to_front(&state.sandbox.allow(Path::new(&path))?))
}

/// Pick a folder natively and remember it as user chosen (so it can become a vault root).
#[tauri::command]
pub async fn fw_fs_pick_folder<R: Runtime>(app: AppHandle<R>, title: Option<String>) -> Result<Option<String>> {
    use tauri_plugin_dialog::DialogExt;
    let mut d = app.dialog().file();
    if let Some(t) = title {
        d = d.set_title(t);
    }
    let Some(picked) = d.blocking_pick_folder() else { return Ok(None) };
    let path = picked.into_path().map_err(err)?;
    let state = app.state::<State>();
    state.sandbox.remember(&path);
    Ok(Some(to_front(&path)))
}

#[tauri::command]
pub fn fw_fs_watch<R: Runtime>(app: AppHandle<R>, state: tauri::State<State>, path: String, recursive: bool) -> Result<u32> {
    let p = state.sandbox.check(&path)?;
    let id = state.fs.next.fetch_add(1, Ordering::Relaxed) + 1;
    let handle = app.clone();
    let mut deb = new_debouncer(Duration::from_millis(50), None, move |res: DebounceEventResult| {
        let Ok(events) = res else { return };
        let mut out = Vec::new();
        for ev in events {
            use notify::event::{EventKind, ModifyKind, RenameMode};
            let paths: Vec<String> = ev.paths.iter().map(|p| to_front(p)).collect();
            match ev.kind {
                EventKind::Create(_) => paths.into_iter().for_each(|p| out.push(FsEvent { kind: "created", path: p, from: None })),
                EventKind::Remove(_) => paths.into_iter().for_each(|p| out.push(FsEvent { kind: "deleted", path: p, from: None })),
                EventKind::Modify(ModifyKind::Name(RenameMode::Both)) if paths.len() == 2 => {
                    out.push(FsEvent { kind: "renamed", path: paths[1].clone(), from: Some(paths[0].clone()) })
                }
                EventKind::Modify(ModifyKind::Name(RenameMode::From)) => paths.into_iter().for_each(|p| out.push(FsEvent { kind: "deleted", path: p, from: None })),
                EventKind::Modify(ModifyKind::Name(RenameMode::To)) => paths.into_iter().for_each(|p| out.push(FsEvent { kind: "created", path: p, from: None })),
                EventKind::Modify(_) => paths.into_iter().for_each(|p| out.push(FsEvent { kind: "modified", path: p, from: None })),
                _ => {}
            }
        }
        // ignore our own temp files from atomic writes
        out.retain(|e| !e.path.ends_with(".tmp"));
        if !out.is_empty() {
            let _ = handle.emit("fw://fs", FsPayload { id, events: out });
        }
    })
    .map_err(err)?;
    let mode = if recursive { RecursiveMode::Recursive } else { RecursiveMode::NonRecursive };
    // watching a file that does not exist yet: watch its parent instead
    let target = if p.exists() { p.clone() } else { p.parent().map(|x| x.to_path_buf()).unwrap_or(p.clone()) };
    deb.watch(&target, mode).map_err(err)?;
    state.fs.watchers.lock().unwrap().insert(id, deb);
    Ok(id)
}

#[tauri::command]
pub fn fw_fs_unwatch(state: tauri::State<State>, id: u32) -> Result<()> {
    state.fs.watchers.lock().unwrap().remove(&id);
    Ok(())
}

#[derive(Serialize)]
pub struct Dirs {
    config: String,
    data: String,
    cache: String,
    log: String,
    home: Option<String>,
}

#[tauri::command]
pub fn fw_dirs<R: Runtime>(app: AppHandle<R>) -> Result<Dirs> {
    use super::{app_dir, Dir};
    Ok(Dirs {
        config: to_front(&app_dir(&app, Dir::Config)?),
        data: to_front(&app_dir(&app, Dir::Data)?),
        cache: to_front(&app_dir(&app, Dir::Cache)?),
        log: to_front(&app_dir(&app, Dir::Log)?),
        home: app.path().home_dir().ok().map(|h| to_front(&h)),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vault_locks_one_window_per_vault_and_one_process() {
        let dir = std::env::temp_dir().join(format!("fw-vault-lock-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let lock = dir.join("lock");
        let locks = VaultLocks::default();
        assert_eq!(locks.claim(&lock, "main", |_| true).unwrap(), VaultLock::Ok);
        assert_eq!(locks.claim(&lock, "main", |_| true).unwrap(), VaultLock::Ok, "a reload keeps it");
        assert_eq!(locks.claim(&lock, "main-2", |_| true).unwrap(), VaultLock::Window { label: "main".into() });
        assert_eq!(locks.claim(&lock, "main-2", |_| false).unwrap(), VaultLock::Ok, "a closed window's claim is taken over");
        locks.release(&lock, "main"); // not the owner any more: no effect
        // another process (simulated by a second table) cannot take it while held
        let other = VaultLocks::default();
        assert_eq!(other.claim(&lock, "main", |_| true).unwrap(), VaultLock::Busy);
        locks.release(&lock, "main-2");
        assert_eq!(other.claim(&lock, "main", |_| true).unwrap(), VaultLock::Ok);
        other.release(&lock, "main");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
