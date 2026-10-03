//! Planner, journaled apply with rollback, receipts and uninstall (Sections 16.4, 16.6, 16.13).

use crate::manifest::{eval_when, format_size, parse_size, Manifest, Step};
use crate::system::{exe, Action, System};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};
use std::io::Write;
use std::path::{Path, PathBuf};

/// Exit codes follow Windows Installer conventions on every OS (Section 16.12).
pub const EXIT_OK: i32 = 0;
pub const EXIT_CANCELLED: i32 = 1602;
pub const EXIT_FATAL: i32 = 1603;
pub const EXIT_REBOOT: i32 = 3010;

/// What the user chose: scope, components and options.
#[derive(Debug, Clone, Default)]
pub struct Selection {
    pub scope: String,
    pub components: Vec<String>,
    pub options: BTreeMap<String, toml::Value>,
    pub silent: bool,
    pub install_dir: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Status {
    Satisfied,
    Missing,
    Outdated,
    /// cannot run in this phase; a later phase of the step will pick it up
    Deferred,
    Blocked,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanItem {
    pub id: String,
    pub title: String,
    pub phase: String,
    pub status: Status,
    pub detail: String,
    pub strategy: Option<String>,
    pub actions: Vec<String>,
    pub download: u64,
    pub disk: u64,
    pub network: bool,
    pub elevation: bool,
    pub reboot: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Plan {
    pub target: String,
    pub scope: String,
    pub phase: Option<String>,
    pub items: Vec<PlanItem>,
    pub download: u64,
    pub disk: u64,
    pub elevation: bool,
    pub reboot: bool,
    pub blocked: bool,
}

impl Plan {
    pub fn summary(&self) -> String {
        format!(
            "Download {} · Disk {} · {}{}",
            format_size(self.download),
            format_size(self.disk),
            if self.elevation { "Administrator rights needed" } else { "No admin rights needed" },
            if self.reboot { " · Restart required" } else { "" }
        )
    }
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct StepRecord {
    pub id: String,
    pub phase: String,
    /// true when we changed the system for this step; only those are reversed at uninstall
    pub ours: bool,
    pub strategy: Option<String>,
    pub actions: Vec<Action>,
    pub undo: Vec<Action>,
    /// applied through the elevated helper, so undoing it needs administrator rights too
    pub elevated: bool,
}

/// {installDir}/.install/receipt.toml: the single source for repair, modify and uninstall.
#[derive(Debug, Default, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Receipt {
    pub app: String,
    pub version: String,
    pub scope: String,
    pub components: Vec<String>,
    pub options: BTreeMap<String, toml::Value>,
    /// values steps expose to later steps and to the app, e.g. UV_BIN
    pub exposed: BTreeMap<String, String>,
    pub steps: Vec<StepRecord>,
}

pub(crate) struct Prepared {
    pub(crate) item: PlanItem,
    pub(crate) actions: Vec<Action>,
    /// explicit uninstall actions, run before the inverses of `actions` (stop a service)
    pub(crate) undo: Vec<Action>,
    /// run after the inverses (refresh a cache once the files are gone)
    pub(crate) undo_after: Vec<Action>,
    pub(crate) ours: bool,
    pub(crate) expose: Option<(String, String)>,
    /// a TypeScript step the Setup app has not evaluated
    pub(crate) ts: bool,
}

/// What the Setup app's TypeScript step decided (src-setup/steps): its check and the actions it queued.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct TsStep {
    /// "satisfied" or "missing"
    pub status: String,
    pub detail: String,
    pub actions: Vec<Action>,
    pub undo: Vec<Action>,
}

/// (step id, running | done | ok | deferred | blocked | failed, detail)
pub type StepHook<'a> = Box<dyn FnMut(&str, &str, &str) + 'a>;

pub struct Engine<'a> {
    pub manifest: &'a Manifest,
    pub sys: &'a dyn System,
    pub sel: Selection,
    pub receipt: Receipt,
    /// write receipt and journal to disk (off for simulated runs)
    pub persist: bool,
    pub out: Box<dyn FnMut(&str) + 'a>,
    /// step progress for a UI: (step id, running | done | ok | deferred | blocked | failed, detail)
    pub on_step: StepHook<'a>,
    /// set from another thread to stop between actions; completed steps are rolled back
    pub cancel: std::sync::Arc<std::sync::atomic::AtomicBool>,
    /// how to start this engine elevated: the binary and the arguments before `elevated`
    /// (`fanwit-install` itself, or the Setup exe with `--engine`)
    pub helper: (PathBuf, Vec<String>),
    /// results of TypeScript steps, by step id (filled by the Setup app)
    pub ts_steps: BTreeMap<String, TsStep>,
}

const ARCHIVES: [&str; 5] = [".zip", ".tar.gz", ".tgz", ".tar.xz", ".tar.zst"];

impl<'a> Engine<'a> {
    pub fn new(manifest: &'a Manifest, sys: &'a dyn System, sel: Selection) -> Self {
        Self {
            manifest,
            sys,
            sel,
            receipt: Receipt::default(),
            persist: false,
            out: Box::new(|l| println!("{l}")),
            on_step: Box::new(|_, _, _| {}),
            cancel: Default::default(),
            helper: (std::env::current_exe().unwrap_or_else(|_| "fanwit-install".into()), vec![]),
            ts_steps: BTreeMap::new(),
        }
    }

