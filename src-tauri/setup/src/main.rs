//! The Setup app (Section 16.9): a themed wizard that runs the bootstrap steps, chains the native
//! package silently with the chosen options, then confirms the package steps. The native package
//! stays the source of truth for files, registration and updates.
//!
//! FW_SETUP_SCENARIO=a.toml,b.toml runs against a simulated machine: nothing real changes.
//!
//! Command line:
//! - `--uninstall` opens the uninstall page; `--install-dir DIR` points at an existing install.
//!   A copy of this exe in the install folder is the app's uninstaller and its Modify entry in
//!   Apps and features (the NSIS hook registers it); that copy relaunches itself from the temp
//!   folder so it can remove the install folder.
//! - `--worker JOB --sha256 HEX --events FILE`: the elevated half of a machine wide install or
//!   uninstall. No window; progress goes to FILE as JSON lines that the visible Setup follows.
//! - `--engine ...`: run the fanwit-install command line (the elevated helper uses this).

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use fanwit_install::*;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};

static MANIFEST: &str = include_str!(concat!(env!("OUT_DIR"), "/installer.toml"));
static LICENSE: &str = include_str!(concat!(env!("OUT_DIR"), "/license.md"));
static PAYLOAD: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/payload.bin"));
const PAYLOAD_NAME: &str = env!("FW_PAYLOAD_NAME");

struct Setup {
    manifest: Manifest,
    /// scenario file contents when simulating (merged in order, later files win)
    scenario: Option<Vec<String>>,
    cancel: Arc<AtomicBool>,
    /// an existing install to maintain (from --install-dir)
    install_dir: Option<String>,
    /// started from Apps and features' Uninstall button
    uninstall: bool,
}

impl Setup {
    fn scenario(&self) -> Option<Scenario> {
        self.scenario.as_ref().map(|texts| texts.iter().fold(Scenario::default(), |acc, t| acc.merge(Scenario::parse(t).unwrap_or_default())))
    }
    fn simulated(&self) -> bool {
        self.scenario.is_some()
    }
}

/// The copy of this exe kept in the install folder (see the NSIS hook in fw installer build).
fn setup_copy_name(m: &Manifest) -> String {
    format!("{}-setup{}", m.app.slug, std::env::consts::EXE_SUFFIX)
}

#[derive(Deserialize, Serialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
struct SelIn {
    scope: Option<String>,
    components: Option<Vec<String>>,
    options: Option<BTreeMap<String, Value>>,
    install_dir: Option<String>,
    /// what the TypeScript steps decided (src-setup/steps), by step id
    #[serde(default)]
    ts: BTreeMap<String, TsStep>,
}

fn select(st: &Setup, s: &SelIn) -> Result<Selection, String> {
    let m = &st.manifest;
    let mut flags = vec![];
    if let Some(d) = st.install_dir.as_ref().filter(|_| s.install_dir.as_deref().unwrap_or_default().is_empty()) {
        flags.push(("installDir".to_string(), d.clone()));
    }
    if let Some(v) = &s.scope {
        flags.push(("scope".to_string(), v.clone()));
    }
    if let Some(c) = &s.components {
        flags.push(("components".into(), c.join(",")));
    }
    if let Some(d) = s.install_dir.as_ref().filter(|d| !d.is_empty()) {
        flags.push(("installDir".into(), d.clone()));
    }
    for (k, v) in s.options.iter().flatten() {
        flags.push((k.clone(), v.as_str().map(String::from).unwrap_or_else(|| v.to_string())));
    }
    selection(m, None, None, &flags)
}

fn with_engine<T>(st: &Setup, sel: Selection, ts: &BTreeMap<String, TsStep>, f: impl FnOnce(&mut Engine) -> T) -> T {
    let scenario = st.scenario();
    let real = Real;
    let sys: &dyn System = match &scenario {
        Some(s) => s,
        None => &real,
    };
    let mut e = Engine::new(&st.manifest, sys, sel);
    e.persist = scenario.is_none();
    e.ts_steps = ts.clone();
    // this exe is also the elevated helper: `Setup --engine elevated ...`
    e.helper = (std::env::current_exe().unwrap_or_default(), vec!["--engine".into()]);
    if e.persist {
        e.load_receipt();
    }
    f(&mut e)
}

