//! App CLI, hybrid execution (Section 15.1.2). The GUI process listens on a per user local
//! socket (named pipe on Windows); `<app>-cli` sends argv, the main window runs the command
//! through the normal pipeline (source "cli") and streams progress and the result back.

use super::{err, Result, State};
use interprocess::local_socket::{prelude::*, GenericFilePath, GenericNamespaced, ListenerOptions, Name, Stream};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{channel, Sender};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, Runtime};

#[derive(Default, Clone, Debug, Serialize)]
pub struct LaunchArgs {
    pub headless: bool,
    pub safe_mode: bool,
    pub new_window: bool,
    pub devtools: bool,
    /// `--set key=value`
    pub sets: Vec<(String, String)>,
    /// files, folders and deep links passed positionally
    pub paths: Vec<String>,
    pub profile: Option<String>,
}

impl LaunchArgs {
    pub fn parse(argv: &[String]) -> Self {
        let mut a = LaunchArgs::default();
        let mut it = argv.iter().skip(1).peekable();
        while let Some(arg) = it.next() {
            match arg.as_str() {
                "--headless" => a.headless = true,
                "--safe-mode" => a.safe_mode = true,
                "--new-window" => a.new_window = true,
                "--devtools" => a.devtools = true,
                "--set" => {
                    if let Some((k, v)) = it.next().and_then(|kv| kv.split_once('=')) {
                        a.sets.push((k.into(), v.into()));
                    }
                }
                "--profile" => a.profile = it.next().cloned(),
                s if s.starts_with("--set=") => {
                    if let Some((k, v)) = s[6..].split_once('=') {
                        a.sets.push((k.into(), v.into()));
                    }
                }
                s if s.starts_with("--") => {}
                s => a.paths.push(s.to_string()),
            }
        }
        a
    }
}

#[derive(Default)]
pub struct CliState {
    pub ready: AtomicBool,
    next: AtomicU64,
    pending: Mutex<HashMap<u64, Sender<String>>>,
}

pub fn socket_name(identifier: &str) -> std::io::Result<Name<'static>> {
    if GenericNamespaced::is_supported() {
        format!("{identifier}.sock").to_ns_name::<GenericNamespaced>()
    } else {
        let p = std::env::temp_dir().join(format!("{identifier}.sock"));
        p.to_fs_name::<GenericFilePath>().map(|n| n.into_owned())
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Request {
    op: String,
    #[serde(default)]
    argv: Vec<String>,
    #[serde(default)]
    cwd: String,
    #[serde(default)]
    tty: bool,
    #[serde(default)]
    no_input: bool,
}

pub fn start_server<R: Runtime>(app: &AppHandle<R>) {
    let identifier = app.config().identifier.clone();
    let handle = app.clone();
    std::thread::spawn(move || {
        let Ok(name) = socket_name(&identifier) else { return };
        #[cfg(unix)]
        if !GenericNamespaced::is_supported() {
            let _ = std::fs::remove_file(std::env::temp_dir().join(format!("{identifier}.sock")));
        }
        let listener = match ListenerOptions::new().name(name).create_sync() {
            Ok(l) => l,
            Err(e) => {
                log::warn!("CLI socket unavailable: {e}");
                return;
            }
        };
        for conn in listener.incoming().flatten() {
            let h = handle.clone();
            std::thread::spawn(move || serve(h, conn));
        }
    });
}

fn serve<R: Runtime>(app: AppHandle<R>, conn: Stream) {
    let mut reader = BufReader::new(conn);
    let mut line = String::new();
    if reader.read_line(&mut line).is_err() {
        return;
    }
    let Ok(req) = serde_json::from_str::<Request>(&line) else { return };
    let mut write = |s: &str| {
        let w = reader.get_mut();
        let _ = w.write_all(s.as_bytes());
        let _ = w.write_all(b"\n");
        let _ = w.flush();
    };
    match req.op.as_str() {
        "ping" => write(r#"{"type":"pong"}"#),
        "quit" => {
            write(r#"{"type":"done","code":0}"#);
            app.exit(0);
        }
        "focus" => {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
            write(r#"{"type":"done","code":0}"#);
        }
        "run" => {
            let state = app.state::<State>();
            // wait for the kernel (headless start) up to 20 s
            for _ in 0..400 {
                if state.cli.ready.load(Ordering::SeqCst) {
                    break;
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            // paths typed on the command line are the user's choice, like launch paths
            for a in &req.argv {
                let p = std::path::Path::new(&req.cwd).join(a);
                if !a.starts_with('-') && p.exists() {
                    state.sandbox.remember(&p);
                }
            }
            let id = state.cli.next.fetch_add(1, Ordering::SeqCst) + 1;
            let (tx, rx) = channel::<String>();
            state.cli.pending.lock().unwrap().insert(id, tx);
            let _ = app.emit_to(
                "main",
                "fw://cli",
                serde_json::json!({ "id": id, "argv": req.argv, "cwd": req.cwd, "tty": req.tty, "noInput": req.no_input }),
            );
            for msg in rx {
                let done = msg.contains(r#""type":"done""#);
                write(&msg);
                if done {
                    break;
                }
            }
            state.cli.pending.lock().unwrap().remove(&id);
        }
        _ => write(r#"{"type":"done","code":2,"stderr":"unknown op"}"#),
    }
}

#[tauri::command]
pub fn fw_cli_ready(state: tauri::State<State>) {
    state.cli.ready.store(true, Ordering::SeqCst);
}

/// Stream a message (`{"type":"progress"|"stdout"|"stderr"|"done", ...}`) to a CLI client.
#[tauri::command]
pub fn fw_cli_send(state: tauri::State<State>, id: u64, message: Value) -> Result<()> {
    let tx = state.cli.pending.lock().unwrap().get(&id).cloned();
    if let Some(tx) = tx {
        tx.send(message.to_string()).map_err(err)?;
    }
    Ok(())
}

#[tauri::command]
pub fn fw_take_launch_paths(state: tauri::State<State>) -> Vec<String> {
    std::mem::take(&mut *state.pending_paths.lock().unwrap())
}

/// Second launch (single instance): focus the running app and hand over paths.
pub fn on_second_instance<R: Runtime>(app: &AppHandle<R>, argv: Vec<String>, cwd: String) {
    let args = LaunchArgs::parse(&argv);
    let paths: Vec<String> = args
        .paths
        .into_iter()
        .map(|p| {
            if p.contains("://") || std::path::Path::new(&p).is_absolute() {
                p
            } else {
                super::to_front(&std::path::Path::new(&cwd).join(p))
            }
        })
        .collect();
    let state = app.state::<State>();
    for p in &paths {
        if !p.contains("://") {
            state.sandbox.remember(std::path::Path::new(p));
        }
    }
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
    if !paths.is_empty() {
        let _ = app.emit("fw://open-paths", paths);
    }
}
