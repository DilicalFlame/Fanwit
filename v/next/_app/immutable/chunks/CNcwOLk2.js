const s=`<div class="fw-code" data-lang="ts" data-file="src/fanwit/plugins/worker-prelude.ts"><span class="fw-code-lang">src/fanwit/plugins/worker-prelude.ts</span><button type="button" class="fw-copy" data-copy aria-label="Copy code">Copy</button><pre class="shiki shiki-themes github-light github-dark" style="--shiki-light:#24292e;--shiki-dark:#e1e4e8;--shiki-light-bg:#fff;--shiki-dark-bg:#24292e" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D">/**</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D"> * Plugin side of the protocol in src/fanwit/plugins/host.ts, as text. WORKER_PRELUDE is</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D"> * prepended to a plugin bundle (JS, or the loader for a WASM plugin) and runs in its Web Worker:</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D"> * no DOM, no Tauri IPC, \`ctx\` is a message proxy checked by the app. FRAME_CLIENT is the same</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D"> * ctx for a plugin's iframe page, served at /&#x3C;id>/_fw/ui.js (or inlined on the web).</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D"> */</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583">const</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF"> CORE</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF"> \`</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">const __pending = new Map();</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">let __seq = 0;</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">const __handlers = new Map();</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">const __listeners = new Map();</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">const __ui = new Map();</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">function __call(method, args) {</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">  const id = ++__seq;</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">  __post({ t: "call", id, method, args });</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">  return new Promise((resolve, reject) => __pending.set(id, { resolve, reject }));</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">}</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">async function __receive(m) {</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">  if (m.t === "result") {</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">    const p = __pending.get(m.id); __pending.delete(m.id);</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">    if (!p) return;</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">    m.error ? p.reject(Object.assign(new Error(m.error.message), m.error)) : p.resolve(m.value);</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">  } else if (m.t === "invoke") {</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">    const h = __handlers.get(m.command);</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">    try { __post({ t: "invoked", id: m.id, value: h ? await h(m.args) : undefined }); }</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">    catch (err) { __post({ t: "invoked", id: m.id, error: { message: String(err &#x26;&#x26; err.message || err) } }); }</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">  } else if (m.t === "event") {</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">    for (const fn of __listeners.get(m.name) || []) try { fn(m.payload); } catch (err) { console.error(err); }</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">  } else if (m.t === "ui") {</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">    for (const fn of __ui.get(m.view) || []) try { await fn(m.action, m.value); } catch (err) { console.error(err); }</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">  }</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">}</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">const settingsCache = {};</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">const __disposable = (fn) => ({ dispose: fn });</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">const ctx = {</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">  id: "__ID__",</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">  commands: {</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">    handle(id, fn) { __handlers.set(id, fn); __call("commands.handle", [id]); return __disposable(() => __handlers.delete(id)); },</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">    run(id, args) { return __call("commands.run", [id, args || {}]); },</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">  },</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">  notify: {</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">    toast(text, kind) { return __call("notify.toast", [text, kind]); },</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">    send(spec) { return __call("notify.send", [spec]); },</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">  },</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">  settings: {</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">    get(key) { return settingsCache[key]; },</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">    set(key, value) { settingsCache[key] = value; return __call("settings.set", [key, value]); },</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">  },</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">  storage: {</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">    get(key) { return __call("storage.get", [key]); },</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">    set(key, value) { return __call("storage.set", [key, value]); },</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">  },</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">  vault: {</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">    readText(path) { return __call("vault.readText", [path]); },</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">    write(path, text) { return __call("vault.write", [path, text]); },</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">    list(dir, o) { return __call("vault.list", [dir || "", o || {}]); },</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">    current() { return __call("vault.current", []); },</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">  },</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">  statusbar: {</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">    item(id) {</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">      return {</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">        set text(v) { __call("statusbar.set", [id, { text: v }]); },</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">        set tooltip(v) { __call("statusbar.set", [id, { tooltip: v }]); },</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">        set command(v) { __call("statusbar.set", [id, { command: v }]); },</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">      };</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">    },</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">  },</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">  ui: {</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">    /** Replace a widgets view's tree (see the Widget type in the SDK). */</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">    render(view, tree) { return __call("ui.render", [view, tree]); },</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">    /** fn(action, value) runs when the user acts on a widget of that view. */</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">    on(view, fn) { const l = __ui.get(view) || []; l.push(fn); __ui.set(view, l); return __disposable(() => __ui.set(view, (__ui.get(view) || []).filter((f) => f !== fn))); },</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">  },</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">  events: {</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">    on(name, fn) {</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">      const list = __listeners.get(name) || [];</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">      // the app forwards an event only after the first subscription asks for it</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">      if (!list.length) __call("events.on", [name]);</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">      list.push(fn); __listeners.set(name, list);</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">      return __disposable(() => __listeners.set(name, (__listeners.get(name) || []).filter((f) => f !== fn)));</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">    },</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">    emit(name, payload) { return __call("events.emit", [name, payload]); },</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">  },</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">  log: {</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">    info: (...a) => __call("log", ["info", a.map(String).join(" ")]),</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">    warn: (...a) => __call("log", ["warn", a.map(String).join(" ")]),</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">    error: (...a) => __call("log", ["error", a.map(String).join(" ")]),</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">  },</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">  subscriptions: { push() {} },</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">};</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">\`</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583">export</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583"> const</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF"> WORKER_PRELUDE</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF"> \`</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">const __post = (m) => postMessage(m);</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">\${</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF">CORE</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">}</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">let __wasm = null;</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">self.onmessage = async (e) => {</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">  const m = e.data;</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">  if (__wasm) return __wasm(m);</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">  if (m.t === "activate") {</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">    Object.assign(settingsCache, m.settings || {});</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">    if (m.wasm) return __wasmBoot(m);</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">    try { await (self.__fanwitPlugin &#x26;&#x26; self.__fanwitPlugin(ctx)); __post({ t: "activated" }); }</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">    catch (err) { __post({ t: "activated", error: { message: String(err &#x26;&#x26; err.message || err) } }); }</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">  } else __receive(m);</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">};</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">// WASM plugins: every message goes in as JSON through fw_handle, and the {out: [...]} it returns</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">// goes out; see packages/fanwit-plugin-rs for the Rust side of this ABI</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">async function __wasmBoot(first) {</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">  try {</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">    const { instance } = await WebAssembly.instantiate(first.wasm, {});</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">    const ex = instance.exports, enc = new TextEncoder(), dec = new TextDecoder();</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">    __wasm = (msg) => {</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">      const data = enc.encode(JSON.stringify(msg));</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">      const ptr = ex.fw_alloc(data.length);</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">      new Uint8Array(ex.memory.buffer, ptr, data.length).set(data);</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">      const r = BigInt(ex.fw_handle(ptr, data.length));</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">      const len = Number(r &#x26; 0xffffffffn);</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">      if (!len) return;</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">      const out = JSON.parse(dec.decode(new Uint8Array(ex.memory.buffer, Number(r >> 32n), len)));</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">      for (const o of out.out || []) __post(o);</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">    };</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">    __wasm({ t: "activate", settings: first.settings });</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">  } catch (err) { __post({ t: "activated", error: { message: "WASM: " + String(err &#x26;&#x26; err.message || err) } }); }</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">}</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">self.__settings = settingsCache;</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">function definePlugin(fn) { self.__fanwitPlugin = fn; return fn; }</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">\`</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D">/**</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D"> * Loaded by a plugin's iframe page: \`&#x3C;script src="/&#x3C;id>/_fw/ui.js">&#x3C;/script>\` (the path is the</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D"> * same on every host). Gives \`window.fanwit\` (the ctx above) once the app hands over a port, and</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D"> * keeps the page's CSS variables in step with the app theme.</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D"> */</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583">export</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583"> const</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF"> FRAME_CLIENT</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF"> \`(() => {</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">let __port = null;</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">const __queue = [];</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">const __post = (m) => (__port ? __port.postMessage(m) : __queue.push(m));</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">\${</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF">CORE</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">}</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">const ready = [];</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">ctx.onReady = (fn) => (__port ? fn(ctx) : ready.push(fn));</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">window.fanwit = ctx;</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">window.addEventListener("message", (e) => {</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">  if (e.source !== parent || !e.data || e.data.t !== "fw-port" || __port) return;</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">  __port = e.ports[0];</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">  __port.onmessage = (ev) => {</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">    const m = ev.data;</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">    if (m.t === "theme") {</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">      for (const [k, v] of Object.entries(m.vars || {})) document.documentElement.style.setProperty("--" + k, v);</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">      document.documentElement.classList.toggle("dark", !!m.dark);</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">    } else __receive(m);</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">  };</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">  for (const m of __queue.splice(0)) __port.postMessage(m);</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">  for (const fn of ready.splice(0)) fn(ctx);</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">});</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">})();\`</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">;</span></span></code></pre></div>`;export{s as default};
