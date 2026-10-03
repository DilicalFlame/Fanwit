//! The machine the engine looks at and changes: the real one, or a simulated scenario (Section 16.1, I6).

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::cell::{Cell, RefCell};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::process::Command;

/// A registry value as `reg.exe` reports it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RegValue {
    pub kind: String,
    pub value: String,
}

/// Every system change is one of these. They are journaled before they happen and recorded in the receipt.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "camelCase")]
pub enum Action {
    Copy { from: String, to: String },
    Download { url: String, sha256: String, to: String },
    Extract { archive: String, to: String },
    /// `optional`: a missing program or a failure is not an error (cache refreshers and the like)
    Exec {
        command: Vec<String>,
        env: BTreeMap<String, String>,
        #[serde(default)]
        optional: bool,
    },
    Remove { path: String },
    Symlink { target: String, link: String },
    PathAdd { dir: String, machine: bool },
    PathRemove { dir: String, machine: bool },
    /// `previous` holds the content it replaced, so undo restores it instead of deleting
    WriteFile {
        path: String,
        content: String,
        #[serde(default)]
        previous: Option<String>,
    },
    /// Windows registry; an empty `name` is the key's default value
    RegSet {
        key: String,
        name: String,
        value: String,
        kind: String,
        #[serde(default)]
        previous: Option<RegValue>,
        /// the key did not exist before: undo deletes the whole key
        #[serde(default)]
        created_key: bool,
    },
    /// `name: None` deletes the whole key
    RegDelete {
        key: String,
        #[serde(default)]
        name: Option<String>,
    },
    /// Windows user or machine environment variable; `value: None` removes it
    EnvSet {
        name: String,
        value: Option<String>,
        machine: bool,
        #[serde(default)]
        previous: Option<String>,
    },
}

impl Action {
    pub fn exec(command: Vec<String>) -> Action {
        Action::Exec { command, env: BTreeMap::new(), optional: false }
    }
    pub fn exec_optional(command: Vec<String>) -> Action {
        Action::Exec { command, env: BTreeMap::new(), optional: true }
    }

    /// The action that undoes this one, when there is one.
    pub fn inverse(&self) -> Option<Action> {
        match self {
            Action::Copy { to, .. } | Action::Download { to, .. } | Action::Extract { to, .. } => Some(Action::Remove { path: to.clone() }),
            Action::Symlink { link, .. } => Some(Action::Remove { path: link.clone() }),
            Action::PathAdd { dir, machine } => Some(Action::PathRemove { dir: dir.clone(), machine: *machine }),
            Action::WriteFile { path, previous: Some(p), .. } => Some(Action::WriteFile { path: path.clone(), content: p.clone(), previous: None }),
            Action::WriteFile { path, previous: None, .. } => Some(Action::Remove { path: path.clone() }),
            Action::RegSet { key, name, previous: Some(p), .. } => Some(Action::RegSet { key: key.clone(), name: name.clone(), value: p.value.clone(), kind: p.kind.clone(), previous: None, created_key: false }),
            Action::RegSet { key, previous: None, created_key: true, .. } => Some(Action::RegDelete { key: key.clone(), name: None }),
            Action::RegSet { key, name, previous: None, .. } => Some(Action::RegDelete { key: key.clone(), name: Some(name.clone()) }),
            Action::EnvSet { name, machine, previous, .. } => Some(Action::EnvSet { name: name.clone(), value: previous.clone(), machine: *machine, previous: None }),
            _ => None,
        }
    }
    pub fn describe(&self) -> String {
        let scope = |m: &bool| if *m { "machine" } else { "user" };
        match self {
            Action::Copy { from, to } => format!("copy {from} to {to}"),
            Action::Download { url, to, .. } => format!("download {url} to {to} (SHA-256 verified)"),
            Action::Extract { archive, to } => format!("extract {archive} to {to}"),
            Action::Exec { command, optional, .. } => format!("run {}{}", command.join(" "), if *optional { " (if available)" } else { "" }),
            Action::Remove { path } => format!("remove {path}"),
            Action::Symlink { target, link } => format!("link {link} to {target}"),
            Action::PathAdd { dir, machine } => format!("add {dir} to the {} PATH", scope(machine)),
            Action::PathRemove { dir, machine } => format!("remove {dir} from the {} PATH", scope(machine)),
            Action::WriteFile { path, previous, .. } => format!("{} {path}", if previous.is_some() { "update" } else { "write" }),
            Action::RegSet { key, name, value, .. } => format!("set registry {key}\\{} = {value}", if name.is_empty() { "(default)" } else { name }),
            Action::RegDelete { key, name } => format!("delete registry {key}{}", name.as_ref().map(|n| format!("\\{n}")).unwrap_or_default()),
            Action::EnvSet { name, value: Some(v), machine, .. } => format!("set {} environment variable {name}={v}", scope(machine)),
            Action::EnvSet { name, value: None, machine, .. } => format!("remove {} environment variable {name}", scope(machine)),
        }
    }
}

