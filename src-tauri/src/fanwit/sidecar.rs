//! Native plugin sidecars (Chapter 14): a bundled program `fanwit-plugin-<id>` next to the app
//! executable, speaking the plugin protocol as newline delimited JSON on stdin and stdout. It runs
//! in its own process, so a heavy native plugin never blocks the app. Only programs that ship
//! with the app can run: the id is validated and resolved to that one file name, never a path.

use super::{err, Result, State};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::ipc::Channel;

const MAX_LINE: usize = 1 << 20;

/// A running sidecar: the process and the pipe we write requests into.
type Running = (Arc<Mutex<Child>>, ChildStdin);

#[derive(Default)]
pub struct Sidecars {
    running: Mutex<HashMap<String, Running>>,
}

impl Sidecars {
    pub fn kill_all(&self) {
        for (_, (child, _)) in self.running.lock().unwrap().drain() {
            let _ = child.lock().unwrap().kill();
        }
    }
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SidecarEvent {
    #[serde(skip_serializing_if = "Option::is_none")]
    line: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    exit: Option<i32>,
}

/// `fanwit-plugin-<id>[.exe]` next to the running executable (target/debug in dev, the bundle in release).
pub fn binary(id: &str) -> Result<PathBuf> {
    if id.is_empty() || id.len() > 64 || !id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-') {
        return Err(format!("invalid plugin id {id:?}"));
    }
    let exe = std::env::current_exe().map_err(err)?;
    let name = format!("fanwit-plugin-{id}{}", std::env::consts::EXE_SUFFIX);
    let p = exe.parent().ok_or("no executable directory")?.join(&name);
    if !p.is_file() {
        return Err(format!("{name} is not built. Run `pnpm fw plugin build {id}`."));
    }
    Ok(p)
}

#[tauri::command]
pub fn fw_sidecar_spawn(state: tauri::State<State>, id: String, on_event: Channel<SidecarEvent>) -> Result<()> {
    let path = binary(&id)?;
    if let Some((old, _)) = state.sidecars.running.lock().unwrap().remove(&id) {
        let _ = old.lock().unwrap().kill();
    }
    let mut cmd = Command::new(path);
    cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let mut child = cmd.spawn().map_err(err)?;
    let stdin = child.stdin.take().ok_or("no stdin")?;
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let stderr = child.stderr.take().ok_or("no stderr")?;
    let child = Arc::new(Mutex::new(child));

    let (ch, waiter, tag) = (on_event.clone(), child.clone(), id.clone());
    std::thread::spawn(move || {
        let mut r = BufReader::new(stdout);
        let mut buf = Vec::new();
        loop {
            buf.clear();
            match (&mut r).take(MAX_LINE as u64 + 1).read_until(b'\n', &mut buf) {
                Ok(0) | Err(_) => break,
                Ok(_) if buf.len() > MAX_LINE => {
                    log::warn!("sidecar {tag}: line over 1 MB dropped");
                    // skip the rest of the oversized line
                    let _ = r.read_until(b'\n', &mut Vec::new());
                }
                Ok(_) => {
                    let line = String::from_utf8_lossy(&buf).trim_end().to_string();
                    if !line.is_empty() && ch.send(SidecarEvent { line: Some(line), exit: None }).is_err() {
                        break;
                    }
                }
            }
        }
        let code = waiter.lock().unwrap().wait().ok().and_then(|s| s.code());
        let _ = ch.send(SidecarEvent { line: None, exit: code });
    });
    let tag = id.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines().map_while(std::result::Result::ok) {
            log::info!("sidecar {tag}: {line}");
        }
    });
    state.sidecars.running.lock().unwrap().insert(id, (child, stdin));
    Ok(())
}

#[tauri::command]
pub fn fw_sidecar_send(state: tauri::State<State>, id: String, line: String) -> Result<()> {
    let mut map = state.sidecars.running.lock().unwrap();
    let (_, stdin) = map.get_mut(&id).ok_or_else(|| format!("sidecar {id} is not running"))?;
    stdin.write_all(line.replace('\n', " ").as_bytes()).and_then(|_| stdin.write_all(b"\n")).and_then(|_| stdin.flush()).map_err(err)
}

#[tauri::command]
pub fn fw_sidecar_kill(state: tauri::State<State>, id: String) -> Result<()> {
    if let Some((child, _)) = state.sidecars.running.lock().unwrap().remove(&id) {
        let _ = child.lock().unwrap().kill();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn ids_never_become_paths() {
        assert!(super::binary("../evil").is_err());
        assert!(super::binary("a/b").is_err());
        assert!(super::binary("Upper").is_err());
        // a valid id that is not built reports how to build it
        assert!(super::binary("not-built-anywhere").unwrap_err().contains("pnpm fw plugin build"));
    }
}
