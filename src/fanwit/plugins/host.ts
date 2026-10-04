/**
 * The app side of the plugin protocol, shared by every runtime: a Web Worker running JS or WASM,
 * a native sidecar speaking the same messages over stdio, and plugin iframes. A runtime only
 * supplies a `PluginPort`; permissions, timeouts, rate limits and frame coalescing live here, so
 * a plugin never runs on the main thread and the main thread never does more than one batched
 * apply per frame for it.
 *
 * Messages (both directions are plain JSON):
 *   plugin -> app  {t:"call", id, method, args}   {t:"invoked", id, value|error}   {t:"activated", error?}
 *   app -> plugin  {t:"result", id, value|error}  {t:"invoke", id, command, args}  {t:"event", name, payload}
 *                  {t:"activate", settings, wasm?} {t:"ui", view, action, value}    {t:"theme", vars}
 */
import { DisposableStore, toDisposable, type Disposable } from "../kernel/disposable";
import { FanwitError } from "../kernel/errors";
import type { Kernel } from "../kernel/kernel.svelte";
import type { ModuleContext } from "../kernel/context-api";
import type { PluginManifest } from "./manifest";
import { checkTree, type Widget } from "./widgets";

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface PluginPort {
	post(msg: any, transfer?: Transferable[]): void;
	onMessage(fn: (msg: any) => void): void;
	close(): void;
}

export interface PluginConnection extends Disposable {
	/** Resolves when the plugin answers `activate` (worker, wasm and sidecar runtimes). */
	activate(extra?: Record<string, unknown>, transfer?: Transferable[]): Promise<void>;
	/** Deliver an event the plugin subscribed to (no-op otherwise). */
	event(name: string, payload: unknown): void;
	post(msg: any): void;
	/** The runtime crashed (worker error, sidecar exit). */
	fail(message: string): void;
}

export interface ConnectHooks {
	/** Where `ui.render` trees land; the plugin may only render its own views. */
	render(view: string, tree: Widget | null): void;
	/** The plugin stopped answering or flooded the app; the service disables it. */
	dead(reason: string): void;
}

// ponytail: fixed limits; make them settings if real plugins hit them
export const LIMITS = { invokeMs: 10_000, activateMs: 10_000, strikes: 3, callsPerSecond: 500 };

export function hasPermission(m: PluginManifest, perm: string) {
	return m.permissions.some((x) => x === perm || x.startsWith(perm + ":"));
}

export function deny(m: PluginManifest, perm: string): never {
	throw new FanwitError("PERMISSION_DENIED", { message: `Plugin "${m.id}" does not have the "${perm}" permission.`, hint: `Add "${perm}" to permissions in plugin.toml.`, owner: m.id });
}

const frame = (fn: () => void) => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(fn) : setTimeout(fn, 16));

/** JSON round trip: only plain data crosses into a plugin. */
const plain = (v: unknown) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

