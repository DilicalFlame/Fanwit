//! fanwit-install command line (Section 16.3). Embedded in every artefact; the generated NSIS,
//! WiX, deb, rpm and terminal glue only ever call this. The Setup exe runs it with `--engine`.

use crate::*;
use sha2::{Digest, Sha256};

// One line per literal: a literal spanning lines picks up CR on Windows checkouts (autocrlf),
// which rustc accepts but rust-analyzer reports as an error.
const HELP: &str = concat!(
    "fanwit-install: the Fanwit Installer Kit engine\n",
    "\n",
    "  fanwit-install plan      [--phase P] [--json]          what would happen; changes nothing\n",
    "  fanwit-install run       --phase P [--step id] [--dry-run]\n",
    "  fanwit-install uninstall [--purge]                     reverse the receipt (user documents are never touched)\n",
    "  fanwit-install receipt                                 print the install receipt\n",
    "  fanwit-install validate                                check installer.toml\n",
    "\n",
    "Selection:  --scope user|machine  --components a,b  --set key=value  --answers file.toml  --silent\n",
    "Location:   --manifest installer.toml (default: next to this binary, then the current folder)\n",
    "            --install-dir DIR\n",
    "Simulate:   --scenario a.toml[,b.toml]  --os windows|macos|linux  --arch x86_64|aarch64\n",
    "Phases:     bootstrap, package, firstRun, update, uninstall\n",
    "Exit codes: 0 ok, 1602 cancelled, 1603 failed, 3010 ok but restart required",
);

/// The engine command line. `helper_prefix` is what precedes `elevated` when the engine starts
/// itself with administrator rights: nothing for `fanwit-install`, `--engine` for the Setup exe.
pub fn main(args: Vec<String>, helper_prefix: Vec<String>) -> i32 {
    real_main(args, helper_prefix).unwrap_or_else(|e| {
        eprintln!("fanwit-install: {e}");
        EXIT_FATAL
    })
}