    pub(crate) fn os(&self) -> String {
        self.sys.os()
    }
    pub(crate) fn machine(&self) -> bool {
        self.sel.scope == "machine"
    }

    // ---------- placeholders (Section 16.5.1) ----------

    fn base_vars(&self) -> BTreeMap<String, String> {
        let app = &self.manifest.app;
        let v = |k: &str| self.sys.var(k).unwrap_or_default();
        let home = self.sys.var("HOME").or_else(|| self.sys.var("USERPROFILE")).unwrap_or_default();
        let mut m = BTreeMap::new();
        let (install, app_data, bin, start, desktop) = match (self.os().as_str(), self.machine()) {
            ("windows", false) => (format!("{}\\Programs\\{}", v("LOCALAPPDATA"), app.name), format!("{}\\{}", v("APPDATA"), app.id), String::new(), format!("{}\\Microsoft\\Windows\\Start Menu\\Programs", v("APPDATA")), format!("{home}\\Desktop")),
            ("windows", true) => (format!("{}\\{}", v("ProgramFiles"), app.name), format!("{}\\{}", v("APPDATA"), app.id), String::new(), format!("{}\\Microsoft\\Windows\\Start Menu\\Programs", v("ProgramData")), format!("{home}\\Desktop")),
            ("macos", false) => (format!("{home}/Applications"), format!("{home}/Library/Application Support/{}", app.id), format!("{home}/.local/bin"), format!("{home}/Applications"), format!("{home}/Desktop")),
            ("macos", true) => ("/Applications".into(), format!("{home}/Library/Application Support/{}", app.id), "/usr/local/bin".into(), "/Applications".into(), format!("{home}/Desktop")),
            (_, false) => (format!("{home}/.local/share/{}", app.slug), format!("{home}/.local/share/{}", app.id), format!("{home}/.local/bin"), format!("{home}/.local/share/applications"), format!("{home}/Desktop")),
            (_, true) => (format!("/opt/{}", app.slug), format!("{home}/.local/share/{}", app.id), "/usr/bin".into(), "/usr/share/applications".into(), format!("{home}/Desktop")),
        };
        let install = self.sel.install_dir.clone().unwrap_or(install);
        let bin = if bin.is_empty() { format!("{install}\\bin") } else { bin };
        let tools = if self.os() == "linux" && self.machine() { format!("{install}/tools") } else if self.os() == "windows" { format!("{app_data}\\tools") } else { format!("{app_data}/tools") };
        for (k, val) in [("id", app.id.clone()), ("name", app.name.clone()), ("slug", app.slug.clone()), ("installDir", install), ("appData", app_data), ("binDir", bin), ("tools", tools), ("startMenu", start), ("desktop", desktop), ("home", home)] {
            m.insert(k.to_string(), val);
        }
        m.insert("temp".into(), self.sys.var("TEMP").or_else(|| self.sys.var("TMPDIR")).unwrap_or_else(|| "/tmp".into()));
        m
    }

    /// Resolve `{placeholder}` and `{env.NAME}` in a path, with native separators.
    pub fn path(&self, s: &str, exposed: &BTreeMap<String, String>) -> String {
        let vars = self.base_vars();
        let r = regex::Regex::new(r"\{([\w.]+)\}").unwrap();
        // placeholders may nest ({binDir} is {installDir}\bin), so resolve until stable
        let mut cur = s.to_string();
        for _ in 0..4 {
            let next = r
                .replace_all(&cur, |c: &regex::Captures| {
                    let k = &c[1];
                    match k.strip_prefix("env.") {
                        Some(e) => exposed.get(e).cloned().or_else(|| self.sys.var(e)).unwrap_or_else(|| c[0].to_string()),
                        None => vars.get(k).cloned().unwrap_or_else(|| c[0].to_string()),
                    }
                })
                .to_string();
            if next == cur {
                break;
            }
            cur = next;
        }
        if self.os() == "windows" { cur.replace('/', "\\") } else { cur }
    }

