//! fanwit-install: the only code that changes the system, whichever installer artefact runs it
//! (Chapter 16). It evaluates checks, builds a plan, applies actions with a journal, rolls back
//! and writes an install receipt. Every artefact (NSIS, MSI, deb, rpm, install.sh, the app's
//! firstRun) calls the same binary.

pub mod cli;
pub mod custom;
pub mod elevate;
pub mod engine;
pub mod manifest;
mod steps;
pub mod system;

pub use engine::{Engine, Plan, Receipt, Selection, Status, TsStep, EXIT_CANCELLED, EXIT_FATAL, EXIT_OK, EXIT_REBOOT};
pub use manifest::Manifest;
pub use system::{Action, Real, Scenario, System};

/// Build the selection: manifest defaults, then the receipt (repair, update), then an answer file, then flags.
pub fn selection(m: &Manifest, receipt: Option<&Receipt>, answers: Option<&toml::Table>, flags: &[(String, String)]) -> Result<Selection, String> {
    let mut sel = Selection {
        scope: match m.installer.scope.as_str() {
            "machine" => "machine".into(),
            _ => "user".into(),
        },
        components: m.components.iter().filter(|c| c.required || c.default).map(|c| c.id.clone()).collect(),
        options: m.options.iter().filter_map(|o| Some((o.id.clone(), o.default.clone()?))).collect(),
        ..Default::default()
    };
    if let Some(r) = receipt.filter(|r| !r.scope.is_empty()) {
        sel.scope = r.scope.clone();
        sel.components = r.components.clone();
        sel.options.extend(r.options.clone());
    }
    let mut apply = |k: &str, v: toml::Value| -> Result<(), String> {
        match (k, v) {
            ("scope", toml::Value::String(s)) => sel.scope = s,
            ("components", toml::Value::String(s)) => sel.components = s.split(',').map(|c| c.trim().to_string()).filter(|c| !c.is_empty()).collect(),
            ("components", toml::Value::Array(a)) => sel.components = a.iter().filter_map(|v| v.as_str().map(String::from)).collect(),
            ("silent", v) => sel.silent = v.as_bool().unwrap_or(true),
            ("installDir", toml::Value::String(s)) => sel.install_dir = Some(s),
            ("options", toml::Value::Table(t)) => sel.options.extend(t),
            (k, v) => {
                if !m.options.iter().any(|o| o.id == k) {
                    return Err(format!("unknown option \"{k}\" (known: {})", m.options.iter().map(|o| o.id.as_str()).collect::<Vec<_>>().join(", ")));
                }
                sel.options.insert(k.to_string(), v);
            }
        }
        Ok(())
    };
    for (k, v) in answers.into_iter().flatten() {
        apply(k, v.clone())?;
    }
    // an empty value (an unset MSI property) means "keep the default"
    for (k, v) in flags.iter().filter(|(_, v)| !v.is_empty()) {
        let val = match v.as_str() {
            "true" | "1" | "yes" => toml::Value::Boolean(true),
            "false" | "0" | "no" => toml::Value::Boolean(false),
            s => s.parse::<i64>().map(toml::Value::Integer).unwrap_or_else(|_| toml::Value::String(s.to_string())),
        };
        apply(k, val)?;
    }
    if !["user", "machine"].contains(&sel.scope.as_str()) {
        return Err(format!("scope must be user or machine, not {}", sel.scope));
    }
    for c in m.components.iter().filter(|c| c.required) {
        if !sel.components.contains(&c.id) {
            sel.components.insert(0, c.id.clone());
        }
    }
    if let Some(bad) = sel.components.iter().find(|c| !m.components.iter().any(|x| &x.id == *c)) {
        return Err(format!("unknown component \"{bad}\""));
    }
    Ok(sel)
}

#[cfg(test)]
mod tests;
#[cfg(test)]
mod tests_steps;