// ---------- progress: to the window, or to a file the window follows ----------

#[derive(Clone)]
enum Sink {
    Window(AppHandle),
    File(Arc<Mutex<std::fs::File>>),
}

impl Sink {
    fn send(&self, event: Value) {
        match self {
            Sink::Window(app) => {
                let name = event["event"].as_str().unwrap_or_default().to_string();
                let _ = app.emit(&format!("setup://{name}"), event["data"].clone());
            }
            Sink::File(f) => {
                if let Ok(mut f) = f.lock() {
                    let _ = writeln!(f, "{event}");
                    let _ = f.flush();
                }
            }
        }
    }
    fn step(&self, id: &str, state: &str, detail: &str) {
        self.send(json!({ "event": "step", "data": { "id": id, "state": state, "detail": detail } }));
    }
    fn log(&self, line: &str) {
        self.send(json!({ "event": "log", "data": line }));
    }
}

// ---------- commands ----------

#[tauri::command]
fn setup_info(st: tauri::State<Setup>) -> Result<Value, String> {
    let m = &st.manifest;
    let sel = select(&st, &SelIn::default())?;
    let (install_dir, installed, admin) = with_engine(&st, sel, &BTreeMap::new(), |e| {
        let dir = e.path("{installDir}", &BTreeMap::new());
        let title = |id: &str| m.steps.iter().find(|s| s.id == id).map(|s| if s.title.is_empty() { s.id.clone() } else { s.title.clone() }).unwrap_or_else(|| id.to_string());
        let installed = e.receipt_path().is_file().then(|| {
            json!({
                "version": e.receipt.version,
                "components": e.receipt.components,
                "scope": e.receipt.scope,
                "dir": dir,
                "steps": e.receipt.steps.iter().map(|r| json!({ "id": r.id, "title": title(&r.id), "ours": r.ours })).collect::<Vec<_>>(),
            })
        });
        // a simulated machine pretends the app is installed, so the uninstall page can be previewed
        let installed = installed.or_else(|| {
            (!e.persist && st.uninstall).then(|| {
                json!({
                    "version": m.app.version, "components": e.sel.components, "scope": e.sel.scope, "dir": dir,
                    "steps": m.steps.iter().map(|s| json!({ "id": s.id, "title": title(&s.id), "ours": true })).collect::<Vec<_>>(),
                })
            })
        });
        (dir, installed, e.sys.admin())
    });
    // the default folder per scope, so the Scope page can switch it
    let dirs: BTreeMap<&str, String> = ["user", "machine"]
        .into_iter()
        .filter_map(|scope| {
            let sel = select(&st, &SelIn { scope: Some(scope.into()), ..Default::default() }).ok()?;
            Some((scope, with_engine(&st, sel, &BTreeMap::new(), |e| e.path("{installDir}", &BTreeMap::new()))))
        })
        .collect();
    let ts_steps: Vec<Value> = m.steps.iter().filter(|s| s.kind == "custom" && s.runtime.as_deref() == Some("ts")).map(|s| json!({ "id": s.id, "handler": s.handler, "title": s.title })).collect();
    Ok(json!({
        "app": { "id": m.app.id, "name": m.app.name, "version": m.app.version, "slug": m.app.slug },
        "installer": { "preset": m.installer.preset, "pages": m.installer.pages, "scope": m.installer.scope, "theme": m.installer.theme },
        "components": m.components.iter().map(|c| json!({ "id": c.id, "title": c.title, "required": c.required, "default": c.default || c.required, "size": c.size })).collect::<Vec<_>>(),
        "options": m.options.iter().map(|o| json!({ "id": o.id, "title": o.title, "type": o.kind, "default": o.default, "when": o.when })).collect::<Vec<_>>(),
        "tsSteps": ts_steps,
        "license": LICENSE,
        "installDir": install_dir,
        "installDirs": dirs,
        "installed": installed,
        "admin": admin,
        "simulated": st.simulated(),
        "launch": if st.uninstall { json!("uninstall") } else { Value::Null },
        "payload": if !PAYLOAD.is_empty() { json!({ "name": PAYLOAD_NAME, "size": PAYLOAD.len() }) } else if let Some(url) = &m.installer.payload.url { json!({ "name": url.rsplit('/').next(), "url": url, "online": true }) } else { Value::Null },
        "os": std::env::consts::OS,
    }))
}