    /// Split a command into words first, so resolved paths with spaces stay one argument.
    pub(crate) fn command(&self, s: &str, exposed: &BTreeMap<String, String>) -> Vec<String> {
        let mut words = vec![];
        let mut cur = String::new();
        let mut quote = None;
        for c in s.chars() {
            match (c, quote) {
                ('"' | '\'', None) => quote = Some(c),
                (c, Some(q)) if c == q => quote = None,
                (c, None) if c.is_whitespace() => {
                    if !cur.is_empty() {
                        words.push(std::mem::take(&mut cur));
                    }
                }
                (c, _) => cur.push(c),
            }
        }
        if !cur.is_empty() {
            words.push(cur);
        }
        words.into_iter().map(|w| if w.contains('{') { self.path(&w, exposed) } else { w }).collect()
    }

    // ---------- selection ----------

    fn truthy(&self, id: &str) -> bool {
        if let Some(c) = id.strip_prefix("component.") {
            return self.sel.components.iter().any(|x| x == c);
        }
        if let Some(o) = id.strip_prefix("os.") {
            return self.os() == o;
        }
        match id {
            "silent" => return self.sel.silent,
            "machine" => return self.machine(),
            _ => {}
        }
        match self.sel.options.get(id.strip_prefix("option.").unwrap_or(id)) {
            Some(toml::Value::Boolean(b)) => *b,
            Some(toml::Value::String(s)) => !s.is_empty(),
            Some(toml::Value::Integer(i)) => *i != 0,
            Some(_) => true,
            None => false,
        }
    }

    fn applies(&self, s: &Step, phase: Option<&str>) -> bool {
        (s.platforms.is_empty() || s.platforms.contains(&self.os()))
            && s.component.as_ref().map(|c| self.sel.components.contains(c)).unwrap_or(true)
            && s.when.as_ref().map(|w| eval_when(w, &|id| self.truthy(id))).unwrap_or(true)
            && match phase {
                Some(p) => s.phases.iter().any(|x| x == p),
                None => s.phases.iter().any(|x| x != "build" && x != "uninstall"),
            }
    }

    // ---------- steps ----------

