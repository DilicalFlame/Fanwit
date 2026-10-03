/**
 * Runs inside the plugin's Web Worker (isolation = "worker"). It has no DOM and no Tauri IPC;
 * `ctx` is a message proxy, and every call is checked against granted permissions by the app.
 * Exported as text and prepended to the plugin bundle.
 */
export const WORKER_PRELUDE = `
const __pending = new Map();
let __seq = 0;
const __handlers = new Map();
const __listeners = new Map();
function __call(method, args) {
  const id = ++__seq;
  postMessage({ t: "call", id, method, args });
  return new Promise((resolve, reject) => __pending.set(id, { resolve, reject }));
}
self.onmessage = async (e) => {
  const m = e.data;
  if (m.t === "result") {
    const p = __pending.get(m.id); __pending.delete(m.id);
    if (!p) return;
    m.error ? p.reject(Object.assign(new Error(m.error.message), m.error)) : p.resolve(m.value);
  } else if (m.t === "invoke") {
    const h = __handlers.get(m.command);
    try { postMessage({ t: "invoked", id: m.id, value: h ? await h(m.args) : undefined }); }
    catch (err) { postMessage({ t: "invoked", id: m.id, error: { message: String(err && err.message || err) } }); }
  } else if (m.t === "event") {
    for (const fn of __listeners.get(m.name) || []) try { fn(m.payload); } catch (err) { console.error(err); }
  } else if (m.t === "activate") {
    Object.assign(settingsCache, m.settings || {});
    try { await (self.__fanwitPlugin && self.__fanwitPlugin(ctx)); postMessage({ t: "activated" }); }
    catch (err) { postMessage({ t: "activated", error: { message: String(err && err.message || err) } }); }
  }
};
const settingsCache = {};
const ctx = {
  id: "__ID__",
  commands: {
    handle(id, fn) { __handlers.set(id, fn); __call("commands.handle", [id]); return { dispose() { __handlers.delete(id); } }; },
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
      };
    },
  },
  events: {
    on(name, fn) {
      const list = __listeners.get(name) || []; list.push(fn); __listeners.set(name, list);
      __call("events.on", [name]);
      return { dispose() { __listeners.set(name, (__listeners.get(name) || []).filter((f) => f !== fn)); } };
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
self.__settings = settingsCache;
function definePlugin(fn) { self.__fanwitPlugin = fn; return fn; }
`;
