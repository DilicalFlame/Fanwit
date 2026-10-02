//! Console client for the app CLI (Section 15.1). The GUI binary uses the Windows GUI subsystem
//! and cannot print, so this tiny binary talks to the running app over a local socket, starting
//! it headless when needed. Output and exit codes are identical in every path.

use interprocess::local_socket::{prelude::*, GenericFilePath, GenericNamespaced, Name, Stream};
use std::io::{BufRead, BufReader, IsTerminal, Write};
use std::process::{Command, ExitCode};
use std::time::{Duration, Instant};

const IDENTIFIER: &str = env!("FW_IDENTIFIER");

fn name() -> std::io::Result<Name<'static>> {
    if GenericNamespaced::is_supported() {
        format!("{IDENTIFIER}.sock").to_ns_name::<GenericNamespaced>()
    } else {
        std::env::temp_dir().join(format!("{IDENTIFIER}.sock")).to_fs_name::<GenericFilePath>().map(|n| n.into_owned())
    }
}

fn connect() -> Option<Stream> {
    Stream::connect(name().ok()?).ok()
}

fn gui_exe() -> std::path::PathBuf {
    let me = std::env::current_exe().unwrap_or_default();
    let stem = me.file_stem().and_then(|s| s.to_str()).unwrap_or("fanwit").trim_end_matches("-cli").to_string();
    me.with_file_name(format!("{stem}{}", std::env::consts::EXE_SUFFIX))
}

fn send(stream: Stream, req: &serde_json::Value) -> i32 {
    let mut reader = BufReader::new(stream);
    let _ = reader.get_mut().write_all(format!("{req}\n").as_bytes());
    let mut code = 1;
    let mut line = String::new();
    let mut progress_shown = false;
    while reader.read_line(&mut line).map(|n| n > 0).unwrap_or(false) {
        let Ok(msg) = serde_json::from_str::<serde_json::Value>(&line) else {
            line.clear();
            continue;
        };
        match msg["type"].as_str() {
            Some("progress") => {
                let pct = msg["fraction"].as_f64().map(|f| format!("{:>3.0}% ", f * 100.0)).unwrap_or_default();
                eprint!("\r{pct}{}\x1b[K", msg["message"].as_str().unwrap_or(""));
                progress_shown = true;
            }
            Some("stdout") => print!("{}", msg["text"].as_str().unwrap_or("")),
            Some("stderr") => eprint!("{}", msg["text"].as_str().unwrap_or("")),
            Some("done") => {
                if progress_shown {
                    eprint!("\r\x1b[K");
                }
                if let Some(s) = msg["stdout"].as_str() {
                    print!("{s}");
                    if !s.ends_with('\n') && !s.is_empty() {
                        println!();
                    }
                }
                if let Some(s) = msg["stderr"].as_str() {
                    eprintln!("{s}");
                }
                code = msg["code"].as_i64().unwrap_or(1) as i32;
                break;
            }
            _ => {}
        }
        line.clear();
    }
    let _ = std::io::stdout().flush();
    code
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.first().map(|a| a == "--version" || a == "-V").unwrap_or(false) {
        println!("{}", env!("CARGO_PKG_VERSION"));
        return ExitCode::SUCCESS;
    }
    // no arguments, or only paths: open the GUI (single instance forwards to a running one)
    let only_paths = args.iter().all(|a| !a.starts_with('-') && (std::path::Path::new(a).exists() || a.contains("://")));
    if args.is_empty() || only_paths {
        return match Command::new(gui_exe()).args(&args).spawn() {
            Ok(_) => ExitCode::SUCCESS,
            Err(e) => {
                eprintln!("could not start {}: {e}", gui_exe().display());
                ExitCode::from(1)
            }
        };
    }

    let mut spawned = false;
    let stream = match connect() {
        Some(s) => s,
        None => {
            if let Err(e) = Command::new(gui_exe()).arg("--headless").spawn() {
                eprintln!("could not start {}: {e}", gui_exe().display());
                return ExitCode::from(1);
            }
            spawned = true;
            let start = Instant::now();
            loop {
                if let Some(s) = connect() {
                    break s;
                }
                if start.elapsed() > Duration::from_secs(30) {
                    eprintln!("the app did not start within 30 s");
                    return ExitCode::from(1);
                }
                std::thread::sleep(Duration::from_millis(150));
            }
        }
    };
    let cwd = std::env::current_dir().map(|p| p.to_string_lossy().replace('\\', "/")).unwrap_or_default();
    let req = serde_json::json!({
        "op": "run",
        "argv": args,
        "cwd": cwd,
        "tty": std::io::stdin().is_terminal(),
        "noInput": args.iter().any(|a| a == "--no-input") || !std::io::stdin().is_terminal(),
    });
    let code = send(stream, &req);
    if spawned {
        if let Some(s) = connect() {
            send(s, &serde_json::json!({ "op": "quit" }));
        }
    }
    ExitCode::from(code.clamp(0, 255) as u8)
}