    fn prepare(&self, s: &Step, phase: Option<&str>, exposed: &BTreeMap<String, String>) -> Prepared {
        let phase_name = phase.map(String::from).unwrap_or_else(|| s.phases.iter().find(|p| *p != "build" && *p != "uninstall").cloned().unwrap_or_default());
        let mut p = Prepared {
            item: PlanItem {
                id: s.id.clone(),
                title: if s.title.is_empty() { s.id.clone() } else { s.title.clone() },
                phase: phase_name.clone(),
                status: Status::Missing,
                detail: String::new(),
                strategy: None,
                actions: vec![],
                download: 0,
                disk: s.requires.disk.as_deref().map(parse_size).unwrap_or(0),
                network: s.requires.network,
                elevation: s.requires.elevation,
                reboot: s.requires.reboot,
            },
            actions: vec![],
            undo: vec![],
            undo_after: vec![],
            ours: true,
            expose: None,
            ts: false,
        };
        let os = self.os();
        match s.kind.as_str() {
            "prereq" => self.prepare_prereq(s, &mut p, exposed),
            "run" => {
                let unresolved = |c: &str| regex::Regex::new(r"\{env\.(\w+)\}").unwrap().captures(c).filter(|m| !exposed.contains_key(&m[1]) && self.sys.var(&m[1]).is_none()).map(|m| m[1].to_string());
                if let Some(v) = s.apply.as_ref().and_then(|a| unresolved(&a.command)) {
                    block(&mut p, &format!("waits for {v} from an earlier step"));
                } else if let Some(c) = &s.check {
                    if self.sys.exec(&self.command(&c.command, exposed), &BTreeMap::new()).code == c.success {
                        p.item.status = Status::Satisfied;
                    }
                }
                if let Some(a) = s.apply.as_ref().filter(|_| p.item.status != Status::Blocked) {
                    let env = a.env.iter().map(|(k, v)| (k.clone(), self.path(v, exposed))).collect();
                    p.actions.push(Action::Exec { command: self.command(&a.command, exposed), env, optional: false });
                }
            }
            "download" => match s.fetch_for(&os, &self.sys.arch()) {
                Some(f) => {
                    let to = self.path(s.install_to.as_deref().unwrap_or("{appData}/downloads/{id}"), exposed).replace("{id}", &s.id);
                    if self.sys.file_sha256(Path::new(&to)).map(|h| h.eq_ignore_ascii_case(&f.sha256)).unwrap_or(false) {
                        p.item.status = Status::Satisfied;
                    }
                    p.item.download = f.size.as_deref().map(parse_size).unwrap_or(0);
                    p.item.network = true;
                    p.actions.push(Action::Download { url: f.url.clone(), sha256: f.sha256.clone(), to });
                }
                None => block(&mut p, &format!("no download for {os}-{}", self.sys.arch())),
            },
            "sidecar" => {
                let name = sidecar_name(s);
                let to = self.path(&format!("{}/{}", s.install_to.as_deref().unwrap_or("{tools}"), exe(&name, &os)), exposed);
                if self.sys.file_sha256(Path::new(&to)).is_some() {
                    p.item.status = Status::Satisfied;
                } else if let Some(from) = self.sys.sidecar(&name) {
                    p.actions.push(Action::Copy { from: from.to_string_lossy().into(), to: to.clone() });
                } else {
                    block(&mut p, &format!("sidecar {name} is not bundled for this target"));
                }
                p.expose = s.expose.clone().map(|e| (e, to));
            }
            "path" => {
                let target = self.path(s.target.as_deref().unwrap_or_default(), exposed);
                let target = if os == "windows" && !split_path(&target).1.contains('.') { format!("{target}.exe") } else { target };
                p.item.elevation |= self.machine();
                let sep = if os == "windows" { ';' } else { ':' };
                let on_path = |dir: &str| self.sys.var("PATH").map(|v| v.split(sep).any(|d| d.trim_end_matches(['\\', '/']) == dir)).unwrap_or(false);
                if os == "windows" {
                    // add the folder itself: the CLI finds the GUI binary next to it
                    let dir = split_path(&target).0.to_string();
                    if on_path(&dir) {
                        p.item.status = Status::Satisfied;
                    }
                    p.actions.push(Action::PathAdd { dir, machine: self.machine() });
                } else {
                    let name = split_path(&target).1.to_string();
                    let bin_dir = self.path("{binDir}", exposed);
                    let link = format!("{bin_dir}/{name}");
                    if self.sys.file_sha256(Path::new(&link)).is_some() {
                        p.item.status = Status::Satisfied;
                    }
                    if !on_path(&bin_dir) {
                        p.item.detail = format!("{bin_dir} is not on PATH; add it in your shell profile");
                    }
                    p.actions.push(Action::Symlink { target, link });
                }
            }
            _ => self.prepare_system(s, &mut p, exposed),
        }
        // explicit uninstall (run steps): { remove = "..." } or { command = "..." }
        if let Some(toml::Value::Table(t)) = &s.uninstall {
            if let Some(toml::Value::String(r)) = t.get("remove") {
                p.undo.push(Action::Remove { path: self.path(r, exposed) });
            }
            if let Some(toml::Value::String(c)) = t.get("command") {
                p.undo.push(Action::exec(self.command(c, exposed)));
            }
        }
        if matches!(&s.uninstall, Some(toml::Value::String(v)) if v == "never") {
            p.ours = false;
        }
        // a step that cannot run now but has a later phase is deferred, not fatal (Figure 16.3)
        if p.item.status == Status::Blocked {
            let later = s.phases.iter().skip_while(|x| **x != phase_name).skip(1).find(|x| *x != "uninstall");
            if let Some(l) = later {
                p.item.status = Status::Deferred;
                p.item.detail = format!("{}; will retry in {l}", p.item.detail);
            }
        }
        if p.item.status == Status::Satisfied {
            p.actions.clear();
        }
        p.item.actions = p.actions.iter().map(Action::describe).collect();
        if !matches!(p.item.status, Status::Missing | Status::Outdated) {
            p.item.download = 0;
            p.item.disk = 0;
        }
        p
    }