#[tauri::command]
fn setup_plan(st: tauri::State<Setup>, sel: SelIn) -> Result<Plan, String> {
    let ts = sel.ts.clone();
    let sel = select(&st, &sel)?;
    with_engine(&st, sel, &ts, |e| e.plan(None))
}

/// For TypeScript step checks: run a command, or look at a file, without changing anything.
#[tauri::command]
fn setup_probe(st: tauri::State<Setup>, command: Option<String>, path: Option<String>) -> Value {
    let sel = select(&st, &SelIn::default()).unwrap_or_default();
    with_engine(&st, sel, &BTreeMap::new(), |e| {
        let ex = BTreeMap::new();
        let resolved = path.as_ref().map(|p| e.path(p, &ex));
        let exec = command.as_ref().map(|c| {
            let words: Vec<String> = c.split_whitespace().map(|w| if w.contains('{') { e.path(w, &ex) } else { w.to_string() }).collect();
            let o = e.sys.exec(&words, &BTreeMap::new());
            json!({ "code": o.code, "stdout": o.stdout })
        });
        json!({
            "path": resolved,
            "exists": resolved.as_ref().map(|p| e.sys.file_sha256(Path::new(p)).is_some()),
            "sha256": resolved.as_ref().and_then(|p| e.sys.file_sha256(Path::new(p))),
            "exec": exec,
        })
    })
}

#[tauri::command]
fn setup_resolve(st: tauri::State<Setup>, path: String) -> String {
    let sel = select(&st, &SelIn::default()).unwrap_or_default();
    with_engine(&st, sel, &BTreeMap::new(), |e| e.path(&path, &BTreeMap::new()))
}

#[tauri::command]
fn setup_cancel(st: tauri::State<Setup>) {
    st.cancel.store(true, Ordering::SeqCst);
}

#[tauri::command]
fn setup_install(app: AppHandle, st: tauri::State<Setup>, sel: SelIn) -> Result<(), String> {
    let selection = select(&st, &sel)?;
    st.cancel.store(false, Ordering::SeqCst);
    let elevated = needs_worker(&st, &selection);
    let app2 = app.clone();
    std::thread::spawn(move || {
        let st = app2.state::<Setup>();
        let sink = Sink::Window(app2.clone());
        let code = if elevated {
            sink.log("Asking for administrator rights to install for everyone on this computer");
            run_worker(&sink, &Job { kind: "install".into(), sel, purge: false })
        } else {
            install(&sink, &st, selection, &sel.ts).unwrap_or_else(|e| {
                sink.log(&format!("error: {e}"));
                EXIT_FATAL
            })
        };
        let _ = app2.emit("setup://done", code);
    });
    Ok(())
}

/// The machine scope writes where only administrators may: run the work in an elevated worker.
fn needs_worker(st: &Setup, sel: &Selection) -> bool {
    !st.simulated() && sel.scope == "machine" && !Real.admin()
}

fn screaming(id: &str) -> String {
    id.chars().fold(String::new(), |mut s, c| {
        if c.is_uppercase() && !s.is_empty() {
            s.push('_');
        }
        s.push(c.to_ascii_uppercase());
        s
    })
}

/// The native package: embedded, or downloaded for an online Setup. Returns its path in temp.
fn payload_file(st: &Setup, sink: &Sink) -> Result<Option<PathBuf>, String> {
    if !PAYLOAD.is_empty() {
        let file = std::env::temp_dir().join(PAYLOAD_NAME);
        std::fs::write(&file, PAYLOAD).map_err(|e| e.to_string())?;
        return Ok(Some(file));
    }
    let p = &st.manifest.installer.payload;
    let (Some(url), Some(sha)) = (&p.url, &p.sha256) else { return Ok(None) };
    let file = std::env::temp_dir().join(url.rsplit('/').next().unwrap_or("payload"));
    sink.step("package", "running", &format!("Downloading {}", p.size.as_deref().unwrap_or("the package")));
    sink.log(&format!("Downloading {url}"));
    // the same verified, resumable download the engine uses for prerequisites
    Real.perform(&Action::Download { url: url.clone(), sha256: sha.clone(), to: file.to_string_lossy().to_string() })?;
    Ok(Some(file))
}