fn real_main(args: Vec<String>, helper_prefix: Vec<String>) -> Result<i32, String> {
    let flag = |name: &str| -> Option<String> {
        let i = args.iter().position(|a| a == &format!("--{name}"))?;
        args.get(i + 1).cloned()
    };
    let has = |name: &str| args.iter().any(|a| a == &format!("--{name}"));
    let Some(cmd) = args.first().filter(|a| !a.starts_with("--")) else {
        println!("{HELP}");
        return Ok(0);
    };
    // the elevated helper: performs exactly the plan whose digest is on its command line
    if cmd == "elevated" {
        let plan = flag("plan").ok_or("elevated needs --plan")?;
        let sha = flag("sha256").ok_or("elevated needs --sha256")?;
        return Ok(elevate::run_helper(&Real, std::path::Path::new(&plan), &sha));
    }

    let manifest_path = flag("manifest").map(std::path::PathBuf::from).unwrap_or_else(|| {
        let beside = std::env::current_exe().ok().and_then(|e| e.parent().map(|d| d.join("installer.toml")));
        beside.filter(|p| p.is_file()).unwrap_or_else(|| "installer.toml".into())
    });
    let text = std::fs::read_to_string(&manifest_path).map_err(|e| format!("{}: {e}", manifest_path.display()))?;
    // an elevated child refuses a manifest that changed since its parent asked for the prompt
    if let Some(want) = flag("manifest-sha256") {
        if !hex::encode(Sha256::digest(text.as_bytes())).eq_ignore_ascii_case(&want) {
            return Err(format!("{} changed after it was checked; refusing to run it", manifest_path.display()));
        }
    }
    let manifest = Manifest::parse(&text)?;
    if cmd == "validate" {
        println!("{} ok: {} components, {} options, {} steps", manifest_path.display(), manifest.components.len(), manifest.options.len(), manifest.steps.len());
        return Ok(0);
    }

    let simulated = flag("scenario").is_some() || flag("os").is_some();
    let scenario = match flag("scenario") {
        Some(list) => list.split(',').try_fold(Scenario::default(), |acc, f| {
            let t = std::fs::read_to_string(f).map_err(|e| format!("{f}: {e}"))?;
            Ok::<_, String>(acc.merge(Scenario::parse(&t)?))
        })?,
        None => Scenario::default(),
    };
    let scenario = Scenario { os: flag("os").or(scenario.os.clone()), arch: flag("arch").or(scenario.arch.clone()), ..scenario };
    let real = Real;
    let sys: &dyn System = if simulated { &scenario } else { &real };

    let answers = match flag("answers") {
        Some(f) => Some(toml::from_str::<toml::Table>(&std::fs::read_to_string(&f).map_err(|e| format!("{f}: {e}"))?).map_err(|e| format!("{f}: {e}"))?),
        None => None,
    };
    // environment first, so package managers can pass choices: MYAPP_COMPONENTS=core,cli apt install ./myapp.deb
    let prefix = manifest.app.slug.to_uppercase().replace('-', "_");
    let mut flags: Vec<(String, String)> = vec![];
    for (key, name) in [("SCOPE", "scope"), ("COMPONENTS", "components")].into_iter().map(|(k, n)| (k.to_string(), n.to_string())).chain(manifest.options.iter().map(|o| (screaming(&o.id), o.id.clone()))) {
        if let Ok(v) = std::env::var(format!("{prefix}_{key}")) {
            flags.push((name, v));
        }
    }
    for (i, a) in args.iter().enumerate() {
        let v = args.get(i + 1).cloned().unwrap_or_default();
        match a.as_str() {
            "--scope" => flags.push(("scope".into(), v)),
            "--components" => flags.push(("components".into(), v)),
            "--install-dir" => flags.push(("installDir".into(), v)),
            "--set" => {
                let (k, val) = v.split_once('=').ok_or("--set needs key=value")?;
                flags.push((k.into(), val.into()));
            }
            _ => {}
        }
    }
    if has("silent") {
        flags.push(("silent".into(), "true".into()));
    }

    // the receipt lives under the install dir, which depends on the scope chosen
    let pre = selection(&manifest, None, answers.as_ref(), &flags)?;
    let mut engine = Engine::new(&manifest, sys, pre);
    engine.persist = !simulated;
    engine.helper = (std::env::current_exe().map_err(|e| e.to_string())?, helper_prefix.clone());
    if !simulated {
        engine.load_receipt();
    }
    let receipt = engine.receipt.clone();
    engine.sel = selection(&manifest, Some(&receipt), answers.as_ref(), &flags)?;
    if let Some(log) = flag("log") {
        if let Some(dir) = std::path::Path::new(&log).parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let mut file = std::fs::OpenOptions::new().create(true).append(true).open(&log).map_err(|e| format!("{log}: {e}"))?;
        // an elevated child's parent relays the log, so it must not print it as well
        let quiet = has("elevated-child");
        engine.out = Box::new(move |l| {
            use std::io::Write;
            if !quiet {
                println!("{l}");
            }
            let _ = writeln!(file, "{l}");
        });
    }
    let json = has("json");

    // the machine scope changes folders only administrators may write (the receipt goes there
    // too), so the whole run moves into one elevated child that streams its log back
    if matches!(cmd.as_str(), "run" | "uninstall") && !simulated && engine.sel.scope == "machine" && !has("elevated-child") && !has("no-elevate") && !has("dry-run") && !Real.admin() {
        let mut child: Vec<String> = args.iter().filter(|a| *a != "--log").cloned().collect();
        if let Some(i) = child.iter().position(|a| a == "--manifest") {
            child.remove(i + 1);
            child.remove(i);
        }
        let abs = std::fs::canonicalize(&manifest_path).unwrap_or(manifest_path.clone());
        child.extend(["--manifest".into(), abs.to_string_lossy().to_string(), "--manifest-sha256".into(), hex::encode(Sha256::digest(text.as_bytes()))]);
        if !child.iter().any(|a| a == "--scope") {
            child.extend(["--scope".into(), "machine".into()]);
        }
        (engine.out)("Asking for administrator rights to install for everyone on this computer");
        let mut out = |l: &str| (engine.out)(l);
        return Ok(elevate::rerun_elevated(&engine.helper.clone(), &child, &mut out));
    }

    match cmd.as_str() {
        "plan" => {
            let plan = engine.plan(flag("phase").as_deref())?;
            if json {
                println!("{}", serde_json::to_string_pretty(&plan).map_err(|e| e.to_string())?);
            } else {
                print_plan(&plan, simulated);
            }
            Ok(if plan.blocked { EXIT_FATAL } else { EXIT_OK })
        }
        "run" => {
            let phase = flag("phase").ok_or("run needs --phase")?;
            engine.run(&phase, flag("step").as_deref(), has("dry-run") || simulated)
        }
        "uninstall" => {
            if simulated {
                println!("(simulated: nothing is removed)");
            }
            engine.uninstall(has("purge"))
        }
        "receipt" => {
            println!("{}", toml::to_string(&engine.receipt).map_err(|e| e.to_string())?);
            Ok(0)
        }
        other => Err(format!("unknown command {other}\n\n{HELP}")),
    }
}

/// addToPath -> ADD_TO_PATH
fn screaming(id: &str) -> String {
    id.chars().fold(String::new(), |mut s, c| {
        if c.is_uppercase() && !s.is_empty() {
            s.push('_');
        }
        s.push(c.to_ascii_uppercase());
        s
    })
}

fn print_plan(plan: &Plan, simulated: bool) {
    println!(
        "Plan for {}, {} scope{}{}",
        plan.target,
        plan.scope,
        plan.phase.as_deref().map(|p| format!(", phase {p}")).unwrap_or_default(),
        if simulated { " (simulated)" } else { "" }
    );
    let w = plan.items.iter().map(|i| i.id.len()).max().unwrap_or(4);
    for i in &plan.items {
        let status = match i.status {
            Status::Satisfied => "ok",
            Status::Missing => "will install",
            Status::Outdated => "will update",
            Status::Deferred => "deferred",
            Status::Blocked => "BLOCKED",
        };
        println!("  {:<w$}  {:<12}  {:<9}  {}", i.id, status, i.phase, if i.detail.is_empty() { &i.title } else { &i.detail });
        for a in &i.actions {
            println!("  {:<w$}  {:<12}  {:<9}    - {a}", "", "", "");
        }
    }
    if plan.items.is_empty() {
        println!("  (no steps for this selection)");
    }
    println!("{}", plan.summary());
}