    fn prepare_prereq(&self, s: &Step, p: &mut Prepared, exposed: &BTreeMap<String, String>) {
        let d = s.detect.as_ref().expect("validated");
        let words = self.command(&d.command, exposed);
        // try what an earlier phase installed first, then PATH
        let mut candidates = vec![];
        if let Some(prev) = s.expose.as_ref().and_then(|e| exposed.get(e)) {
            let mut w = words.clone();
            w[0] = prev.clone();
            candidates.push(w);
        }
        candidates.push(words);
        for cmd in &candidates {
            let o = self.sys.exec(cmd, &BTreeMap::new());
            if o.code != 0 {
                continue;
            }
            let version = d.parse.as_ref().and_then(|re| regex::Regex::new(re).ok()?.captures(&o.stdout)?.get(1).map(|m| m.as_str().to_string()));
            let ok = match (&d.require, &version) {
                (Some(req), Some(v)) => semver::VersionReq::parse(req).ok().zip(semver::Version::parse(v).ok()).map(|(r, v)| r.matches(&v)).unwrap_or(false),
                (Some(_), None) => false,
                (None, _) => true,
            };
            let v = version.unwrap_or_default();
            if ok {
                p.item.status = Status::Satisfied;
                p.item.detail = format!("{} {v} found, will be used", s.bin_name());
                p.item.strategy = Some("existing".into());
                p.ours = false;
                if let (Some(e), Some(path)) = (&s.expose, self.sys.which(&cmd[0])) {
                    p.expose = Some((e.clone(), path.to_string_lossy().into()));
                }
                return;
            }
            p.item.status = Status::Outdated;
            p.item.detail = format!("{} {v} found, {} required", s.bin_name(), d.require.as_deref().unwrap_or("another version"));
        }
        let os = self.os();
        let install_to = self.path(s.install_to.as_deref().unwrap_or("{tools}"), exposed);
        let bin = exe(s.bin_name(), &os);
        let dest = self.path(&format!("{install_to}/{bin}"), exposed);
        p.undo = if matches!(&s.uninstall, Some(toml::Value::String(v)) if v == "never") { vec![] } else { vec![Action::Remove { path: install_to.clone() }] };
        p.expose = s.expose.clone().map(|e| (e, dest.clone()));
        let strategies = if s.strategies.is_empty() { vec!["existing".to_string(), "sidecar".into(), "download".into()] } else { s.strategies.clone() };
        for strategy in strategies {
            match strategy.as_str() {
                "sidecar" => {
                    if let Some(from) = self.sys.sidecar(&sidecar_name(s)) {
                        p.actions = vec![Action::Copy { from: from.to_string_lossy().into(), to: dest }];
                        p.item.strategy = Some(strategy);
                        p.item.detail = format!("{} will be installed from the bundled copy", s.bin_name());
                        return;
                    }
                }
                "download" => {
                    let Some(f) = s.fetch_for(&os, &self.sys.arch()) else { continue };
                    if !self.sys.online(&f.url) {
                        continue;
                    }
                    let file = f.url.rsplit('/').next().unwrap_or("download");
                    p.item.download = f.size.as_deref().map(parse_size).unwrap_or(0);
                    p.item.disk += p.item.download;
                    p.item.network = true;
                    p.item.strategy = Some(strategy);
                    p.item.detail = format!("{} will be installed ({})", s.bin_name(), format_size(p.item.download));
                    if ARCHIVES.iter().any(|a| file.ends_with(a)) {
                        let archive = self.path(&format!("{{temp}}/{file}"), exposed);
                        p.actions = vec![
                            Action::Download { url: f.url.clone(), sha256: f.sha256.clone(), to: archive.clone() },
                            Action::Extract { archive: archive.clone(), to: install_to },
                            Action::Remove { path: archive },
                        ];
                    } else {
                        p.actions = vec![Action::Download { url: f.url.clone(), sha256: f.sha256.clone(), to: dest }];
                    }
                    return;
                }
                _ => {}
            }
        }
        let offline = s.fetch_for(&os, &self.sys.arch()).map(|f| !self.sys.online(&f.url)).unwrap_or(false);
        block(p, &format!("{} is missing, no bundled copy for this target{}", s.bin_name(), if offline { " and no network" } else { "" }));
    }

    // ---------- plan ----------

    pub fn plan(&self, phase: Option<&str>) -> Result<Plan, String> {
        let mut exposed = self.receipt.exposed.clone();
        let mut items = vec![];
        let m = self.manifest;
        for s in m.ordered()? {
            if !self.applies(s, phase) {
                continue;
            }
            let p = self.prepare(s, phase, &exposed);
            if let Some((k, v)) = p.expose.filter(|_| matches!(p.item.status, Status::Satisfied | Status::Missing | Status::Outdated)) {
                exposed.insert(k, v); // predicted, so later checks and commands see it
            }
            items.push(p.item);
        }
        let pending = || items.iter().filter(|i| matches!(i.status, Status::Missing | Status::Outdated));
        Ok(Plan {
            target: format!("{}-{}", self.os(), self.sys.arch()),
            scope: self.sel.scope.clone(),
            phase: phase.map(String::from),
            download: pending().map(|i| i.download).sum(),
            disk: pending().map(|i| i.disk).sum(),
            elevation: pending().any(|i| i.elevation),
            reboot: pending().any(|i| i.reboot),
            blocked: items.iter().any(|i| i.status == Status::Blocked),
            items,
        })
    }

    // ---------- apply ----------