export function connect(k: Kernel, m: PluginManifest, ctx: ModuleContext, port: PluginPort, hooks: ConnectHooks): PluginConnection {
	const id = `plugin:${m.id}`;
	const subs = new DisposableStore();
	const log = k.scopedLog(id);
	let invokeSeq = 0;
	const invokes = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void; timer: ReturnType<typeof setTimeout> }>();
	let strikes = 0;
	let closed = false;
	let onActivated: ((e?: { message: string }) => void) | null = null;
	const subscribed = new Set<string>();
	const views = new Set((m.contributes?.views ?? []).map((v) => v.id));

	// coalesce status bar and widget updates into one apply per frame
	const pending = new Map<string, () => void>();
	const statusPatches: Record<string, object> = {};
	let scheduled = false;
	const later = (key: string, fn: () => void) => {
		pending.set(key, fn);
		if (scheduled) return;
		scheduled = true;
		frame(() => {
			scheduled = false;
			const all = [...pending.values()];
			pending.clear();
			if (!closed) for (const f of all) f();
		});
	};

	// rate limit: drop calls past the budget for the rest of the second
	let windowStart = 0;
	let calls = 0;
	let warned = false;
	const overBudget = () => {
		const now = Date.now();
		if (now - windowStart > 1000) (windowStart = now), (calls = 0), (warned = false);
		if (++calls <= LIMITS.callsPerSecond) return false;
		if (!warned) log.warn(`plugin "${m.id}" made more than ${LIMITS.callsPerSecond} calls in a second; dropping calls`);
		warned = true;
		return true;
	};

	const prefix = (key: string) => (key.startsWith(m.id) || key.split(".")[0] === m.id.replace(/-(\w)/g, (_, c: string) => c.toUpperCase()) ? key : `${m.id}.${key}`);
	const own = (key: string) => {
		if (!(m.contributes?.settings ?? []).some((s) => s.key === key)) deny(m, `settings:${key}`);
		return key;
	};
	const need = (perm: string) => hasPermission(m, perm) || deny(m, perm);

	const api: Record<string, (...a: any[]) => unknown> = {
		"commands.handle": (cmd) => {
			const name = String(cmd);
			subs.add(
				ctx.commands.handle(name, (args) => {
					const iid = ++invokeSeq;
					port.post({ t: "invoke", id: iid, command: name, args: plain(args) });
					return new Promise((resolve, reject) => {
						const timer = setTimeout(() => {
							invokes.delete(iid);
							reject(new FanwitError("PLUGIN_TIMEOUT", { message: `${m.name} did not answer ${name} within ${LIMITS.invokeMs / 1000} s.`, owner: m.id }));
							if (++strikes >= LIMITS.strikes) hooks.dead("Not responding");
						}, LIMITS.invokeMs);
						invokes.set(iid, { resolve, reject, timer });
					});
				})
			);
		},
		"commands.run": (cmd, args) => k.commands.run(String(cmd), args ?? {}, { source: "api" }),
		"notify.toast": (text, kind) => void ctx.notify.toast(String(text), kind),
		"notify.send": (spec) => {
			if ((spec?.route === "os" || spec?.route === "toast+os") && !hasPermission(m, "notify.os")) deny(m, "notify.os");
			return ctx.notify.send(spec).id;
		},
		"settings.set": (key, value) => k.sys.settings.set(own(String(key)), value),
		"storage.get": (key) => ctx.storage.get(String(key)),
		"storage.set": (key, value) => ctx.storage.set(String(key), value),
		"vault.readText": (path) => need("vault.read") && k.sys.vault.fs.readText(String(path)),
		"vault.list": (dir, o) => need("vault.read") && k.sys.vault.fs.list(String(dir), o).then((l) => l.map((e) => ({ name: e.name, path: e.path, dir: e.dir }))),
		"vault.write": (path, text) => need("vault.write") && k.sys.vault.fs.write(String(path), String(text)),
		"vault.current": () => (k.sys.vault.current ? { name: k.sys.vault.current.name, readonly: k.sys.vault.current.readonly } : null),
		"statusbar.set": (item, patch) => {
			need("statusbar");
			const sid = String(item);
			// patches in one frame merge (text then tooltip), the last value of each field wins
			const merged = (statusPatches[sid] = { ...statusPatches[sid], ...(patch as object) });
			later(`status:${sid}`, () => {
				delete statusPatches[sid];
				if (!k.sys.status.items.some((i) => i.id === sid)) subs.add(k.sys.status.add({ id: sid, align: "right" }, id));
				const i = k.sys.status.items.findIndex((x) => x.id === sid);
				if (i >= 0) k.sys.status.items[i] = { ...k.sys.status.items[i], ...merged };
			});
		},
		"ui.render": (view, tree) => {
			const v = String(view);
			if (!views.has(v)) deny(m, `view:${v}`);
			const t = checkTree(tree);
			later(`ui:${v}`, () => hooks.render(v, t));
		},
		"events.on": (name) => {
			const n = String(name);
			if (subscribed.has(n)) return;
			subscribed.add(n);
			subs.add(k.events.on(n as never, (payload: unknown) => port.post({ t: "event", name: n, payload: plain(payload) })));
			// a state, not just an event: a new subscriber learns where the user is right away
			if (n === "layout:activePane") {
				const L = k.sys.layout;
				const set = L.activeTabset ? (L.doc.node[L.activeTabset] as { active?: string } | undefined) : undefined;
				const pane = set?.active ?? L.activePane;
				const p = pane ? L.doc.pane[pane] : undefined;
				port.post({ t: "event", name: n, payload: { pane: pane ?? null, view: p?.view ?? null, path: typeof p?.props?.path === "string" ? p.props.path : null } });
			}
		},
		"events.emit": (name, payload) => k.events.emit(prefix(String(name)) as never, payload as never),
		log: (level, msg) => ctx.log[(["info", "warn", "error", "debug"].includes(level) ? level : "info") as "info"](String(msg))
	};

	port.onMessage(async (msg) => {
		if (closed || !msg || typeof msg !== "object") return;
		if (msg.t === "call") {
			if (overBudget()) return;
			try {
				const fn = api[msg.method];
				if (!fn) throw new FanwitError("PLUGIN_API", { message: `Unknown plugin API ${msg.method}` });
				port.post({ t: "result", id: msg.id, value: plain(await fn(...(Array.isArray(msg.args) ? msg.args : []))) });
			} catch (err) {
				port.post({ t: "result", id: msg.id, error: { message: (err as Error).message, code: (err as FanwitError).code } });
			}
		} else if (msg.t === "invoked") {
			const w = invokes.get(msg.id);
			if (!w) return;
			invokes.delete(msg.id);
			clearTimeout(w.timer);
			strikes = 0;
			if (msg.error) w.reject(new FanwitError("PLUGIN_FAILED", { message: String(msg.error.message), owner: m.id }));
			else w.resolve(msg.value);
		} else if (msg.t === "activated") onActivated?.(msg.error);
	});

	const conn: PluginConnection = {
		activate(extra = {}, transfer) {
			return new Promise<void>((resolve, reject) => {
				const timer = setTimeout(() => {
					reject(new FanwitError("PLUGIN_TIMEOUT", { message: `${m.name} did not finish activating within ${LIMITS.activateMs / 1000} s.`, owner: m.id }));
					hooks.dead("Not responding");
				}, LIMITS.activateMs);
				onActivated = (e) => {
					clearTimeout(timer);
					onActivated = null;
					if (e) reject(new FanwitError("PLUGIN_ACTIVATE", { message: String(e.message), owner: m.id }));
					else resolve();
				};
				const settings = Object.fromEntries((m.contributes?.settings ?? []).map((s) => [s.key, k.sys.settings.get(s.key)]));
				port.post({ t: "activate", settings: plain(settings), ...extra }, transfer);
			});
		},
		event(name, payload) {
			if (subscribed.has(name)) port.post({ t: "event", name, payload: plain(payload) });
		},
		post: (msg) => port.post(msg),
		fail(message) {
			if (onActivated) onActivated({ message });
			else if (!closed) hooks.dead(message);
		},
		dispose() {
			if (closed) return;
			closed = true;
			for (const w of invokes.values()) clearTimeout(w.timer), w.reject(new FanwitError("PLUGIN_STOPPED", { message: `${m.name} stopped.`, owner: m.id }));
			invokes.clear();
			subs.dispose();
			port.close();
		}
	};
	ctx.subscriptions.push(toDisposable(() => conn.dispose()));
	return conn;
}

/** A Web Worker as a port. */
export function workerPort(w: Worker): PluginPort {
	return {
		post: (msg, transfer) => w.postMessage(msg, transfer ?? []),
		onMessage: (fn) => {
			w.onmessage = (e) => fn(e.data);
		},
		close: () => w.terminate()
	};
}

/** A MessagePort (plugin iframes) as a port. */
export function messagePort(p: MessagePort): PluginPort {
	return {
		post: (msg) => p.postMessage(msg),
		onMessage: (fn) => {
			p.onmessage = (e) => fn(e.data);
		},
		close: () => p.close()
	};
}
