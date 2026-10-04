//! A native sidecar plugin: its own OS process, talking to the app over stdin and stdout. Use one
//! when a plugin needs what a browser sandbox cannot give: native libraries, threads, the GPU,
//! or simply heavy compute that should not share a process with the UI.

use fanwit_plugin::{json, Host, Plugin, Value};
use std::time::Instant;

#[derive(Default)]
struct SysInfo {
    last_bench: Option<(u64, u128, usize)>,
}

fn info() -> Value {
    let host = std::env::var("COMPUTERNAME").or_else(|_| std::env::var("HOSTNAME")).unwrap_or_else(|_| "unknown".into());
    json!({
        "os": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "cpus": std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1),
        "host": host,
        "pid": std::process::id(),
    })
}

/// Count primes below `n` on every core: real native threads, which a web worker cannot match.
fn primes(n: u64) -> (u64, usize) {
    let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1);
    let chunk = n / threads as u64 + 1;
    let handles: Vec<_> = (0..threads as u64)
        .map(|t| {
            std::thread::spawn(move || {
                let (lo, hi) = (t * chunk, ((t + 1) * chunk).min(n));
                (lo..hi).filter(|&k| k >= 2 && (2..).take_while(|d| d * d <= k).all(|d| k % d != 0)).count() as u64
            })
        })
        .collect();
    (handles.into_iter().map(|h| h.join().unwrap_or(0)).sum(), threads)
}

impl SysInfo {
    fn render(&self, host: &mut Host) {
        let i = info();
        let mut rows = vec![
            json!(["OS", i["os"]]),
            json!(["Architecture", i["arch"]]),
            json!(["CPU threads", i["cpus"]]),
            json!(["Computer", i["host"]]),
            json!(["Sidecar process", i["pid"]]),
        ];
        if let Some((count, ms, threads)) = self.last_bench {
            rows.push(json!(["Primes below 5M", format!("{count} in {ms} ms on {threads} threads")]));
        }
        host.render(
            "sysInfo.panel",
            json!({ "type": "stack", "gap": 3, "children": [
                { "type": "text", "text": "Native sidecar", "size": "lg" },
                { "type": "text", "text": "This panel is drawn from a separate Rust process.", "tone": "muted", "size": "sm" },
                { "type": "table", "columns": ["", ""], "rows": rows },
                { "type": "button", "label": "Count primes below 5 million", "icon": "cpu", "action": "bench", "variant": "primary" }
            ]}),
        );
    }

    fn bench(&mut self, host: &mut Host) -> Value {
        let t = Instant::now();
        let (count, threads) = primes(5_000_000);
        let ms = t.elapsed().as_millis();
        self.last_bench = Some((count, ms, threads));
        host.toast(&format!("{count} primes below 5,000,000 in {ms} ms ({threads} native threads)"));
        self.render(host);
        json!({ "count": count, "ms": ms, "threads": threads })
    }
}

impl Plugin for SysInfo {
    fn activate(&mut self, host: &mut Host, _settings: &Value) {
        host.handle("sysInfo.show");
        host.handle("sysInfo.bench");
        self.render(host);
    }

    fn invoke(&mut self, host: &mut Host, command: &str, _args: &Value) -> Result<Value, String> {
        match command {
            "sysInfo.show" => {
                let i = info();
                host.toast(&format!("{} {} with {} CPU threads (sidecar pid {})", i["os"].as_str().unwrap_or(""), i["arch"].as_str().unwrap_or(""), i["cpus"], i["pid"]));
                Ok(i)
            }
            "sysInfo.bench" => Ok(self.bench(host)),
            _ => Err(format!("unknown command {command}")),
        }
    }

    fn ui(&mut self, host: &mut Host, _view: &str, action: &str, _value: &Value) {
        if action == "bench" {
            self.bench(host);
        }
    }
}

fn main() {
    fanwit_plugin::run_stdio::<SysInfo>();
}

#[cfg(test)]
mod tests {
    #[test]
    fn counts_primes() {
        assert_eq!(super::primes(100).0, 25);
    }
}