    fn journal(&self, step: &str, state: &str, action: &Action) {
        if !self.persist {
            return;
        }
        let dir = PathBuf::from(self.path("{installDir}/.install", &BTreeMap::new()));
        let _ = std::fs::create_dir_all(&dir);
        let t = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
        let line = serde_json::json!({ "t": t, "step": step, "state": state, "action": action });
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(dir.join("journal.jsonl")) {
            let _ = writeln!(f, "{line}");
        }
    }

    /// The undo list of a step: its explicit undo, the inverses of what it did (minus those an
    /// explicit removal of a parent folder covers), then its after-undo.
    fn make_record(&self, s: &Step, p: &Prepared, phase: &str, actions: Vec<Action>, elevated: bool) -> StepRecord {
        let covered = |a: &Action| p.undo.iter().any(|u| matches!((u, a), (Action::Remove { path: parent }, Action::Remove { path }) if Path::new(path).starts_with(parent)));
        let inverses: Vec<Action> = actions.iter().rev().filter_map(Action::inverse).filter(|a| !covered(a)).collect();
        let undo = if p.ours { p.undo.iter().cloned().chain(inverses).chain(p.undo_after.iter().cloned()).collect() } else { vec![] };
        StepRecord { id: s.id.clone(), phase: phase.into(), ours: p.ours, strategy: p.item.strategy.clone(), actions, undo, elevated }
    }

    fn expose_after(&mut self, s: &Step, p: &Prepared) {
        if let Some((k, mut v)) = p.expose.clone() {
            // archives often nest a folder; record where the binary really is
            if let Some(Action::Extract { to, .. }) = p.actions.iter().find(|a| matches!(a, Action::Extract { .. })) {
                if let Some(found) = self.sys.find_bin(Path::new(to), s.bin_name()) {
                    v = found.to_string_lossy().into();
                }
            }
            self.receipt.exposed.insert(k, v);
        }
    }

