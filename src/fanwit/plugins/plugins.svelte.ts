/**
 * Runtime plugins (Chapter 14). Zero cost loading: manifests are indexed at scan; the kernel
 * registers every contribution as lazy stubs; code loads only when an activation event fires
 * (a command, a view, `onEvent:<name>`, or an explicit onStartupFinished). Code never runs on
 * the main thread except the opt in isolation = "none":
 *   js       a Web Worker running the plugin bundle (isolation = "worker", the default)
 *   wasm     a Web Worker running a WebAssembly module (any language that targets WASM)
 *   sidecar  a bundled native program speaking the same protocol over stdio (desktop)
 * All three talk to the app through host.ts, which owns permissions, timeouts and batching.
 * Plugins ship from three places: built in (plugins/ in this repo, bundled and off by default),
 * global (<data>/plugins) and the open vault (<vault config>/plugins).
 */
import { untrack } from "svelte";
import { SvelteMap } from "svelte/reactivity";
import { parse } from "smol-toml";
import { toDisposable, type Disposable } from "../kernel/disposable";
import { FanwitError } from "../kernel/errors";
import type { Kernel } from "../kernel/kernel.svelte";
import { defineModule, type ModuleDefinition } from "../kernel/module";
import type { ModuleContext } from "../kernel/context-api";
import { joinPath } from "../host/types";
import { identity } from "../gen/identity";
import { defineSettings, s as S, type SettingDef } from "../settings/define";
import { injectCss, parseTheme } from "../themes/themes.svelte";
import { connect, deny, hasPermission, messagePort, workerPort, type PluginConnection, type PluginPort } from "./host";
import { isDataOnly, parseManifest, satisfies, scriptManifest, type PluginManifest } from "./manifest";
import type { Widget } from "./widgets";
import { WORKER_PRELUDE } from "./worker-prelude";

export type PluginScope = "builtin" | "global" | "vault";

export interface InstalledPlugin {
	manifest: PluginManifest;
	dir: string;
	scope: PluginScope;
	enabled: boolean;
	readme?: string;
	error?: string;
	/** A user script (scripts/*.js), not a packaged plugin. */
	script?: boolean;
	/** Built in plugins: lazy loaders for their files, keyed by path inside the plugin. */
	files?: Record<string, () => Promise<string>>;
}

export interface Snippet {
	name: string;
	scope: "global" | "vault";
	path: string;
	enabled: boolean;
}

export interface RegistryEntry {
	id: string;
	name: string;
	version: string;
	description?: string;
	author?: string;
	rating?: number;
	isolation?: string;
	runtime?: string;
	category?: string;
	files: { path: string; url: string; sha256: string }[];
	signature?: string;
	registry: string;
}

// Built in plugins: every plugins/<id>/ folder of this repo, bundled as lazy chunks (nothing loads
// until a scan reads a manifest). Rust and WASM sources stay out; the built plugin.wasm goes in as a URL.
const BUILTIN_FILES = import.meta.glob(["/plugins/*/**/*.{toml,md,js,css,json,html,svg,txt}", "!/plugins/*/native/**", "!/plugins/*/wasm/**", "!/plugins/*/part.toml"], { query: "?raw", import: "default" }) as Record<string, () => Promise<string>>;
const BUILTIN_WASM = import.meta.glob("/plugins/*/*.wasm", { query: "?url", import: "default" }) as Record<string, () => Promise<string>>;