/// Install the native package silently with the user's choices. Per OS:
/// Windows NSIS or MSI, macOS a DMG or an .app archive, Linux a deb, rpm or AppImage.
fn chain_payload(st: &Setup, sink: &Sink, file: &Path, dir: &str, sel: &Selection) -> Result<(), String> {
    let m = &st.manifest;
    let name = file.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let machine = sel.scope == "machine";
    let prefix = m.app.slug.to_uppercase().replace('-', "_");
    let mut env: Vec<(String, String)> = vec![(format!("{prefix}_SCOPE"), sel.scope.clone()), (format!("{prefix}_COMPONENTS"), sel.components.join(","))];
    for (k, v) in &sel.options {
        env.push((format!("{prefix}_{}", screaming(k)), v.as_str().map(String::from).unwrap_or_else(|| v.to_string())));
    }
    let run = |mut cmd: std::process::Command| -> Result<(), String> {
        sink.log(&format!("Running {cmd:?}"));
        let status = cmd.envs(env.clone()).status().map_err(|e| format!("could not start {name}: {e}"))?;
        status.success().then_some(()).ok_or_else(|| format!("{name} exited with {}", status.code().unwrap_or(-1)))
    };
    if name.ends_with(".msi") {
        let mut c = std::process::Command::new("msiexec");
        c.arg("/i").arg(file).arg("/qn").arg(format!("COMPONENTS={}", sel.components.join(",")));
        for (k, v) in &sel.options {
            c.arg(format!("{}={}", k.to_uppercase(), v.as_str().map(String::from).unwrap_or_else(|| v.to_string())));
        }
        return run(c);
    }
    if name.ends_with(".exe") {
        // NSIS: /S silent, /D the folder (must be last). /AllUsers and /CurrentUser pick the
        // scope when the package was built with installMode = "both"; other builds ignore them.
        let mut c = std::process::Command::new(file);
        c.arg("/S").arg(if machine { "/AllUsers" } else { "/CurrentUser" }).arg(format!("/D={dir}"));
        return run(c);
    }
    let app_bundle = format!("{}.app", m.app.name);
    if name.ends_with(".dmg") {
        let mount = std::env::temp_dir().join(format!("{}-dmg", m.app.slug));
        let _ = std::fs::create_dir_all(&mount);
        let mut attach = std::process::Command::new("hdiutil");
        attach.args(["attach", "-nobrowse", "-quiet", "-mountpoint"]).arg(&mount).arg(file);
        run(attach)?;
        let _ = std::fs::create_dir_all(dir);
        let target = Path::new(dir).join(&app_bundle);
        let _ = std::fs::remove_dir_all(&target);
        let mut cp = std::process::Command::new("cp");
        cp.arg("-R").arg(mount.join(&app_bundle)).arg(dir);
        let copied = run(cp);
        let mut detach = std::process::Command::new("hdiutil");
        detach.args(["detach", "-quiet"]).arg(&mount);
        let _ = run(detach);
        return copied;
    }
    if name.ends_with(".tar.gz") {
        let _ = std::fs::create_dir_all(dir);
        let mut tar = std::process::Command::new("tar");
        tar.arg("-xzf").arg(file).arg("-C").arg(dir);
        return run(tar);
    }
    if name.ends_with(".deb") || name.ends_with(".rpm") {
        // system packages need root: this runs in the elevated worker for the machine scope
        let tool = if name.ends_with(".deb") { if Real.which("apt-get").is_some() { "apt-get" } else { "dpkg" } } else if Real.which("dnf").is_some() { "dnf" } else { "rpm" };
        let mut c = std::process::Command::new(tool);
        match tool {
            "dpkg" => c.arg("-i"),
            "rpm" => c.arg("-U"),
            _ => c.args(["install", "-y"]),
        };
        c.arg(file);
        return run(c);
    }
    if name.ends_with(".AppImage") {
        let target = Path::new(dir).join(format!("{}.AppImage", m.app.name));
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        std::fs::copy(file, &target).map_err(|e| e.to_string())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&target, std::fs::Permissions::from_mode(0o755));
        }
        return Ok(());
    }
    Err(format!("do not know how to install {name}"))
}

