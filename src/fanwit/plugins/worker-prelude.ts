/**
 * Plugin side of the protocol in src/fanwit/plugins/host.ts, as text. WORKER_PRELUDE is
 * prepended to a plugin bundle (JS, or the loader for a WASM plugin) and runs in its Web Worker:
 * no DOM, no Tauri IPC, `ctx` is a message proxy checked by the app. FRAME_CLIENT is the same
 * ctx for a plugin's iframe page, served at /<id>/_fw/ui.js (or inlined on the web).
 */
const CORE = `
const __pending = new Map();
let __seq = 0;
const __handlers = new Map();
const __listeners = new Map();
const __ui = new Map();
function __call(method, args) {
  const id = ++__seq;
  __post({ t: "call", id, method, args });
  return new Promise((resolve, reject) => __pending.set(id, { resolve, reject }));
}
async function __receive(m) {
  if (m.t === "result") {
    const p = __pending.get(m.id); __pending.delete(m.id);
    if (!p) return;
    m.error ? p.reject(Object.assign(new Error(m.error.message), m.error)) : p.resolve(m.value);
  } else if (m.t === "invoke") {
    const h = __handlers.get(m.command);
    try { __post({ t: "invoked", id: m.id, value: h ? await h(m.args) : undefined }); }
    catch (err) { __post({ t: "invoked", id: m.id, error: { message: String(err && err.message || err) } }); }
  } else if (m.t === "event") {
    for (const fn of __listeners.get(m.name) || []) try { fn(m.payload); } catch (err) { console.error(err); }
  } else if (m.t === "ui") {
    for (const fn of __ui.get(m.view) || []) try { await fn(m.action, m.value); } catch (err) { console.error(err); }
  }
}
const settingsCache = {};
const __disposable = (fn) => ({ dispose: fn });
const ctx = {
  id: "__ID__",
  commands: {
    handle(id, fn) { __handlers.set(id, fn); __call("commands.handle", [id]); return __disposable(() => __handlers.delete(id)); },
    run(id, args) { return __call("commands.run", [id, args || {}]); },
  },
  notify: {
    toast(text, kind) { return __call("notify.toast", [text, kind]); },
    send(spec) { return __call("notify.send", [spec]); },
  },
  settings: {
    get(key) { return settingsCache[key]; },
    set(key, value) { settingsCache[key] = value; return __call("settings.set", [key, value]); },
  },
  storage: {
    get(key) { return __call("storage.get", [key]); },
    set(key, value) { return __call("storage.set", [key, value]); },
  },
  vault: {
    readText(path) { return __call("vault.readText", [path]); },
    write(path, text) { return __call("vault.write", [path, text]); },
    list(dir, o) { return __call("vault.list", [dir || "", o || {}]); },
    current() { return __call("vault.current", []); },
  },
  statusbar: {
    item(id) {
      return {
        set text(v) { __call("statusbar.set", [id, { text: v }]); },
        set tooltip(v) { __call("statusbar.set", [id, { tooltip: v }]); },
        set command(v) { __call("statusbar.set", [id, { command: v }]); },
      };
    },
  },
  ui: {
    /** Replace a widgets view's tree (see the Widget type in the SDK). */
    render(view, tree) { return __call("ui.render", [view, tree]); },
    /** fn(action, value) runs when the user acts on a widget of that view. */
    on(view, fn) { const l = __ui.get(view) || []; l.push(fn); __ui.set(view, l); return __disposable(() => __ui.set(view, (__ui.get(view) || []).filter((f) => f !== fn))); },
  },
  events: {
    on(name, fn) {
      const list = __listeners.get(name) || [];
      // the app forwards an event only after the first subscription asks for it
      if (!list.length) __call("events.on", [name]);
      list.push(fn); __listeners.set(name, list);
      return __disposable(() => __listeners.set(name, (__listeners.get(name) || []).filter((f) => f !== fn)));
    },
    emit(name, payload) { return __call("events.emit", [name, payload]); },
  },
  log: {
    info: (...a) => __call("log", ["info", a.map(String).join(" ")]),
    warn: (...a) => __call("log", ["warn", a.map(String).join(" ")]),
    error: (...a) => __call("log", ["error", a.map(String).join(" ")]),
  },
  subscriptions: { push() {} },
};
`;

export const WORKER_PRELUDE = `
const __post = (m) => postMessage(m);
${CORE}
let __wasm = null;
self.onmessage = async (e) => {
  const m = e.data;
  if (__wasm) return __wasm(m);
  if (m.t === "activate") {
    Object.assign(settingsCache, m.settings || {});
    if (m.wasm) return __wasmBoot(m);
    try { await (self.__fanwitPlugin && self.__fanwitPlugin(ctx)); __post({ t: "activated" }); }
    catch (err) { __post({ t: "activated", error: { message: String(err && err.message || err) } }); }
  } else __receive(m);
};
// WASM plugins: every message goes in as JSON through fw_handle, and the {out: [...]} it returns
// goes out; see packages/fanwit-plugin-rs for the Rust side of this ABI
async function __wasmBoot(first) {
  try {
    const { instance } = await WebAssembly.instantiate(first.wasm, {});
    const ex = instance.exports, enc = new TextEncoder(), dec = new TextDecoder();
    __wasm = (msg) => {
      const data = enc.encode(JSON.stringify(msg));
      const ptr = ex.fw_alloc(data.length);
      new Uint8Array(ex.memory.buffer, ptr, data.length).set(data);
      const r = BigInt(ex.fw_handle(ptr, data.length));
      const len = Number(r & 0xffffffffn);
      if (!len) return;
      const out = JSON.parse(dec.decode(new Uint8Array(ex.memory.buffer, Number(r >> 32n), len)));
      for (const o of out.out || []) __post(o);
    };
    __wasm({ t: "activate", settings: first.settings });
  } catch (err) { __post({ t: "activated", error: { message: "WASM: " + String(err && err.message || err) } }); }
}
self.__settings = settingsCache;
function definePlugin(fn) { self.__fanwitPlugin = fn; return fn; }
`;

/**
 * Loaded by a plugin's iframe page: `<script src="/<id>/_fw/ui.js"></script>` (the path is the
 * same on every host). Gives `window.fanwit` (the ctx above) once the app hands over a port, and
 * keeps the page's CSS variables in step with the app theme.
 */
export const FRAME_CLIENT = `(() => {
let __port = null;
const __queue = [];
const __post = (m) => (__port ? __port.postMessage(m) : __queue.push(m));
${CORE}
const ready = [];
ctx.onReady = (fn) => (__port ? fn(ctx) : ready.push(fn));
window.fanwit = ctx;
window.addEventListener("message", (e) => {
  if (e.source !== parent || !e.data || e.data.t !== "fw-port" || __port) return;
  __port = e.ports[0];
  __port.onmessage = (ev) => {
    const m = ev.data;
    if (m.t === "theme") {
      for (const [k, v] of Object.entries(m.vars || {})) document.documentElement.style.setProperty("--" + k, v);
      document.documentElement.classList.toggle("dark", !!m.dark);
    } else __receive(m);
  };
  for (const m of __queue.splice(0)) __port.postMessage(m);
  for (const fn of ready.splice(0)) fn(ctx);
});
})();`;
