//! Custom Rust steps (Section 16.8). They run in every phase, including inside native packages,
//! because they are compiled into the engine.
//!
//! Add one:
//!   1. implement [`CustomStep`] below (or in a new file declared here),
//!   2. list it in [`REGISTRY`] under a handler id,
//!   3. use it from installer.toml:
//!
//! ```toml
//! [[step]]
//! id = "config"
//! type = "custom"
//! runtime = "rust"
//! handler = "example.defaultConfig"
//! phases = ["package", "firstRun"]
//! value = "theme = \"dark\"\n"
//! ```
//!
//! A custom step only decides; it never changes the system itself. It returns [`Action`]s, which
//! the engine journals, elevates when needed, records in the receipt and undoes on uninstall.

use crate::engine::{Engine, Prepared, Status};
use crate::manifest::Step;
use crate::system::{Action, System};
use std::collections::BTreeMap;

/// What a custom step found.
pub enum Check {
    Satisfied(String),
    Missing(String),
    Outdated(String),
    /// cannot be done here; a later phase of the step retries
    Blocked(String),
}

/// What a custom step can read: the system, its own installer.toml entry, and placeholders.
pub struct Ctx<'a> {
    engine: &'a Engine<'a>,
    pub step: &'a Step,
    exposed: &'a BTreeMap<String, String>,
}

impl Ctx<'_> {
    pub fn sys(&self) -> &dyn System {
        self.engine.sys
    }
    /// Resolve `{appData}`, `{env.UV_BIN}` and the other placeholders.
    pub fn path(&self, s: &str) -> String {
        self.engine.path(s, self.exposed)
    }
    /// Split and resolve a command line.
    pub fn command(&self, s: &str) -> Vec<String> {
        self.engine.command(s, self.exposed)
    }
    pub fn os(&self) -> String {
        self.engine.os()
    }
    pub fn machine(&self) -> bool {
        self.engine.machine()
    }
}

pub trait CustomStep: Sync {
    fn check(&self, ctx: &Ctx) -> Check;
    /// What to do when the check is not satisfied.
    fn actions(&self, ctx: &Ctx) -> Vec<Action>;
    /// Extra undo besides the inverses of `actions` (stop something before its files go).
    fn undo(&self, _ctx: &Ctx) -> Vec<Action> {
        vec![]
    }
    /// True when the actions need administrator rights.
    fn elevation(&self, ctx: &Ctx) -> bool {
        ctx.machine()
    }
}

// ---------- the registry ----------

static REGISTRY: &[(&str, &dyn CustomStep)] = &[("example.defaultConfig", &DefaultConfig)];

pub fn exists(handler: &str) -> bool {
    REGISTRY.iter().any(|(id, _)| *id == handler)
}

pub(crate) fn prepare(engine: &Engine, s: &Step, p: &mut Prepared, exposed: &BTreeMap<String, String>) {
    let handler = s.handler.as_deref().unwrap_or_default();
    let Some((_, step)) = REGISTRY.iter().find(|(id, _)| *id == handler) else {
        return crate::engine::block(p, &format!("no Rust custom step \"{handler}\""));
    };
    let ctx = Ctx { engine, step: s, exposed };
    let (status, detail) = match step.check(&ctx) {
        Check::Satisfied(d) => (Status::Satisfied, d),
        Check::Missing(d) => (Status::Missing, d),
        Check::Outdated(d) => (Status::Outdated, d),
        Check::Blocked(d) => return crate::engine::block(p, &d),
    };
    p.item.status = status;
    p.item.detail = detail;
    p.item.elevation |= step.elevation(&ctx);
    if status != Status::Satisfied {
        p.actions = step.actions(&ctx);
    }
    p.undo.extend(step.undo(&ctx));
}

// ---------- example ----------

/// Writes a default config file (`value`) to `install_to` (default `{appData}/config.toml`)
/// unless the user already has one. Uninstall removes it only if Setup wrote it.
struct DefaultConfig;

impl DefaultConfig {
    fn file(ctx: &Ctx) -> String {
        ctx.path(ctx.step.install_to.as_deref().unwrap_or("{appData}/config.toml"))
    }
}

impl CustomStep for DefaultConfig {
    fn check(&self, ctx: &Ctx) -> Check {
        let file = Self::file(ctx);
        if ctx.sys().file_sha256(std::path::Path::new(&file)).is_some() {
            Check::Satisfied(format!("{file} exists, kept"))
        } else {
            Check::Missing(format!("will write {file}"))
        }
    }
    fn actions(&self, ctx: &Ctx) -> Vec<Action> {
        let content = match &ctx.step.value {
            Some(toml::Value::String(s)) => s.clone(),
            Some(v) => v.to_string(),
            None => String::new(),
        };
        vec![Action::WriteFile { path: Self::file(ctx), content, previous: None }]
    }
}