fn install(sink: &Sink, st: &Setup, sel: Selection, ts: &BTreeMap<String, TsStep>) -> Result<i32, String> {
    let simulated = st.simulated();
    let s2 = sink.clone();
    let step = move |id: &str, state: &str, detail: &str| {
        s2.step(id, state, detail);
        if simulated && state == "running" {
            std::thread::sleep(std::time::Duration::from_millis(900)); // so the simulation is watchable
        }
    };
    let s3 = sink.clone();
    let log = move |l: &str| s3.log(l);
    let m = &st.manifest;
    with_engine(st, sel.clone(), ts, |e| -> Result<i32, String> {
        e.out = Box::new(log.clone());
        e.on_step = Box::new(step.clone());
        e.cancel = st.cancel.clone();
        let code = e.run("bootstrap", None, false)?;
        if code != EXIT_OK && code != EXIT_REBOOT {
            return Ok(code);
        }
        // chain the native package; on Windows and Linux its hook runs the package phase with the
        // same choices, on macOS the package phase below does it
        step("package", "running", "");
        let dir = e.path("{installDir}", &BTreeMap::new());
        if simulated {
            log(&format!("(simulated) install {} into {dir}", if PAYLOAD_NAME.is_empty() { "the native package" } else { PAYLOAD_NAME }));
        } else {
            match payload_file(st, sink)? {
                None => log("No native package is embedded (development build); skipping it"),
                Some(file) => {
                    // keep a copy of Setup in the install folder: the NSIS hook registers it as the
                    // uninstaller and the Modify entry, and it carries the payload for Repair
                    let me = std::env::current_exe().map_err(|e| e.to_string())?;
                    let copy = Path::new(&dir).join(setup_copy_name(m));
                    if cfg!(windows) && me != copy {
                        std::fs::create_dir_all(&dir).map_err(|e| format!("{dir}: {e}"))?;
                        std::fs::copy(&me, &copy).map_err(|e| format!("{}: {e}", copy.display()))?;
                    }
                    let result = chain_payload(st, sink, &file, &dir, &sel);
                    let _ = std::fs::remove_file(&file);
                    if let Err(err) = result {
                        if cfg!(windows) && me != copy {
                            let _ = std::fs::remove_file(&copy);
                        }
                        step("package", "failed", &err);
                        return Ok(EXIT_FATAL);
                    }
                }
            }
        }
        step("package", "done", "");
        // confirms what the package hook did (already satisfied) or does it (macOS, simulation)
        let after = e.run("package", None, false)?;
        Ok(if code == EXIT_REBOOT { EXIT_REBOOT } else { after })
    })
}

#[tauri::command]
fn setup_launch(st: tauri::State<Setup>, dir: String) -> Result<(), String> {
    if st.simulated() {
        return Ok(());
    }
    let m = &st.manifest;
    let mut cmd = match std::env::consts::OS {
        "macos" => {
            let mut c = std::process::Command::new("open");
            c.arg(Path::new(&dir).join(format!("{}.app", m.app.name)));
            c
        }
        "linux" if Path::new(&dir).join(format!("{}.AppImage", m.app.name)).is_file() => std::process::Command::new(Path::new(&dir).join(format!("{}.AppImage", m.app.name))),
        "linux" => std::process::Command::new(&m.app.slug),
        _ => std::process::Command::new(Path::new(&dir).join(format!("{}{}", m.app.slug, std::env::consts::EXE_SUFFIX))),
    };
    cmd.spawn().map(|_| ()).map_err(|e| format!("could not start {}: {e}", m.app.name))
}

/// Async so the window stays responsive while the native uninstaller runs.
#[tauri::command]
async fn setup_uninstall(app: AppHandle, st: tauri::State<'_, Setup>, purge: bool) -> Result<i32, String> {
    let sel = select(&st, &SelIn::default())?;
    let sink = Sink::Window(app);
    // installed for everyone: the elevated worker removes it
    let receipt_scope = with_engine(&st, sel.clone(), &BTreeMap::new(), |e| e.receipt.scope.clone());
    if !st.simulated() && receipt_scope == "machine" && !Real.admin() {
        sink.log("Asking for administrator rights to remove it for everyone on this computer");
        let job = Job { kind: "uninstall".into(), sel: SelIn { install_dir: Some(with_engine(&st, sel, &BTreeMap::new(), |e| e.path("{installDir}", &BTreeMap::new()))), ..Default::default() }, purge };
        return Ok(run_worker(&sink, &job));
    }
    uninstall(&sink, &st, sel, purge)
}