pub struct Output {
    pub code: i32,
    pub stdout: String,
}

pub trait System {
    fn os(&self) -> String;
    fn arch(&self) -> String;
    fn var(&self, key: &str) -> Option<String>;
    fn exec(&self, command: &[String], env: &BTreeMap<String, String>) -> Output;
    /// Absolute path of a program, from an absolute path or a PATH lookup.
    fn which(&self, program: &str) -> Option<PathBuf>;
    fn online(&self, url: &str) -> bool;
    fn admin(&self) -> bool;
    /// A binary bundled next to the engine (Tauri externalBin strips the target triple).
    fn sidecar(&self, name: &str) -> Option<PathBuf>;
    /// A file named `bin` somewhere below `dir` (archives often nest a folder).
    fn find_bin(&self, dir: &Path, bin: &str) -> Option<PathBuf>;
    /// SHA-256 of a file, or None when it does not exist.
    fn file_sha256(&self, path: &Path) -> Option<String>;
    fn read_text(&self, path: &Path) -> Option<String>;
    fn reg_get(&self, key: &str, name: &str) -> Option<RegValue>;
    fn reg_key_exists(&self, key: &str) -> bool;
    /// A persistent (registry) environment variable on Windows.
    fn env_get(&self, name: &str, machine: bool) -> Option<String>;
    /// Run `exe args` with administrator rights after the system prompt (UAC, macOS
    /// authorisation, polkit). Returns its exit code; 1602 when the user declined.
    fn run_elevated(&self, exe: &Path, args: &[String]) -> Result<i32, String>;
    fn perform(&self, action: &Action) -> Result<(), String>;
}

pub fn exe(name: &str, os: &str) -> String {
    if os == "windows" && !name.ends_with(".exe") { format!("{name}.exe") } else { name.to_string() }
}

/// `'...'` for POSIX shells.
pub fn sh_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

fn powershell(script: &str) -> Output {
    match Command::new("powershell").args(["-NoProfile", "-NonInteractive", "-Command", script]).output() {
        Ok(o) => Output { code: o.status.code().unwrap_or(1), stdout: String::from_utf8_lossy(&o.stdout).trim_end().to_string() },
        Err(e) => Output { code: 127, stdout: e.to_string() },
    }
}

fn ps_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "''"))
}

// ---------- the real machine ----------

pub struct Real;

