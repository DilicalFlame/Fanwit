/**
 * MemoryHost: the whole kernel in Node or a test, with an in-memory file system.
 * Also the base the other hosts borrow small pieces from.
 */
import { mergeToml } from "./toml-merge";
import { Emitter, toDisposable, type Disposable } from "../kernel/disposable";
import type { FsEntry, FsEvent, Host, HostEvents, HostFs, HostWindows, LogLevel } from "./types";
import { dirname, joinPath } from "./types";

export class MemoryFs implements HostFs {
	files = new Map<string, Uint8Array>();
	dirs = new Set<string>(["/"]);
	private changes = new Emitter<FsEvent>();
	private enc = new TextEncoder();
	private dec = new TextDecoder();

	constructor(seed: Record<string, string> = {}) {
		for (const [p, v] of Object.entries(seed)) this.put(p, this.enc.encode(v));
	}

	private norm(p: string) {
		return p.replace(/\\/g, "/").replace(/\/+$/, "") || "/";
	}
	private put(p: string, data: Uint8Array) {
		p = this.norm(p);
		const existed = this.files.has(p);
		for (let d = dirname(p); d && !this.dirs.has(d); d = dirname(d)) this.dirs.add(d);
		this.files.set(p, data);
		this.changes.fire({ kind: existed ? "modified" : "created", path: p });
	}
	private missing(p: string): never {
		const e = new Error(`No such file: ${p}`) as Error & { code: string };
		e.code = "ENOENT";
		throw e;
	}

	async read(p: string) {
		return this.files.get(this.norm(p)) ?? this.missing(p);
	}
	async readText(p: string) {
		return this.dec.decode(await this.read(p));
	}
	async write(p: string, data: Uint8Array) {
		this.put(p, data);
	}
	async writeText(p: string, data: string) {
		this.put(p, this.enc.encode(data));
	}
	async exists(p: string) {
		p = this.norm(p);
		return this.files.has(p) || this.dirs.has(p);
	}
	async stat(p: string) {
		p = this.norm(p);
		if (this.dirs.has(p)) return { dir: true, size: 0, mtime: 0 };
		const f = this.files.get(p) ?? this.missing(p);
		return { dir: false, size: f.length, mtime: Date.now() };
	}
	async list(dir: string, o?: { recursive?: boolean }) {
		dir = this.norm(dir);
		const prefix = dir === "/" ? "/" : dir + "/";
		const out: FsEntry[] = [];
		const all = [...[...this.dirs].map((p) => [p, true] as const), ...[...this.files.keys()].map((p) => [p, false] as const)];
		for (const [p, isDir] of all) {
			if (!p.startsWith(prefix) || p === dir) continue;
			const rest = p.slice(prefix.length);
			if (!o?.recursive && rest.includes("/")) continue;
			out.push({ name: rest.split("/").pop()!, path: p, dir: isDir, size: isDir ? undefined : this.files.get(p)!.length });
		}
		return out.sort((a, b) => a.path.localeCompare(b.path));
	}
	async mkdir(p: string) {
		for (let d = this.norm(p); d && d !== "/" && !this.dirs.has(d); d = dirname(d)) this.dirs.add(d);
	}
	async remove(p: string) {
		p = this.norm(p);
		for (const k of [...this.files.keys()]) if (k === p || k.startsWith(p + "/")) this.files.delete(k);
		for (const k of [...this.dirs]) if (k === p || k.startsWith(p + "/")) this.dirs.delete(k);
		this.changes.fire({ kind: "deleted", path: p });
	}
	async rename(from: string, to: string) {
		from = this.norm(from);
		to = this.norm(to);
		const f = this.files.get(from);
		if (f) {
			this.files.delete(from);
			this.files.set(to, f);
		} else {
			for (const k of [...this.files.keys()])
				if (k.startsWith(from + "/")) {
					this.files.set(to + k.slice(from.length), this.files.get(k)!);
					this.files.delete(k);
				}
			for (const k of [...this.dirs])
				if (k === from || k.startsWith(from + "/")) {
					this.dirs.delete(k);
					this.dirs.add(to + k.slice(from.length));
				}
		}
		this.changes.fire({ kind: "renamed", path: to, from });
	}
	async trash(p: string) {
		await this.remove(p);
	}
	async watch(path: string, cb: (e: FsEvent[]) => void): Promise<Disposable> {
		path = this.norm(path);
		return this.changes.on((e) => {
			if (e.path === path || e.path.startsWith(path + "/")) cb([e]);
		});
	}
	async pickFolder() {
		return null;
	}
	async writeToml(p: string, value: Record<string, unknown>) {
		const existing = await this.readText(p).catch(() => "");
		const text = await mergeToml(existing, value);
		if (text !== existing) await this.writeText(p, text);
		return text;
	}
	async allowRoot() {}
}

