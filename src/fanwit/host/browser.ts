/**
 * BrowserHost: the static web build. Storage is OPFS; vaults are either OPFS folders
 * (`/vaults/<name>`) or real folders picked with the File System Access API (`fsa://<id>`).
 */
import { stringify } from "smol-toml";
import { Emitter, toDisposable, type Disposable } from "../kernel/disposable";
import { consoleLog, stubWindows } from "./memory";
import type { FsEntry, FsEvent, FsStat, Host, HostDialog, HostEvents, HostFs, Platform } from "./types";
import { basename } from "./types";
import { identity } from "../gen/identity";

type DirHandle = FileSystemDirectoryHandle;
type FileHandle = FileSystemFileHandle;

const IDB = "fanwit-handles";
function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		const open = indexedDB.open(IDB, 1);
		open.onupgradeneeded = () => open.result.createObjectStore("h");
		open.onerror = () => reject(open.error);
		open.onsuccess = () => {
			const tx = open.result.transaction("h", mode);
			const req = fn(tx.objectStore("h"));
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		};
	});
}

class BrowserFs implements HostFs {
	private fsa = new Map<string, DirHandle>();
	private uploads = new Map<string, File>();
	private enc = new TextEncoder();
	private dec = new TextDecoder();

	/** Resolve a host path to its root handle and the remaining segments. */
	private async root(path: string): Promise<{ dir: DirHandle; parts: string[] }> {
		const m = /^fsa:\/\/([^/]+)(\/.*)?$/.exec(path);
		if (m) {
			let h = this.fsa.get(m[1]);
			if (!h) {
				h = (await idb<DirHandle | undefined>("readonly", (s) => s.get(m[1]) as IDBRequest<DirHandle | undefined>)) ?? undefined;
				if (!h) throw notFound(path);
				const perm = (h as unknown as { requestPermission?: (o: object) => Promise<string> }).requestPermission;
				if (perm && (await perm.call(h, { mode: "readwrite" })) !== "granted") throw new Error(`Permission to ${path} was denied`);
				this.fsa.set(m[1], h);
			}
			return { dir: h, parts: split(m[2] ?? "") };
		}
		return { dir: await navigator.storage.getDirectory(), parts: split(path) };
	}

	private async dirAt(path: string, create = false): Promise<DirHandle> {
		const { dir, parts } = await this.root(path);
		let d = dir;
		for (const p of parts) d = await d.getDirectoryHandle(p, { create }).catch(() => Promise.reject(notFound(path)));
		return d;
	}

	private async fileAt(path: string, create = false): Promise<FileHandle> {
		const { dir, parts } = await this.root(path);
		const name = parts.pop();
		if (!name) throw notFound(path);
		let d = dir;
		for (const p of parts) d = await d.getDirectoryHandle(p, { create }).catch(() => Promise.reject(notFound(path)));
		return d.getFileHandle(name, { create }).catch(() => Promise.reject(notFound(path)));
	}