impl System for Real {
    fn os(&self) -> String {
        std::env::consts::OS.into()
    }
    fn arch(&self) -> String {
        std::env::consts::ARCH.into()
    }
    fn var(&self, key: &str) -> Option<String> {
        std::env::var(key).ok().filter(|v| !v.is_empty())
    }
    fn exec(&self, command: &[String], env: &BTreeMap<String, String>) -> Output {
        let Some((prog, args)) = command.split_first() else { return Output { code: 127, stdout: String::new() } };
        let Some(path) = self.which(prog) else { return Output { code: 127, stdout: String::new() } };
        match Command::new(path).args(args).envs(env).output() {
            Ok(o) => Output { code: o.status.code().unwrap_or(1), stdout: format!("{}{}", String::from_utf8_lossy(&o.stdout), String::from_utf8_lossy(&o.stderr)) },
            Err(_) => Output { code: 127, stdout: String::new() },
        }
    }
    fn which(&self, program: &str) -> Option<PathBuf> {
        let p = Path::new(program);
        if p.is_absolute() || program.contains('/') || program.contains('\\') {
            return [p.to_path_buf(), PathBuf::from(exe(program, &self.os()))].into_iter().find(|c| c.is_file());
        }
        std::env::split_paths(&std::env::var_os("PATH")?).map(|d| d.join(exe(program, &self.os()))).find(|c| c.is_file())
    }
    fn online(&self, url: &str) -> bool {
        // ponytail: a TCP connect to the download host stands in for a reachability check; proxies may need more
        use std::net::ToSocketAddrs;
        let host = url.split("://").nth(1).and_then(|r| r.split('/').next()).unwrap_or("");
        let Ok(mut addrs) = format!("{host}:443").to_socket_addrs() else { return false };
        addrs.next().map(|a| std::net::TcpStream::connect_timeout(&a, std::time::Duration::from_secs(3)).is_ok()).unwrap_or(false)
    }
    fn admin(&self) -> bool {
        if cfg!(windows) {
            Command::new("net").arg("session").output().map(|o| o.status.success()).unwrap_or(false)
        } else {
            Command::new("id").arg("-u").output().map(|o| String::from_utf8_lossy(&o.stdout).trim() == "0").unwrap_or(false)
        }
    }
    fn sidecar(&self, name: &str) -> Option<PathBuf> {
        let dir = std::env::current_exe().ok()?.parent()?.to_path_buf();
        Some(dir.join(exe(name, &self.os()))).filter(|p| p.is_file())
    }
    fn find_bin(&self, dir: &Path, bin: &str) -> Option<PathBuf> {
        let want = exe(bin, &self.os());
        let mut stack = vec![dir.to_path_buf()];
        while let Some(d) = stack.pop() {
            for e in std::fs::read_dir(&d).ok()?.flatten() {
                let p = e.path();
                if p.is_dir() {
                    stack.push(p);
                } else if p.file_name().map(|n| n == want.as_str()).unwrap_or(false) {
                    return Some(p);
                }
            }
        }
        None
    }
    fn file_sha256(&self, path: &Path) -> Option<String> {
        std::fs::read(path).ok().map(|b| hex::encode(Sha256::digest(b)))
    }
    fn read_text(&self, path: &Path) -> Option<String> {
        std::fs::read_to_string(path).ok()
    }
    fn reg_get(&self, key: &str, name: &str) -> Option<RegValue> {
        if !cfg!(windows) {
            return None;
        }
        let mut cmd = Command::new("reg");
        cmd.args(["query", key]);
        if name.is_empty() { cmd.arg("/ve") } else { cmd.args(["/v", name]) };
        let o = cmd.output().ok().filter(|o| o.status.success())?;
        // "    <name>    REG_SZ    <value>" (the default value's name is localised, so find the type)
        String::from_utf8_lossy(&o.stdout).lines().find_map(|l| {
            let at = l.find("    REG_")? + 4;
            let rest = &l[at..];
            let (kind, value) = rest.split_once("    ").unwrap_or((rest.trim(), ""));
            let (kind, value) = (kind.trim().to_string(), value.trim().to_string());
            // reg query prints numbers in hex ("0x1"); steps and `reg add /d` use decimal
            let value = match (kind.as_str(), value.strip_prefix("0x")) {
                ("REG_DWORD" | "REG_QWORD", Some(h)) => u64::from_str_radix(h, 16).map(|n| n.to_string()).unwrap_or(value),
                _ => value,
            };
            Some(RegValue { kind, value })
        })
    }
    fn reg_key_exists(&self, key: &str) -> bool {
        cfg!(windows) && Command::new("reg").args(["query", key]).output().map(|o| o.status.success()).unwrap_or(false)
    }
    fn env_get(&self, name: &str, machine: bool) -> Option<String> {
        if !cfg!(windows) {
            return None;
        }
        let o = powershell(&format!("[Environment]::GetEnvironmentVariable({}, '{}')", ps_quote(name), if machine { "Machine" } else { "User" }));
        (o.code == 0 && !o.stdout.is_empty()).then_some(o.stdout)
    }
    fn run_elevated(&self, exe: &Path, args: &[String]) -> Result<i32, String> {
        let exe = exe.to_string_lossy().to_string();
        if cfg!(windows) {
            // UAC: Start-Process -Verb RunAs; declining throws, which we report as cancelled
            let list = args.iter().map(|a| format!("\"{}\"", a.replace('"', "\\\""))).collect::<Vec<_>>().join(" ");
            let script = format!(
                "try {{ $p = Start-Process -FilePath {} -ArgumentList {} -Verb RunAs -WindowStyle Hidden -Wait -PassThru; exit $p.ExitCode }} catch {{ exit 1602 }}",
                ps_quote(&exe),
                ps_quote(&list)
            );
            return Ok(powershell(&script).code);
        }
        // already allowed without a password (CI, a recent sudo in this terminal): no dialog needed
        if self.which("sudo").is_some() && Command::new("sudo").args(["-n", "true"]).output().map(|o| o.status.success()).unwrap_or(false) {
            return Ok(Command::new("sudo").arg("-n").arg(&exe).args(args).status().map_err(|e| e.to_string())?.code().unwrap_or(1));
        }
        let line = std::iter::once(&exe).chain(args).map(|a| sh_quote(a)).collect::<Vec<_>>().join(" ");
        if cfg!(target_os = "macos") {
            // the system authorisation dialog; do shell script hides the exit code, so echo it
            let script = format!("{line}; echo \"__fw_exit=$?\"");
            let apple = format!("do shell script \"{}\" with administrator privileges", script.replace('\\', "\\\\").replace('"', "\\\""));
            let o = Command::new("osascript").args(["-e", &apple]).output().map_err(|e| e.to_string())?;
            let text = format!("{}{}", String::from_utf8_lossy(&o.stdout), String::from_utf8_lossy(&o.stderr));
            if text.contains("(-128)") {
                return Ok(1602); // user cancelled
            }
            return text.lines().find_map(|l| l.trim().strip_prefix("__fw_exit=").and_then(|c| c.parse().ok())).ok_or_else(|| format!("could not ask for administrator rights: {}", text.trim()));
        }
        // Linux and other unix: polkit, else sudo when there is a terminal to ask in
        if self.which("pkexec").is_some() {
            let code = Command::new("pkexec").arg(&exe).args(args).status().map_err(|e| e.to_string())?.code().unwrap_or(1);
            return Ok(if code == 126 || code == 127 { 1602 } else { code });
        }
        if self.which("sudo").is_some() && std::io::IsTerminal::is_terminal(&std::io::stdin()) {
            return Ok(Command::new("sudo").arg(&exe).args(args).status().map_err(|e| e.to_string())?.code().unwrap_or(1));
        }
        Err("administrator rights are needed, but neither pkexec nor an interactive sudo is available".into())
    }
    fn perform(&self, action: &Action) -> Result<(), String> {
        let parent = |p: &str| std::fs::create_dir_all(Path::new(p).parent().unwrap_or(Path::new("."))).map_err(|e| format!("{p}: {e}"));
        match action {
            Action::Copy { from, to } => {
                parent(to)?;
                std::fs::copy(from, to).map(|_| ()).map_err(|e| format!("copy {from}: {e}"))
            }
            Action::Download { url, sha256, to } => {
                parent(to)?;
                let part = format!("{to}.part");
                // curl ships with Windows 10+, macOS and every desktop Linux; -C - resumes a partial file
                let ok = Command::new("curl").args(["-fsSL", "--retry", "3", "-C", "-", "-o", &part, url]).status().map(|s| s.success()).unwrap_or(false);
                if !ok {
                    return Err(format!("download failed: {url}"));
                }
                let got = hex::encode(Sha256::digest(std::fs::read(&part).map_err(|e| e.to_string())?));
                if !got.eq_ignore_ascii_case(sha256) {
                    let _ = std::fs::remove_file(&part);
                    return Err(format!("SHA-256 mismatch for {url}: expected {sha256}, got {got}"));
                }
                std::fs::rename(&part, to).map_err(|e| e.to_string())
            }
            Action::Extract { archive, to } => {
                std::fs::create_dir_all(to).map_err(|e| e.to_string())?;
                // bsdtar on Windows and macOS reads zip too; GNU tar on Linux does not
                let status = if archive.ends_with(".zip") && !cfg!(any(windows, target_os = "macos")) {
                    Command::new("unzip").args(["-o", "-q", archive, "-d", to]).status()
                } else {
                    Command::new("tar").args(["-xf", archive, "-C", to]).status()
                };
                status.map_err(|e| e.to_string())?.success().then_some(()).ok_or(format!("could not extract {archive}"))
            }
            Action::Exec { command, env, optional } => {
                let o = self.exec(command, env);
                if o.code == 0 || *optional { Ok(()) } else { Err(format!("`{}` exited with {}: {}", command.join(" "), o.code, o.stdout.trim())) }
            }
            Action::Remove { path } => {
                let p = Path::new(path);
                let r = if p.is_dir() && !p.is_symlink() { std::fs::remove_dir_all(p) } else if p.exists() || p.is_symlink() { std::fs::remove_file(p) } else { Ok(()) };
                r.map_err(|e| format!("remove {path}: {e}"))
            }
            Action::Symlink { target, link } => {
                parent(link)?;
                let _ = std::fs::remove_file(link);
                #[cfg(unix)]
                return std::os::unix::fs::symlink(target, link).map_err(|e| e.to_string());
                #[cfg(not(unix))]
                return std::fs::copy(target, link).map(|_| ()).map_err(|e| e.to_string());
            }
            Action::PathAdd { dir, machine } | Action::PathRemove { dir, machine } => {
                if !cfg!(windows) {
                    return Ok(()); // unix exposes binaries with symlinks in {binDir}
                }
                let add = matches!(action, Action::PathAdd { .. });
                let target = if *machine { "Machine" } else { "User" };
                // [Environment]::SetEnvironmentVariable broadcasts WM_SETTINGCHANGE for us
                let script = format!(
                    "$d={d};$p=[Environment]::GetEnvironmentVariable('Path','{target}');$l=@($p -split ';' | Where-Object {{ $_ -and $_ -ne $d }});{add}[Environment]::SetEnvironmentVariable('Path',($l -join ';'),'{target}')",
                    d = ps_quote(dir),
                    add = if add { "$l+=$d;" } else { "" }
                );
                (powershell(&script).code == 0).then_some(()).ok_or_else(|| format!("could not update the {target} PATH"))
            }
            Action::WriteFile { path, content, .. } => {
                parent(path)?;
                std::fs::write(path, content).map_err(|e| format!("{path}: {e}"))
            }
            Action::RegSet { key, name, value, kind, .. } => {
                let mut cmd = Command::new("reg");
                cmd.args(["add", key]);
                if name.is_empty() { cmd.arg("/ve") } else { cmd.args(["/v", name]) };
                let o = cmd.args(["/t", kind, "/d", value, "/f"]).output().map_err(|e| format!("reg: {e}"))?;
                o.status.success().then_some(()).ok_or_else(|| format!("could not set {key}: {}", String::from_utf8_lossy(&o.stderr).trim()))
            }
            Action::RegDelete { key, name } => {
                let mut cmd = Command::new("reg");
                cmd.args(["delete", key]);
                match name.as_deref() {
                    Some("") => {
                        cmd.arg("/ve");
                    }
                    Some(n) => {
                        cmd.args(["/v", n]);
                    }
                    None => {}
                }
                // already gone is fine: undo must be repeatable
                let _ = cmd.arg("/f").output();
                Ok(())
            }
            Action::EnvSet { name, value, machine, .. } => {
                let v = value.as_deref().map(ps_quote).unwrap_or_else(|| "$null".into());
                let o = powershell(&format!("[Environment]::SetEnvironmentVariable({}, {v}, '{}')", ps_quote(name), if *machine { "Machine" } else { "User" }));
                (o.code == 0).then_some(()).ok_or_else(|| format!("could not set environment variable {name}"))
            }
        }
    }
}