export class LocalEvents implements HostEvents {
	private bus = new Map<string, Emitter<unknown>>();
	async emit(name: string, payload?: unknown) {
		this.bus.get(name)?.fire(payload);
	}
	on<T>(name: string, cb: (p: T) => void): Disposable {
		let e = this.bus.get(name);
		if (!e) this.bus.set(name, (e = new Emitter()));
		return e.on(cb as (p: unknown) => void);
	}
}

const noop = async () => {};

export function stubWindows(label = "main"): HostWindows {
	return {
		label,
		open: async () => {
			throw new Error("This host has no native windows");
		},
		close: noop,
		destroy: noop,
		show: noop,
		hide: noop,
		focus: noop,
		minimize: noop,
		toggleMaximize: noop,
		isMaximized: async () => false,
		setFullscreen: noop,
		setTitle: async (t) => {
			if (typeof document !== "undefined") document.title = t;
		},
		setAlwaysOnTop: noop,
		list: async () => [label],
		feedback: noop,
		onCloseRequested: () => toDisposable(() => {}),
		onFocusChanged: () => toDisposable(() => {}),
		onResized: () => toDisposable(() => {}),
		setTheme: noop,
		setBackgroundColor: noop,
		setBadge: noop,
		setProgress: noop,
		startDragging: noop
	};
}

export function consoleLog(level: LogLevel, message: string) {
	const fn = level === "trace" ? console.debug : level === "info" ? console.info : console[level];
	fn.call(console, message);
}

export function createMemoryHost(o: { files?: Record<string, string>; platform?: Host["platform"] } = {}): Host & { fs: MemoryFs } {
	const fs = new MemoryFs(o.files);
	return {
		kind: "memory",
		platform: o.platform ?? "web",
		caps: {
			nativeWindows: false,
			modalWindows: false,
			alwaysOnTop: "none",
			globalShortcuts: false,
			osNotifications: "none",
			fileSystem: "memory",
			tray: false,
			menubar: "custom",
			multiInstance: false,
			sql: false
		},
		dirs: { config: "/config", data: "/global", cache: "/cache", log: "/logs" },
		windows: stubWindows(),
		fs,
		db: {
			open: async () => {
				throw new Error("SQL is not available on the memory host");
			},
			exec: async () => ({ changes: 0, lastId: 0 }),
			query: async () => [],
			batch: noop,
			close: noop
		},
		notify: { permission: async () => "denied", requestPermission: async () => false, os: async () => false, attention: noop },
		keys: { registerGlobal: async () => toDisposable(() => {}) },
		events: new LocalEvents(),
		dialog: { ask: async () => true, message: noop, open: async () => null, save: async () => null },
		log: { write: () => {} },
		invoke: async (cmd) => {
			throw new Error(`No backend for "${cmd}" on the memory host`);
		},
		onFileDrop: () => toDisposable(() => {}),
		app: async () => ({
			name: "Fanwit",
			version: "0.0.0",
			identifier: "test",
			os: "memory",
			overrides: {},
			safeMode: false,
			headless: false,
			devtools: true
		}),
		openExternal: noop,
		reveal: noop,
		exit: noop,
		relaunch: noop
	};
}

export { joinPath };