async function sha256(data: Uint8Array) {
	const buf = await crypto.subtle.digest("SHA-256", data as unknown as ArrayBuffer);
	return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class PluginService {
	version = $state(0);
	installed = $state<InstalledPlugin[]>([]);
	browse = $state<RegistryEntry[]>([]);
	snippets = $state<Snippet[]>([]);
	/** Widget trees by view id, written by plugins through ui.render. */
	readonly widgets = new SvelteMap<string, Widget | null>();
	private registered = new Map<string, Disposable>();
	private conns = new Map<string, PluginConnection>();
	private snippetCss = new Map<string, Disposable>();
	private snippetWatch: Disposable[] = [];
	safeMode = false;

	constructor(private k: Kernel) {}

	dir(scope: "global" | "vault") {
		if (scope === "vault") return this.k.sys.vault.current ? joinPath(this.k.sys.vault.current.configDir, "plugins") : null;
		return joinPath(this.k.host.dirs.data, "plugins");
	}

	private base(scope: "global" | "vault") {
		return scope === "vault" ? this.k.sys.vault.current?.configDir : this.k.host.dirs.config;
	}

	private enabledFile(scope: PluginScope) {
		const base = this.base(scope === "vault" ? "vault" : "global");
		return base ? joinPath(base, "plugins.toml") : null;
	}

	/** plugins.toml: enabled (installed plugins), builtin (built in ones turned on), consent (sidecars), snippets. */
	private async readFile(scope: PluginScope): Promise<Record<string, unknown>> {
		const f = this.enabledFile(scope);
		if (!f) return {};
		try {
			return parse(await this.k.host.fs.readText(f)) as Record<string, unknown>;
		} catch {
			return {};
		}
	}

	private async readList(scope: PluginScope, key = "enabled"): Promise<string[]> {
		const v = (await this.readFile(scope))[key];
		return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
	}

	private async writeList(scope: PluginScope, list: string[], key = "enabled") {
		const f = this.enabledFile(scope);
		// writeToml writes the whole document (keeping comments on desktop), so carry the other lists
		if (f) await this.k.host.fs.writeToml(f, { ...(await this.readFile(scope)), [key]: [...new Set(list)] });
	}

	/** Read a file of a plugin, wherever it lives. */
	async read(p: InstalledPlugin, rel: string): Promise<string> {
		if (p.files) {
			const f = p.files[rel.replace(/^\.?\//, "")];
			if (!f) throw new FanwitError("FS_NOT_FOUND", { message: `${p.manifest.id}/${rel} is not part of the plugin.` });
			return f();
		}
		return this.k.host.fs.readText(joinPath(p.dir, rel));
	}

	/** README text, read on demand. */
	async readme(p: InstalledPlugin): Promise<string | undefined> {
		return p.readme ?? (p.files ? p.files["README.md"]?.() : undefined);
	}

	private async readBytes(p: InstalledPlugin, rel: string): Promise<ArrayBuffer> {
		if (p.files) {
			const url = BUILTIN_WASM[`${p.dir}/${rel.replace(/^\.?\//, "")}`];
			if (!url) throw new FanwitError("FS_NOT_FOUND", { message: `${p.manifest.id}/${rel} is not bundled; build it with pnpm fw plugin build ${p.manifest.id}.` });
			return (await fetch(await url())).arrayBuffer();
		}
		return (await this.k.host.fs.read(joinPath(p.dir, rel))).slice().buffer;
	}

	private async scanBuiltin(enabled: Set<string>): Promise<InstalledPlugin[]> {
		const byDir = new Map<string, Record<string, () => Promise<string>>>();
		for (const [key, load] of Object.entries(BUILTIN_FILES)) {
			const m = /^\/plugins\/([^/]+)\/(.+)$/.exec(key);
			if (!m) continue;
			const dir = `/plugins/${m[1]}`;
			if (!byDir.has(dir)) byDir.set(dir, {});
			byDir.get(dir)![m[2]] = load;
		}
		// manifests only, in parallel; READMEs load when someone opens the details
		return Promise.all(
			[...byDir].filter(([, files]) => files["plugin.toml"]).map(async ([dir, files]): Promise<InstalledPlugin> => {
				try {
					const manifest = parseManifest(await files["plugin.toml"](), `${dir.slice(1)}/plugin.toml`);
					return { manifest, dir, scope: "builtin", enabled: enabled.has(manifest.id), files };
				} catch (err) {
					return { manifest: stub(dir.split("/").pop()!), dir, scope: "builtin", enabled: false, error: (err as Error).message, files };
				}
			})
		);
	}

	private scanning: Promise<void> | null = null;
	private rescan = false;

	/**
	 * Scan plugin folders, validate manifests and register contributions of enabled plugins.
	 * One scan at a time: calls during a scan (file watchers, other windows) queue one follow up.
	 */
	scan(): Promise<void> {
		if (this.scanning) {
			this.rescan = true;
			return this.scanning;
		}
		this.scanning = (async () => {
			try {
				do {
					this.rescan = false;
					await this.doScan();
				} while (this.rescan);
			} finally {
				this.scanning = null;
			}
		})();
		return this.scanning;
	}

	/** Every window runs its own kernel: tell the others to rescan after a change here. */
	readonly instance = Math.random().toString(36).slice(2);
	private changed() {
		this.k.events.emit("fw:plugins-changed" as never, { from: this.instance } as never, { scope: "app" });
	}

	/** Show what a plugin added, in the main window (the plugin browser may be its own window). */
	reveal(what: { view?: string; preset?: string; theme?: string }) {
		this.k.events.emit("fw:plugins-reveal" as never, what as never, { scope: "app" });
	}

	private async doScan() {
		const out: InstalledPlugin[] = [];
		for (const scope of ["global", "vault"] as const) {
			const dir = this.dir(scope);
			if (!dir) continue;
			const enabled = new Set(await this.readList(scope));
			const entries = await this.k.host.fs.list(dir).catch(() => []);
			for (const e of entries.filter((x) => x.dir)) {
				try {
					const manifest = parseManifest(await this.k.host.fs.readText(joinPath(e.path, "plugin.toml")), `${e.name}/plugin.toml`);
					const readme = await this.k.host.fs.readText(joinPath(e.path, "README.md")).catch(() => undefined);
					out.push({ manifest, dir: e.path, scope, enabled: enabled.has(manifest.id), readme });
				} catch (err) {
					out.push({ manifest: stub(e.name), dir: e.path, scope, enabled: false, error: (err as Error).message });
				}
			}
			// user scripts: scripts/*.js next to plugins.toml, each a tiny worker plugin
			const base = this.base(scope);
			const sdir = base && joinPath(base, "scripts");
			for (const e of sdir ? await this.k.host.fs.list(sdir).catch(() => []) : []) {
				if (e.dir || !e.name.endsWith(".js")) continue;
				const manifest = scriptManifest(e.name, await this.k.host.fs.readText(e.path));
				out.push({ manifest, dir: sdir!, scope, enabled: enabled.has(manifest.id), script: true });
			}
		}
		// built in plugins last: an installed copy with the same id shadows the bundled one
		const builtinOn = new Set(await this.readList("builtin", "builtin"));
		for (const b of await this.scanBuiltin(builtinOn)) if (!out.some((p) => p.manifest.id === b.manifest.id)) out.push(b);
		// drop modules of plugins that disappeared (uninstalled, shadowed, stripped)
		for (const [id, d] of this.registered) {
			if (!out.some((p) => `plugin:${p.manifest.id}` === id && p.enabled)) {
				d.dispose();
				this.registered.delete(id);
			}
		}
		this.installed = out;
		// the contribution index: one file listing what every plugin declares (Section 14.4 step 1)
		await this.k.host.fs.writeText(joinPath(this.k.host.dirs.data, "plugins", "index.json"), JSON.stringify(out.map((p) => ({ id: p.manifest.id, scope: p.scope, dir: p.dir, manifest: p.manifest })), null, 1)).catch(() => {});
		for (const p of out) await this.sync(p);
		await this.scanSnippets();
		this.version = untrack(() => this.version) + 1;
	}

	/** Register or unregister a plugin's module to match its enabled state. */
	private async sync(p: InstalledPlugin) {
		const id = `plugin:${p.manifest.id}`;
		const want = p.enabled && !p.error;
		if (!want) {
			this.registered.get(id)?.dispose();
			this.registered.delete(id);
			return;
		}
		if (this.registered.has(id)) return;
		const why = await this.blocked(p);
		if (why) {
			p.error = why;
			return;
		}
		try {
			const mod = await this.toModule(p);
			const reg = this.k.modules.register(mod);
			const events = this.eventActivation(p);
			this.registered.set(id, toDisposable(() => (events.dispose(), reg.dispose(), this.conns.get(id)?.dispose(), this.conns.delete(id))));
		} catch (e) {
			p.error = (e as Error).message;
		}
	}

	/** Why this plugin may not run here, or undefined when it may. */
	private async blocked(p: InstalledPlugin): Promise<string | undefined> {
		const m = p.manifest;
		if (!satisfies(identity.version, m.app ?? "*")) return `Needs ${identity.name} ${m.app}; this is ${identity.version}.`;
		if (isDataOnly(m)) return;
		const allow = this.k.sys.config.plugins?.allow ?? ["data", "worker"];
		if (m.runtime === "sidecar") {
			if (p.scope !== "builtin") return "Native sidecars run only when they ship with the app.";
			if (!this.k.host.plugins?.sidecar) return "Native sidecars need the desktop app.";
			if (!hasPermission(m, `sidecar:${m.id}`)) return `Add "sidecar:${m.id}" to permissions in plugin.toml.`;
			if (!(await this.readList("builtin", "consent")).includes(m.id)) return "Turn it off and on again to allow its native program.";
			return;
		}
		if (m.runtime === "js" && !allow.includes(m.isolation)) return `This app does not accept plugins with isolation = "${m.isolation}".`;
		if (m.runtime === "js" && m.isolation === "none" && !this.k.sys.settings.get("plugins.allowCode")) return "Enable Allow community code plugins in Settings, Plugins to run this plugin.";
	}

	/**
	 * onEvent:<name> activation: one listener per name activates the plugin on the first event and
	 * hands it that event once it has subscribed, so nothing runs before the plugin is needed.
	 */
	private eventActivation(p: InstalledPlugin): Disposable {
		const id = `plugin:${p.manifest.id}`;
		// events that arrive while it starts are queued and handed over in order, not lost
		let queue: [string, unknown][] | null = null;
		const subs = p.manifest.activation
			.filter((a) => a.startsWith("onEvent:"))
			.map((a) =>
				this.k.events.on(a.slice(8) as never, async (payload: unknown) => {
					const status = this.k.modules.modules.get(id)?.status;
					if (status === "activating" && queue) return void queue.push([a.slice(8), payload]);
					if (status !== "idle") return;
					queue = [[a.slice(8), payload]];
					await this.k.modules.activate(id, a);
					const q = queue;
					queue = null;
					for (const [name, data] of q) this.conns.get(id)?.event(name, data);
				})
			);
		return toDisposable(() => subs.forEach((s) => s.dispose()));
	}

	private async toModule(p: InstalledPlugin): Promise<ModuleDefinition> {
		const m = p.manifest;
		const c = m.contributes ?? {};
		const settings = c.settings?.length
			? [
					defineSettings(
						"",
						Object.fromEntries(
							c.settings.map((s) => {
								const meta = { title: s.title, description: s.description, category: m.name };
								const b = s.type === "number" ? S.number(Number(s.default), meta) : s.type === "boolean" ? S.boolean(Boolean(s.default), meta) : s.type === "enum" ? S.enum(String(s.default), s.options ?? [], meta) : S.string(String(s.default ?? ""), meta);
								return [s.key, b] as [string, Omit<SettingDef, "key">];
							})
						)
					)
				]
			: undefined;
		const themes: ReturnType<typeof parseTheme>[] = [];
		for (const t of c.themes ?? []) themes.push(parseTheme(await this.read(p, t)));
		const presets = [];
		for (const l of c.layoutPresets ?? []) presets.push({ id: `${m.id}:${l.replace(/\.toml$/, "").split("/").pop()}`, title: `${m.name}: ${l}`, text: await this.read(p, l) });
		const styles = [];
		for (const f of c.styles ?? []) styles.push({ id: f, css: await this.read(p, f) });
		// legacy: a code plugin's styles.css next to its entry
		if (!c.styles && !isDataOnly(m)) {
			const css = await this.read(p, "styles.css").catch(() => "");
			if (css) styles.push({ id: "styles.css", css });
		}
		const code = !isDataOnly(m);
		const safe = this.safeMode || !!this.k.sys.settings.get("plugins.safeMode");
		const views = (c.views ?? []).map((v) => ({ id: v.id, title: v.title, icon: v.icon ?? m.icon ?? "puzzle", regions: v.regions, singleton: v.singleton, category: m.name, component: () => import("./PluginView.svelte") }));
		return defineModule({
			id: `plugin:${m.id}`,
			title: m.name,
			description: m.description,
			tier: "plugin",
			// nothing at startup unless asked for; commands and views activate implicitly
			activationEvents: code && !safe ? [...(m.permissions.includes("startup") ? ["onStartup"] : []), ...m.activation.filter((a) => !a.startsWith("onEvent:"))] : [],
			contributes: {
				commands: c.commands,
				keybindings: c.keybindings,
				statusItems: c.statusItems,
				settings,
				themes,
				styles,
				views,
				layoutPresets: presets,
				menus: this.menus(p) as never
			},
			activate: code && !safe ? (ctx: ModuleContext) => this.activateCode(p, ctx) : undefined
		});
	}

	/**
	 * Context menu items a plugin adds (any location: statusbar/item, view/title, editor/context...).
	 * Its own commands go anywhere; pointing other commands needs the menus.global permission.
	 */
	private menus(p: InstalledPlugin) {
		const m = p.manifest;
		const own = new Set((m.contributes?.commands ?? []).map((c) => c.id));
		const out: Record<string, Record<string, unknown>[]> = {};
		for (const [loc, items] of Object.entries(m.contributes?.menus ?? {})) {
			out[loc] = items
				.filter((it) => {
					const ok = !it.command || own.has(String(it.command)) || hasPermission(m, "menus.global");
					if (!ok) this.k.scopedLog("plugins").warn(`plugin "${m.id}": menu item for ${String(it.command)} in ${loc} needs the menus.global permission`);
					return ok;
				})
				.map((it, i) => ({ id: `${m.id}.${loc}.${i}`, ...it }));
		}
		return out;
	}

	private hooks(p: InstalledPlugin) {
		return {
			render: (view: string, tree: Widget | null) => this.widgets.set(view, tree),
			dead: (reason: string) => {
				this.k.scopedLog("plugins").error(`plugin "${p.manifest.id}" stopped: ${reason}`);
				p.error = reason;
				this.registered.get(`plugin:${p.manifest.id}`)?.dispose();
				this.registered.delete(`plugin:${p.manifest.id}`);
				this.version = untrack(() => this.version) + 1;
			}
		};
	}

	private async activateCode(p: InstalledPlugin, ctx: ModuleContext) {
		const m = p.manifest;
		const id = `plugin:${m.id}`;
		if (m.runtime === "js" && m.isolation === "none") return this.activateInRealm(p, ctx, await this.read(p, m.entry!));
		let port: PluginPort;
		let extra: Record<string, unknown> = {};
		let transfer: Transferable[] | undefined;
		if (m.runtime === "sidecar") {
			let conn: PluginConnection | undefined;
			let onMsg: (msg: unknown) => void = () => {};
			const proc = await this.k.host.plugins!.sidecar!(
				m.id,
				(line) => {
					try {
						onMsg(JSON.parse(line));
					} catch {
						ctx.log.warn(`sidecar ${m.id}: not JSON: ${line.slice(0, 200)}`);
					}
				},
				(code) => conn?.fail(`Its native program exited (${code ?? "killed"}).`)
			);
			port = { post: (msg) => void proc.send(JSON.stringify(msg)), onMessage: (fn) => (onMsg = fn), close: () => void proc.kill() };
			conn = this.open(p, ctx, port);
			return conn.activate();
		}
		const src = m.runtime === "wasm" ? "" : (await this.read(p, m.entry!)).replace(/^\s*import\s[^;]*;?\s*$/gm, "").replace(/export\s+default\s+/, "self.__fanwitPlugin = ");
		if (m.runtime === "wasm") {
			const wasm = await this.readBytes(p, m.entry!);
			extra = { wasm };
			transfer = [wasm];
		}
		const url = URL.createObjectURL(new Blob([WORKER_PRELUDE.replace("__ID__", m.id), "\n", src], { type: "text/javascript" }));
		const worker = new Worker(url, { name: id });
		URL.revokeObjectURL(url);
		port = workerPort(worker);
		const conn = this.open(p, ctx, port);
		worker.onerror = (e) => conn.fail(e.message || "The plugin worker crashed.");
		return conn.activate(extra, transfer);
	}

	private open(p: InstalledPlugin, ctx: ModuleContext, port: PluginPort) {
		const id = `plugin:${p.manifest.id}`;
		const conn = connect(this.k, p.manifest, ctx, port, this.hooks(p));
		this.conns.set(id, conn);
		ctx.subscriptions.push(toDisposable(() => this.conns.get(id) === conn && this.conns.delete(id)));
		return conn;
	}

	/** isolation = "none": import the ESM bundle and give it a permission filtered ctx. */
	private async activateInRealm(p: InstalledPlugin, ctx: ModuleContext, src: string) {
		const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
		try {
			const mod = await import(/* @vite-ignore */ url);
			const fn = mod.default ?? mod.activate;
			if (typeof fn !== "function") throw new FanwitError("PLUGIN_ENTRY", { message: `${p.manifest.entry} has no default export function.` });
			await fn(this.filter(p, ctx));
		} finally {
			URL.revokeObjectURL(url);
		}
	}

	private filter(p: InstalledPlugin, ctx: ModuleContext): ModuleContext {
		const m = p.manifest;
		const vaultFs = new Proxy(ctx.vault.fs, {
			get(t, key: string) {
				if (["read", "readText", "list", "stat", "exists", "watch"].includes(key) && !hasPermission(m, "vault.read")) return () => deny(m, "vault.read");
				if (["write", "rename", "trash", "mkdir"].includes(key) && !hasPermission(m, "vault.write")) return () => deny(m, "vault.write");
				return (t as unknown as Record<string, unknown>)[key];
			}
		});
		return new Proxy(ctx, {
			get(t, key: string) {
				if (key === "vault") return new Proxy(t.vault, { get: (vt, kk: string) => (kk === "fs" ? vaultFs : (vt as unknown as Record<string, unknown>)[kk]) });
				if (key === "windows" && !hasPermission(m, "windows")) return new Proxy({}, { get: () => () => deny(m, "windows") });
				if (key === "commands") return { ...t.commands, intercept: hasPermission(m, "commands.intercept") ? t.commands.intercept : () => deny(m, "commands.intercept") };
				return (t as unknown as Record<string, unknown>)[key];
			}
		});
	}

	// ----- plugin views -----

	/** The plugin and view spec behind a view id contributed by a plugin. */
	viewOwner(viewId: string) {
		for (const p of this.installed) {
			const v = p.manifest.contributes?.views?.find((x) => x.id === viewId);
			if (v) return { plugin: p, view: v };
		}
		return null;
	}

	/** A user acted on a widget: tell the plugin. */
	uiEvent(viewId: string, action: string, value?: unknown) {
		const o = this.viewOwner(viewId);
		if (o) this.conns.get(`plugin:${o.plugin.manifest.id}`)?.post({ t: "ui", view: viewId, action, value: value === undefined ? null : JSON.parse(JSON.stringify(value)) });
	}

	/** Files of a plugin's iframe page, as bytes, for the host's plugin scheme or srcdoc. */
	async frameFiles(p: InstalledPlugin): Promise<Record<string, string>> {
		const out: Record<string, string> = {};
		const paths = p.files ? Object.keys(p.files) : (await this.k.host.fs.list(p.dir, { recursive: true })).filter((e) => !e.dir).map((e) => e.path.slice(p.dir.replace(/\/+$/, "").length + 1));
		for (const rel of paths) if (/\.(html|js|css|svg|json|txt)$/.test(rel) && !rel.startsWith("native/") && !rel.startsWith("wasm/")) out[rel] = await this.read(p, rel);
		return out;
	}

	/** Connect an iframe's MessagePort to its plugin under the plugin's permissions. */
	async connectFrame(viewId: string, port: MessagePort): Promise<Disposable> {
		const o = this.viewOwner(viewId);
		if (!o) throw new FanwitError("PLUGIN_VIEW", { message: `No plugin provides ${viewId}.` });
		const id = `plugin:${o.plugin.manifest.id}`;
		await this.k.modules.activate(id, `onView:${viewId}`);
		const ctx = this.k.modules.modules.get(id)?.ctx;
		if (!ctx) throw new FanwitError("PLUGIN_VIEW", { message: `${o.plugin.manifest.name} is not running.` });
		const conn = connect(this.k, o.plugin.manifest, ctx, messagePort(port), this.hooks(o.plugin));
		return conn;
	}

	// ----- enable, install -----

	async setEnabled(id: string, scope: PluginScope, on: boolean) {
		const p = this.installed.find((x) => x.manifest.id === id && x.scope === scope);
		if (scope === "builtin") {
			// no point asking where it cannot run anyway (the web build); the card says why
			if (on && p?.manifest.runtime === "sidecar" && this.k.host.plugins?.sidecar && !(await this.readList("builtin", "consent")).includes(id)) {
				const ok = await this.k.sys.dialog.ask(`${p.manifest.name} runs a native program that ships with this app (${describe(p.manifest)}). It runs outside the browser sandbox with your user's rights. Allow it?`, { title: "Allow native plugin", kind: "warning", okLabel: "Allow", cancelLabel: "Cancel" });
				if (!ok) return;
				await this.writeList("builtin", [...(await this.readList("builtin", "consent")), id], "consent");
			}
			const list = await this.readList("builtin", "builtin");
			await this.writeList("builtin", on ? [...list, id] : list.filter((x) => x !== id), "builtin");
		} else {
			const list = await this.readList(scope);
			await this.writeList(scope, on ? [...list, id] : list.filter((x) => x !== id));
		}
		if (p) {
			p.enabled = on;
			p.error = undefined;
			await this.sync(p);
		}
		this.version = untrack(() => this.version) + 1;
		this.changed();
		if (on && p && !p.error) await this.announce(p);
	}

	/**
	 * Turning a plugin on often changes nothing you can see yet: its views are closed, its skin
	 * targets another layout, its theme is not selected. Say so, with a button that shows it.
	 */
	private async announce(p: InstalledPlugin) {
		const m = p.manifest;
		const c = m.contributes ?? {};
		const actions: { label: string; command: string; args: Record<string, unknown> }[] = [];
		for (const v of c.views ?? []) actions.push({ label: `Open ${v.title}`, command: "plugins.reveal", args: { view: v.id } });
		for (const t of c.themes ?? []) {
			const id = (parse(await this.read(p, t).catch(() => "")) as { meta?: { id?: string } }).meta?.id;
			if (id) actions.push({ label: "Use this theme", command: "plugins.reveal", args: { theme: id } });
		}
		const presets = new Set<string>();
		for (const f of c.styles ?? []) for (const x of (await this.read(p, f).catch(() => "")).matchAll(/data-preset="([\w-]+)"/g)) presets.add(x[1]);
		const current = typeof document !== "undefined" ? document.documentElement.dataset.preset : undefined;
		for (const preset of presets) if (preset !== current) actions.push({ label: `Switch to the ${preset} layout`, command: "plugins.reveal", args: { preset } });
		const body = c.views?.length
			? "Its panel is ready to open."
			: presets.size && !presets.has(current ?? "")
				? `It restyles the ${[...presets].join(", ")} layout preset only.`
				: c.themes?.length
					? "It adds a theme; pick it to use it."
					: m.activation.some((a) => a.startsWith("onEvent:"))
						? "It starts by itself when it is needed, for example when you open a note."
						: c.commands?.length
							? `Try it from the command palette: ${c.commands[0].title}.`
							: undefined;
		if (body || actions.length) this.k.sys.notify.send({ title: `${m.name} is on`, body, kind: "success", actions: actions.slice(0, 2) });
	}

	/** Copy a plugin folder into the plugins directory (desktop: pick a folder). */
	async installFromFiles(files: Record<string, string | Uint8Array>, scope: "global" | "vault" = "global") {
		const manifest = parseManifest(String(files["plugin.toml"] ?? ""), "plugin.toml");
		if (manifest.runtime === "sidecar") throw new FanwitError("PLUGIN_SIDECAR", { message: `${manifest.name} is a native sidecar plugin; those run only when they ship with the app.` });
		const dir = this.dir(scope);
		if (!dir) throw new FanwitError("STORAGE_NO_VAULT", { message: "Open a vault to install vault plugins." });
		const target = joinPath(dir, manifest.id);
		for (const [path, data] of Object.entries(files)) {
			if (path.includes("..")) continue;
			if (typeof data === "string") await this.k.host.fs.writeText(joinPath(target, path), data);
			else await this.k.host.fs.write(joinPath(target, path), data);
		}
		await this.scan();
		this.changed();
		return manifest;
	}

	async installFromFolder(path: string) {
		const entries = await this.k.host.fs.list(path, { recursive: true });
		const files: Record<string, Uint8Array> = {};
		for (const e of entries.filter((x) => !x.dir)) files[e.path.slice(path.replace(/\/+$/, "").length + 1)] = await this.k.host.fs.read(e.path);
		const text = new TextDecoder().decode(files["plugin.toml"] ?? new Uint8Array());
		return this.installFromFiles({ ...files, "plugin.toml": text });
	}

	async uninstall(id: string, scope: "global" | "vault") {
		await this.setEnabled(id, scope, false);
		const p = this.installed.find((x) => x.manifest.id === id && x.scope === scope);
		// a script shares its folder with other scripts: remove only its file
		if (p) await (p.script ? this.k.host.fs.remove(joinPath(p.dir, p.manifest.entry!)) : this.k.host.fs.remove(p.dir, { recursive: true }));
		await this.scan();
		this.changed();
	}

	/** Registries are static JSON indexes the app trusts (Section 14.8). */
	async loadRegistries() {
		const out: RegistryEntry[] = [];
		for (const url of this.k.sys.config.plugins?.registries ?? []) {
			try {
				const r = (await (await fetch(url)).json()) as { plugins: Omit<RegistryEntry, "registry">[] };
				out.push(...r.plugins.map((p) => ({ ...p, registry: url })));
			} catch (e) {
				this.k.scopedLog("plugins").warn(`registry ${url} failed: ${(e as Error).message}`);
			}
		}
		this.browse = out;
		return out;
	}

	/** Download, verify SHA-256 of every file, then install. */
	async installFromRegistry(entry: RegistryEntry) {
		const files: Record<string, string | Uint8Array> = {};
		for (const f of entry.files) {
			const data = new Uint8Array(await (await fetch(new URL(f.url, entry.registry))).arrayBuffer());
			if ((await sha256(data)) !== f.sha256) throw new FanwitError("PLUGIN_INTEGRITY", { message: `${entry.id}/${f.path} failed its SHA-256 check; nothing was installed.` });
			files[f.path] = /\.(toml|md|js|css|html|json|svg|txt)$/.test(f.path) ? new TextDecoder().decode(data) : data;
		}
		if (!entry.signature && !this.k.sys.settings.get("plugins.allowUnsigned")) throw new FanwitError("PLUGIN_UNSIGNED", { message: `${entry.name} is not signed.`, hint: "Enable Allow unsigned plugins in Settings, Plugins to install it." });
		return this.installFromFiles(files);
	}

	updates() {
		return this.browse.filter((b) => {
			const i = this.installed.find((p) => p.manifest.id === b.id);
			return i && i.scope !== "builtin" && satisfies(b.version, `>${i.manifest.version}`);
		});
	}

	/** Hot reload: re-read every plugin and re-activate code plugins (dev.reloadPlugins). */
	async reload() {
		for (const [id, d] of this.registered) {
			d.dispose();
			this.registered.delete(id);
		}
		await this.scan();
	}

	// ----- CSS snippets (Obsidian style): <config>/snippets/*.css and <vault config>/snippets/*.css -----

	snippetDir(scope: "global" | "vault") {
		const base = this.base(scope);
		return base ? joinPath(base, "snippets") : null;
	}

	async scanSnippets() {
		const out: Snippet[] = [];
		for (const s of this.snippetWatch.splice(0)) s.dispose();
		for (const scope of ["global", "vault"] as const) {
			const dir = this.snippetDir(scope);
			if (!dir) continue;
			const on = new Set(await this.readList(scope, "snippets"));
			for (const e of await this.k.host.fs.list(dir).catch(() => [])) if (!e.dir && e.name.endsWith(".css")) out.push({ name: e.name, scope, path: e.path, enabled: on.has(e.name) });
			// edits on disk apply live
			const w = await this.k.host.fs.watch(dir, () => void this.scanSnippets()).catch(() => null);
			if (w) this.snippetWatch.push(w);
		}
		this.snippets = out;
		for (const [key, d] of this.snippetCss) d.dispose(), this.snippetCss.delete(key);
		for (const s of out.filter((x) => x.enabled)) {
			const css = await this.k.host.fs.readText(s.path).catch(() => "");
			this.snippetCss.set(`${s.scope}:${s.name}`, injectCss(`snippet:${s.name}`, css));
		}
		this.version = untrack(() => this.version) + 1;
	}

	async setSnippet(name: string, scope: "global" | "vault", on: boolean) {
		const list = await this.readList(scope, "snippets");
		await this.writeList(scope, on ? [...list, name] : list.filter((x) => x !== name), "snippets");
		await this.scanSnippets();
		this.changed();
	}

	async newSnippet(scope: "global" | "vault" = "global") {
		const dir = this.snippetDir(scope);
		if (!dir) throw new FanwitError("STORAGE_NO_VAULT", { message: "Open a vault to add vault snippets." });
		let n = 1;
		while (this.snippets.some((s) => s.scope === scope && s.name === `snippet-${n}.css`)) n++;
		const path = joinPath(dir, `snippet-${n}.css`);
		await this.k.host.fs.writeText(path, `/* Any CSS. Theme tokens are CSS variables, for example: */\n:root {\n\t/* --primary: oklch(0.6 0.2 260); */\n}\n`);
		await this.scanSnippets();
		return path;
	}

	dispose() {
		for (const s of this.snippetWatch.splice(0)) s.dispose();
		for (const d of this.snippetCss.values()) d.dispose();
	}
}

function stub(id: string): PluginManifest {
	return { id, name: id, version: "0.0.0", runtime: "js", isolation: "worker", activation: [], permissions: [], contributes: {} } as PluginManifest;
}

export function runtimeLabel(m: PluginManifest): "data" | "js" | "wasm" | "sidecar" | "main thread" {
	if (isDataOnly(m)) return "data";
	if (m.runtime === "js" && m.isolation === "none") return "main thread";
	return m.runtime;
}

/** Appearance plugins only change how the app looks: data only with styles or themes. */
export function categoryOf(m: PluginManifest): string {
	if (m.category) return m.category.toLowerCase();
	return isDataOnly(m) && (m.contributes?.styles?.length || m.contributes?.themes?.length) ? "appearance" : "feature";
}

function describe(m: PluginManifest) {
	return `fanwit-plugin-${m.id}`;
}
