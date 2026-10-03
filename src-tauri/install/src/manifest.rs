//! installer.toml: components, options, pages and steps (Section 16.5).

use serde::Deserialize;
use std::collections::{BTreeMap, HashSet};

pub const PHASES: [&str; 6] = ["build", "bootstrap", "package", "firstRun", "update", "uninstall"];
pub const STEP_TYPES: [&str; 18] = [
    "prereq", "download", "sidecar", "run", "path", "shortcut", "fileAssociation", "urlScheme", "autostart", "service", "env", "registry", "plist",
    "desktopEntry", "firewallRule", "font", "certificate", "custom",
];

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct Manifest {
    pub app: App,
    pub installer: Installer,
    #[serde(rename = "component")]
    pub components: Vec<Component>,
    #[serde(rename = "option")]
    pub options: Vec<Opt>,
    #[serde(rename = "step")]
    pub steps: Vec<Step>,
}

/// Injected by `fw installer build` from fanwit.app.toml, so the source file never repeats it.
#[derive(Debug, Deserialize)]
#[serde(default)]
pub struct App {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub version: String,
}

impl Default for App {
    fn default() -> Self {
        Self { id: "com.fanwit.app".into(), name: "Fanwit".into(), slug: "fanwit".into(), version: "0.0.0".into() }
    }
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct Installer {
    pub preset: String,
    pub artefacts: Vec<String>,
    pub scope: String,
    pub theme: String,
    pub pages: Vec<String>,
    pub languages: Vec<String>,
    pub license: Option<String>,
    pub payload: Payload,
}

/// Where the Setup app gets the native package: embedded (offline) or downloaded (online).
#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct Payload {
    /// "offline" (default) or "online"
    pub mode: String,
    pub url: Option<String>,
    pub sha256: Option<String>,
    pub size: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct Component {
    pub id: String,
    pub title: String,
    pub required: bool,
    pub default: bool,
    pub size: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct Opt {
    pub id: String,
    pub title: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub default: Option<toml::Value>,
    pub when: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct Requires {
    pub network: bool,
    pub elevation: bool,
    pub reboot: bool,
    pub disk: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct Detect {
    pub command: String,
    pub parse: Option<String>,
    pub require: Option<String>,
}

#[derive(Debug, Default, Deserialize, Clone)]
#[serde(default)]
pub struct Fetch {
    pub url: String,
    pub sha256: String,
    pub size: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct Command {
    pub command: String,
    pub success: i32,
    pub env: BTreeMap<String, String>,
    pub remove: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct Step {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub title: String,
    pub component: Option<String>,
    pub phases: Vec<String>,
    pub platforms: Vec<String>,
    pub after: Vec<String>,
    pub when: Option<String>,
    pub requires: Requires,
    // prereq
    pub detect: Option<Detect>,
    pub strategies: Vec<String>,
    pub expose: Option<String>,
    /// binary name inside the tool (defaults to the step id)
    pub bin: Option<String>,
    // prereq, download, sidecar
    pub sidecar: Option<String>,
    pub install_to: Option<String>,
    /// keyed by `<os>-<arch>`, `<os>` or `any`
    pub download: BTreeMap<String, Fetch>,
    pub extract: Option<bool>,
    // run
    pub check: Option<Command>,
    pub apply: Option<Command>,
    /// "only-if-installed-by-us" (default), "never", or { remove = "..." } / { command = "..." }
    pub uninstall: Option<toml::Value>,
    // path, shortcut, fileAssociation, urlScheme, autostart, service: the program
    pub target: Option<String>,
    /// arguments passed to `target`
    pub args: Vec<String>,
    /// display name (shortcut, service, firewall rule, font, desktop entry file); default: the app name
    pub name: Option<String>,
    pub icon: Option<String>,
    pub description: Option<String>,
    /// shortcut: "startMenu" and/or "desktop"
    pub location: Vec<String>,
    // fileAssociation
    pub ext: Option<String>,
    #[serde(rename = "progId")]
    pub prog_id: Option<String>,
    pub mime: Option<String>,
    // urlScheme
    pub scheme: Option<String>,
    // registry, plist, env
    pub key: Option<String>,
    pub value: Option<toml::Value>,
    #[serde(rename = "valueType")]
    pub value_type: Option<String>,
    pub domain: Option<String>,
    // desktopEntry
    pub entry: BTreeMap<String, String>,
    // firewallRule
    pub port: Option<u16>,
    pub protocol: Option<String>,
    pub program: Option<String>,
    // font, certificate: a file shipped with the app
    pub file: Option<String>,
    /// certificate: the subject used to find and remove it
    pub subject: Option<String>,
    /// service: run as the signed in user instead of the system
    pub user: bool,
    // custom
    /// "rust" (src-tauri/install/src/custom.rs) or "ts" (src-setup/steps)
    pub runtime: Option<String>,
    pub handler: Option<String>,
}

impl Step {
    pub fn fetch_for(&self, os: &str, arch: &str) -> Option<&Fetch> {
        self.download.get(&format!("{os}-{arch}")).or_else(|| self.download.get(os)).or_else(|| self.download.get("any"))
    }
    pub fn bin_name(&self) -> &str {
        self.bin.as_deref().unwrap_or(&self.id)
    }
}

impl Manifest {
    pub fn parse(text: &str) -> Result<Self, String> {
        let m: Manifest = toml::from_str(text).map_err(|e| format!("installer.toml: {e}"))?;
        m.validate()?;
        Ok(m)
    }

    /// Structural checks; the build fails on any of these (Section 16.15: a missing pinned hash fails).
    pub fn validate(&self) -> Result<(), String> {
        let mut errs = vec![];
        let ids: HashSet<&str> = self.steps.iter().map(|s| s.id.as_str()).collect();
        let comps: HashSet<&str> = self.components.iter().map(|c| c.id.as_str()).collect();
        if ids.len() != self.steps.len() {
            errs.push("duplicate step ids".to_string());
        }
        for s in &self.steps {
            if !STEP_TYPES.contains(&s.kind.as_str()) {
                errs.push(format!("step {}: type \"{}\" is not one of {}", s.id, s.kind, STEP_TYPES.join(", ")));
            }
            for p in &s.phases {
                if !PHASES.contains(&p.as_str()) {
                    errs.push(format!("step {}: unknown phase \"{p}\"", s.id));
                }
            }
            if s.phases.is_empty() {
                errs.push(format!("step {}: no phases", s.id));
            }
            for a in &s.after {
                if !ids.contains(a.as_str()) {
                    errs.push(format!("step {}: after unknown step \"{a}\"", s.id));
                }
            }
            if let Some(c) = &s.component {
                if !comps.contains(c.as_str()) {
                    errs.push(format!("step {}: unknown component \"{c}\"", s.id));
                }
            }
            for (target, f) in &s.download {
                if !f.url.starts_with("https://") {
                    errs.push(format!("step {} [{target}]: downloads must be https", s.id));
                }
                if f.sha256.len() != 64 || !f.sha256.chars().all(|c| c.is_ascii_hexdigit()) {
                    errs.push(format!("step {} [{target}]: sha256 must be a pinned 64 character hex hash", s.id));
                }
            }
            match s.kind.as_str() {
                "prereq" if s.detect.is_none() => errs.push(format!("step {}: prereq needs detect", s.id)),
                "run" if s.apply.is_none() => errs.push(format!("step {}: run needs apply", s.id)),
                "path" if s.target.is_none() => errs.push(format!("step {}: path needs target", s.id)),
                "download" if s.download.is_empty() => errs.push(format!("step {}: download needs [step.download.<target>]", s.id)),
                "sidecar" if s.sidecar.is_none() => errs.push(format!("step {}: sidecar needs sidecar", s.id)),
                "shortcut" | "autostart" | "service" if s.target.is_none() => errs.push(format!("step {}: {} needs target", s.id, s.kind)),
                "fileAssociation" if s.ext.is_none() || s.target.is_none() => errs.push(format!("step {}: fileAssociation needs ext and target", s.id)),
                "urlScheme" if s.scheme.is_none() || s.target.is_none() => errs.push(format!("step {}: urlScheme needs scheme and target", s.id)),
                "env" if s.name.is_none() || s.value.is_none() => errs.push(format!("step {}: env needs name and value", s.id)),
                "registry" if s.key.is_none() || s.value.is_none() => errs.push(format!("step {}: registry needs key and value", s.id)),
                "plist" if s.domain.is_none() || s.key.is_none() || s.value.is_none() => errs.push(format!("step {}: plist needs domain, key and value", s.id)),
                "desktopEntry" if s.entry.is_empty() => errs.push(format!("step {}: desktopEntry needs [step.entry]", s.id)),
                "firewallRule" if s.program.is_none() && s.port.is_none() => errs.push(format!("step {}: firewallRule needs program or port", s.id)),
                "font" if s.file.is_none() => errs.push(format!("step {}: font needs file", s.id)),
                "certificate" if s.file.is_none() || s.subject.is_none() => errs.push(format!("step {}: certificate needs file and subject", s.id)),
                "custom" if !matches!(s.runtime.as_deref(), Some("rust" | "ts")) || s.handler.is_none() => errs.push(format!("step {}: custom needs runtime = \"rust\" or \"ts\" and handler", s.id)),
                "custom" if s.runtime.as_deref() == Some("rust") && !crate::custom::exists(s.handler.as_deref().unwrap_or_default()) => {
                    errs.push(format!("step {}: no Rust custom step \"{}\" in src-tauri/install/src/custom.rs", s.id, s.handler.as_deref().unwrap_or_default()))
                }
                _ => {}
            }
        }
        if self.installer.payload.mode == "online" {
            let p = &self.installer.payload;
            if !p.url.as_deref().unwrap_or_default().starts_with("https://") || p.sha256.as_deref().map(|h| h.len() != 64).unwrap_or(true) {
                errs.push("[installer.payload] online needs an https url and a pinned sha256 (fw installer build fills both)".into());
            }
        }
        if let Err(e) = self.ordered() {
            errs.push(e);
        }
        if errs.is_empty() { Ok(()) } else { Err(errs.join("\n")) }
    }

    /// Steps in dependency order (`after`), declaration order otherwise.
    pub fn ordered(&self) -> Result<Vec<&Step>, String> {
        let mut done: Vec<&Step> = vec![];
        let mut left: Vec<&Step> = self.steps.iter().collect();
        while !left.is_empty() {
            let i = left
                .iter()
                .position(|s| s.after.iter().all(|a| done.iter().any(|d| &d.id == a) || !self.steps.iter().any(|x| &x.id == a)))
                .ok_or_else(|| format!("steps form a cycle: {}", left.iter().map(|s| s.id.as_str()).collect::<Vec<_>>().join(", ")))?;
            done.push(left.remove(i));
        }
        Ok(done)
    }
}

/// "12 MB" -> bytes. Plain numbers are bytes.
pub fn parse_size(s: &str) -> u64 {
    let s = s.trim();
    let (num, unit) = s.split_at(s.find(|c: char| c.is_alphabetic()).unwrap_or(s.len()));
    let n: f64 = num.trim().parse().unwrap_or(0.0);
    let mul = match unit.trim().to_ascii_uppercase().as_str() {
        "KB" | "K" => 1e3,
        "MB" | "M" => 1e6,
        "GB" | "G" => 1e9,
        _ => 1.0,
    };
    (n * mul) as u64
}

pub fn format_size(b: u64) -> String {
    match b {
        0 => "0 MB".into(),
        b if b >= 1_000_000_000 => format!("{:.1} GB", b as f64 / 1e9),
        b => format!("{} MB", ((b as f64 / 1e6).ceil() as u64).max(1)),
    }
}

/// `when` clauses: identifiers, `!`, `&&`, `||`, parentheses. Unknown identifiers are false.
pub fn eval_when(expr: &str, truthy: &dyn Fn(&str) -> bool) -> bool {
    let toks: Vec<String> = regex::Regex::new(r"&&|\|\||[!()]|[\w.\-]+").unwrap().find_iter(expr).map(|m| m.as_str().to_string()).collect();
    let mut i = 0;
    or(&toks, &mut i, truthy)
}
fn or(t: &[String], i: &mut usize, f: &dyn Fn(&str) -> bool) -> bool {
    let mut v = and(t, i, f);
    while t.get(*i).map(|s| s == "||").unwrap_or(false) {
        *i += 1;
        v |= and(t, i, f);
    }
    v
}
fn and(t: &[String], i: &mut usize, f: &dyn Fn(&str) -> bool) -> bool {
    let mut v = unary(t, i, f);
    while t.get(*i).map(|s| s == "&&").unwrap_or(false) {
        *i += 1;
        v &= unary(t, i, f);
    }
    v
}
fn unary(t: &[String], i: &mut usize, f: &dyn Fn(&str) -> bool) -> bool {
    let Some(tok) = t.get(*i) else { return false };
    *i += 1;
    match tok.as_str() {
        "!" => !unary(t, i, f),
        "(" => {
            let v = or(t, i, f);
            *i += 1; // ')'
            v
        }
        id => f(id),
    }
}
