/**
 * Runtime plugins (Chapter 14). Zero cost loading: manifests are indexed at install; at boot the
 * kernel registers every contribution as lazy stubs; code loads only when an activation event
 * fires. Two clearly labelled isolation levels:
 *   none   same realm, full UI power; permissions gate ctx but are a contract, not a sandbox
 *   worker Web Worker with an RPC ctx; every call is checked against granted permissions
 */
import { untrack } from "svelte";
import { parse } from "smol-toml";
import { DisposableStore, toDisposable, type Disposable } from "../kernel/disposable";
import { FanwitError } from "../kernel/errors";
import type { Kernel } from "../kernel/kernel.svelte";
import { defineModule, type ModuleDefinition } from "../kernel/module";
import type { ModuleContext } from "../kernel/context-api";
import { joinPath } from "../host/types";
import { identity } from "../gen/identity";
import { defineSettings, s as S, type SettingDef } from "../settings/define";
import { parseTheme } from "../themes/themes.svelte";
import { isDataOnly, parseManifest, satisfies, scriptManifest, type PluginManifest } from "./manifest";
import { WORKER_PRELUDE } from "./worker-prelude";

export interface InstalledPlugin {
	manifest: PluginManifest;
	dir: string;
	scope: "global" | "vault";
	enabled: boolean;
	readme?: string;
	error?: string;
	/** A user script (scripts/*.js), not a packaged plugin. */
	script?: boolean;
}

export interface RegistryEntry {
	id: string;
	name: string;
	version: string;
	description?: string;
	author?: string;
	rating?: number;
	isolation?: string;
	files: { path: string; url: string; sha256: string }[];
	signature?: string;
	registry: string;
}

