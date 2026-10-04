//! Fanwit plugins in Rust. The same plugin type runs two ways:
//!
//! * **WASM** (`runtime = "wasm"`): `fanwit_plugin::export_wasm!(MyPlugin);` in a `cdylib` built
//!   for `wasm32-unknown-unknown`. It runs in a Web Worker, sandboxed, at near native speed.
//! * **Sidecar** (`runtime = "sidecar"`): `fn main() { fanwit_plugin::run_stdio::<MyPlugin>() }`
//!   in a binary named `fanwit-plugin-<id>`. A separate native process (desktop, bundled only).
//!
//! Both speak the protocol of `src/fanwit/plugins/host.ts`: the app sends one JSON message, the
//! plugin answers with any number of messages. Calls to the app (`Host::call`) are fire and
//! forget; their answers arrive later in [`Plugin::result`] with the id `call` returned.
//!
//! ```ignore
//! #[derive(Default)]
//! struct Hello;
//! impl fanwit_plugin::Plugin for Hello {
//!     fn activate(&mut self, host: &mut Host, _settings: &Value) { host.handle("hello.greet"); }
//!     fn invoke(&mut self, host: &mut Host, _cmd: &str, _args: &Value) -> Result<Value, String> {
//!         host.toast("Hello from Rust");
//!         Ok(Value::Null)
//!     }
//! }
//! ```

pub use serde_json::{json, Value};

/// Messages queued for the app while a plugin handles one message.
#[derive(Default)]
pub struct Host {
    out: Vec<Value>,
    seq: u64,
}

impl Host {
    /// Call an app API (`commands.run`, `storage.set`, `vault.readText`...). Returns the call id.
    pub fn call(&mut self, method: &str, args: Value) -> u64 {
        self.seq += 1;
        self.out.push(json!({ "t": "call", "id": self.seq, "method": method, "args": args }));
        self.seq
    }
    /// Answer `command` from [`Plugin::invoke`].
    pub fn handle(&mut self, command: &str) -> u64 {
        self.call("commands.handle", json!([command]))
    }
    /// Receive app events in [`Plugin::event`].
    pub fn on_event(&mut self, name: &str) -> u64 {
        self.call("events.on", json!([name]))
    }
    pub fn toast(&mut self, text: &str) -> u64 {
        self.call("notify.toast", json!([text]))
    }
    pub fn status(&mut self, item: &str, text: &str, tooltip: &str) -> u64 {
        self.call("statusbar.set", json!([item, { "text": text, "tooltip": tooltip }]))
    }
    /// Replace a widgets view's tree (see `src/fanwit/plugins/widgets.ts` for node types).
    pub fn render(&mut self, view: &str, tree: Value) -> u64 {
        self.call("ui.render", json!([view, tree]))
    }
    pub fn log(&mut self, msg: &str) -> u64 {
        self.call("log", json!(["info", msg]))
    }
}

/// A plugin: implement what you need, everything has a default.
pub trait Plugin: Default {
    fn activate(&mut self, _host: &mut Host, _settings: &Value) {}
    fn invoke(&mut self, _host: &mut Host, command: &str, _args: &Value) -> Result<Value, String> {
        Err(format!("unknown command {command}"))
    }
    fn event(&mut self, _host: &mut Host, _name: &str, _payload: &Value) {}
    fn ui(&mut self, _host: &mut Host, _view: &str, _action: &str, _value: &Value) {}
    /// The answer to `Host::call` number `id`.
    fn result(&mut self, _host: &mut Host, _id: u64, _value: Result<Value, String>) {}
}

