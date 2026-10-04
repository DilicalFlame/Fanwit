/**
 * The Host is the only code that knows where Fanwit runs (Section 3.3).
 * Systems never import @tauri-apps/* directly; they call the Host and read `caps`.
 */
import type { Disposable } from "../kernel/disposable";

export type HostKind = "tauri" | "browser" | "remote" | "memory";
export type Platform = "windows" | "macos" | "linux" | "web";
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

export interface HostCapabilities {
	nativeWindows: boolean;
	modalWindows: boolean;
	alwaysOnTop: "native" | "pip" | "none";
	globalShortcuts: boolean;
	osNotifications: "full" | "basic" | "none";
	fileSystem: "full" | "fs-access" | "opfs" | "memory";
	tray: boolean;
	menubar: "native" | "custom";
	multiInstance: boolean;
	sql: boolean;
}

export interface FsEntry {
	name: string;
	path: string;
	dir: boolean;
	size?: number;
	mtime?: number;
}
export interface FsStat {
	dir: boolean;
	size: number;
	mtime: number;
}
export interface FsEvent {
	kind: "created" | "modified" | "deleted" | "renamed";
	path: string;
	from?: string;
}

export interface HostFs {
	readText(path: string): Promise<string>;
	read(path: string): Promise<Uint8Array>;
	writeText(path: string, data: string, o?: { atomic?: boolean }): Promise<void>;
	write(path: string, data: Uint8Array): Promise<void>;
	exists(path: string): Promise<boolean>;
	stat(path: string): Promise<FsStat>;
	list(dir: string, o?: { recursive?: boolean }): Promise<FsEntry[]>;
	mkdir(path: string): Promise<void>;
	remove(path: string, o?: { recursive?: boolean }): Promise<void>;
	rename(from: string, to: string): Promise<void>;
	trash(path: string): Promise<void>;
	watch(path: string, cb: (events: FsEvent[]) => void, o?: { recursive?: boolean }): Promise<Disposable>;
	/** Let the user pick a folder; returns a host path or null. */
	pickFolder(o?: { title?: string }): Promise<string | null>;
	/**
	 * Write `value` as TOML into `path`, editing the existing document in place so comments and
	 * formatting survive where the host can (desktop: toml_edit in Rust). Returns the written text.
	 */
	writeToml(path: string, value: Record<string, unknown>): Promise<string>;
	/** Allow access below a root (vault folders). Desktop enforces this sandbox in Rust. */
	allowRoot(path: string): Promise<void>;
}

export interface HostDirs {
	config: string;
	data: string;
	cache: string;
	log: string;
	home?: string;
}

export interface DbExecResult {
	changes: number;
	lastId: number;
}
export interface DbOptions {
	/** Restrict statements to tables prefixed `<owner>__` (runtime plugins). */
	owner?: string;
	/** Reject writes. */
	readonly?: boolean;
}
export interface HostDb {
	open(path: string): Promise<number>;
	exec(handle: number, sql: string, params?: unknown[], o?: DbOptions): Promise<DbExecResult>;
	query<T = Record<string, unknown>>(handle: number, sql: string, params?: unknown[], o?: DbOptions): Promise<T[]>;
	/** Run statements atomically in one transaction. */
	batch(handle: number, statements: { sql: string; params?: unknown[] }[], o?: DbOptions): Promise<void>;
	close(handle: number): Promise<void>;
}

export interface NativeWindowOptions {
	label: string;
	url: string;
	title: string;
	width?: number;
	height?: number;
	minWidth?: number;
	minHeight?: number;
	x?: number;
	y?: number;
	center?: boolean;
	parent?: string;
	focus?: "none" | "takeover" | "lock";
	alwaysOnTop?: boolean;
	skipTaskbar?: boolean;
	decorations?: boolean;
	transparent?: boolean;
	shadow?: boolean;
	resizable?: boolean;
	maximizable?: boolean;
	minimizable?: boolean;
	closable?: boolean;
	visible?: boolean;
	/** Identity used as the window state key; omitted means "do not persist". */
	stateKey?: string;
	backgroundColor?: string;
	/** Effects when the locked parent is clicked (focus = lock). */
	onBlocked?: string[];
	/** Placed at the pointer: "cursor" (palette) or beside it, towards the screen centre ("tray"). */
	position?: "cursor" | "tray";
}

export interface HostWindows {
	/** Label of the window this kernel runs in. */
	readonly label: string;
	open(o: NativeWindowOptions): Promise<void>;
	close(label?: string): Promise<void>;
	/** Destroy without running close handlers. */
	destroy(label?: string): Promise<void>;
	show(label?: string): Promise<void>;
	hide(label?: string): Promise<void>;
	focus(label?: string): Promise<void>;
	minimize(): Promise<void>;
	toggleMaximize(): Promise<void>;
	isMaximized(): Promise<boolean>;
	setFullscreen(on: boolean): Promise<void>;
	setTitle(title: string): Promise<void>;
	setAlwaysOnTop(on: boolean): Promise<void>;
	list(): Promise<string[]>;
	/** Another layout window under the cursor and the cursor in its CSS pixels (native windows only). */
	at?(): Promise<{ label: string; x: number; y: number } | null>;
	feedback(label: string, effects: ("bell" | "shake" | "attention")[]): Promise<void>;
	/** Called before the window closes; returning false vetoes. */
	onCloseRequested(cb: () => Promise<boolean> | boolean): Disposable;
	onFocusChanged(cb: (focused: boolean) => void): Disposable;
	onResized(cb: () => void): Disposable;
	setTheme(mode: "light" | "dark" | null): Promise<void>;
	setBackgroundColor(color: string): Promise<void>;
	setBadge(count: number | null): Promise<void>;
	setProgress(fraction: number | null): Promise<void>;
	startDragging(): Promise<void>;
	showSystemMenu?(): Promise<void>;
}

