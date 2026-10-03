//! Built in step types beyond prereq, download, sidecar, run and path (Section 16.6.1). Each one
//! compiles to plain [`Action`]s per OS, so journaling, rollback, receipts and elevation work the
//! same for all of them. Undo comes from the actions' inverses plus `undo` (runs first) and
//! `undo_after` (runs last) for commands such as "stop the service" and "refresh the cache".

use crate::engine::{block, Engine, Prepared, Status};
use crate::manifest::Step;
use crate::system::Action;
use std::collections::BTreeMap;
use std::path::Path;

type Exposed = BTreeMap<String, String>;

/// The step does not apply on this OS (it is set at build time, or the OS has no such thing).
fn not_here(p: &mut Prepared, why: &str) {
    p.item.status = Status::Satisfied;
    p.item.detail = why.to_string();
}

fn value_text(v: &Option<toml::Value>) -> String {
    match v {
        Some(toml::Value::String(s)) => s.clone(),
        Some(toml::Value::Boolean(b)) => b.to_string(),
        Some(v) => v.to_string(),
        None => String::new(),
    }
}

/// One `.desktop` file from key/value pairs, `[Desktop Entry]` first.
fn desktop_file(entries: &[(&str, String)]) -> String {
    let mut s = String::from("[Desktop Entry]\n");
    for (k, v) in entries.iter().filter(|(_, v)| !v.is_empty()) {
        s.push_str(&format!("{k}={v}\n"));
    }
    s
}

/// A launchd property list running `args` (LaunchAgent or LaunchDaemon).
fn launchd_plist(label: &str, args: &[String], keep_alive: bool) -> String {
    let esc = |s: &str| s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;");
    let items = args.iter().map(|a| format!("    <string>{}</string>\n", esc(a))).collect::<String>();
    format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n<plist version=\"1.0\">\n<dict>\n  <key>Label</key>\n  <string>{}</string>\n  <key>ProgramArguments</key>\n  <array>\n{items}  </array>\n  <key>RunAtLoad</key>\n  <true/>\n  <key>KeepAlive</key>\n  <{}/>\n</dict>\n</plist>\n",
        esc(label),
        if keep_alive { "true" } else { "false" }
    )
}

/// Quote a program and its arguments for a Windows command line or a desktop `Exec=`.
fn cmdline(target: &str, args: &[String]) -> String {
    std::iter::once(format!("\"{target}\"")).chain(args.iter().map(|a| if a.contains(' ') { format!("\"{a}\"") } else { a.clone() })).collect::<Vec<_>>().join(" ")
}

