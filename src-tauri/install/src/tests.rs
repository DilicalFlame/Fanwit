//! Scenario tests: the uv worked example (Section 16.7) on simulated machines.

use super::*;
use std::collections::BTreeMap;

const UV: &str = include_str!("fixtures/uv.toml");

fn sim(text: &str) -> Scenario {
    Scenario::parse(text).unwrap()
}

fn engine<'a>(m: &'a Manifest, s: &'a Scenario) -> Engine<'a> {
    let sel = selection(m, None, None, &[]).unwrap();
    let mut e = Engine::new(m, s, sel);
    e.out = Box::new(|_| {});
    e
}

fn status(p: &Plan, id: &str) -> Status {
    p.items.iter().find(|i| i.id == id).unwrap_or_else(|| panic!("{id} not in plan")).status
}

#[test]
fn existing_uv_is_used_and_not_ours() {
    let m = Manifest::parse(UV).unwrap();
    let s = sim("os = \"linux\"\nprograms = [\"uv\"]\n[commands]\n\"uv --version\" = { stdout = \"uv 0.5.4 (abc)\" }\n\"uv python find 3.12\" = { code = 0 }");
    let mut e = engine(&m, &s);
    let p = e.plan(Some("bootstrap")).unwrap();
    assert_eq!(status(&p, "uv"), Status::Satisfied);
    assert_eq!(status(&p, "python"), Status::Satisfied);
    assert_eq!(e.run("bootstrap", None, false).unwrap(), EXIT_OK);
    let rec = e.receipt.steps.iter().find(|r| r.id == "uv").unwrap();
    assert!(!rec.ours, "a uv that was already present is never removed");
    assert_eq!(e.receipt.exposed["UV_BIN"], "/usr/local/bin/uv");
}

#[test]
fn outdated_uv_is_replaced_from_the_sidecar() {
    let m = Manifest::parse(UV).unwrap();
    let s = sim("os = \"linux\"\nsidecars = [\"uv\"]\nprograms = [\"uv\"]\n[commands]\n\"uv --version\" = { stdout = \"uv 0.4.9\" }");
    let e = engine(&m, &s);
    let p = e.plan(Some("bootstrap")).unwrap();
    let uv = &p.items[0];
    assert_eq!(uv.status, Status::Outdated);
    assert_eq!(uv.strategy.as_deref(), Some("sidecar"));
    assert!(uv.actions[0].starts_with("copy <sidecar>/uv to /home/sim/.local/share/com.example.myapp/tools/uv/uv"), "{:?}", uv.actions);
    // python now runs against the uv we will install
    assert!(p.items[1].actions[0].contains("/tools/uv/uv python install 3.12"), "{:?}", p.items[1].actions);
}

#[test]
fn missing_uv_downloads_pinned_release_on_windows() {
    let m = Manifest::parse(UV).unwrap();
    let s = sim("os = \"windows\"");
    let e = engine(&m, &s);
    let p = e.plan(Some("bootstrap")).unwrap();
    let uv = &p.items[0];
    assert_eq!(uv.strategy.as_deref(), Some("download"));
    assert_eq!(uv.download, 12_000_000);
    assert_eq!(uv.actions.len(), 3, "download, extract, remove archive: {:?}", uv.actions);
    assert!(uv.actions[1].contains("C:\\Users\\sim\\AppData\\Roaming\\com.example.myapp\\tools\\uv"), "{:?}", uv.actions);
    assert_eq!(p.download, 12_000_000);
    assert_eq!(p.disk, 72_000_000);
    assert!(!p.elevation);
}

#[test]
fn offline_without_sidecar_defers_to_first_run() {
    let m = Manifest::parse(UV).unwrap();
    let s = sim("os = \"linux\"\nnetwork = false");
    let mut e = engine(&m, &s);
    let p = e.plan(Some("bootstrap")).unwrap();
    assert_eq!(status(&p, "uv"), Status::Deferred);
    assert!(p.items[0].detail.contains("no network") && p.items[0].detail.contains("will retry in package"), "{}", p.items[0].detail);
    // python needs the uv that is not there yet, so it waits too instead of planning a bad command
    assert_eq!(status(&p, "python"), Status::Deferred);
    assert!(p.items[1].detail.starts_with("waits for UV_BIN"), "{}", p.items[1].detail);
    // and in the last phase there is nowhere to defer to
    let p = e.plan(Some("firstRun")).unwrap();
    assert_eq!(status(&p, "uv"), Status::Blocked);
    assert_eq!(e.run("firstRun", None, false).unwrap(), EXIT_FATAL);
}

#[test]
fn macos_has_no_download_and_no_sidecar_so_it_blocks() {
    let m = Manifest::parse(UV).unwrap();
    let s = sim("os = \"macos\"");
    let p = engine(&m, &s).plan(Some("firstRun")).unwrap();
    assert!(p.blocked);
}