	async read(path: string) {
		const up = this.uploads.get(path);
		if (up) return new Uint8Array(await up.arrayBuffer());
		const f = await (await this.fileAt(path)).getFile();
		return new Uint8Array(await f.arrayBuffer());
	}
	async readText(path: string) {
		return this.dec.decode(await this.read(path));
	}
	async write(path: string, data: Uint8Array) {
		const h = await this.fileAt(path, true);
		const w = await h.createWritable();
		await w.write(data as unknown as ArrayBuffer);
		await w.close();
	}
	async writeText(path: string, data: string) {
		await this.write(path, this.enc.encode(data));
	}
	async exists(path: string) {
		try {
			await this.stat(path);
			return true;
		} catch {
			return false;
		}
	}
	async stat(path: string): Promise<FsStat> {
		try {
			const f = await (await this.fileAt(path)).getFile();
			return { dir: false, size: f.size, mtime: f.lastModified };
		} catch {
			await this.dirAt(path);
			return { dir: true, size: 0, mtime: 0 };
		}
	}
	async list(dir: string, o?: { recursive?: boolean }) {
		const out: FsEntry[] = [];
		const walk = async (h: DirHandle, base: string) => {
			for await (const [name, child] of (h as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
				const path = `${base}/${name}`;
				if (child.kind === "directory") {
					out.push({ name, path, dir: true });
					if (o?.recursive) await walk(child as DirHandle, path);
				} else {
					const f = await (child as FileHandle).getFile();
					out.push({ name, path, dir: false, size: f.size, mtime: f.lastModified });
				}
			}
		};
		await walk(await this.dirAt(dir), dir.replace(/\/+$/, ""));
		return out.sort((a, b) => a.path.localeCompare(b.path));
	}
	async mkdir(path: string) {
		await this.dirAt(path, true);
	}
	async remove(path: string, o?: { recursive?: boolean }) {
		const { dir, parts } = await this.root(path);
		const name = parts.pop()!;
		let d = dir;
		for (const p of parts) d = await d.getDirectoryHandle(p);
		await d.removeEntry(name, { recursive: o?.recursive ?? true });
	}
	async rename(from: string, to: string) {
		// ponytail: copy + delete; FileSystemHandle.move() is not available everywhere yet
		const st = await this.stat(from);
		if (st.dir) {
			await this.mkdir(to);
			for (const e of await this.list(from, { recursive: true })) {
				const target = to + e.path.slice(from.replace(/\/+$/, "").length);
				if (e.dir) await this.mkdir(target);
				else await this.write(target, await this.read(e.path));
			}
		} else await this.write(to, await this.read(from));
		await this.remove(from, { recursive: true });
	}
	async trash(path: string) {
		await this.remove(path, { recursive: true });
	}
	async watch(path: string, cb: (e: FsEvent[]) => void, o?: { recursive?: boolean }): Promise<Disposable> {
		// ponytail: polls once per second while visible; switch to FileSystemObserver when it ships widely
		const snapshot = async () => {
			const m = new Map<string, number>();
			try {
				const st = await this.stat(path);
				if (!st.dir) m.set(path, st.mtime);
				else for (const e of await this.list(path, { recursive: o?.recursive ?? true })) if (!e.dir) m.set(e.path, e.mtime ?? 0);
			} catch {
				/* missing: empty snapshot */
			}
			return m;
		};
		let prev = await snapshot();
		const timer = setInterval(async () => {
			if (document.visibilityState !== "visible") return;
			const next = await snapshot();
			const events: FsEvent[] = [];
			for (const [p, t] of next) {
				const old = prev.get(p);
				if (old === undefined) events.push({ kind: "created", path: p });
				else if (old !== t) events.push({ kind: "modified", path: p });
			}
			for (const p of prev.keys()) if (!next.has(p)) events.push({ kind: "deleted", path: p });
			prev = next;
			if (events.length) cb(events);
		}, 1000);
		return toDisposable(() => clearInterval(timer));
	}
	async pickFolder() {
		const picker = (window as unknown as { showDirectoryPicker?: (o: object) => Promise<DirHandle> }).showDirectoryPicker;
		if (!picker) return null;
		const h = await picker({ mode: "readwrite" }).catch(() => null);
		if (!h) return null;
		const id = `${h.name}-${Math.random().toString(36).slice(2, 8)}`;
		await idb("readwrite", (s) => s.put(h, id));
		this.fsa.set(id, h);
		return `fsa://${id}`;
	}
	async writeToml(path: string, value: Record<string, unknown>) {
		// ponytail: the web host rewrites the file; desktop preserves comments with toml_edit
		const text = stringify(value) + "\n";
		await this.writeText(path, text);
		return text;
	}
	async allowRoot() {}

	addUpload(f: File) {
		const key = `upload://${crypto.randomUUID()}/${f.name}`;
		this.uploads.set(key, f);
		return key;
	}
}

function split(p: string) {
	return p.split("/").filter(Boolean);
}
function notFound(p: string) {
	const e = new Error(`No such file: ${p}`) as Error & { code: string };
	e.code = "ENOENT";
	return e;
}

class ChannelEvents implements HostEvents {
	private bc = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(`fanwit:${identity.slug}`) : null;
	private bus = new Map<string, Emitter<unknown>>();
	constructor() {
		this.bc?.addEventListener("message", (e) => this.bus.get(e.data?.name)?.fire(e.data?.payload));
	}
	async emit(name: string, payload?: unknown) {
		this.bus.get(name)?.fire(payload);
		try {
			this.bc?.postMessage({ name, payload });
		} catch {
			/* payload not cloneable: local only */
		}
	}
	on<T>(name: string, cb: (p: T) => void) {
		let e = this.bus.get(name);
		if (!e) this.bus.set(name, (e = new Emitter()));
		return e.on(cb as (p: unknown) => void);
	}
}

/** In page dialogs are rendered by the workbench; until then fall back to the browser's own. */
export interface DialogPresenter {
	ask(message: string, o: { title?: string; kind?: string; okLabel?: string; cancelLabel?: string }): Promise<boolean>;
	message(message: string, o: { title?: string; kind?: string }): Promise<void>;
}
let presenter: DialogPresenter | null = null;
export function setDialogPresenter(p: DialogPresenter | null) {
	presenter = p;
}

/** SQLite WASM in a dedicated worker; the same calls as the desktop IPC bridge. */
function sqliteDb(): Host["db"] {
	let worker: Worker | null = null;
	let seq = 0;
	const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
	const call = <T>(msg: Record<string, unknown>): Promise<T> => {
		if (!worker) {
			worker = new Worker(new URL("./sqlite.worker.ts", import.meta.url), { type: "module", name: "fanwit-sqlite" });
			worker.onmessage = (e) => {
				const p = pending.get(e.data.id);
				pending.delete(e.data.id);
				if (e.data.ok) p?.resolve(e.data.value);
				else p?.reject(new Error(e.data.error));
			};
		}
		const id = ++seq;
		return new Promise<T>((resolve, reject) => {
			pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
			worker!.postMessage({ id, ...msg });
		});
	};
	return {
		open: (path) => call<number>({ op: "open", path }),
		exec: (handle, sql, params = [], o = {}) => call({ op: "exec", handle, sql, params, owner: o.owner ?? null, readonly: !!o.readonly }),
		query: (handle, sql, params = [], o = {}) => call({ op: "query", handle, sql, params, owner: o.owner ?? null, readonly: !!o.readonly }),
		batch: (handle, statements, o = {}) => call({ op: "batch", handle, statements, owner: o.owner ?? null }),
		close: (handle) => call({ op: "close", handle })
	};
}

function detectPlatform(): Platform {
	return "web";
}

export function createBrowserHost(): Host {
	const fs = new BrowserFs();
	const dialog: HostDialog = {
		ask: (m, o = {}) => (presenter ? presenter.ask(m, o) : Promise.resolve(window.confirm(m))),
		message: (m, o = {}) => (presenter ? presenter.message(m, o) : Promise.resolve(window.alert(m))),
		open: (o = {}) =>
			new Promise((resolve) => {
				if (o.directory) return resolve(fs.pickFolder());
				const input = document.createElement("input");
				input.type = "file";
				input.multiple = !!o.multiple;
				if (o.filters?.length) input.accept = o.filters.flatMap((f) => f.extensions.map((e) => "." + e)).join(",");
				input.onchange = () => {
					const files = [...(input.files ?? [])].map((f) => fs.addUpload(f));
					resolve(o.multiple ? files : (files[0] ?? null));
				};
				input.oncancel = () => resolve(null);
				input.click();
			}),
		save: async (o = {}) => {
			const name = window.prompt(o.title ?? "Save as", o.defaultPath ? basename(o.defaultPath) : "untitled");
			return name ? `download://${name}` : null;
		}
	};
	const windows = stubWindows("main");
	windows.setBadge = async (n) => {
		const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
		if (n) await nav.setAppBadge?.(n).catch(() => {});
		else await nav.clearAppBadge?.().catch(() => {});
	};
	windows.onFocusChanged = (cb) => {
		const f = () => cb(true);
		const b = () => cb(false);
		window.addEventListener("focus", f);
		window.addEventListener("blur", b);
		return toDisposable(() => {
			window.removeEventListener("focus", f);
			window.removeEventListener("blur", b);
		});
	};
	windows.onResized = (cb) => {
		window.addEventListener("resize", cb);
		return toDisposable(() => window.removeEventListener("resize", cb));
	};
	windows.onCloseRequested = (cb) => {
		const h = (e: BeforeUnloadEvent) => {
			const r = cb();
			if (r === false) e.preventDefault();
		};
		window.addEventListener("beforeunload", h);
		return toDisposable(() => window.removeEventListener("beforeunload", h));
	};
	windows.setFullscreen = async (on) => {
		if (on) await document.documentElement.requestFullscreen?.().catch(() => {});
		else if (document.fullscreenElement) await document.exitFullscreen();
	};

	return {
		kind: "browser",
		platform: detectPlatform(),
		caps: {
			nativeWindows: false,
			modalWindows: false,
			alwaysOnTop: "documentPictureInPicture" in window ? "pip" : "none",
			globalShortcuts: false,
			osNotifications: "Notification" in window ? "basic" : "none",
			fileSystem: "showDirectoryPicker" in window ? "fs-access" : "opfs",
			tray: false,
			menubar: "custom",
			multiInstance: false,
			// sync access handles exist only inside workers; OPFS plus Worker support is the signal
			sql: typeof Worker !== "undefined" && typeof navigator.storage?.getDirectory === "function"
		},
		dirs: { config: "/config", data: "/global", cache: "/cache", log: "/logs" },
		windows,
		fs,
		db: sqliteDb(),
		notify: {
			permission: async () => ("Notification" in window ? (Notification.permission as "granted" | "denied" | "default") : "denied"),
			requestPermission: async () => ("Notification" in window ? (await Notification.requestPermission()) === "granted" : false),
			os: async (n) => {
				if (!("Notification" in window) || Notification.permission !== "granted") return false;
				const note = new Notification(n.title, { body: n.body, icon: n.icon });
				note.onclick = () => window.focus();
				return true;
			},
			attention: async () => {
				const t = document.title;
				document.title = `• ${t}`;
				setTimeout(() => (document.title = t), 3000);
			}
		},
		keys: { registerGlobal: async () => toDisposable(() => {}) },
		events: new ChannelEvents(),
		dialog,
		log: { write: (level, message) => consoleLog(level, message) },
		invoke: async (cmd) => {
			throw new Error(`No backend command "${cmd}" in the browser host`);
		},
		app: async () => {
			const params = new URLSearchParams(location.search);
			return {
				name: identity.name,
				version: identity.version,
				identifier: identity.identifier,
				os: navigator.userAgent,
				webview: navigator.userAgent,
				overrides: {},
				safeMode: params.has("safe-mode"),
				headless: false,
				devtools: import.meta.env.DEV
			};
		},
		openExternal: async (url) => void window.open(url, "_blank", "noopener"),
		reveal: async () => {},
		exit: async () => window.close(),
		relaunch: async () => location.reload()
	};
}
