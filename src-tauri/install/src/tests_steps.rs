//! Scenario tests for the step types of Section 16.6.1, the elevated helper and custom steps.

use super::*;
use crate::engine::TsStep;

const APP: &str = "[app]\nid = \"com.example.myapp\"\nname = \"My App\"\nslug = \"myapp\"\nversion = \"1.0.0\"\n[[component]]\nid = \"core\"\nrequired = true\n";

fn case(os: &str, extra: &str, steps: &str) -> (Manifest, Scenario) {
    let m = Manifest::parse(&format!("{APP}
{steps}")).unwrap_or_else(|e| panic!("{e}"));
    (m, Scenario::parse(&format!("os = \"{os}\"
{extra}")).unwrap())
}

fn engine<'a>(m: &'a Manifest, s: &'a Scenario, scope: &str) -> Engine<'a> {
    let sel = selection(m, None, None, &[("scope".into(), scope.into())]).unwrap();
    let mut e = Engine::new(m, s, sel);
    e.out = Box::new(|_| {});
    e
}

/// Run the package phase on a simulated machine: exit code, what was performed, the receipt.
fn apply(m: &Manifest, s: &Scenario, scope: &str) -> (i32, Vec<Action>, Receipt) {
    let mut e = engine(m, s, scope);
    let code = e.run("package", None, false).unwrap();
    (code, s.log.borrow().clone(), e.receipt.clone())
}

fn has(log: &[Action], f: impl Fn(&Action) -> bool) -> bool {
    log.iter().any(f)
}

#[test]
fn shortcut_per_os() {
    let steps = "[[step]]\nid = \"sc\"\ntype = \"shortcut\"\nphases = [\"package\"]\ntarget = \"{installDir}/myapp\"\nlocation = [\"startMenu\", \"desktop\"]\n";
    let (m, s) = case("windows", "", steps);
    let (code, log, rc) = apply(&m, &s, "user");
    assert_eq!(code, 0);
    let scripts: Vec<_> = log.iter().filter_map(|a| if let Action::Exec { command, .. } = a { Some(command.join(" ")) } else { None }).collect();
    assert_eq!(scripts.len(), 2, "{scripts:?}");
    assert!(scripts[0].contains("CreateShortcut('C:\\Users\\sim\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\My App.lnk')"), "{}", scripts[0]);
    assert!(scripts[0].contains("TargetPath='C:\\Users\\sim\\AppData\\Local\\Programs\\My App\\myapp.exe'"));
    let undo = &rc.steps[0].undo;
    assert!(undo.contains(&Action::Remove { path: "C:\\Users\\sim\\Desktop\\My App.lnk".into() }), "{undo:?}");

    let (m, s) = case("linux", "", steps);
    let (_, log, _) = apply(&m, &s, "user");
    let Some(Action::WriteFile { path, content, .. }) = log.first() else { panic!("{log:?}") };
    assert_eq!(path, "/home/sim/.local/share/applications/myapp.desktop");
    assert!(content.contains("Exec=\"/home/sim/.local/share/myapp/myapp\"") && content.starts_with("[Desktop Entry]\n"), "{content}");
    assert!(has(&log, |a| matches!(a, Action::Exec { command, optional: true, .. } if command[0] == "update-desktop-database")));

    let (m, s) = case("macos", "", steps);
    let (_, log, _) = apply(&m, &s, "user");
    assert!(has(&log, |a| matches!(a, Action::Symlink { link, .. } if link == "/Users/sim/Desktop/My App")), "{log:?}");
}

#[test]
fn file_association_registry_and_mime() {
    let steps = "[[step]]\nid = \"fa\"\ntype = \"fileAssociation\"\nphases = [\"package\"]\next = \".fwn\"\ntarget = \"{installDir}/myapp\"\ndescription = \"My note\"\n";
    let (m, s) = case("windows", "[registry]\n\"HKCU\\\\Software\\\\Classes\\\\.fwn\\\\\" = \"OldApp.fwn\"\n", steps);
    let (_, log, rc) = apply(&m, &s, "user");
    let sets: Vec<_> = log.iter().filter_map(|a| if let Action::RegSet { key, value, previous, .. } = a { Some((key.clone(), value.clone(), previous.clone())) } else { None }).collect();
    assert_eq!(sets.len(), 4, "{sets:?}");
    assert_eq!(sets[0].0, "HKCU\\Software\\Classes\\.fwn");
    assert_eq!(sets[0].2.as_ref().map(|p| p.value.as_str()), Some("OldApp.fwn"), "remembers the previous owner of .fwn");
    assert_eq!(sets[3].1, "\"C:\\Users\\sim\\AppData\\Local\\Programs\\My App\\myapp.exe\" \"%1\"");
    let undo = &rc.steps[0].undo;
    assert_eq!(undo[0], Action::RegDelete { key: "HKCU\\Software\\Classes\\myapp.fwn".into(), name: None });
    // .fwn goes back to the old app instead of being deleted
    assert!(undo.iter().any(|a| matches!(a, Action::RegSet { key, value, .. } if key.ends_with(".fwn") && value == "OldApp.fwn")), "{undo:?}");

    let (m, s) = case("linux", "", steps);
    let (_, log, _) = apply(&m, &s, "user");
    assert!(has(&log, |a| matches!(a, Action::WriteFile { path, content, .. } if path == "/home/sim/.local/share/mime/packages/myapp-fwn.xml" && content.contains("<glob pattern=\"*.fwn\"/>"))));
    assert!(has(&log, |a| matches!(a, Action::Exec { command, .. } if command[0] == "xdg-mime")));

    let (m, s) = case("macos", "", steps);
    let p = engine(&m, &s, "user").plan(None).unwrap();
    assert_eq!(p.items[0].status, Status::Satisfied, "macOS sets this in Info.plist at build time");
}

#[test]
fn url_scheme_and_autostart() {
    let steps = "[[step]]\nid = \"url\"\ntype = \"urlScheme\"\nphases = [\"package\"]\nscheme = \"myapp\"\ntarget = \"{installDir}/myapp\"\n\n[[step]]\nid = \"auto\"\ntype = \"autostart\"\nphases = [\"package\"]\ntarget = \"{installDir}/myapp\"\nargs = [\"--headless\"]\n";
    let (m, s) = case("windows", "", steps);
    let (_, log, _) = apply(&m, &s, "user");
    assert!(has(&log, |a| matches!(a, Action::RegSet { key, name, .. } if key == "HKCU\\Software\\Classes\\myapp" && name == "URL Protocol")));
    assert!(has(&log, |a| matches!(a, Action::RegSet { key, value, .. } if key.ends_with("CurrentVersion\\Run") && value.ends_with("myapp.exe\" --headless"))), "{log:?}");

    let (m, s) = case("macos", "", steps);
    let (_, log, _) = apply(&m, &s, "user");
    assert!(has(&log, |a| matches!(a, Action::WriteFile { path, content, .. } if path == "/Users/sim/Library/LaunchAgents/com.example.myapp.autostart.plist" && content.contains("<string>--headless</string>"))));

    let (m, s) = case("linux", "", steps);
    let (_, log, _) = apply(&m, &s, "user");
    assert!(has(&log, |a| matches!(a, Action::WriteFile { path, content, .. } if path.ends_with("myapp-myapp-handler.desktop") && content.contains("MimeType=x-scheme-handler/myapp;"))));
    assert!(has(&log, |a| matches!(a, Action::WriteFile { path, .. } if path == "/home/sim/.config/autostart/myapp.desktop")));
}

#[test]
fn user_service_on_linux_stops_before_files_go() {
    let steps = "[[step]]\nid = \"svc\"\ntype = \"service\"\nphases = [\"package\"]\nname = \"myapp-sync\"\nuser = true\ntarget = \"{installDir}/myapp\"\nargs = [\"sync\"]\n";
    let (m, s) = case("linux", "", steps);
    let (code, log, rc) = apply(&m, &s, "user");
    assert_eq!(code, 0);
    assert_eq!(s.prompts.get(), 0, "a user service needs no administrator rights");
    assert!(matches!(&log[0], Action::WriteFile { path, .. } if path == "/home/sim/.config/systemd/user/myapp-sync.service"));
    assert!(matches!(&log[2], Action::Exec { command, .. } if command.join(" ") == "systemctl --user enable --now myapp-sync.service"));
    let undo: Vec<String> = rc.steps[0].undo.iter().map(Action::describe).collect();
    assert_eq!(undo[0], "run systemctl --user disable --now myapp-sync.service (if available)");
    assert_eq!(undo[1], "remove /home/sim/.config/systemd/user/myapp-sync.service");
    assert_eq!(undo[2], "run systemctl --user daemon-reload (if available)");
}

#[test]
fn system_service_and_firewall_share_one_prompt() {
    let steps = "[[step]]\nid = \"svc\"\ntype = \"service\"\nphases = [\"package\"]\ntarget = \"{installDir}/myapp\"\n\n[[step]]\nid = \"cfg\"\ntype = \"env\"\nphases = [\"package\"]\nname = \"MYAPP_HOME\"\nvalue = \"{installDir}\"\n\n[[step]]\nid = \"fw\"\ntype = \"firewallRule\"\nphases = [\"package\"]\nname = \"My App\"\nprogram = \"{installDir}/myapp.exe\"\nport = 8443\n";
    let (m, s) = case("windows", "", steps);
    let (code, log, rc) = apply(&m, &s, "user");
    assert_eq!(code, 0);
    assert_eq!(s.prompts.get(), 1, "the service and the firewall rule go through one prompt");
    assert!(has(&log, |a| matches!(a, Action::Exec { command, .. } if command[0] == "sc.exe" && command[1] == "create")));
    assert!(has(&log, |a| matches!(a, Action::Exec { command, .. } if command.iter().any(|c| c == "localport=8443"))));
    assert!(has(&log, |a| matches!(a, Action::EnvSet { name, machine: false, .. } if name == "MYAPP_HOME")), "the user variable needs no prompt");
    let elevated: Vec<_> = rc.steps.iter().filter(|r| r.elevated).map(|r| r.id.as_str()).collect();
    assert_eq!(elevated, ["svc", "fw"]);
}

#[test]
fn declining_the_prompt_rolls_back_and_cancels() {
    let steps = "[[step]]\nid = \"cfg\"\ntype = \"env\"\nphases = [\"package\"]\nname = \"MYAPP_HOME\"\nvalue = \"x\"\n\n[[step]]\nid = \"fw\"\ntype = \"firewallRule\"\nphases = [\"package\"]\nprogram = \"x.exe\"\n";
    let (m, s) = case("windows", "decline_elevation = true\n[env]\nMYAPP_HOME = \"old\"\n", steps);
    let (code, log, rc) = apply(&m, &s, "user");
    assert_eq!(code, EXIT_CANCELLED);
    // the variable was set, then put back to its old value
    assert!(matches!(&log[0], Action::EnvSet { value: Some(v), .. } if v == "x"));
    assert!(matches!(&log[1], Action::EnvSet { value: Some(v), .. } if v == "old"), "{log:?}");
    assert!(rc.steps.is_empty());
}

#[test]
fn uninstall_batches_elevated_undo() {
    let steps = "[[step]]\nid = \"fw\"\ntype = \"firewallRule\"\nphases = [\"package\"]\nport = 8443\n\n[[step]]\nid = \"cert\"\ntype = \"certificate\"\nphases = [\"package\"]\nfile = \"{installDir}/ca.crt\"\nsubject = \"My CA\"\n";
    let (m, s) = case("linux", "programs = [\"ufw\", \"update-ca-certificates\"]", steps);
    let mut e = engine(&m, &s, "user");
    assert_eq!(e.run("package", None, false).unwrap(), 0);
    assert_eq!(s.prompts.get(), 1);
    s.log.borrow_mut().clear();
    e.uninstall(false).unwrap();
    assert_eq!(s.prompts.get(), 2, "one more prompt to undo both");
    let log: Vec<String> = s.log.borrow().iter().map(Action::describe).collect();
    assert!(log.iter().any(|l| l == "run ufw delete allow 8443/tcp (if available)"), "{log:?}");
    assert!(log.iter().any(|l| l == "remove /usr/local/share/ca-certificates/myapp-cert.crt"), "{log:?}");
}

#[test]
fn registry_plist_desktop_entry_are_platform_specific() {
    let steps = "[[step]]\nid = \"reg\"\ntype = \"registry\"\nphases = [\"package\"]\nkey = \"HKCU\\\\Software\\\\MyApp\"\nname = \"Telemetry\"\nvalue = 0\n\n[[step]]\nid = \"pl\"\ntype = \"plist\"\nphases = [\"package\"]\ndomain = \"com.example.myapp\"\nkey = \"Telemetry\"\nvalue = false\n\n[[step]]\nid = \"de\"\ntype = \"desktopEntry\"\nphases = [\"package\"]\nname = \"myapp-tools\"\n[step.entry]\nName = \"My App Tools\"\nExec = \"{installDir}/myapp --tools\"\nCategories = \"Development;\"\n";
    let (m, s) = case("windows", "", steps);
    let (_, log, _) = apply(&m, &s, "user");
    assert!(has(&log, |a| matches!(a, Action::RegSet { kind, value, .. } if kind == "REG_DWORD" && value == "0")));
    assert_eq!(log.len(), 1, "plist and desktopEntry do nothing on Windows: {log:?}");

    let (m, s) = case("macos", "", steps);
    let (_, log, _) = apply(&m, &s, "user");
    assert_eq!(log.len(), 1);
    assert!(matches!(&log[0], Action::Exec { command, .. } if command.join(" ") == "defaults write com.example.myapp Telemetry -bool false"));

    let (m, s) = case("linux", "", steps);
    let (_, log, _) = apply(&m, &s, "user");
    assert!(has(&log, |a| matches!(a, Action::WriteFile { path, content, .. } if path == "/home/sim/.local/share/applications/myapp-tools.desktop" && content.contains("Exec=/home/sim/.local/share/myapp/myapp --tools"))));
}

#[test]
fn files_already_in_place_are_satisfied() {
    let steps = "[[step]]\nid = \"auto\"\ntype = \"autostart\"\nphases = [\"package\"]\ntarget = \"/opt/myapp/myapp\"\n";
    let content = "[Desktop Entry]\nType=Application\nName=My App\nExec=\"/opt/myapp/myapp\"\nX-GNOME-Autostart-enabled=true\n";
    let (m, s) = case("linux", &format!("[texts]\n\"/home/sim/.config/autostart/myapp.desktop\" = '''{content}'''\n"), steps);
    let p = engine(&m, &s, "user").plan(None).unwrap();
    assert_eq!(p.items[0].status, Status::Satisfied, "{:?}", p.items[0]);
}

#[test]
fn font_and_certificate() {
    let steps = "[[step]]\nid = \"font\"\ntype = \"font\"\nphases = [\"package\"]\nfile = \"{installDir}/fonts/Inter.ttf\"\nname = \"Inter\"\n\n[[step]]\nid = \"cert\"\ntype = \"certificate\"\nphases = [\"package\"]\nfile = \"{installDir}/ca.crt\"\nsubject = \"My CA\"\n";
    let (m, s) = case("windows", "", steps);
    let (_, log, _) = apply(&m, &s, "user");
    assert!(has(&log, |a| matches!(a, Action::Copy { to, .. } if to == "C:\\Users\\sim\\AppData\\Local\\Microsoft\\Windows\\Fonts\\Inter.ttf")));
    assert!(has(&log, |a| matches!(a, Action::RegSet { name, .. } if name == "Inter (TrueType)")));
    assert!(has(&log, |a| matches!(a, Action::Exec { command, .. } if command.join(" ").starts_with("certutil -user -addstore -f Root"))));
    assert_eq!(s.prompts.get(), 0, "user fonts and the user certificate store need no prompt");
}

#[test]
fn custom_rust_and_typescript_steps() {
    let steps = "[[step]]\nid = \"config\"\ntype = \"custom\"\nruntime = \"rust\"\nhandler = \"example.defaultConfig\"\nphases = [\"package\"]\nvalue = \"theme = \\\"dark\\\"\\n\"\n\n[[step]]\nid = \"model\"\ntype = \"custom\"\nruntime = \"ts\"\nhandler = \"models.base\"\nphases = [\"bootstrap\", \"package\"]\n";
    let (m, s) = case("linux", "", steps);
    // without the Setup app the TypeScript step waits
    let p = engine(&m, &s, "user").plan(Some("package")).unwrap();
    assert_eq!(p.items[1].status, Status::Deferred);
    let (code, log, _) = apply(&m, &s, "user");
    assert_eq!(code, 0);
    assert!(matches!(&log[0], Action::WriteFile { path, content, .. } if path == "/home/sim/.local/share/com.example.myapp/config.toml" && content == "theme = \"dark\"\n"));

    // the Setup app hands over what the TypeScript step decided
    let mut e = engine(&m, &s, "user");
    e.ts_steps.insert("model".into(), TsStep { status: "missing".into(), detail: "Download the model".into(), actions: vec![Action::Download { url: "https://example.com/m.bin".into(), sha256: "0".repeat(64), to: "/tmp/m.bin".into() }], undo: vec![] });
    let p = e.plan(Some("package")).unwrap();
    assert_eq!(p.items[1].status, Status::Missing);
    assert_eq!(p.items[1].actions, ["download https://example.com/m.bin to /tmp/m.bin (SHA-256 verified)"]);

    assert!(Manifest::parse(&format!("{APP}\n[[step]]\nid = \"x\"\ntype = \"custom\"\nruntime = \"rust\"\nhandler = \"nope\"\nphases = [\"package\"]\n")).unwrap_err().contains("no Rust custom step"));
}

#[test]
fn elevated_helper_verifies_the_digest() {
    let dir = std::env::temp_dir().join(format!("fw-elevate-test-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let target = dir.join("written.txt");
    let plan = serde_json::json!({ "version": 1, "session": "t", "expires": u64::MAX, "tolerant": false, "steps": [{ "id": "a", "actions": [{ "op": "writeFile", "path": target.to_string_lossy(), "content": "ok" }] }] });
    let file = dir.join("plan.json");
    let bytes = serde_json::to_vec(&plan).unwrap();
    std::fs::write(&file, &bytes).unwrap();
    // a wrong digest is refused and nothing is written
    assert_eq!(elevate::run_helper(&Real, &file, &"0".repeat(64)), EXIT_FATAL);
    assert!(!target.exists());
    let digest = { use sha2::Digest; hex::encode(sha2::Sha256::digest(&bytes)) };
    assert_eq!(elevate::run_helper(&Real, &file, &digest), 0);
    assert_eq!(std::fs::read_to_string(&target).unwrap(), "ok");
    // an expired plan is refused
    let old = serde_json::json!({ "version": 1, "session": "t", "expires": 1, "tolerant": false, "steps": [] });
    let bytes = serde_json::to_vec(&old).unwrap();
    std::fs::write(&file, &bytes).unwrap();
    let digest = { use sha2::Digest; hex::encode(sha2::Sha256::digest(&bytes)) };
    assert_eq!(elevate::run_helper(&Real, &file, &digest), EXIT_FATAL);
    let _ = std::fs::remove_dir_all(&dir);
}