    /// Runs one phase. Returns an exit code; on failure every step applied in this run is rolled back.
    pub fn run(&mut self, phase: &str, only: Option<&str>, dry_run: bool) -> Result<i32, String> {
        let m = self.manifest;
        let steps: Vec<&Step> = m.ordered()?.into_iter().filter(|s| self.applies(s, Some(phase)) && only.map(|o| o == s.id).unwrap_or(true)).collect();
        if let Some(o) = only {
            if steps.is_empty() {
                return Err(format!("step {o} does not run in phase {phase} for this selection"));
            }
        }
        let mut session: Vec<StepRecord> = vec![];
        let mut reboot = false;
        let total = steps.len();
        // steps an elevated batch already applied
        let mut batched: HashSet<String> = HashSet::new();
        for (n, s) in steps.iter().enumerate() {
            if batched.contains(&s.id) {
                continue;
            }
            if self.cancel.load(std::sync::atomic::Ordering::SeqCst) {
                (self.out)("Cancelled");
                self.rollback(&session);
                return Ok(EXIT_CANCELLED);
            }
            let p = self.prepare(s, Some(phase), &self.receipt.exposed.clone());
            let label = format!("[{}/{total}] {}", n + 1, p.item.title);
            match p.item.status {
                Status::Satisfied => {
                    (self.out)(&format!("{label} ... {}", if p.item.detail.is_empty() { "ok" } else { &p.item.detail }));
                    (self.on_step)(&s.id, "ok", &p.item.detail);
                    if let Some((k, v)) = p.expose {
                        self.receipt.exposed.insert(k, v);
                    }
                    if !self.receipt.steps.iter().any(|r| r.id == s.id) {
                        session.push(StepRecord { id: s.id.clone(), phase: phase.into(), ours: false, strategy: p.item.strategy, ..Default::default() });
                    }
                    continue;
                }
                Status::Deferred => {
                    (self.out)(&format!("{label} ... deferred: {}", p.item.detail));
                    (self.on_step)(&s.id, "deferred", &p.item.detail);
                    continue;
                }
                Status::Blocked => {
                    (self.out)(&format!("{label} ... blocked: {}", p.item.detail));
                    (self.on_step)(&s.id, "blocked", &p.item.detail);
                    self.rollback(&session);
                    return Ok(EXIT_FATAL);
                }
                Status::Missing | Status::Outdated => {}
            }
            if dry_run {
                let admin_note = if p.item.elevation && !self.sys.admin() { " (as administrator)" } else { "" };
                (self.out)(&format!("{label} ... would {}{admin_note}", if p.item.actions.is_empty() { "do nothing".into() } else { p.item.actions.join(", then ") }));
                if let Some((k, v)) = p.expose {
                    self.receipt.exposed.insert(k, v);
                }
                continue;
            }
            if p.item.elevation && !self.sys.admin() {
                // one prompt for this step and every later elevated step whose dependencies are met
                let mut ready: HashSet<String> = session.iter().map(|r| r.id.clone()).chain([s.id.clone()]).collect();
                let in_phase: HashSet<&str> = steps.iter().map(|x| x.id.as_str()).collect();
                let mut exposed = self.receipt.exposed.clone();
                if let Some((k, v)) = &p.expose {
                    exposed.insert(k.clone(), v.clone());
                }
                let mut batch = vec![(*s, p)];
                for later in &steps[n + 1..] {
                    if !later.after.iter().all(|a| ready.contains(a) || !in_phase.contains(a.as_str())) {
                        continue;
                    }
                    let lp = self.prepare(later, Some(phase), &exposed);
                    if lp.item.elevation && matches!(lp.item.status, Status::Missing | Status::Outdated) {
                        if let Some((k, v)) = &lp.expose {
                            exposed.insert(k.clone(), v.clone());
                        }
                        ready.insert(later.id.clone());
                        batch.push((*later, lp));
                    }
                }
                match self.run_elevated_batch(phase, &batch, &mut session) {
                    Ok(()) => {
                        for (bs, bp) in &batch {
                            batched.insert(bs.id.clone());
                            reboot |= bp.item.reboot;
                        }
                    }
                    Err(code) => {
                        self.rollback(&session);
                        return Ok(code);
                    }
                }
                continue;
            }
            (self.out)(&format!("{label} ..."));
            (self.on_step)(&s.id, "running", &p.item.detail);
            let mut done = vec![];
            let mut failed = None;
            for a in &p.actions {
                (self.out)(&format!("  {}", a.describe()));
                self.journal(&s.id, "begin", a);
                // record first, so a half done action is still undone
                done.push(a.clone());
                if let Err(e) = self.sys.perform(a) {
                    self.journal(&s.id, "failed", a);
                    failed = Some(e);
                    break;
                }
                self.journal(&s.id, "done", a);
            }
            let rec = self.make_record(s, &p, phase, done, false);
            if let Some(e) = failed {
                (self.out)(&format!("  failed: {e}"));
                (self.on_step)(&s.id, "failed", &e);
                session.push(rec);
                self.rollback(&session);
                return Ok(EXIT_FATAL);
            }
            self.expose_after(s, &p);
            (self.out)("  done");
            (self.on_step)(&s.id, "done", "");
            reboot |= p.item.reboot;
            session.push(rec);
        }
        if dry_run {
            return Ok(EXIT_OK);
        }
        for rec in session {
            // keep the original install order, uninstall reverses it
            match self.receipt.steps.iter_mut().find(|r| r.id == rec.id) {
                Some(r) => *r = rec,
                None => self.receipt.steps.push(rec),
            }
        }
        self.receipt.app = self.manifest.app.id.clone();
        self.receipt.version = self.manifest.app.version.clone();
        self.receipt.scope = self.sel.scope.clone();
        self.receipt.components = self.sel.components.clone();
        self.receipt.options = self.sel.options.clone();
        self.save_receipt()?;
        Ok(if reboot { EXIT_REBOOT } else { EXIT_OK })
    }

    /// Apply steps through the elevated helper: one administrator prompt for the batch.
    fn run_elevated_batch(&mut self, phase: &str, batch: &[(&Step, Prepared)], session: &mut Vec<StepRecord>) -> Result<(), i32> {
        let titles: Vec<&str> = batch.iter().map(|(_, p)| p.item.title.as_str()).collect();
        (self.out)(&format!("Asking for administrator rights for: {}", titles.join(", ")));
        for (s, p) in batch {
            (self.on_step)(&s.id, "running", "as administrator");
            for a in &p.actions {
                (self.out)(&format!("  {} (as administrator)", a.describe()));
                self.journal(&s.id, "begin-elevated", a);
            }
        }
        let steps = batch.iter().map(|(s, p)| crate::elevate::ElevatedStep { id: s.id.clone(), actions: p.actions.clone() }).collect();
        match crate::elevate::request(self.sys, &self.helper, steps, false, self.persist) {
            Ok(r) if r.ok => {
                for (s, p) in batch {
                    for a in &p.actions {
                        self.journal(&s.id, "done-elevated", a);
                    }
                    session.push(self.make_record(s, p, phase, p.actions.clone(), true));
                    self.expose_after(s, p);
                    (self.on_step)(&s.id, "done", "");
                }
                (self.out)("  done");
                Ok(())
            }
            Ok(r) => {
                // the helper undid its own work before reporting
                let (step, err) = r.failed.unwrap_or_default();
                (self.out)(&format!("  failed: {err}"));
                (self.on_step)(&step, "failed", &err);
                Err(EXIT_FATAL)
            }
            Err(code) if code == EXIT_CANCELLED => {
                (self.out)("  administrator rights were not granted");
                for (s, _) in batch {
                    (self.on_step)(&s.id, "blocked", "administrator rights were not granted");
                }
                Err(EXIT_CANCELLED)
            }
            Err(code) => {
                (self.out)(&format!("  the elevated helper failed ({code})"));
                Err(EXIT_FATAL)
            }
        }
    }