export interface HostEvents {
	/** Emit to every window of the app instance (including this one). */
	emit(name: string, payload?: unknown): Promise<void>;
	on<T = unknown>(name: string, cb: (payload: T) => void): Disposable;
}

export interface HostNotify {
	permission(): Promise<"granted" | "denied" | "default">;
	requestPermission(): Promise<boolean>;
	os(n: { title: string; body?: string; icon?: string }): Promise<boolean>;
	attention(): Promise<void>;
}

export interface HostKeys {
	registerGlobal(accelerator: string, cb: () => void): Promise<Disposable>;
}

export interface DialogFilter {
	name: string;
	extensions: string[];
}
export interface HostDialog {
	ask(message: string, o?: { title?: string; kind?: "info" | "warning" | "error"; okLabel?: string; cancelLabel?: string }): Promise<boolean>;
	message(message: string, o?: { title?: string; kind?: "info" | "warning" | "error" }): Promise<void>;
	open(o?: { title?: string; directory?: boolean; multiple?: boolean; filters?: DialogFilter[] }): Promise<string | string[] | null>;
	save(o?: { title?: string; defaultPath?: string; filters?: DialogFilter[] }): Promise<string | null>;
}

export interface HostLog {
	write(level: LogLevel, message: string, location?: string): void;
}

export interface AppInfo {
	name: string;
	version: string;
	identifier: string;
	tauriVersion?: string;
	webview?: string;
	os: string;
	arch?: string;
	/** Process level settings overrides (`--set key=value`, env vars). */
	overrides: Record<string, unknown>;
	safeMode: boolean;
	headless: boolean;
	devtools: boolean;
	/** Desktop: this process id. */
	pid?: number;
}

/** What the host offers plugin runtimes beyond Web Workers (Chapter 14). */
export interface HostPlugins {
	/** How plugin iframes load: from the fanwit-plugin: scheme (desktop) or as inline srcdoc (web). */
	frames: "scheme" | "srcdoc";
	/** Make a plugin's files loadable at url(id, path) (scheme hosts only). */
	serve?(id: string, files: Record<string, Uint8Array>): Promise<void>;
	unserve?(id: string): Promise<void>;
	url?(id: string, path: string): string;
	/** Start a bundled native sidecar: newline delimited JSON both ways (desktop only). */
	sidecar?(id: string, onLine: (line: string) => void, onExit: (code: number | null) => void): Promise<{ send(line: string): Promise<void>; kill(): Promise<void> }>;
}

export interface Host {
	readonly kind: HostKind;
	readonly platform: Platform;
	readonly caps: HostCapabilities;
	readonly dirs: HostDirs;
	windows: HostWindows;
	fs: HostFs;
	db: HostDb;
	notify: HostNotify;
	keys: HostKeys;
	events: HostEvents;
	dialog: HostDialog;
	log: HostLog;
	invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
	plugins?: HostPlugins;
	/** Start at login (desktop); undefined where the platform cannot. */
	autostart?: { get(): Promise<boolean>; set(on: boolean): Promise<void> };
	/** Files dropped from the OS onto the window: host paths (desktop) or upload:// keys (web). */
	onFileDrop(cb: (paths: string[]) => void): Disposable;
	app(): Promise<AppInfo>;
	/**
	 * Take a vault's lock file for this window: "window" names another window of this app that has
	 * the vault open, "busy" another app instance (browser: another tab). Released on exit or crash.
	 */
	lockVault?(lockPath: string): Promise<{ status: "ok" | "busy" } | { status: "window"; label: string }>;
	unlockVault?(lockPath: string): Promise<void>;
	openExternal(url: string): Promise<void>;
	reveal(path: string): Promise<void>;
	exit(code?: number): Promise<void>;
	relaunch(): Promise<void>;
}

/** Path helpers shared by every host (forward slashes everywhere). */
export function joinPath(...parts: string[]): string {
	const joined = parts
		.filter((p) => p !== "")
		.map((p, i) => (i === 0 ? p.replace(/[\\/]+$/, "") : p.replace(/^[\\/]+|[\\/]+$/g, "")))
		.join("/");
	return joined.replace(/\\/g, "/");
}
export function dirname(p: string): string {
	const s = p.replace(/\\/g, "/").replace(/\/+$/, "");
	const i = s.lastIndexOf("/");
	return i <= 0 ? (i === 0 ? "/" : "") : s.slice(0, i);
}
export function basename(p: string): string {
	const s = p.replace(/\\/g, "/").replace(/\/+$/, "");
	return s.slice(s.lastIndexOf("/") + 1);
}
export function extname(p: string): string {
	const b = basename(p);
	const i = b.lastIndexOf(".");
	return i <= 0 ? "" : b.slice(i + 1).toLowerCase();
}
