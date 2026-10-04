/**
 * TauriHost: desktop. File system, SQLite, windows and the CLI bridge are Fanwit's own Rust
 * commands (src-tauri/src/fanwit/*), which enforce the vault sandbox and namespacing.
 */
import { Channel, invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow, ProgressBarStatus, UserAttentionType, Window as TauriWindow } from "@tauri-apps/api/window";
import * as dialog from "@tauri-apps/plugin-dialog";
import * as tauriLog from "@tauri-apps/plugin-log";
import { toDisposable, type Disposable } from "../kernel/disposable";
import type { AppInfo, FsEntry, FsEvent, FsStat, Host, HostFs, HostWindows, LogLevel, NativeWindowOptions, Platform } from "./types";

/** Subscribe to a Tauri event synchronously, returning a Disposable. */
function sub<T>(name: string, cb: (p: T) => void, target?: string): Disposable {
	let un: (() => void) | undefined;
	let gone = false;
	listen<T>(name, (e) => cb(e.payload), target ? { target: { kind: "WebviewWindow", label: target } } : undefined).then((u) => {
		if (gone) u();
		else un = u;
	});
	return toDisposable(() => {
		gone = true;
		un?.();
	});
}

class TauriFs implements HostFs {
	readText = (path: string) => invoke<string>("fw_fs_read_text", { path });
	read = async (path: string) => new Uint8Array(await invoke<number[]>("fw_fs_read", { path }));
	writeText = (path: string, data: string, o?: { atomic?: boolean }) => invoke<void>("fw_fs_write_text", { path, data, atomic: o?.atomic ?? true });
	write = (path: string, data: Uint8Array) => invoke<void>("fw_fs_write", { path, data: [...data] });
	exists = (path: string) => invoke<boolean>("fw_fs_exists", { path });
	stat = (path: string) => invoke<FsStat>("fw_fs_stat", { path });
	list = (dir: string, o?: { recursive?: boolean }) => invoke<FsEntry[]>("fw_fs_list", { dir, recursive: o?.recursive ?? false });
	mkdir = (path: string) => invoke<void>("fw_fs_mkdir", { path });
	remove = (path: string, o?: { recursive?: boolean }) => invoke<void>("fw_fs_remove", { path, recursive: o?.recursive ?? false });
	rename = (from: string, to: string) => invoke<void>("fw_fs_rename", { from, to });
	trash = (path: string) => invoke<void>("fw_fs_trash", { path });
	allowRoot = async (path: string) => void (await invoke<string>("fw_fs_allow_root", { path }));
	writeToml = (path: string, value: Record<string, unknown>) => invoke<string>("fw_toml_merge", { path, value });

	async watch(path: string, cb: (e: FsEvent[]) => void, o?: { recursive?: boolean }) {
		const id = await invoke<number>("fw_fs_watch", { path, recursive: o?.recursive ?? true });
		const d = sub<{ id: number; events: FsEvent[] }>("fw://fs", (p) => {
			if (p.id === id) cb(p.events);
		});
		return toDisposable(() => {
			d.dispose();
			invoke("fw_fs_unwatch", { id }).catch(() => {});
		});
	}

	/** Native picker in Rust: the chosen folder is remembered as user chosen (sandbox). */
	pickFolder = (o?: { title?: string }) => invoke<string | null>("fw_fs_pick_folder", { title: o?.title ?? null });
}