async function sha256(data: Uint8Array) {
	const buf = await crypto.subtle.digest("SHA-256", data as unknown as ArrayBuffer);
	return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class PluginService {
	version = $state(0);
	installed = $state<InstalledPlugin[]>([]);
	browse = $state<RegistryEntry[]>([]);
	private registered = new Map<string, Disposable>();
	private workers = new Map<string, Worker>();
	safeMode = false;

	constructor(private k: Kernel) {}

	dir(scope: "global" | "vault") {
		if (scope === "vault") return this.k.sys.vault.current ? joinPath(this.k.sys.vault.current.configDir, "plugins") : null;
		return joinPath(this.k.host.dirs.data, "plugins");
	}

	private enabledFile(scope: "global" | "vault") {
		const base = scope === "vault" ? this.k.sys.vault.current?.configDir : this.k.host.dirs.config;
		return base ? joinPath(base, "plugins.toml") : null;
	}

	private async readEnabled(scope: "global" | "vault"): Promise<string[]> {
		const f = this.enabledFile(scope);
		if (!f) return [];
		try {
			return ((parse(await this.k.host.fs.readText(f)) as { enabled?: string[] }).enabled ?? []).filter((x) => typeof x === "string");
		} catch {
			return [];
		}
	}

	private async writeEnabled(scope: "global" | "vault", list: string[]) {
		const f = this.enabledFile(scope);
		if (f) await this.k.host.fs.writeToml(f, { enabled: [...new Set(list)] });
	}

	/** Scan plugin folders, validate manifests and register contributions of enabled plugins. */
	async scan() {
		const out: InstalledPlugin[] = [];
		for (const scope of ["global", "vault"] as const) {
			const dir = this.dir(scope);
			if (!dir) continue;
			const enabled = new Set(await this.readEnabled(scope));
			const entries = await this.k.host.fs.list(dir).catch(() => []);
			for (const e of entries.filter((x) => x.dir)) {
				try {
					const manifest = parseManifest(await this.k.host.fs.readText(joinPath(e.path, "plugin.toml")), `${e.name}/plugin.toml`);
					const readme = await this.k.host.fs.readText(joinPath(e.path, "README.md")).catch(() => undefined);
					out.push({ manifest, dir: e.path, scope, enabled: enabled.has(manifest.id), readme });
				} catch (err) {
					out.push({ manifest: { id: e.name, name: e.name, version: "0.0.0", isolation: "worker", activation: [], permissions: [], contributes: {} } as PluginManifest, dir: e.path, scope, enabled: false, error: (err as Error).message });
				}
			}
			// user scripts: scripts/*.js next to plugins.toml, each a tiny worker plugin
			const base = scope === "vault" ? this.k.sys.vault.current?.configDir : this.k.host.dirs.config;
			const sdir = base && joinPath(base, "scripts");
			for (const e of sdir ? await this.k.host.fs.list(sdir).catch(() => []) : []) {
				if (e.dir || !e.name.endsWith(".js")) continue;
				const manifest = scriptManifest(e.name, await this.k.host.fs.readText(e.path));
				out.push({ manifest, dir: sdir!, scope, enabled: enabled.has(manifest.id), script: true });
			}
		}
		this.installed = out;
		// the contribution index: one file listing what every plugin declares (Section 14.4 step 1)
		await this.k.host.fs.writeText(joinPath(this.k.host.dirs.data, "plugins", "index.json"), JSON.stringify(out.map((p) => ({ id: p.manifest.id, scope: p.scope, dir: p.dir, manifest: p.manifest })), null, 1)).catch(() => {});
		for (const p of out) await this.sync(p);
		this.version = untrack(() => this.version) + 1;
	}

	/** Register or unregister a plugin's module to match its enabled state. */
	private async sync(p: InstalledPlugin) {
		const id = `plugin:${p.manifest.id}`;
		const want = p.enabled && !p.error;
		if (!want) {
			this.registered.get(id)?.dispose();
			this.registered.delete(id);
			this.workers.get(id)?.terminate();
			this.workers.delete(id);
			return;
		}
		if (this.registered.has(id)) return;
		if (!satisfies(identity.version, p.manifest.app ?? "*")) {
			p.error = `Needs ${identity.name} ${p.manifest.app}; this is ${identity.version}.`;
			return;
		}
		const allow = this.k.sys.config.plugins?.allow ?? ["data", "worker"];
		const code = !isDataOnly(p.manifest);
		if (code && !allow.includes(p.manifest.isolation)) {
			p.error = `This app does not accept plugins with isolation = "${p.manifest.isolation}".`;
			return;
		}
		if (code && p.manifest.isolation === "none" && !this.k.sys.settings.get("plugins.allowCode")) {
			p.error = "Enable Allow community code plugins in Settings, Plugins to run this plugin.";
			return;
		}
		try {
			const mod = await this.toModule(p);
			this.registered.set(id, this.k.modules.register(mod));
		} catch (e) {
			p.error = (e as Error).message;
		}
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
		for (const t of c.themes ?? []) themes.push(parseTheme(await this.k.host.fs.readText(joinPath(p.dir, t))));
		const presets = [];
		for (const l of c.layoutPresets ?? []) presets.push({ id: `${m.id}:${l.replace(/\.toml$/, "").split("/").pop()}`, title: `${m.name}: ${l}`, text: await this.k.host.fs.readText(joinPath(p.dir, l)) });
		const code = !isDataOnly(m);
		const safe = this.safeMode || !!this.k.sys.settings.get("plugins.safeMode");
		return defineModule({
			id: `plugin:${m.id}`,
			title: m.name,
			description: m.description,
			tier: "plugin",
			activationEvents: code && !safe ? (m.permissions.includes("startup") ? ["onStartup", ...m.activation] : m.activation.length ? m.activation : ["onStartupFinished"]) : [],
			contributes: {
				commands: c.commands,
				keybindings: c.keybindings,
				statusItems: c.statusItems,
				settings,
				themes,
				layoutPresets: presets,
				menus: c.menus as never
			},
			activate: code && !safe ? (ctx: ModuleContext) => this.activateCode(p, ctx) : undefined
		});
	}

	private has(p: InstalledPlugin, perm: string) {
		return p.manifest.permissions.some((x) => x === perm || x.startsWith(perm + ":"));
	}

	private deny(p: InstalledPlugin, perm: string): never {
		throw new FanwitError("PERMISSION_DENIED", { message: `Plugin "${p.manifest.id}" does not have the "${perm}" permission.`, hint: `Add "${perm}" to permissions in plugin.toml.`, owner: p.manifest.id });
	}

	private async activateCode(p: InstalledPlugin, ctx: ModuleContext) {
		const src = await this.k.host.fs.readText(joinPath(p.dir, p.manifest.entry!));
		const css = await this.k.host.fs.readText(joinPath(p.dir, "styles.css")).catch(() => "");
		if (css) {
			const style = document.createElement("style");
			style.dataset.plugin = p.manifest.id;
			style.textContent = css.replace(/@import[^;]*;/g, "").replace(/url\((?!\s*['"]?data:)[^)]*\)/g, "none");
			document.head.appendChild(style);
			ctx.subscriptions.push(toDisposable(() => style.remove()));
		}
		if (p.manifest.isolation === "none") return this.activateInRealm(p, ctx, src);
		return this.activateInWorker(p, ctx, src);
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
		const self = this;
		const vaultFs = new Proxy(ctx.vault.fs, {
			get(t, key: string) {
				if (["read", "readText", "list", "stat", "exists", "watch"].includes(key) && !self.has(p, "vault.read")) return () => self.deny(p, "vault.read");
				if (["write", "rename", "trash", "mkdir"].includes(key) && !self.has(p, "vault.write")) return () => self.deny(p, "vault.write");
				return (t as unknown as Record<string, unknown>)[key];
			}
		});
		return new Proxy(ctx, {
			get(t, key: string) {
				if (key === "vault") return new Proxy(t.vault, { get: (vt, kk: string) => (kk === "fs" ? vaultFs : (vt as unknown as Record<string, unknown>)[kk]) });
				if (key === "windows" && !self.has(p, "windows")) return new Proxy({}, { get: () => () => self.deny(p, "windows") });
				if (key === "commands") return { ...t.commands, intercept: self.has(p, "commands.intercept") ? t.commands.intercept : () => self.deny(p, "commands.intercept") };
				return (t as unknown as Record<string, unknown>)[key];
			}
		});
	}

	/** isolation = "worker": a real boundary. The worker sees only the RPC ctx in the prelude. */
	private activateInWorker(p: InstalledPlugin, ctx: ModuleContext, src: string): Promise<void> {
		const k = this.k;
		const body = src.replace(/^\s*import\s[^;]*;?\s*$/gm, "").replace(/export\s+default\s+/, "self.__fanwitPlugin = ");
		const url = URL.createObjectURL(new Blob([WORKER_PRELUDE.replace("__ID__", p.manifest.id), "\n", body], { type: "text/javascript" }));
		const worker = new Worker(url, { name: `plugin:${p.manifest.id}` });
		URL.revokeObjectURL(url);
		const id = `plugin:${p.manifest.id}`;
		this.workers.set(id, worker);
		const subs = new DisposableStore();
		ctx.subscriptions.push(subs, toDisposable(() => (worker.terminate(), this.workers.delete(id))));
		let invokeSeq = 0;
		const invokes = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();
		const prefix = (key: string) => (key.startsWith(p.manifest.id) || key.split(".")[0] === p.manifest.id.replace(/-(\w)/g, (_, c: string) => c.toUpperCase()) ? key : `${p.manifest.id}.${key}`);
		const own = (key: string) => {
			const defs = p.manifest.contributes?.settings?.map((s) => s.key) ?? [];
			if (!defs.includes(key)) this.deny(p, `settings:${key}`);
			return key;
		};
		const api: Record<string, (...a: unknown[]) => unknown> = {
			"commands.handle": (cmd) => {
				const name = String(cmd);
				subs.add(
					ctx.commands.handle(name, (args) => {
						const iid = ++invokeSeq;
						worker.postMessage({ t: "invoke", id: iid, command: name, args });
						return new Promise((resolve, reject) => invokes.set(iid, { resolve, reject }));
					})
				);
			},
			"commands.run": (cmd, args) => k.commands.run(String(cmd), (args as Record<string, unknown>) ?? {}, { source: "api" }),
			"notify.toast": (text, kind) => void ctx.notify.toast(String(text), kind as never),
			"notify.send": (spec) => {
				const sp = spec as { route?: string };
				if ((sp.route === "os" || sp.route === "toast+os") && !this.has(p, "notify.os")) this.deny(p, "notify.os");
				return ctx.notify.send(spec as never).id;
			},
			"settings.set": (key, value) => k.sys.settings.set(own(String(key)), value),
			"storage.get": (key) => ctx.storage.get(String(key)),
			"storage.set": (key, value) => ctx.storage.set(String(key), value),
			"vault.readText": (path) => (this.has(p, "vault.read") ? k.sys.vault.fs.readText(String(path)) : this.deny(p, "vault.read")),
			"vault.list": (dir, o) => (this.has(p, "vault.read") ? k.sys.vault.fs.list(String(dir), o as never).then((l) => l.map((e) => ({ name: e.name, path: e.path, dir: e.dir }))) : this.deny(p, "vault.read")),
			"vault.write": (path, text) => (this.has(p, "vault.write") ? k.sys.vault.fs.write(String(path), String(text)) : this.deny(p, "vault.write")),
			"vault.current": () => (k.sys.vault.current ? { name: k.sys.vault.current.name, readonly: k.sys.vault.current.readonly } : null),
			"statusbar.set": (item, patch) => {
				if (!this.has(p, "statusbar")) this.deny(p, "statusbar");
				const sid = String(item);
				if (!k.sys.status.items.some((i) => i.id === sid)) subs.add(k.sys.status.add({ id: sid, align: "right" }, id));
				const i = k.sys.status.items.findIndex((x) => x.id === sid);
				if (i >= 0) k.sys.status.items[i] = { ...k.sys.status.items[i], ...(patch as object) };
			},
			"events.on": (name) => {
				subs.add(k.events.on(String(name) as never, (payload: unknown) => worker.postMessage({ t: "event", name, payload: JSON.parse(JSON.stringify(payload ?? null)) })));
			},
			"events.emit": (name, payload) => k.events.emit(prefix(String(name)) as never, payload as never),
			log: (level, msg) => ctx.log[level as "info"](String(msg))
		};
		return new Promise((resolve, reject) => {
			worker.onmessage = async (e) => {
				const m = e.data;
				if (m.t === "call") {
					try {
						const fn = api[m.method];
						if (!fn) throw new FanwitError("PLUGIN_API", { message: `Unknown plugin API ${m.method}` });
						worker.postMessage({ t: "result", id: m.id, value: await fn(...(m.args ?? [])) });
					} catch (err) {
						worker.postMessage({ t: "result", id: m.id, error: { message: (err as Error).message, code: (err as FanwitError).code } });
					}
				} else if (m.t === "invoked") {
					const w = invokes.get(m.id);
					invokes.delete(m.id);
					if (m.error) w?.reject(new FanwitError("PLUGIN_FAILED", { message: m.error.message, owner: p.manifest.id }));
					else w?.resolve(m.value);
				} else if (m.t === "activated") {
					if (m.error) reject(new FanwitError("PLUGIN_ACTIVATE", { message: m.error.message, owner: p.manifest.id }));
					else resolve();
				}
			};
			worker.onerror = (e) => reject(new FanwitError("PLUGIN_ACTIVATE", { message: e.message, owner: p.manifest.id }));
			const settings = Object.fromEntries((p.manifest.contributes?.settings ?? []).map((s) => [s.key, k.sys.settings.get(s.key)]));
			worker.postMessage({ t: "activate", settings });
		});
	}

	async setEnabled(id: string, scope: "global" | "vault", on: boolean) {
		const list = await this.readEnabled(scope);
		await this.writeEnabled(scope, on ? [...list, id] : list.filter((x) => x !== id));
		const p = this.installed.find((x) => x.manifest.id === id && x.scope === scope);
		if (p) {
			p.enabled = on;
			p.error = undefined;
			await this.sync(p);
		}
		this.version = untrack(() => this.version) + 1;
	}

	/** Copy a plugin folder into the plugins directory (desktop: pick a folder). */
	async installFromFiles(files: Record<string, string | Uint8Array>, scope: "global" | "vault" = "global") {
		const manifest = parseManifest(String(files["plugin.toml"] ?? ""), "plugin.toml");
		const dir = this.dir(scope);
		if (!dir) throw new FanwitError("STORAGE_NO_VAULT", { message: "Open a vault to install vault plugins." });
		const target = joinPath(dir, manifest.id);
		for (const [path, data] of Object.entries(files)) {
			if (path.includes("..")) continue;
			if (typeof data === "string") await this.k.host.fs.writeText(joinPath(target, path), data);
			else await this.k.host.fs.write(joinPath(target, path), data);
		}
		await this.scan();
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
			files[f.path] = f.path.endsWith(".toml") || f.path.endsWith(".md") || f.path.endsWith(".js") || f.path.endsWith(".css") ? new TextDecoder().decode(data) : data;
		}
		if (!entry.signature && !this.k.sys.settings.get("plugins.allowUnsigned")) throw new FanwitError("PLUGIN_UNSIGNED", { message: `${entry.name} is not signed.`, hint: "Enable Allow unsigned plugins in Settings, Plugins to install it." });
		return this.installFromFiles(files);
	}

	updates() {
		return this.browse.filter((b) => {
			const i = this.installed.find((p) => p.manifest.id === b.id);
			return i && satisfies(b.version, `>${i.manifest.version}`);
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
}