// ---------- a simulated machine ----------

/// A scenario file: what is installed, network, rights. Nothing real changes; actions are recorded.
#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct Scenario {
    pub os: Option<String>,
    pub arch: Option<String>,
    pub network: Option<bool>,
    pub admin: bool,
    pub env: BTreeMap<String, String>,
    /// command line (program basename and args) -> result
    pub commands: BTreeMap<String, SimCommand>,
    /// programs on PATH, by name
    pub programs: Vec<String>,
    pub sidecars: Vec<String>,
    /// existing files: path -> SHA-256 ("" when the hash does not matter)
    pub files: BTreeMap<String, String>,
    /// existing text files: path -> content
    pub texts: BTreeMap<String, String>,
    /// registry values: "KEY\\name" -> value (REG_SZ)
    pub registry: BTreeMap<String, String>,
    /// the user declines the administrator prompt
    pub decline_elevation: bool,
    /// an action whose description contains this text fails (to test rollback)
    pub fail: Option<String>,
    #[serde(skip)]
    pub log: RefCell<Vec<Action>>,
    /// how many times the administrator prompt was shown
    #[serde(skip)]
    pub prompts: Cell<u32>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct SimCommand {
    pub code: i32,
    pub stdout: String,
}

impl Scenario {
    pub fn parse(text: &str) -> Result<Self, String> {
        toml::from_str(text).map_err(|e| format!("scenario: {e}"))
    }
    /// Combine scenario files: later ones win ("uv-missing,offline").
    pub fn merge(mut self, other: Scenario) -> Self {
        self.os = other.os.or(self.os);
        self.arch = other.arch.or(self.arch);
        self.network = other.network.or(self.network);
        self.admin |= other.admin;
        self.decline_elevation |= other.decline_elevation;
        self.env.extend(other.env);
        self.commands.extend(other.commands);
        self.programs.extend(other.programs);
        self.sidecars.extend(other.sidecars);
        self.files.extend(other.files);
        self.texts.extend(other.texts);
        self.registry.extend(other.registry);
        self.fail = other.fail.or(self.fail);
        self
    }
    fn key(command: &[String]) -> String {
        let mut parts = command.to_vec();
        if let Some(p) = parts.first_mut() {
            let base = p.rsplit(['/', '\\']).next().unwrap_or(p).trim_end_matches(".exe").to_string();
            *p = base;
        }
        parts.join(" ")
    }
}

