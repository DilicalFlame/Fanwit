//! The elevated helper (Section 16.9.3). The engine itself never runs as administrator: when a
//! step needs it, the actions of that step (and of the other elevated steps that can join it) go
//! into a plan file, and a second copy of the engine is started with administrator rights to
//! perform exactly those actions and exit.
//!
//! - Windows: UAC (`Start-Process -Verb RunAs`), macOS: the authorisation dialog (`osascript ...
//!   with administrator privileges`), Linux: polkit (`pkexec`), else an interactive `sudo`.
//! - The parent puts the SHA-256 of the plan file on the helper's command line, which a process
//!   without administrator rights cannot change once the prompt is shown. The helper refuses a
//!   plan whose digest differs, and plans expire after ten minutes.
//! - A failed batch is undone by the helper before it reports, so the parent only rolls back its
//!   own work.

use crate::engine::EXIT_CANCELLED;
use crate::system::{Action, System};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

const LIFETIME_SECS: u64 = 600;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElevatedStep {
    pub id: String,
    pub actions: Vec<Action>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ElevatedPlan {
    pub version: u32,
    pub session: String,
    /// unix seconds
    pub expires: u64,
    /// undo work: keep going after an error and report it as a warning
    pub tolerant: bool,
    pub steps: Vec<ElevatedStep>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct ElevatedResult {
    pub ok: bool,
    /// (step id, error) of the action that failed
    pub failed: Option<(String, String)>,
    pub warnings: Vec<String>,
}

fn now() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn session_id() -> String {
    let nanos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    hex::encode(&Sha256::digest(format!("{nanos}:{}", std::process::id()))[..12])
}

fn result_path(plan: &Path) -> PathBuf {
    plan.with_extension("result.json")
}

/// A private folder per session. Loose files in a shared /tmp do not work: with Linux's
/// protected_regular, root may not open a file another user created there.
fn session_dir(session: &str) -> std::io::Result<PathBuf> {
    let dir = std::env::temp_dir().join(format!("fanwit-elevate-{session}"));
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// Ask for administrator rights and perform `steps` in the helper. In a simulation (`persist`
/// false) the actions run in process after the simulated prompt.
pub fn request(sys: &dyn System, helper: &(PathBuf, Vec<String>), steps: Vec<ElevatedStep>, tolerant: bool, persist: bool) -> Result<ElevatedResult, i32> {
    if !persist {
        let code = sys.run_elevated(&helper.0, &[]).map_err(|_| crate::engine::EXIT_FATAL)?;
        if code == EXIT_CANCELLED {
            return Err(EXIT_CANCELLED);
        }
        return Ok(perform(sys, &steps, tolerant));
    }
    let plan = ElevatedPlan { version: 1, session: session_id(), expires: now() + LIFETIME_SECS, tolerant, steps };
    let bytes = serde_json::to_vec_pretty(&plan).map_err(|_| crate::engine::EXIT_FATAL)?;
    let digest = hex::encode(Sha256::digest(&bytes));
    let dir = session_dir(&plan.session).map_err(|_| crate::engine::EXIT_FATAL)?;
    let file = dir.join("plan.json");
    std::fs::write(&file, &bytes).map_err(|_| crate::engine::EXIT_FATAL)?;
    let mut args = helper.1.clone();
    args.extend(["elevated".into(), "--plan".into(), file.to_string_lossy().to_string(), "--sha256".into(), digest]);
    let code = sys.run_elevated(&helper.0, &args);
    let result = std::fs::read_to_string(result_path(&file)).ok().and_then(|t| serde_json::from_str::<ElevatedResult>(&t).ok());
    let _ = std::fs::remove_dir_all(&dir);
    match (code, result) {
        (Ok(c), _) if c == EXIT_CANCELLED => Err(EXIT_CANCELLED),
        (_, Some(r)) => Ok(r),
        (Ok(c), None) => Err(if c == 0 { crate::engine::EXIT_FATAL } else { c }),
        (Err(_), None) => Err(crate::engine::EXIT_FATAL),
    }
}

/// Perform the steps in order; unless tolerant, undo everything on the first error.
fn perform(sys: &dyn System, steps: &[ElevatedStep], tolerant: bool) -> ElevatedResult {
    let mut done: Vec<&Action> = vec![];
    let mut result = ElevatedResult { ok: true, ..Default::default() };
    for step in steps {
        for a in &step.actions {
            match sys.perform(a) {
                Ok(()) => done.push(a),
                Err(e) if tolerant => result.warnings.push(e),
                Err(e) => {
                    for d in done.iter().rev() {
                        if let Some(inv) = d.inverse() {
                            if let Err(w) = sys.perform(&inv) {
                                result.warnings.push(w);
                            }
                        }
                    }
                    result.ok = false;
                    result.failed = Some((step.id.clone(), e));
                    return result;
                }
            }
        }
    }
    result
}

/// The helper side: `fanwit-install elevated --plan FILE --sha256 HEX`. Returns the exit code.
pub fn run_helper(sys: &dyn System, plan_path: &Path, expected: &str) -> i32 {
    let fail = |msg: String| {
        let r = ElevatedResult { ok: false, failed: Some((String::new(), msg)), ..Default::default() };
        let _ = std::fs::write(result_path(plan_path), serde_json::to_vec(&r).unwrap_or_default());
        crate::engine::EXIT_FATAL
    };
    let Ok(bytes) = std::fs::read(plan_path) else { return fail(format!("cannot read {}", plan_path.display())) };
    if !hex::encode(Sha256::digest(&bytes)).eq_ignore_ascii_case(expected) {
        return fail("the plan file changed after it was signed; refusing to run it".into());
    }
    let plan: ElevatedPlan = match serde_json::from_slice(&bytes) {
        Ok(p) => p,
        Err(e) => return fail(format!("invalid plan: {e}")),
    };
    if plan.version != 1 || plan.expires < now() {
        return fail("the plan expired; start the install again".into());
    }
    let result = perform(sys, &plan.steps, plan.tolerant);
    let code = if result.ok { 0 } else { crate::engine::EXIT_FATAL };
    let _ = std::fs::write(result_path(plan_path), serde_json::to_vec(&result).unwrap_or_default());
    code
}

/// Run an engine command line with administrator rights (the whole run, for the machine scope)
/// and stream its log here while it works. Returns its exit code.
pub fn rerun_elevated(helper: &(PathBuf, Vec<String>), args: &[String], out: &mut dyn FnMut(&str)) -> i32 {
    let Ok(dir) = session_dir(&session_id()) else { return crate::engine::EXIT_FATAL };
    let log = dir.join("run.log");
    let _ = std::fs::write(&log, b"");
    let mut full = helper.1.clone();
    full.extend(args.iter().cloned());
    full.extend(["--log".into(), log.to_string_lossy().to_string(), "--elevated-child".into()]);
    let exe = helper.0.clone();
    let (tx, rx) = std::sync::mpsc::channel();
    // the prompt and the child run on their own thread so we can follow the log
    std::thread::scope(|scope| {
        scope.spawn(|| {
            let _ = tx.send(sys_run(&crate::system::Real, &exe, &full));
        });
        let mut seen = 0usize;
        loop {
            let finished = rx.try_recv().ok();
            if let Ok(text) = std::fs::read_to_string(&log) {
                for line in text[seen.min(text.len())..].lines() {
                    out(line);
                }
                seen = text.len();
            }
            if let Some(code) = finished {
                let _ = std::fs::remove_dir_all(&dir);
                return code;
            }
            std::thread::sleep(std::time::Duration::from_millis(200));
        }
    })
}

fn sys_run(sys: &dyn System, exe: &Path, args: &[String]) -> i32 {
    sys.run_elevated(exe, args).unwrap_or_else(|e| {
        eprintln!("{e}");
        crate::engine::EXIT_FATAL
    })
}