function windowsApi(): HostWindows {
	const self = getCurrentWindow();
	const win = (label?: string) => (label ? new TauriWindow(label) : self);
	return {
		label: self.label,
		open: (o: NativeWindowOptions) => invoke("fw_win_open", { opts: o }),
		close: (label) => win(label).close(),
		destroy: (label) => win(label).destroy(),
		show: (label) => win(label).show(),
		hide: (label) => win(label).hide(),
		focus: (label) => win(label).setFocus(),
		minimize: () => self.minimize(),
		toggleMaximize: () => self.toggleMaximize(),
		isMaximized: () => self.isMaximized(),
		setFullscreen: (on) => self.setFullscreen(on),
		setTitle: async (t) => {
			document.title = t;
			await self.setTitle(t);
		},
		setAlwaysOnTop: (on) => self.setAlwaysOnTop(on),
		list: () => invoke<string[]>("fw_win_list"),
		at: () => invoke<{ label: string; x: number; y: number } | null>("fw_win_at"),
		feedback: (label, effects) => invoke("fw_win_feedback", { label, effects }),
		onCloseRequested(cb) {
			let un: (() => void) | undefined;
			let gone = false;
			self
				.onCloseRequested(async (e) => {
					if ((await cb()) === false) e.preventDefault();
				})
				.then((u) => (gone ? u() : (un = u)));
			return toDisposable(() => {
				gone = true;
				un?.();
			});
		},
		onFocusChanged(cb) {
			let un: (() => void) | undefined;
			let gone = false;
			self.onFocusChanged((e) => cb(e.payload)).then((u) => (gone ? u() : (un = u)));
			return toDisposable(() => {
				gone = true;
				un?.();
			});
		},
		onResized(cb) {
			let un: (() => void) | undefined;
			let gone = false;
			self.onResized(() => cb()).then((u) => (gone ? u() : (un = u)));
			return toDisposable(() => {
				gone = true;
				un?.();
			});
		},
		setTheme: (mode) => self.setTheme(mode),
		setBackgroundColor: (c) => self.setBackgroundColor(c).catch(() => {}),
		setBadge: (n) => self.setBadgeCount(n ?? undefined).catch(() => {}),
		setProgress: (f) =>
			self
				.setProgressBar(f === null ? { status: ProgressBarStatus.None } : { status: ProgressBarStatus.Normal, progress: Math.round(f * 100) })
				.catch(() => {}),
		startDragging: () => self.startDragging(),
		showSystemMenu: () => invoke("fw_win_system_menu")
	};
}

function detectPlatform(): Platform {
	const ua = navigator.userAgent.toLowerCase();
	if (ua.includes("windows")) return "windows";
	if (ua.includes("mac")) return "macos";
	return "linux";
}