impl Engine<'_> {
    /// Resolve the target; on Windows a bare name gets `.exe`.
    fn target(&self, s: &Step, ex: &Exposed) -> String {
        let t = self.path(s.target.as_deref().unwrap_or_default(), ex);
        if self.os() == "windows" && !crate::engine::split_path(&t).1.contains('.') { format!("{t}.exe") } else { t }
    }

    fn display_name(&self, s: &Step) -> String {
        s.name.clone().unwrap_or_else(|| self.manifest.app.name.clone())
    }

    /// Write a file unless it already holds exactly `content`; remembers what it replaces.
    fn write_file(&self, p: &mut Prepared, path: String, content: String) -> bool {
        let previous = self.sys.read_text(Path::new(&path));
        if previous.as_deref() == Some(content.as_str()) {
            return false;
        }
        p.actions.push(Action::WriteFile { path, content, previous });
        true
    }

    /// Set a registry value unless it already has it; remembers the old value.
    fn reg_set(&self, p: &mut Prepared, key: &str, name: &str, value: &str, kind: &str) -> bool {
        let previous = self.sys.reg_get(key, name);
        if previous.as_ref().map(|v| v.value == value).unwrap_or(false) {
            return false;
        }
        // a key an earlier action of this step creates counts as created too
        let created_key = previous.is_none() && !self.sys.reg_key_exists(key) && !p.actions.iter().any(|a| matches!(a, Action::RegSet { key: k, created_key: true, .. } if k == key));
        p.actions.push(Action::RegSet { key: key.into(), name: name.into(), value: value.into(), kind: kind.into(), previous, created_key });
        true
    }

    fn classes(&self) -> &'static str {
        if self.machine() { "HKLM\\Software\\Classes" } else { "HKCU\\Software\\Classes" }
    }

    /// Mark satisfied when nothing needs to change.
    fn settle(&self, p: &mut Prepared, changed: bool) {
        if !changed {
            p.item.status = Status::Satisfied;
        }
    }

    pub(crate) fn prepare_system(&self, s: &Step, p: &mut Prepared, ex: &Exposed) {
        let os = self.os();
        let machine = self.machine();
        let app = &self.manifest.app;
        match (s.kind.as_str(), os.as_str()) {
            // ---------- shortcut ----------
            ("shortcut", _) => {
                let target = self.target(s, ex);
                let name = self.display_name(s);
                let places = if s.location.is_empty() { vec!["startMenu".to_string()] } else { s.location.clone() };
                p.item.elevation |= machine;
                let mut changed = false;
                for place in places {
                    let dir = self.path(&format!("{{{place}}}"), ex);
                    match os.as_str() {
                        "windows" => {
                            let lnk = format!("{dir}\\{name}.lnk");
                            if self.sys.file_sha256(Path::new(&lnk)).is_none() {
                                // WScript.Shell is on every Windows; .lnk files are binary, so build them there
                                let q = |v: &str| format!("'{}'", v.replace('\'', "''"));
                                let script = format!(
                                    "$s=(New-Object -ComObject WScript.Shell).CreateShortcut({});$s.TargetPath={};$s.Arguments={};$s.WorkingDirectory={};{}$s.Save()",
                                    q(&lnk),
                                    q(&target),
                                    q(&s.args.join(" ")),
                                    q(crate::engine::split_path(&target).0),
                                    s.icon.as_ref().map(|i| format!("$s.IconLocation={};", q(&self.path(i, ex)))).unwrap_or_default()
                                );
                                p.actions.push(Action::exec(vec!["powershell".into(), "-NoProfile".into(), "-NonInteractive".into(), "-Command".into(), script]));
                                p.undo_after.push(Action::Remove { path: lnk });
                                changed = true;
                            }
                        }
                        "macos" => {
                            let link = format!("{dir}/{name}");
                            if self.sys.file_sha256(Path::new(&link)).is_none() {
                                p.actions.push(Action::Symlink { target: target.clone(), link });
                                changed = true;
                            }
                        }
                        _ => {
                            let icon = s.icon.as_ref().map(|i| self.path(i, ex)).unwrap_or_else(|| app.slug.clone());
                            let file = format!("{dir}/{}.desktop", app.slug);
                            changed |= self.write_file(p, file, desktop_file(&[("Type", "Application".into()), ("Name", name.clone()), ("Exec", cmdline(&target, &s.args)), ("Icon", icon), ("Terminal", "false".into()), ("Comment", s.description.clone().unwrap_or_default())]));
                        }
                    }
                }
                if os == "linux" {
                    p.actions.push(Action::exec_optional(vec!["update-desktop-database".into(), self.path("{startMenu}", ex)]));
                }
                self.settle(p, changed);
            }

            // ---------- fileAssociation ----------
            ("fileAssociation", "macos") => not_here(p, "macOS takes file associations from Info.plist: set bundle.fileAssociations in tauri.conf.json"),
            ("fileAssociation", "windows") => {
                let ext = s.ext.clone().unwrap_or_default();
                let ext = if ext.starts_with('.') { ext } else { format!(".{ext}") };
                let prog = s.prog_id.clone().unwrap_or_else(|| format!("{}{}", app.slug, ext));
                let target = self.target(s, ex);
                let c = self.classes();
                p.item.elevation |= machine;
                let mut changed = self.reg_set(p, &format!("{c}\\{ext}"), "", &prog, "REG_SZ");
                changed |= self.reg_set(p, &format!("{c}\\{prog}"), "", &s.description.clone().unwrap_or_else(|| format!("{} file", app.name)), "REG_SZ");
                changed |= self.reg_set(p, &format!("{c}\\{prog}\\DefaultIcon"), "", &format!("\"{}\",0", s.icon.as_ref().map(|i| self.path(i, ex)).unwrap_or_else(|| target.clone())), "REG_SZ");
                changed |= self.reg_set(p, &format!("{c}\\{prog}\\shell\\open\\command"), "", &format!("\"{target}\" \"%1\""), "REG_SZ");
                p.undo.push(Action::RegDelete { key: format!("{c}\\{prog}"), name: None });
                self.settle(p, changed);
            }
            ("fileAssociation", _) => {
                let ext = s.ext.clone().unwrap_or_default().trim_start_matches('.').to_string();
                let mime = s.mime.clone().unwrap_or_else(|| format!("application/x-{}-{ext}", app.slug));
                let data = if machine { "/usr/share".to_string() } else { self.path("{home}/.local/share", ex) };
                p.item.elevation |= machine;
                let xml = format!(
                    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<mime-info xmlns=\"http://www.freedesktop.org/standards/shared-mime-info\">\n  <mime-type type=\"{mime}\">\n    <comment>{}</comment>\n    <glob pattern=\"*.{ext}\"/>\n  </mime-type>\n</mime-info>\n",
                    s.description.clone().unwrap_or_else(|| format!("{} file", app.name))
                );
                let handler = format!("{}-{ext}.desktop", app.slug);
                let target = self.target(s, ex);
                let mut changed = self.write_file(p, format!("{data}/mime/packages/{}-{ext}.xml", app.slug), xml);
                changed |= self.write_file(
                    p,
                    format!("{data}/applications/{handler}"),
                    desktop_file(&[("Type", "Application".into()), ("Name", app.name.clone()), ("Exec", format!("{} %f", cmdline(&target, &s.args))), ("MimeType", format!("{mime};")), ("NoDisplay", "true".into())]),
                );
                if changed {
                    p.actions.push(Action::exec_optional(vec!["update-mime-database".into(), format!("{data}/mime")]));
                    p.actions.push(Action::exec_optional(vec!["xdg-mime".into(), "default".into(), handler, mime]));
                }
                p.undo_after.push(Action::exec_optional(vec!["update-mime-database".into(), format!("{data}/mime")]));
                self.settle(p, changed);
            }

            // ---------- urlScheme ----------
            ("urlScheme", "macos") => not_here(p, "macOS takes URL schemes from Info.plist: set plugins.deep-link in tauri.conf.json"),
            ("urlScheme", "windows") => {
                let scheme = s.scheme.clone().unwrap_or_default();
                let c = self.classes();
                let target = self.target(s, ex);
                p.item.elevation |= machine;
                let mut changed = self.reg_set(p, &format!("{c}\\{scheme}"), "", &format!("URL:{}", self.display_name(s)), "REG_SZ");
                changed |= self.reg_set(p, &format!("{c}\\{scheme}"), "URL Protocol", "", "REG_SZ");
                changed |= self.reg_set(p, &format!("{c}\\{scheme}\\shell\\open\\command"), "", &format!("\"{target}\" \"%1\""), "REG_SZ");
                p.undo.push(Action::RegDelete { key: format!("{c}\\{scheme}"), name: None });
                self.settle(p, changed);
            }
            ("urlScheme", _) => {
                let scheme = s.scheme.clone().unwrap_or_default();
                let file = format!("{}-{scheme}-handler.desktop", app.slug);
                let dir = if machine { "/usr/share/applications".to_string() } else { self.path("{home}/.local/share/applications", ex) };
                p.item.elevation |= machine;
                let target = self.target(s, ex);
                let changed = self.write_file(
                    p,
                    format!("{dir}/{file}"),
                    desktop_file(&[("Type", "Application".into()), ("Name", app.name.clone()), ("Exec", format!("{} %u", cmdline(&target, &s.args))), ("MimeType", format!("x-scheme-handler/{scheme};")), ("NoDisplay", "true".into())]),
                );
                if changed {
                    p.actions.push(Action::exec_optional(vec!["xdg-mime".into(), "default".into(), file, format!("x-scheme-handler/{scheme}")]));
                }
                self.settle(p, changed);
            }

            // ---------- autostart ----------
            ("autostart", "windows") => {
                let key = if machine { "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" } else { "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" };
                p.item.elevation |= machine;
                let changed = self.reg_set(p, key, &self.display_name(s), &cmdline(&self.target(s, ex), &s.args), "REG_SZ");
                self.settle(p, changed);
            }
            ("autostart", "macos") => {
                let dir = if machine { "/Library/LaunchAgents".to_string() } else { self.path("{home}/Library/LaunchAgents", ex) };
                p.item.elevation |= machine;
                let label = format!("{}.autostart", app.id);
                let args: Vec<String> = std::iter::once(self.target(s, ex)).chain(s.args.clone()).collect();
                let changed = self.write_file(p, format!("{dir}/{label}.plist"), launchd_plist(&label, &args, false));
                self.settle(p, changed);
            }
            ("autostart", _) => {
                let dir = if machine { "/etc/xdg/autostart".to_string() } else { self.path("{home}/.config/autostart", ex) };
                p.item.elevation |= machine;
                let changed = self.write_file(
                    p,
                    format!("{dir}/{}.desktop", app.slug),
                    desktop_file(&[("Type", "Application".into()), ("Name", self.display_name(s)), ("Exec", cmdline(&self.target(s, ex), &s.args)), ("X-GNOME-Autostart-enabled", "true".into())]),
                );
                self.settle(p, changed);
            }

            // ---------- service ----------
            ("service", "windows") => {
                // the target must speak the Service Control Manager protocol
                let name = s.name.clone().unwrap_or_else(|| app.slug.clone());
                p.item.elevation = true;
                if self.sys.exec(&["sc.exe".into(), "query".into(), name.clone()], &BTreeMap::new()).code == 0 {
                    p.item.status = Status::Satisfied;
                } else {
                    p.actions.push(Action::exec(vec![
                        "sc.exe".into(),
                        "create".into(),
                        name.clone(),
                        "binPath=".into(),
                        cmdline(&self.target(s, ex), &s.args),
                        "start=".into(),
                        "auto".into(),
                        "DisplayName=".into(),
                        if s.title.is_empty() { name.clone() } else { s.title.clone() },
                    ]));
                    p.actions.push(Action::exec(vec!["sc.exe".into(), "start".into(), name.clone()]));
                }
                p.undo.push(Action::exec_optional(vec!["sc.exe".into(), "stop".into(), name.clone()]));
                p.undo.push(Action::exec_optional(vec!["sc.exe".into(), "delete".into(), name]));
            }
            ("service", "macos") => {
                let label = s.name.clone().unwrap_or_else(|| format!("{}.service", app.id));
                let dir = if s.user { self.path("{home}/Library/LaunchAgents", ex) } else { "/Library/LaunchDaemons".to_string() };
                p.item.elevation |= !s.user;
                let plist = format!("{dir}/{label}.plist");
                let args: Vec<String> = std::iter::once(self.target(s, ex)).chain(s.args.clone()).collect();
                if self.write_file(p, plist.clone(), launchd_plist(&label, &args, true)) {
                    p.actions.push(Action::exec(vec!["launchctl".into(), "load".into(), "-w".into(), plist.clone()]));
                } else {
                    p.item.status = Status::Satisfied;
                }
                p.undo.push(Action::exec_optional(vec!["launchctl".into(), "unload".into(), "-w".into(), plist]));
            }
            ("service", _) => {
                let name = s.name.clone().unwrap_or_else(|| app.slug.clone());
                let (dir, ctl): (String, Vec<String>) =
                    if s.user { (self.path("{home}/.config/systemd/user", ex), vec!["systemctl".into(), "--user".into()]) } else { ("/etc/systemd/system".into(), vec!["systemctl".into()]) };
                p.item.elevation |= !s.user;
                let unit = format!(
                    "[Unit]\nDescription={}\n\n[Service]\nExecStart={}\nRestart=on-failure\n\n[Install]\nWantedBy={}\n",
                    if s.title.is_empty() { &name } else { &s.title },
                    cmdline(&self.target(s, ex), &s.args),
                    if s.user { "default.target" } else { "multi-user.target" }
                );
                let with = |extra: &[&str]| ctl.iter().cloned().chain(extra.iter().map(|x| x.to_string())).collect::<Vec<_>>();
                if self.write_file(p, format!("{dir}/{name}.service"), unit) {
                    p.actions.push(Action::exec(with(&["daemon-reload"])));
                    p.actions.push(Action::exec(with(&["enable", "--now", &format!("{name}.service")])));
                } else {
                    p.item.status = Status::Satisfied;
                }
                p.undo.push(Action::exec_optional(with(&["disable", "--now", &format!("{name}.service")])));
                p.undo_after.push(Action::exec_optional(with(&["daemon-reload"])));
            }

            // ---------- env ----------
            ("env", "windows") => {
                let name = s.name.clone().unwrap_or_default();
                let value = self.path(&value_text(&s.value), ex);
                p.item.elevation |= machine;
                let previous = self.sys.env_get(&name, machine);
                if previous.as_deref() == Some(value.as_str()) {
                    p.item.status = Status::Satisfied;
                } else {
                    p.actions.push(Action::EnvSet { name, value: Some(value), machine, previous });
                }
            }
            ("env", "macos") => {
                // launchd sets it for apps started at login; launchctl setenv for this session
                let name = s.name.clone().unwrap_or_default();
                let value = self.path(&value_text(&s.value), ex);
                let label = format!("{}.env.{}", app.id, name.to_lowercase());
                let plist = launchd_plist(&label, &["/bin/launchctl".into(), "setenv".into(), name.clone(), value.clone()], false);
                if self.write_file(p, self.path(&format!("{{home}}/Library/LaunchAgents/{label}.plist"), ex), plist) {
                    p.actions.push(Action::exec(vec!["launchctl".into(), "setenv".into(), name.clone(), value]));
                } else {
                    p.item.status = Status::Satisfied;
                }
                p.undo.push(Action::exec_optional(vec!["launchctl".into(), "unsetenv".into(), name]));
            }
            ("env", _) => {
                // systemd's environment.d is read for the user session and every desktop app
                let name = s.name.clone().unwrap_or_default();
                let value = self.path(&value_text(&s.value), ex);
                let dir = if machine { "/etc/environment.d".to_string() } else { self.path("{home}/.config/environment.d", ex) };
                p.item.elevation |= machine;
                let changed = self.write_file(p, format!("{dir}/60-{}-{}.conf", app.slug, name.to_lowercase()), format!("{name}={value}\n"));
                self.settle(p, changed);
            }

            // ---------- registry ----------
            ("registry", "windows") => {
                let key = self.path(s.key.as_deref().unwrap_or_default(), ex);
                p.item.elevation |= key.to_uppercase().starts_with("HKLM");
                let kind = s.value_type.clone().unwrap_or_else(|| if matches!(s.value, Some(toml::Value::Integer(_))) { "REG_DWORD".into() } else { "REG_SZ".into() });
                let changed = self.reg_set(p, &key, s.name.as_deref().unwrap_or(""), &self.path(&value_text(&s.value), ex), &kind);
                self.settle(p, changed);
            }
            ("registry", _) => not_here(p, &format!("registry is Windows only (skipped on {os})")),

            // ---------- plist ----------
            ("plist", "macos") => {
                let domain = self.path(s.domain.as_deref().unwrap_or_default(), ex);
                let key = s.key.clone().unwrap_or_default();
                let (flag, value) = match &s.value {
                    Some(toml::Value::Boolean(b)) => ("-bool", b.to_string()),
                    Some(toml::Value::Integer(i)) => ("-int", i.to_string()),
                    Some(toml::Value::Float(f)) => ("-float", f.to_string()),
                    v => ("-string", value_text(v)),
                };
                let current = self.sys.exec(&["defaults".into(), "read".into(), domain.clone(), key.clone()], &BTreeMap::new());
                let normalised = if flag == "-bool" { if value == "true" { "1".into() } else { "0".into() } } else { value.clone() };
                if current.code == 0 && current.stdout.trim() == normalised {
                    p.item.status = Status::Satisfied;
                } else {
                    p.actions.push(Action::exec(vec!["defaults".into(), "write".into(), domain.clone(), key.clone(), flag.into(), value]));
                    // put back what was there, or delete the key we added
                    p.undo.push(if current.code == 0 {
                        Action::exec_optional(vec!["defaults".into(), "write".into(), domain, key, "-string".into(), current.stdout.trim().to_string()])
                    } else {
                        Action::exec_optional(vec!["defaults".into(), "delete".into(), domain, key])
                    });
                }
            }
            ("plist", _) => not_here(p, &format!("plist is macOS only (skipped on {os})")),

            // ---------- desktopEntry ----------
            ("desktopEntry", "linux") => {
                let file = s.name.clone().unwrap_or_else(|| app.slug.clone());
                let mut entries: Vec<(&str, String)> = vec![("Type", s.entry.get("Type").cloned().unwrap_or_else(|| "Application".into()))];
                entries.extend(s.entry.iter().filter(|(k, _)| *k != "Type").map(|(k, v)| (k.as_str(), self.path(v, ex))));
                let dir = if machine { "/usr/share/applications".to_string() } else { self.path("{startMenu}", ex) };
                p.item.elevation |= machine;
                let changed = self.write_file(p, format!("{dir}/{file}.desktop"), desktop_file(&entries));
                if changed {
                    p.actions.push(Action::exec_optional(vec!["update-desktop-database".into(), dir]));
                }
                self.settle(p, changed);
            }
            ("desktopEntry", _) => not_here(p, &format!("desktopEntry is Linux only (skipped on {os})")),

            // ---------- firewallRule ----------
            ("firewallRule", "windows") => {
                let name = self.display_name(s);
                p.item.elevation = true;
                let show = self.sys.exec(&["netsh".into(), "advfirewall".into(), "firewall".into(), "show".into(), "rule".into(), format!("name={name}")], &BTreeMap::new());
                if show.code == 0 {
                    p.item.status = Status::Satisfied;
                } else {
                    let mut add: Vec<String> = ["netsh", "advfirewall", "firewall", "add", "rule"].iter().map(|x| x.to_string()).collect();
                    add.extend([format!("name={name}"), "dir=in".into(), "action=allow".into(), "enable=yes".into()]);
                    if let Some(prog) = &s.program {
                        add.push(format!("program={}", self.path(prog, ex)));
                    }
                    if let Some(port) = s.port {
                        add.push(format!("protocol={}", s.protocol.clone().unwrap_or_else(|| "TCP".into()).to_uppercase()));
                        add.push(format!("localport={port}"));
                    }
                    p.actions.push(Action::exec(add));
                }
                p.undo.push(Action::exec_optional(vec!["netsh".into(), "advfirewall".into(), "firewall".into(), "delete".into(), "rule".into(), format!("name={name}")]));
            }
            ("firewallRule", "macos") => not_here(p, "macOS asks the user the first time the app accepts connections"),
            ("firewallRule", _) => {
                let Some(port) = s.port else { return not_here(p, "Linux firewalls open ports, not programs: set port") };
                let spec = format!("{port}/{}", s.protocol.clone().unwrap_or_else(|| "tcp".into()).to_lowercase());
                p.item.elevation = true;
                if self.sys.which("ufw").is_some() {
                    p.actions.push(Action::exec(vec!["ufw".into(), "allow".into(), spec.clone()]));
                    p.undo.push(Action::exec_optional(vec!["ufw".into(), "delete".into(), "allow".into(), spec]));
                } else if self.sys.which("firewall-cmd").is_some() {
                    p.actions.push(Action::exec(vec!["firewall-cmd".into(), "--permanent".into(), format!("--add-port={spec}")]));
                    p.actions.push(Action::exec(vec!["firewall-cmd".into(), "--reload".into()]));
                    p.undo.push(Action::exec_optional(vec!["firewall-cmd".into(), "--permanent".into(), format!("--remove-port={spec}")]));
                    p.undo_after.push(Action::exec_optional(vec!["firewall-cmd".into(), "--reload".into()]));
                } else {
                    not_here(p, "no ufw or firewalld on this system");
                }
            }

            // ---------- font ----------
            ("font", _) => {
                let file = self.path(s.file.as_deref().unwrap_or_default(), ex);
                let base = crate::engine::split_path(&file).1.to_string();
                p.item.elevation |= machine;
                let dir = match (os.as_str(), machine) {
                    ("windows", false) => self.path("{home}\\AppData\\Local\\Microsoft\\Windows\\Fonts", ex),
                    ("windows", true) => format!("{}\\Fonts", self.sys.var("SystemRoot").unwrap_or_else(|| "C:\\Windows".into())),
                    ("macos", false) => self.path("{home}/Library/Fonts", ex),
                    ("macos", true) => "/Library/Fonts".into(),
                    (_, false) => self.path("{home}/.local/share/fonts", ex),
                    (_, true) => "/usr/local/share/fonts".into(),
                };
                let dest = self.path(&format!("{dir}/{base}"), ex);
                if self.sys.file_sha256(Path::new(&dest)).is_some() {
                    p.item.status = Status::Satisfied;
                } else {
                    p.actions.push(Action::Copy { from: file, to: dest.clone() });
                    if os == "windows" {
                        // per user fonts need their registry entry; machine fonts are found by folder
                        let hive = if machine { "HKLM" } else { "HKCU" };
                        let label = format!("{} (TrueType)", s.name.clone().unwrap_or_else(|| base.trim_end_matches(".ttf").trim_end_matches(".otf").to_string()));
                        self.reg_set(p, &format!("{hive}\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts"), &label, if machine { &base } else { &dest }, "REG_SZ");
                    }
                    if os == "linux" {
                        p.actions.push(Action::exec_optional(vec!["fc-cache".into(), "-f".into(), dir]));
                    }
                }
            }

            // ---------- certificate ----------
            ("certificate", _) => {
                let file = self.path(s.file.as_deref().unwrap_or_default(), ex);
                let subject = s.subject.clone().unwrap_or_default();
                match os.as_str() {
                    "windows" => {
                        p.item.elevation |= machine;
                        let user: Vec<String> = if machine { vec![] } else { vec!["-user".into()] };
                        let cmd = |verb: &str, extra: Vec<String>| std::iter::once("certutil".to_string()).chain(user.clone()).chain([verb.to_string()]).chain(extra).collect::<Vec<_>>();
                        if self.sys.exec(&cmd("-verifystore", vec!["Root".into(), subject.clone()]), &BTreeMap::new()).code == 0 {
                            p.item.status = Status::Satisfied;
                        } else {
                            // adding to the per user Root store shows a Windows confirmation dialog
                            p.actions.push(Action::exec(cmd("-addstore", vec!["-f".into(), "Root".into(), file])));
                        }
                        p.undo.push(Action::exec_optional(cmd("-delstore", vec!["Root".into(), subject])));
                    }
                    "macos" => {
                        p.item.elevation |= machine;
                        if self.sys.exec(&["security".into(), "find-certificate".into(), "-c".into(), subject.clone()], &BTreeMap::new()).code == 0 {
                            p.item.status = Status::Satisfied;
                        } else {
                            let keychain = if machine { "/Library/Keychains/System.keychain".to_string() } else { self.path("{home}/Library/Keychains/login.keychain-db", ex) };
                            let mut add = vec!["security".to_string(), "add-trusted-cert".into()];
                            if machine {
                                add.push("-d".into());
                            }
                            add.extend(["-r".into(), "trustRoot".into(), "-k".into(), keychain, file.clone()]);
                            p.actions.push(Action::exec(add));
                        }
                        p.undo.push(Action::exec_optional(vec!["security".into(), "remove-trusted-cert".into(), file]));
                    }
                    _ => {
                        // the system CA bundle only: Linux has no per user trust store
                        p.item.elevation = true;
                        let (dir, tool) = if self.sys.which("update-ca-trust").is_some() { ("/etc/pki/ca-trust/source/anchors", "update-ca-trust") } else { ("/usr/local/share/ca-certificates", "update-ca-certificates") };
                        let dest = format!("{dir}/{}-{}.crt", app.slug, s.id);
                        if self.sys.file_sha256(Path::new(&dest)).is_some() {
                            p.item.status = Status::Satisfied;
                        } else {
                            p.actions.push(Action::Copy { from: file, to: dest });
                            p.actions.push(Action::exec(vec![tool.into()]));
                        }
                        p.undo_after.push(Action::exec_optional(vec![tool.into()]));
                    }
                }
            }

            // ---------- custom ----------
            ("custom", _) => match (s.runtime.as_deref(), self.ts_steps.get(&s.id)) {
                (Some("rust"), _) => crate::custom::prepare(self, s, p, ex),
                // the Setup app evaluated the TypeScript step and queued its actions
                (_, Some(t)) => {
                    p.item.status = if t.status == "satisfied" { Status::Satisfied } else { Status::Missing };
                    p.item.detail = t.detail.clone();
                    p.item.elevation |= machine;
                    p.actions = t.actions.clone();
                    p.undo.extend(t.undo.iter().cloned());
                }
                // TypeScript steps need a webview: only the Setup app can run them
                _ => {
                    p.item.status = Status::Deferred;
                    p.item.detail = "runs in the Setup app (TypeScript)".into();
                    p.ts = true;
                }
            },

            (other, _) => block(p, &format!("step type {other} is not supported")),
        }
    }
}