impl System for Scenario {
    fn os(&self) -> String {
        self.os.clone().unwrap_or_else(|| std::env::consts::OS.into())
    }
    fn arch(&self) -> String {
        self.arch.clone().unwrap_or_else(|| "x86_64".into())
    }
    fn var(&self, key: &str) -> Option<String> {
        self.env.get(key).cloned().or_else(|| {
            let home = if self.os() == "windows" { "C:\\Users\\sim" } else if self.os() == "macos" { "/Users/sim" } else { "/home/sim" };
            Some(match key {
                "HOME" | "USERPROFILE" => home.into(),
                "APPDATA" => format!("{home}\\AppData\\Roaming"),
                "LOCALAPPDATA" => format!("{home}\\AppData\\Local"),
                "ProgramFiles" => "C:\\Program Files".into(),
                "ProgramData" => "C:\\ProgramData".into(),
                "SystemRoot" => "C:\\Windows".into(),
                _ => return None,
            })
        })
    }
    fn exec(&self, command: &[String], _env: &BTreeMap<String, String>) -> Output {
        match self.commands.get(&Self::key(command)) {
            Some(c) => Output { code: c.code, stdout: c.stdout.clone() },
            None => Output { code: 127, stdout: String::new() },
        }
    }
    fn which(&self, program: &str) -> Option<PathBuf> {
        if program.contains('/') || program.contains('\\') {
            return Some(PathBuf::from(program));
        }
        let dir = if self.os() == "windows" { "C:\\sim\\bin\\" } else { "/usr/local/bin/" };
        self.programs.iter().any(|p| p == program).then(|| PathBuf::from(format!("{dir}{}", exe(program, &self.os()))))
    }
    fn online(&self, _url: &str) -> bool {
        self.network.unwrap_or(true)
    }
    fn admin(&self) -> bool {
        self.admin
    }
    fn sidecar(&self, name: &str) -> Option<PathBuf> {
        self.sidecars.iter().any(|s| s == name).then(|| PathBuf::from(format!("<sidecar>/{}", exe(name, &self.os()))))
    }
    fn find_bin(&self, dir: &Path, bin: &str) -> Option<PathBuf> {
        Some(dir.join(exe(bin, &self.os())))
    }
    fn file_sha256(&self, path: &Path) -> Option<String> {
        let p = path.to_string_lossy().to_string();
        self.files.get(&p).cloned().or_else(|| self.texts.contains_key(&p).then(String::new))
    }
    fn read_text(&self, path: &Path) -> Option<String> {
        self.texts.get(&path.to_string_lossy().to_string()).cloned()
    }
    fn reg_get(&self, key: &str, name: &str) -> Option<RegValue> {
        self.registry.get(&format!("{key}\\{name}")).map(|v| RegValue { kind: "REG_SZ".into(), value: v.clone() })
    }
    fn reg_key_exists(&self, key: &str) -> bool {
        let prefix = format!("{key}\\");
        self.registry.keys().any(|k| k.starts_with(&prefix))
    }
    fn env_get(&self, name: &str, _machine: bool) -> Option<String> {
        self.env.get(name).cloned()
    }
    fn run_elevated(&self, _exe: &Path, _args: &[String]) -> Result<i32, String> {
        self.prompts.set(self.prompts.get() + 1);
        Ok(if self.decline_elevation { 1602 } else { 0 })
    }
    fn perform(&self, action: &Action) -> Result<(), String> {
        if let Some(f) = &self.fail {
            if action.describe().contains(f.as_str()) {
                return Err(format!("simulated failure: {}", action.describe()));
            }
        }
        self.log.borrow_mut().push(action.clone());
        Ok(())
    }
}