    fn rollback(&mut self, session: &[StepRecord]) {
        if session.is_empty() {
            return;
        }
        (self.out)("Rolling back");
        self.undo_records(session);
    }

    /// Undo records in reverse order. Runs of elevated records share one administrator prompt.
    fn undo_records(&mut self, records: &[StepRecord]) {
        let admin = self.sys.admin();
        let mut i = records.len();
        while i > 0 {
            let rec = &records[i - 1];
            if rec.elevated && !admin {
                // the contiguous elevated records before this one go in the same batch
                let mut j = i;
                while j > 0 && records[j - 1].elevated {
                    j -= 1;
                }
                let group: Vec<_> = records[j..i].iter().rev().filter(|r| !r.undo.is_empty()).map(|r| crate::elevate::ElevatedStep { id: r.id.clone(), actions: r.undo.clone() }).collect();
                for r in records[j..i].iter().rev() {
                    for a in &r.undo {
                        self.journal(&r.id, "undo-elevated", a);
                    }
                }
                if !group.is_empty() {
                    match crate::elevate::request(self.sys, &self.helper, group, true, self.persist) {
                        Ok(r) => {
                            for w in r.warnings {
                                (self.out)(&format!("  warning: {w}"));
                            }
                        }
                        Err(code) => (self.out)(&format!("  warning: could not undo the administrator steps ({code}); run the uninstaller as administrator")),
                    }
                }
                i = j;
                continue;
            }
            for a in &rec.undo {
                self.journal(&rec.id, "undo", a);
                if let Err(e) = self.sys.perform(a) {
                    (self.out)(&format!("  warning: {e}"));
                }
            }
            i -= 1;
        }
    }

    /// Reverse every step the receipt says is ours, in reverse order. User documents are never touched.
    pub fn uninstall(&mut self, purge: bool) -> Result<i32, String> {
        let steps: Vec<StepRecord> = std::mem::take(&mut self.receipt.steps).into_iter().filter(|r| r.ours).collect();
        for rec in steps.iter().rev() {
            (self.out)(&format!("Removing {}", rec.id));
        }
        self.undo_records(&steps);
        let mut last = vec![Action::Remove { path: self.path("{installDir}/.install", &BTreeMap::new()) }];
        if purge {
            last.push(Action::Remove { path: self.path("{appData}", &BTreeMap::new()) });
        }
        for a in &last {
            (self.out)(&format!("  {}", a.describe()));
            let _ = self.sys.perform(a);
        }
        Ok(EXIT_OK)
    }

    pub fn receipt_path(&self) -> PathBuf {
        PathBuf::from(self.path("{installDir}/.install/receipt.toml", &BTreeMap::new()))
    }

    pub fn load_receipt(&mut self) {
        if let Ok(t) = std::fs::read_to_string(self.receipt_path()) {
            if let Ok(r) = toml::from_str(&t) {
                self.receipt = r;
            }
        }
    }

    fn save_receipt(&self) -> Result<(), String> {
        if !self.persist {
            return Ok(());
        }
        let p = self.receipt_path();
        std::fs::create_dir_all(p.parent().unwrap()).map_err(|e| e.to_string())?;
        let text = toml::to_string(&self.receipt).map_err(|e| e.to_string())?;
        std::fs::write(&p, format!("# Written by fanwit-install. Do not edit: uninstall and repair read it.\n{text}")).map_err(|e| e.to_string())
    }
}

/// (folder, file name) of a path in either separator style: a simulated Windows install planned
/// on Linux has backslashes that `Path` there does not split.
pub(crate) fn split_path(p: &str) -> (&str, &str) {
    match p.rfind(['/', '\\']) {
        Some(i) => (&p[..i], &p[i + 1..]),
        None => ("", p),
    }
}

pub(crate) fn block(p: &mut Prepared, why: &str) {
    p.item.status = Status::Blocked;
    p.item.detail = why.to_string();
    p.actions.clear();
}

fn sidecar_name(s: &Step) -> String {
    s.sidecar.as_deref().map(|x| x.rsplit(['/', '\\']).next().unwrap_or(x).to_string()).unwrap_or_else(|| s.bin_name().to_string())
}