fn uninstall(sink: &Sink, st: &Setup, sel: Selection, purge: bool) -> Result<i32, String> {
    let simulated = st.simulated();
    let m = &st.manifest;
    with_engine(st, sel, &BTreeMap::new(), |e| {
        let s2 = sink.clone();
        let log = move |l: &str| s2.log(l);
        e.out = Box::new(log.clone());
        let dir = PathBuf::from(e.path("{installDir}", &BTreeMap::new()));
        // 1. reverse what the steps did (only what the receipt says is ours)
        let code = e.uninstall(purge)?;
        if simulated {
            log(&format!("(simulated) remove the native package from {}", dir.display()));
            return Ok(code);
        }
        // 2. the native uninstaller removes the files, shortcuts and the Apps and features entry
        if cfg!(windows) {
            // `_?=` keeps it in place so we can wait for it (by default NSIS re-launches itself
            // from temp and returns at once), which also means we clean up after it
            let un = dir.join("uninstall.exe");
            if un.is_file() {
                log("Removing program files");
                let status = std::process::Command::new(&un).arg("/S").arg(format!("_?={}", dir.display())).status().map_err(|e| e.to_string())?;
                if !status.success() {
                    log(&format!("The native uninstaller exited with {}", status.code().unwrap_or(-1)));
                    return Ok(EXIT_FATAL);
                }
                let _ = std::fs::remove_file(&un);
            }
            let _ = std::fs::remove_file(dir.join(setup_copy_name(m)));
        } else if cfg!(target_os = "macos") {
            log("Removing the app");
            let _ = std::fs::remove_dir_all(dir.join(format!("{}.app", m.app.name)));
        } else {
            let appimage = dir.join(format!("{}.AppImage", m.app.name));
            if appimage.is_file() {
                let _ = std::fs::remove_file(appimage);
            } else {
                let tool = if Real.which("apt-get").is_some() { vec!["apt-get", "remove", "-y"] } else if Real.which("dnf").is_some() { vec!["dnf", "remove", "-y"] } else { vec!["rpm", "-e"] };
                log(&format!("Removing the {} package", m.app.slug));
                let _ = std::process::Command::new(tool[0]).args(&tool[1..]).arg(&m.app.slug).status();
            }
        }
        if purge {
            // the webview cache lives next to the app data
            if let Some(local) = std::env::var_os("LOCALAPPDATA") {
                let _ = std::fs::remove_dir_all(Path::new(&local).join(&m.app.id));
            }
        }
        // only removes the folder when nothing else (user files) is left in it
        let _ = std::fs::remove_dir(&dir);
        log("Done");
        Ok(code)
    })
}

/// A dialog result inside an existing folder gets the app's own subfolder, like other installers.
#[tauri::command]
fn setup_pick_dir(st: tauri::State<Setup>, picked: String) -> String {
    let name = &st.manifest.app.name;
    let p = Path::new(&picked);
    if p.file_name().map(|n| n.to_string_lossy().eq_ignore_ascii_case(name)).unwrap_or(false) {
        picked
    } else {
        p.join(name).to_string_lossy().to_string()
    }
}

// ---------- the elevated worker ----------

#[derive(Serialize, Deserialize)]
struct Job {
    kind: String,
    sel: SelIn,
    purge: bool,
}

/// Start the worker with administrator rights and relay its progress. One prompt for everything.
fn run_worker(sink: &Sink, job: &Job) -> i32 {
    use sha2::Digest;
    let id = std::process::id();
    let job_file = std::env::temp_dir().join(format!("fanwit-setup-job-{id}.json"));
    let events = std::env::temp_dir().join(format!("fanwit-setup-events-{id}.jsonl"));
    let Ok(bytes) = serde_json::to_vec(job) else { return EXIT_FATAL };
    if std::fs::write(&job_file, &bytes).is_err() || std::fs::write(&events, b"").is_err() {
        return EXIT_FATAL;
    }
    let digest = hex::encode(sha2::Sha256::digest(&bytes));
    let exe = std::env::current_exe().unwrap_or_default();
    let args: Vec<String> = vec!["--worker".into(), job_file.to_string_lossy().into(), "--sha256".into(), digest, "--events".into(), events.to_string_lossy().into()];
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let _ = tx.send(Real.run_elevated(&exe, &args).unwrap_or(EXIT_FATAL));
    });
    let mut seen = 0usize;
    let code = loop {
        let finished = rx.try_recv().ok();
        if let Ok(text) = std::fs::read_to_string(&events) {
            for line in text[seen.min(text.len())..].lines() {
                if let Ok(v) = serde_json::from_str::<Value>(line) {
                    sink.send(v);
                }
            }
            seen = text.len();
        }
        if let Some(c) = finished {
            break c;
        }
        std::thread::sleep(std::time::Duration::from_millis(150));
    };
    let _ = std::fs::remove_file(&job_file);
    let _ = std::fs::remove_file(&events);
    if code == EXIT_CANCELLED {
        sink.log("Administrator rights were not granted");
    }
    code
}