#[test]
fn failure_rolls_back_in_reverse_order() {
    let m = Manifest::parse(UV).unwrap();
    let s = sim("os = \"linux\"\nsidecars = [\"uv\"]\nfail = \"python install\"");
    let mut e = engine(&m, &s);
    assert_eq!(e.run("bootstrap", None, false).unwrap(), EXIT_FATAL);
    let log = s.log.borrow();
    let uv_dir = "/home/sim/.local/share/com.example.myapp/tools/uv";
    assert!(matches!(&log[0], Action::Copy { .. }));
    // python failed before doing anything; its explicit uninstall still runs, then uv is removed
    assert_eq!(log[1], Action::Remove { path: "/home/sim/.local/share/com.example.myapp/python".into() });
    assert_eq!(log[2], Action::Remove { path: uv_dir.into() });
    assert!(e.receipt.steps.is_empty(), "nothing is recorded after a rollback");
}

#[test]
fn uninstall_reverses_only_what_is_ours() {
    let m = Manifest::parse(UV).unwrap();
    let s = sim("os = \"linux\"\nsidecars = [\"uv\"]");
    let mut e = engine(&m, &s);
    assert_eq!(e.run("bootstrap", None, false).unwrap(), EXIT_OK);
    assert_eq!(e.run("package", None, false).unwrap(), EXIT_OK);
    let ids: Vec<_> = e.receipt.steps.iter().map(|r| (r.id.as_str(), r.ours)).collect();
    assert_eq!(ids, [("uv", true), ("python", true), ("cliPath", true)]);
    s.log.borrow_mut().clear();
    e.uninstall(false).unwrap();
    let log = s.log.borrow();
    // reverse order: cli link, python, uv, then the receipt folder
    assert_eq!(log[0], Action::Remove { path: "/home/sim/.local/bin/myapp-cli".into() });
    assert_eq!(log[1], Action::Remove { path: "/home/sim/.local/share/com.example.myapp/python".into() });
    assert_eq!(log[2], Action::Remove { path: "/home/sim/.local/share/com.example.myapp/tools/uv".into() });
    assert_eq!(log[3], Action::Remove { path: "/home/sim/.local/share/myapp/.install".into() });
}

#[test]
fn selection_flags_answers_and_when() {
    let m = Manifest::parse(UV).unwrap();
    let s = sim("os = \"windows\"");
    let flags = vec![("components".to_string(), "cli".to_string()), ("addToPath".into(), "false".into())];
    let sel = selection(&m, None, None, &flags).unwrap();
    assert_eq!(sel.components, ["core", "cli"], "required components are always selected");
    let p = Engine::new(&m, &s, sel).plan(None).unwrap();
    assert!(p.items.is_empty(), "python is deselected and addToPath is off");
    assert!(selection(&m, None, None, &[("nope".into(), "1".into())]).is_err());
    let answers: toml::Table = toml::from_str("scope = \"machine\"\ncomponents = [\"core\"]").unwrap();
    let sel = selection(&m, None, Some(&answers), &[]).unwrap();
    assert_eq!((sel.scope.as_str(), sel.components.len()), ("machine", 1));
}

#[test]
fn machine_scope_paths_need_elevation() {
    let m = Manifest::parse(UV).unwrap();
    let s = sim("os = \"windows\"");
    let sel = selection(&m, None, None, &[("scope".into(), "machine".into()), ("components".into(), "cli".into())]).unwrap();
    let mut e = Engine::new(&m, &s, sel);
    e.out = Box::new(|_| {});
    let p = e.plan(Some("package")).unwrap();
    assert!(p.elevation);
    assert_eq!(p.items[0].actions, ["add C:\\Program Files\\My App to the machine PATH"]);
    // one administrator prompt, and the record remembers that undoing it needs one too
    assert_eq!(e.run("package", None, false).unwrap(), EXIT_OK);
    assert_eq!(s.prompts.get(), 1);
    assert!(e.receipt.steps.iter().any(|r| r.id == "cliPath" && r.elevated));
}

#[test]
fn validation_rejects_unpinned_downloads_and_cycles() {
    let bad = UV.replace("1111111111111111111111111111111111111111111111111111111111111111", "<pinned hash>");
    assert!(Manifest::parse(&bad).unwrap_err().contains("sha256"));
    let cyc = UV.replace("after = [\"uv\"]", "after = [\"cliPath\"]").replace("phases = [\"package\", \"firstRun\"]", "phases = [\"package\", \"firstRun\"]\nafter = [\"python\"]");
    assert!(Manifest::parse(&cyc).unwrap_err().contains("cycle"));
}

#[test]
fn when_clauses() {
    let t = |id: &str| id == "a" || id == "component.b";
    assert!(manifest::eval_when("a && component.b", &t));
    assert!(!manifest::eval_when("a && !component.b", &t));
    assert!(manifest::eval_when("c || (a && !c)", &t));
    assert!(!manifest::eval_when("!silent && c", &t));
}

#[test]
fn receipt_round_trips_as_toml() {
    let m = Manifest::parse(UV).unwrap();
    let s = sim("os = \"linux\"\nsidecars = [\"uv\"]");
    let mut e = engine(&m, &s);
    e.run("bootstrap", None, false).unwrap();
    let text = toml::to_string(&e.receipt).unwrap();
    let back: Receipt = toml::from_str(&text).unwrap();
    assert_eq!(back.steps.len(), 2);
    assert_eq!(back.steps[0].actions, e.receipt.steps[0].actions);
    let _: BTreeMap<String, String> = back.exposed;
}