/// Handle one message from the app; returns the messages to send back.
pub fn dispatch<P: Plugin>(p: &mut P, host: &mut Host, msg: &Value) -> Vec<Value> {
    let s = |k: &str| msg.get(k).and_then(Value::as_str).unwrap_or("");
    let null = Value::Null;
    match s("t") {
        "activate" => {
            p.activate(host, msg.get("settings").unwrap_or(&null));
            host.out.push(json!({ "t": "activated" }));
        }
        "invoke" => {
            let id = msg.get("id").cloned().unwrap_or(Value::Null);
            let r = p.invoke(host, s("command"), msg.get("args").unwrap_or(&null));
            host.out.push(match r {
                Ok(v) => json!({ "t": "invoked", "id": id, "value": v }),
                Err(e) => json!({ "t": "invoked", "id": id, "error": { "message": e } }),
            });
        }
        "event" => p.event(host, s("name"), msg.get("payload").unwrap_or(&null)),
        "ui" => p.ui(host, s("view"), s("action"), msg.get("value").unwrap_or(&null)),
        "result" => {
            let id = msg.get("id").and_then(Value::as_u64).unwrap_or(0);
            let r = match msg.get("error") {
                Some(e) => Err(e.get("message").and_then(Value::as_str).unwrap_or("error").to_string()),
                None => Ok(msg.get("value").cloned().unwrap_or(Value::Null)),
            };
            p.result(host, id, r);
        }
        _ => {}
    }
    std::mem::take(&mut host.out)
}

/// Sidecar main loop: one JSON message per line on stdin, answers on stdout.
pub fn run_stdio<P: Plugin>() {
    use std::io::{BufRead, Write};
    let mut p = P::default();
    let mut host = Host::default();
    let stdout = std::io::stdout();
    for line in std::io::stdin().lock().lines() {
        let Ok(line) = line else { break };
        let Ok(msg) = serde_json::from_str::<Value>(&line) else { continue };
        let mut o = stdout.lock();
        for m in dispatch(&mut p, &mut host, &msg) {
            let _ = writeln!(o, "{m}");
        }
        let _ = o.flush();
    }
}

/// WASM exports for `runtime = "wasm"`: `fw_alloc(len) -> ptr` and `fw_handle(ptr, len) -> u64`
/// where the result packs the answer's pointer (high 32 bits) and length (low 32 bits). The
/// answer is `{"out": [messages]}` and stays valid until the next call.
#[macro_export]
macro_rules! export_wasm {
    ($t:ty) => {
        static __FW: std::sync::Mutex<Option<($t, $crate::Host, Vec<u8>)>> = std::sync::Mutex::new(None);

        #[no_mangle]
        pub extern "C" fn fw_alloc(len: usize) -> *mut u8 {
            let mut v = Vec::<u8>::with_capacity(len);
            let p = v.as_mut_ptr();
            std::mem::forget(v);
            p
        }

        /// # Safety
        /// `ptr` must come from `fw_alloc(len)`; ownership passes back to Rust.
        #[no_mangle]
        pub unsafe extern "C" fn fw_handle(ptr: *mut u8, len: usize) -> u64 {
            let input = Vec::from_raw_parts(ptr, len, len);
            let mut g = __FW.lock().unwrap();
            let (p, host, out) = g.get_or_insert_with(|| (<$t>::default(), $crate::Host::default(), Vec::new()));
            let msgs = match $crate::__parse(&input) {
                Some(m) => $crate::dispatch(p, host, &m),
                None => Vec::new(),
            };
            *out = $crate::__encode(msgs);
            ((out.as_ptr() as u64) << 32) | out.len() as u64
        }
    };
}

#[doc(hidden)]
pub fn __parse(bytes: &[u8]) -> Option<Value> {
    serde_json::from_slice(bytes).ok()
}

#[doc(hidden)]
pub fn __encode(msgs: Vec<Value>) -> Vec<u8> {
    serde_json::to_vec(&json!({ "out": msgs })).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Default)]
    struct Echo(u32);
    impl Plugin for Echo {
        fn activate(&mut self, host: &mut Host, _: &Value) {
            host.handle("echo.run");
        }
        fn invoke(&mut self, _: &mut Host, _: &str, args: &Value) -> Result<Value, String> {
            self.0 += 1;
            Ok(json!({ "n": self.0, "args": args }))
        }
    }

    #[test]
    fn activate_then_invoke() {
        let (mut p, mut h) = (Echo::default(), Host::default());
        let out = dispatch(&mut p, &mut h, &json!({ "t": "activate", "settings": {} }));
        assert_eq!(out[0]["method"], "commands.handle");
        assert_eq!(out[1]["t"], "activated");
        let out = dispatch(&mut p, &mut h, &json!({ "t": "invoke", "id": 7, "command": "echo.run", "args": { "x": 1 } }));
        assert_eq!(out[0], json!({ "t": "invoked", "id": 7, "value": { "n": 1, "args": { "x": 1 } } }));
    }
}
