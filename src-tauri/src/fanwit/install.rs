//! Installer Kit app phases (Section 16.4). On the first launch of each version the bundled
//! engine runs the firstRun steps (or update steps after an update) in the background. Builds
//! without the kit (dev, plain `tauri build`) have no engine next to the binary and skip this.

use super::{app_dir, Dir};
use std::process::Command;
use tauri::{AppHandle, Manager, Runtime};

pub fn run_pending_phases<R: Runtime>(app: &AppHandle<R>) {
    let Ok(exe) = std::env::current_exe() else { return };
    // only installed copies: never change the system from a dev build or a cargo target dir
    // ponytail: detects target/<profile> by folder names; an install path with those names is skipped too
    let names: Vec<_> = exe.components().map(|c| c.as_os_str().to_string_lossy().to_lowercase()).collect();
    if cfg!(debug_assertions) || names.windows(2).any(|w| w[0] == "target" && (w[1] == "release" || w[1] == "debug")) {
        return;
    }
    let engine = exe.with_file_name(format!("fanwit-install{}", std::env::consts::EXE_SUFFIX));
    let Ok(res) = app.path().resource_dir() else { return };
    let manifest = res.join("installer.toml");
    let Ok(data) = app_dir(app, Dir::Data) else { return };
    if !engine.is_file() || !manifest.is_file() {
        return;
    }
    let marker = data.join(".install-phase");
    let version = app.package_info().version.to_string();
    let last = std::fs::read_to_string(&marker).unwrap_or_default();
    if last.trim() == version {
        return;
    }
    let phase = if last.trim().is_empty() { "firstRun" } else { "update" };
    // Windows installs are per user and writable; elsewhere the package dir belongs to root, so
    // per user phases keep their receipt in the app data dir.
    // ponytail: values exposed by the package phase receipt (e.g. UV_BIN) are re-detected, not shared
    let install_dir = if cfg!(windows) { exe.parent().map(|p| p.to_path_buf()).unwrap_or_default() } else { data.clone() };
    std::thread::spawn(move || {
        let out = Command::new(&engine)
            .args(["run", "--phase", phase, "--manifest"])
            .arg(&manifest)
            .arg("--install-dir")
            .arg(&install_dir)
            .output();
        match out {
            Ok(o) => {
                let code = o.status.code().unwrap_or(1);
                log::info!("installer {phase} phase exited with {code}\n{}", String::from_utf8_lossy(&o.stdout));
                // 3010: done, restart needed; anything else is retried on the next launch
                if code == 0 || code == 3010 {
                    let _ = std::fs::create_dir_all(&data);
                    let _ = std::fs::write(&marker, &version);
                }
            }
            Err(e) => log::warn!("installer {phase} phase did not start: {e}"),
        }
    });
}

// ---------- Installer Lab (Section 16.16) ----------

/// The repo root in dev builds (src-tauri's parent), where installer.toml and the scenarios live.
fn repo_root() -> Option<std::path::PathBuf> {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).parent()?.to_path_buf();
    (cfg!(debug_assertions) && root.join("installer.toml").is_file()).then_some(root)
}

/// Scenarios shipped with the template, for builds without the repo.
const SCENARIOS: [(&str, &str); 6] = [
    ("admin", include_str!("../../../installer/scenarios/admin.toml")),
    ("no-admin", include_str!("../../../installer/scenarios/no-admin.toml")),
    ("offline", include_str!("../../../installer/scenarios/offline.toml")),
    ("uv-missing", include_str!("../../../installer/scenarios/uv-missing.toml")),
    ("uv-present", include_str!("../../../installer/scenarios/uv-present.toml")),
    ("uv-sidecar", include_str!("../../../installer/scenarios/uv-sidecar.toml")),
];

/// installer.toml (from the repo in dev, else the bundled copy), the scenarios, and the native
/// glue `fw installer build` generated, so the lab can show them next to the declaration.
#[tauri::command]
pub fn fw_installer_lab_load<R: Runtime>(app: AppHandle<R>) -> serde_json::Value {
    let (source, text) = match repo_root() {
        Some(root) => ("repo", std::fs::read_to_string(root.join("installer.toml")).unwrap_or_default()),
        None => ("bundle", app.path().resource_dir().ok().and_then(|d| std::fs::read_to_string(d.join("installer.toml")).ok()).unwrap_or_default()),
    };
    let mut scenarios: std::collections::BTreeMap<String, String> = SCENARIOS.iter().map(|(n, t)| (n.to_string(), t.to_string())).collect();
    let mut glue = std::collections::BTreeMap::new();
    if let Some(root) = repo_root() {
        if let Ok(dir) = std::fs::read_dir(root.join("installer/scenarios")) {
            for e in dir.flatten() {
                if let (Some(stem), Ok(t)) = (e.path().file_stem().map(|s| s.to_string_lossy().to_string()), std::fs::read_to_string(e.path())) {
                    scenarios.insert(stem, t);
                }
            }
        }
        let gen = root.join("src-tauri/gen/installer");
        for f in ["hooks.nsh", "fanwit-install.wxs", "deb-postinst.sh", "deb-prerm.sh", "rpm-post.sh", "rpm-preun.sh", "pkg/postinstall", "install.sh", "install.ps1", "tauri.installer.conf.json"] {
            if let Ok(t) = std::fs::read_to_string(gen.join(f)) {
                glue.insert(f.to_string(), t);
            }
        }
    }
    serde_json::json!({ "source": source, "text": text, "scenarios": scenarios, "glue": glue, "os": std::env::consts::OS })
}

#[derive(serde::Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LabInput {
    text: String,
    scenarios: Vec<String>,
    os: String,
    scope: String,
    phase: Option<String>,
    components: Option<Vec<String>>,
}

/// Plan installer.toml on a simulated machine. Nothing on this computer is read or changed.
#[tauri::command]
pub fn fw_installer_lab_plan<R: Runtime>(app: AppHandle<R>, input: LabInput) -> Result<serde_json::Value, String> {
    use fanwit_install::*;
    // the source file has no [app]; the build injects it, so do the same
    let text = if input.text.contains("\n[app]") || input.text.starts_with("[app]") {
        input.text.clone()
    } else {
        let info = app.package_info();
        let id = app.config().identifier.clone();
        format!("[app]\nid = {id:?}\nname = {:?}\nslug = {:?}\nversion = {:?}\n\n{}", info.name, info.crate_name, info.version.to_string(), input.text)
    };
    let manifest = Manifest::parse(&text)?;
    let sim = input.scenarios.iter().try_fold(Scenario::default(), |acc, t| Ok::<_, String>(acc.merge(Scenario::parse(t)?)))?;
    let sim = Scenario { os: Some(input.os.clone()), ..sim };
    let mut flags = vec![("scope".to_string(), input.scope.clone())];
    if let Some(c) = &input.components {
        flags.push(("components".into(), c.join(",")));
    }
    let sel = selection(&manifest, None, None, &flags)?;
    let engine = Engine::new(&manifest, &sim, sel);
    let plan = engine.plan(input.phase.as_deref())?;
    Ok(serde_json::json!({
        "plan": plan,
        "summary": plan.summary(),
        "pages": manifest.installer.pages,
        "preset": manifest.installer.preset,
        "components": manifest.components.iter().map(|c| serde_json::json!({ "id": c.id, "title": c.title, "required": c.required, "default": c.default })).collect::<Vec<_>>(),
    }))
}