export async function createTauriHost(): Promise<Host> {
	const dirs = await invoke<Host["dirs"]>("fw_dirs");
	const platform = detectPlatform();
	const fs = new TauriFs();
	let info: AppInfo | undefined;

	return {
		kind: "tauri",
		platform,
		caps: {
			nativeWindows: true,
			modalWindows: true,
			alwaysOnTop: "native",
			globalShortcuts: true,
			osNotifications: "full",
			fileSystem: "full",
			tray: true,
			menubar: platform === "macos" ? "native" : "custom",
			multiInstance: true,
			osTrash: true,
			sql: true
		},
		dirs,
		windows: windowsApi(),
		fs,
		plugins: {
			frames: "scheme",
			serve: (id, files) => invoke("fw_plugin_serve", { id, files: Object.fromEntries(Object.entries(files).map(([k, v]) => [k, [...v]])) }),
			unserve: (id) => invoke("fw_plugin_unserve", { id }),
			// Windows (WebView2) serves custom schemes as http://<scheme>.localhost
			url: (id, path) => `${platform === "windows" ? "http://fanwit-plugin.localhost" : "fanwit-plugin://localhost"}/${id}/${path}`,
			async sidecar(id, onLine, onExit) {
				const ch = new Channel<{ line?: string; exit?: number | null }>();
				ch.onmessage = (m) => (m.line !== undefined ? onLine(m.line) : onExit(m.exit ?? null));
				await invoke("fw_sidecar_spawn", { id, onEvent: ch });
				return { send: (line) => invoke("fw_sidecar_send", { id, line }), kill: () => invoke("fw_sidecar_kill", { id }) };
			}
		},
		db: {
			open: (path) => invoke<number>("fw_db_open", { path }),
			exec: (handle, sql, params = [], o = {}) => invoke("fw_db_exec", { handle, sql, params, owner: o.owner ?? null, readonly: !!o.readonly }),
			query: (handle, sql, params = [], o = {}) => invoke("fw_db_query", { handle, sql, params, owner: o.owner ?? null, readonly: !!o.readonly }),
			batch: (handle, statements, o = {}) => invoke("fw_db_batch", { handle, statements, owner: o.owner ?? null }),
			close: (handle) => invoke("fw_db_close", { handle })
		},
		notify: {
			async permission() {
				const n = await import("@tauri-apps/plugin-notification");
				return (await n.isPermissionGranted()) ? "granted" : "default";
			},
			async requestPermission() {
				const n = await import("@tauri-apps/plugin-notification");
				return (await n.requestPermission()) === "granted";
			},
			async os(o) {
				const n = await import("@tauri-apps/plugin-notification");
				if (!(await n.isPermissionGranted()) && (await n.requestPermission()) !== "granted") return false;
				n.sendNotification({ title: o.title, body: o.body, icon: o.icon });
				return true;
			},
			attention: () => getCurrentWindow().requestUserAttention(UserAttentionType.Informational)
		},
		keys: {
			async registerGlobal(accelerator, cb) {
				const gs = await import("@tauri-apps/plugin-global-shortcut");
				await gs.register(accelerator, (e) => {
					if (e.state === "Pressed") cb();
				});
				return toDisposable(() => void gs.unregister(accelerator).catch(() => {}));
			}
		},
		events: {
			emit: (name, payload) => emit(name, payload),
			on: (name, cb) => sub(name, cb)
		},
		dialog: {
			ask: (m, o = {}) => dialog.ask(m, { title: o.title, kind: o.kind, okLabel: o.okLabel, cancelLabel: o.cancelLabel }),
			message: async (m, o = {}) => void (await dialog.message(m, { title: o.title, kind: o.kind })),
			open: async (o = {}) => {
				const r = await dialog.open({ title: o.title, directory: o.directory, multiple: o.multiple, filters: o.filters });
				return r as string | string[] | null;
			},
			save: (o = {}) => dialog.save({ title: o.title, defaultPath: o.defaultPath, filters: o.filters })
		},
		log: {
			write(level: LogLevel, message: string, location?: string) {
				const text = location ? `[FRONTEND_LOC:${location}] ${message}` : message;
				void tauriLog[level](text).catch(() => {});
			}
		},
		invoke: (cmd, args) => invoke(cmd, args),
		autostart: {
			async get() {
				const a = await import("@tauri-apps/plugin-autostart");
				return a.isEnabled();
			},
			async set(on) {
				const a = await import("@tauri-apps/plugin-autostart");
				if (on) await a.enable();
				else await a.disable();
			}
		},
		onFileDrop(cb) {
			let un: (() => void) | undefined;
			let gone = false;
			void import("@tauri-apps/api/webview").then(({ getCurrentWebview }) =>
				getCurrentWebview()
					.onDragDropEvent((e) => {
						if (e.payload.type === "drop") cb(e.payload.paths.map((p) => p.replace(/\\/g, "/")));
					})
					.then((u) => (gone ? u() : (un = u)))
			);
			return toDisposable(() => {
				gone = true;
				un?.();
			});
		},
		app: async () => (info ??= await invoke<AppInfo>("fw_app_info")),
		lockVault: (path) => invoke("fw_vault_lock", { path }),
		unlockVault: (path) => invoke("fw_vault_unlock", { path }),
		openExternal: async (url) => {
			const o = await import("@tauri-apps/plugin-opener");
			await o.openUrl(url);
		},
		reveal: async (path) => {
			const o = await import("@tauri-apps/plugin-opener");
			await o.revealItemInDir(path);
		},
		exit: async (code = 0) => {
			const p = await import("@tauri-apps/plugin-process");
			await p.exit(code);
		},
		relaunch: async () => {
			const p = await import("@tauri-apps/plugin-process");
			await p.relaunch();
		}
	};
}