/// `--worker JOB --sha256 HEX --events FILE`: the elevated side. Refuses a job file that changed.
fn worker_main(args: &[String], manifest: Manifest) -> i32 {
    use sha2::Digest;
    let arg = |name: &str| args.iter().position(|a| a == name).and_then(|i| args.get(i + 1)).cloned();
    let (Some(job_file), Some(digest), Some(events)) = (arg("--worker"), arg("--sha256"), arg("--events")) else { return EXIT_FATAL };
    let Ok(bytes) = std::fs::read(&job_file) else { return EXIT_FATAL };
    if !hex::encode(sha2::Sha256::digest(&bytes)).eq_ignore_ascii_case(&digest) {
        return EXIT_FATAL;
    }
    let Ok(job) = serde_json::from_slice::<Job>(&bytes) else { return EXIT_FATAL };
    let Ok(file) = std::fs::OpenOptions::new().append(true).open(&events) else { return EXIT_FATAL };
    let sink = Sink::File(Arc::new(Mutex::new(file)));
    let st = Setup { manifest, scenario: None, cancel: Default::default(), install_dir: job.sel.install_dir.clone(), uninstall: false };
    let result = select(&st, &job.sel).and_then(|sel| match job.kind.as_str() {
        "uninstall" => uninstall(&sink, &st, sel, job.purge),
        _ => install(&sink, &st, sel, &job.sel.ts),
    });
    result.unwrap_or_else(|e| {
        sink.log(&format!("error: {e}"));
        EXIT_FATAL
    })
}

// ---------- WebView2 pre stage (Windows) ----------

/// The Setup window needs the WebView2 runtime. Windows 11 and current Windows 10 have it; when
/// it is missing, ask before the first webview, run Microsoft's bootstrapper, then continue.
#[cfg(windows)]
fn ensure_webview2(app_name: &str) -> bool {
    const CLIENT: &str = "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
    let installed = || {
        [
            format!("HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{CLIENT}"),
            format!("HKLM\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\{CLIENT}"),
            format!("HKCU\\Software\\Microsoft\\EdgeUpdate\\Clients\\{CLIENT}"),
        ]
        .iter()
        .any(|k| Real.reg_get(k, "pv").map(|v| !v.value.is_empty() && v.value != "0.0.0.0").unwrap_or(false))
    };
    if std::env::var_os("FW_SETUP_PRETEND_NO_WEBVIEW2").is_none() && installed() {
        return true;
    }
    let title = format!("{app_name} Setup");
    let ask = format!("{app_name} Setup needs the Microsoft Edge WebView2 Runtime, which is not installed on this computer.\n\nDownload and install it now (about 2 MB)?");
    if !message_box(&title, &ask, true) {
        return false;
    }
    let file = std::env::temp_dir().join("MicrosoftEdgeWebview2Setup.exe");
    let downloaded = std::process::Command::new("curl").args(["-fsSL", "-o"]).arg(&file).arg("https://go.microsoft.com/fwlink/p/?LinkId=2124703").status().map(|s| s.success()).unwrap_or(false);
    // the bootstrapper shows its own progress window
    let ran = downloaded && std::process::Command::new(&file).arg("/install").status().map(|s| s.success()).unwrap_or(false);
    let _ = std::fs::remove_file(&file);
    if ran && (installed() || std::env::var_os("FW_SETUP_PRETEND_NO_WEBVIEW2").is_some()) {
        return true;
    }
    message_box(&title, "The WebView2 Runtime could not be installed. Install it from https://go.microsoft.com/fwlink/p/?LinkId=2124703 and run Setup again.", false);
    false
}

#[cfg(windows)]
fn message_box(title: &str, text: &str, question: bool) -> bool {
    use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, IDYES, MB_ICONERROR, MB_ICONQUESTION, MB_OK, MB_YESNO};
    let w = |s: &str| s.encode_utf16().chain([0]).collect::<Vec<u16>>();
    let (t, c) = (w(text), w(title));
    let flags = if question { MB_YESNO | MB_ICONQUESTION } else { MB_OK | MB_ICONERROR };
    unsafe { MessageBoxW(std::ptr::null_mut(), t.as_ptr(), c.as_ptr(), flags) == IDYES }
}

// ---------- entry ----------

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    // `Setup --engine ...`: the engine command line, used as the elevated helper
    if args.first().map(|a| a == "--engine").unwrap_or(false) {
        std::process::exit(fanwit_install::cli::main(args[1..].to_vec(), vec!["--engine".into()]));
    }
    let manifest = Manifest::parse(MANIFEST).unwrap_or_else(|e| {
        eprintln!("embedded installer.toml is invalid: {e}");
        std::process::exit(EXIT_FATAL)
    });
    if args.iter().any(|a| a == "--worker") {
        std::process::exit(worker_main(&args, manifest));
    }
    let scenario = std::env::var("FW_SETUP_SCENARIO").ok().filter(|s| !s.is_empty()).map(|list| list.split(',').map(|f| std::fs::read_to_string(f).unwrap_or_default()).collect::<Vec<_>>());
    let arg = |name: &str| args.iter().position(|a| a == name).and_then(|i| args.get(i + 1)).cloned();
    let uninstall = args.iter().any(|a| a == "--uninstall") || std::env::var_os("FW_SETUP_UNINSTALL").is_some();
    let from_temp = args.iter().any(|a| a == "--from-temp");
    let mut install_dir = arg("--install-dir");

    #[cfg(windows)]
    if !ensure_webview2(&manifest.app.name) {
        std::process::exit(EXIT_CANCELLED);
    }

    // Started as the copy inside the install folder (Apps and features)? Windows cannot delete a
    // running exe, so continue from a temp copy that can remove the whole folder.
    let me = std::env::current_exe().unwrap_or_default();
    let here = me.parent().map(|d| d.to_path_buf()).unwrap_or_default();
    if scenario.is_none() && !from_temp && here.join(".install").join("receipt.toml").is_file() {
        let temp = std::env::temp_dir().join(format!("{}-setup-{}{}", manifest.app.slug, std::process::id(), std::env::consts::EXE_SUFFIX));
        if std::fs::copy(&me, &temp).is_ok() {
            let mut cmd = std::process::Command::new(&temp);
            cmd.args(&args).arg("--install-dir").arg(&here).arg("--from-temp");
            if cmd.spawn().is_ok() {
                return;
            }
        }
        install_dir = Some(here.to_string_lossy().to_string());
    }

    let title = format!("{} {}", manifest.app.name, if uninstall { "Uninstall" } else { "Setup" });
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Setup { manifest, scenario, cancel: Default::default(), install_dir, uninstall })
        .invoke_handler(tauri::generate_handler![setup_info, setup_plan, setup_probe, setup_resolve, setup_install, setup_cancel, setup_launch, setup_uninstall, setup_pick_dir])
        .setup(move |app| {
            if let Some(w) = app.get_webview_window("setup") {
                let _ = w.set_title(&title);
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("could not start the Setup app");
    app.run(move |_, event| {
        if from_temp && matches!(event, tauri::RunEvent::Exit) {
            delete_after_exit(&me);
        }
    });
}

/// The temp copy removes itself once this process has exited.
fn delete_after_exit(exe: &Path) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        // raw_arg: cmd does not understand the \" escaping that .arg() would add
        let _ = std::process::Command::new("cmd")
            .raw_arg(format!("/C \"ping -n 3 127.0.0.1 >NUL & del /f /q \"{}\"\"", exe.display()))
            .creation_flags(CREATE_NO_WINDOW)
            .spawn();
    }
    #[cfg(not(windows))]
    let _ = std::fs::remove_file(exe); // unix can unlink a running binary
}
