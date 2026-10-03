/**
 * Boot sequence (Section 3.6): pick the host, start services, read contributions, load the
 * user's TOML files, render, then activate lazy work after the first paint.
 */
import { parse } from "smol-toml";
import config from "$appconfig";
import { pickHost } from "./host";
import { joinPath, type Host } from "./host/types";
import { Kernel } from "./kernel/kernel.svelte";
import { DisposableStore, toDisposable, type Disposable } from "./kernel/disposable";
import { logs, type LogRecord } from "./kernel/logger";
import { JobService } from "./kernel/jobs.svelte";
import { I18nService } from "./kernel/i18n.svelte";
import { StorageService, createPersisted, type Scope } from "./data/storage.svelte";
import { DbService, sql } from "./data/db";
import { VaultService } from "./data/vault.svelte";
import { TomlFile } from "./data/toml-file.svelte";
import { SettingsService } from "./settings/settings.svelte";
import type { SettingsContribution } from "./settings/define";
import { ThemeService, parseTheme, type ThemeDef, type ModeSetting } from "./themes/themes.svelte";
import { NotifyService, type ChannelDef, type NotificationItem, type NotificationSpec } from "./notify/notify.svelte";
import { LayoutService, type CustomNodeType, type Preset } from "./layout/layout.svelte";
import type { ViewContribution } from "./layout/views";
import type { LayoutAction } from "./layout/actions";
import { WindowService, type WindowKindSpec } from "./windows/windows.svelte";
import { MenuService, type MenuItem, type MenuItemKind, type MenuLocation, type MenuPatch } from "./menus/menus.svelte";
import { PaletteService, type PaletteProvider } from "./workbench/palette-service.svelte";
import { StatusService, type StatusItemSpec } from "./workbench/status.svelte";
import { icons } from "./icons/registry.svelte";
import { coreModules } from "./core";
import type { CommandDefinition } from "./commands/types";
import presetWorkbench from "./layout/presets/workbench.toml?raw";
import ViewHost from "./workbench/ViewHost.svelte";
import WindowView from "./workbench/WindowView.svelte";
import { DockDrag } from "./workbench/layout/dnd.svelte";
import { setActiveKernel } from "./ui.svelte";

declare module "./kernel/kernel.svelte" {
	interface KernelSystems {
		storage: StorageService;
		db: DbService;
		vault: VaultService;
		settings: SettingsService;
		themes: ThemeService;
		notify: NotifyService;
		layout: LayoutService;
		windows: WindowService;
		menus: MenuService;
		palette: PaletteService;
		status: StatusService;
		jobs: JobService;
		i18n: I18nService;
		/** User commands from commands.toml. */
		userCommands: TomlFile | null;
		keysFile: TomlFile | null;
		config: typeof config;
		info: Awaited<ReturnType<Host["app"]>>;
	}
	interface ContextExtensions {
		layout: ReturnType<typeof layoutFacade>;
		windows: ReturnType<typeof windowsFacade>;
		notify: ReturnType<typeof notifyFacade>;
		themes: { set(id: string, o?: { mode?: ModeSetting }): Promise<void>; list(): ThemeDef[]; current(): { id: string; mode: string } };
		settings: { get<T = unknown>(key: string): T; set(key: string, v: unknown, o?: { scope?: "global" | "vault" | "window" }): Promise<void>; inspect(key: string): ReturnType<SettingsService["inspect"]>; onDidChange(fn: (keys: string[]) => void): Disposable };
		vault: VaultService;
		storage: { get<T>(key: string, o?: { scope?: Scope }): Promise<T | undefined>; set(key: string, v: unknown, o?: { scope?: Scope }): Promise<void>; delete(key: string, o?: { scope?: Scope }): Promise<void>; toml<T extends Record<string, unknown>>(file: string, o?: { scope?: "global" | "vault" }): Promise<TomlFile<T>>; onDidChange: StorageService["onDidChange"]["on"] };
		persisted<T>(key: string, initial: T, o?: { scope?: Scope }): { value: T; readonly loaded: boolean };
		db: { sql(o?: { scope?: "global" | "vault" }): ReturnType<DbService["sql"]>; collection<T extends Record<string, unknown>>(name: string, o?: { scope?: "global" | "vault" }): ReturnType<ReturnType<DbService["sql"]>["collection"]> };
		menus: { patch(location: string, p: Omit<MenuPatch, "location">): void; contribute(location: string, items: MenuItem[]): Disposable; show(location: string, x: number, y: number, o?: { target?: unknown }): void; registerProvider(id: string, p: Parameters<MenuService["registerProvider"]>[1]): Disposable };
		statusbar: { item(id: string): ReturnType<StatusService["item"]>; add(spec: StatusItemSpec): ReturnType<StatusService["add"]> };
		jobs: { run: JobService["run"] };
		i18n: { t: I18nService["t"]; formatDate: I18nService["formatDate"]; formatNumber: I18nService["formatNumber"]; add(locale: string, m: Record<string, string>): Disposable };
		icons: { register(name: string, svg: string): Disposable };
		palette: { register(p: PaletteProvider): Disposable; open(prefix?: string): void };
		sql: typeof sql;
	}
}

function layoutFacade(k: Kernel, track: <T extends Disposable>(d: T) => T, owner: string) {
	const l = k.sys.layout;
	return {
		openView: (view: string, props?: Record<string, unknown>, o?: { target?: string; preview?: boolean; title?: string }) => l.openView(view, props, o),
		dispatch: (a: LayoutAction) => l.dispatch(a, { origin: "api" }),
		intercept: (fn: Parameters<LayoutService["intercept"]>[0]) => track(l.intercept(fn)),
		applyPreset: (name: string) => l.applyPreset(name),
		get doc() {
			return l.doc;
		},
		get active() {
			const p = l.activePane ? l.doc.pane[l.activePane] : undefined;
			return p ? { id: l.activePane!, ...p } : undefined;
		},
		registerView: (v: ViewContribution) => track(l.registerView(v, owner)),
		registerNodeType: (t: CustomNodeType) => track(l.registerNodeType({ ...t, owner })),
		saveWorkspace: (name: string) => l.saveWorkspace(name, k.sys.vault.current?.configDir ?? k.host.dirs.data),
		loadWorkspace: (name: string) => l.loadWorkspace(name, k.sys.vault.current?.configDir ?? k.host.dirs.data),
		setDirty: (pane: string, dirty: boolean) => (l.dirty[pane] = dirty),
		setTitle: (pane: string, title: string) => (l.titles[pane] = title)
	};
}

function windowsFacade(k: Kernel, track: <T extends Disposable>(d: T) => T, owner: string) {
	const w = k.sys.windows;
	return {
		open: <R = unknown>(kind: string, props?: Record<string, unknown>) => w.open<R>(kind, props),
		register: (spec: WindowKindSpec) => track(w.register(spec, owner)),
		popover: (anchor: Element, view: string, o?: Record<string, unknown>) => k.sys.layers.popover(anchor, view, o),
		flyout: (view: string, o?: { duration?: number; placement?: "cursor" | "center" | "bottom"; props?: Record<string, unknown> }) => k.sys.layers.flyout(view, o),
		overlay: (view: string, o?: { variant?: "dialog" | "fullscreen" | "sheet" | "lightbox"; backdrop?: "dim" | "blur" | "none"; props?: Record<string, unknown> }) =>
			k.sys.layout.dispatch({ type: "openOverlay", view, props: o?.props, variant: o?.variant, backdrop: o?.backdrop }),
		dialog: k.sys.dialog
	};
}

function notifyFacade(k: Kernel, owner: string) {
	const n = k.sys.notify;
	return {
		send: (s: NotificationSpec) => n.send({ source: owner, ...s }),
		toast: (text: string | NotificationSpec, kind?: NotificationSpec["kind"]) => (typeof text === "string" ? n.toast(text, kind) : n.send({ source: owner, route: "toast", ...text })),
		error: (e: unknown) => n.error(e, owner),
		progress: (s: Omit<NotificationSpec, "kind"> & { cancellable?: boolean }) => n.progress({ source: owner, ...s }),
		banner: (b: Parameters<NotifyService["banner"]>[0]) => n.banner(b)
	};
}

/** In page layers: popovers anchored to elements and transient flyouts (Section 9.10). */
export class LayerService {
	popovers = $state<{ id: string; anchor: DOMRect; view: string; props: Record<string, unknown>; side: string; align: string }[]>([]);
	flyouts = $state<{ id: string; view: string; props: Record<string, unknown>; x: number; y: number; placement: string }[]>([]);
	private seq = 0;
	private pointer = { x: 0, y: 0 };
	constructor() {
		if (typeof window !== "undefined") window.addEventListener("pointermove", (e) => (this.pointer = { x: e.clientX, y: e.clientY }), { passive: true });
	}
	popover(anchor: Element, view: string, o: Record<string, unknown> = {}) {
		const id = `pop${++this.seq}`;
		this.popovers = [...this.popovers, { id, anchor: anchor.getBoundingClientRect(), view, props: (o.props as Record<string, unknown>) ?? {}, side: String(o.side ?? "bottom"), align: String(o.align ?? "start") }];
		return toDisposable(() => (this.popovers = this.popovers.filter((p) => p.id !== id)));
	}
	closePopover(id: string) {
		this.popovers = this.popovers.filter((p) => p.id !== id);
	}
	flyout(view: string, o: { duration?: number; placement?: string; props?: Record<string, unknown> } = {}) {
		const id = `fly${++this.seq}`;
		this.flyouts = [...this.flyouts, { id, view, props: o.props ?? {}, x: this.pointer.x, y: this.pointer.y, placement: o.placement ?? "cursor" }];
		setTimeout(() => (this.flyouts = this.flyouts.filter((f) => f.id !== id)), o.duration ?? 1500);
	}
}

declare module "./kernel/kernel.svelte" {
	interface KernelSystems {
		layers: LayerService;
		dock: DockDrag;
		dialog: {
			ask: Host["dialog"]["ask"];
			confirm: Host["dialog"]["ask"];
			message: Host["dialog"]["message"];
			open: Host["dialog"]["open"];
			save: Host["dialog"]["save"];
		};
	}
}

export interface BootOptions {
	windowKind: string;
	/** Layout window id this kernel renders (main or a popped out aux window). */
	layoutWindow?: string;
}

let booted: Promise<Kernel> | null = null;

/** Boot the kernel once per window. */
export function boot(o: BootOptions): Promise<Kernel> {
	booted ??= doBoot(o);
	return booted;
}

async function doBoot(o: BootOptions): Promise<Kernel> {
	const t0 = performance.now();
	const host = await pickHost(config.host);
	const info = await host.app();
	const k = new Kernel({ host, windowKind: o.windowKind });
	k.lifecycle.mark("host");
	const log = logs.scoped("boot");

	// ----- systems -----
	const storage = new StorageService(host, () => host.windows.label);
	const settings = new SettingsService(host, logs.scoped("settings"));
	const themes = new ThemeService(host);
	const notify = new NotifyService(
		host,
		(id, args) => k.commands.run(id, args, { source: "notification" }),
		(items) => void storage.set("fanwit", "notify/history", items).catch(() => {})
	);
	const layout = new LayoutService(k);
	layout.windowId = o.layoutWindow ?? "main";
	const windows = new WindowService(k);
	const menus = new MenuService(k);
	const palette = new PaletteService(k);
	const status = new StatusService();
	const jobs = new JobService(notify);
	const i18n = new I18nService();
	const vault = new VaultService(k);
	const db = new DbService(host, () => (vault.current ? joinPath(vault.current.configDir, "data") : null));
	const log2 = (level: "info" | "warn", m: string) => logs.scoped("dialog")[level](m);
	const dialog = {
		ask: (m: string, op?: Parameters<Host["dialog"]["ask"]>[1]) => {
			log2("info", `ask: ${m}`);
			return host.dialog.ask(m, op);
		},
		confirm: (m: string, op?: Parameters<Host["dialog"]["ask"]>[1]) => {
			log2("info", `confirm: ${m}`);
			return host.dialog.ask(m, op);
		},
		message: (m: string, op?: Parameters<Host["dialog"]["message"]>[1]) => {
			log2("info", `message: ${m}`);
			return host.dialog.message(m, op);
		},
		open: (op?: Parameters<Host["dialog"]["open"]>[0]) => host.dialog.open(op),
		save: (op?: Parameters<Host["dialog"]["save"]>[0]) => host.dialog.save(op)
	};
	Object.assign(k.sys, { storage, db, vault, settings, themes, notify, layout, windows, menus, palette, status, jobs, i18n, config, info, layers: new LayerService(), dock: new DockDrag(k), dialog, userCommands: null, keysFile: null });
	layout.pool.hostComponent = ViewHost;
	windows.viewHost = WindowView;
	setActiveKernel(k);

	k.commands.setPrompter((entry, missing, given) =>
		palette.ask(
			k.commands.label(entry.def.id),
			missing.map((name) => ({ name, spec: entry.specs[name], title: entry.specs[name].title ?? name })),
			given
		)
	);
	k.commands.setConfirmer((message, danger, okLabel) => dialog.ask(message, { title: "Confirm", kind: danger ? "warning" : "info", okLabel: okLabel ?? "Continue", cancelLabel: "Cancel" }));
	k.keys.onError = (e) => notify.error(e);

	// ----- contribution points -----
	const point = (key: string, fn: (owner: string, value: never) => Disposable | void) => k.modules.definePoint(key, fn as never);
	const each = <T>(fn: (owner: string, item: T) => Disposable) => (owner: string, list: T[]) => {
		const s = new DisposableStore();
		for (const it of list ?? []) s.add(fn(owner, it));
		return s;
	};
	point("views", each<ViewContribution>((owner, v) => layout.registerView(v, owner)));
	point("windows", each<WindowKindSpec>((owner, w) => windows.register(w, owner)));
	point("settings", (owner, value: SettingsContribution | SettingsContribution[]) => {
		const s = new DisposableStore();
		for (const c of Array.isArray(value) ? value : [value]) s.add(settings.contribute(c, owner));
		return s;
	});
	point("themes", each<ThemeDef | string>((owner, t) => themes.add(typeof t === "string" ? parseTheme(t) : t, owner)));
	point("menuLocations", each<MenuLocation>((owner, l) => menus.addLocation(l, owner)));
	point("menus", (owner, value: Record<string, MenuItem[]>) => {
		const s = new DisposableStore();
		const mod = k.modules.modules.get(owner)?.def.tier;
		for (const [loc, items] of Object.entries(value)) s.add(menus.contribute(loc, items, owner, mod === "core" ? "core" : mod === "plugin" ? "plugin" : "module"));
		return s;
	});
	point("menuKinds", each<MenuItemKind>((owner, kd) => menus.registerKind(kd, owner)));
	point("statusItems", each<StatusItemSpec>((owner, it) => status.add(it, owner)));
	point("notificationChannels", each<ChannelDef>((_owner, c) => notify.addChannel(c)));
	point("layoutPresets", each<Preset>((owner, p) => layout.registerPreset({ ...p, owner })));
	point("layoutNodes", each<CustomNodeType>((owner, t) => layout.registerNodeType({ ...t, owner })));
	point("paletteProviders", each<PaletteProvider>((_owner, p) => palette.register(p)));
	point("i18n", (_owner, value: Record<string, Record<string, string>>) => {
		const s = new DisposableStore();
		for (const [loc, msgs] of Object.entries(value)) s.add(i18n.add(loc, msgs));
		return s;
	});
	point("icons", (_owner, value: Record<string, string>) => {
		const s = new DisposableStore();
		for (const [n, svg] of Object.entries(value)) s.add(icons.register(n, svg));
		return s;
	});

	// ----- ctx facades -----
	k.extend((kk, owner, subs) => {
		const track = <T extends Disposable>(d: T) => subs.add(d);
		return {
			layout: layoutFacade(kk, track, owner),
			windows: windowsFacade(kk, track, owner),
			notify: notifyFacade(kk, owner),
			themes: {
				set: async (id: string, op: { mode?: ModeSetting } = {}) => {
					const mode = op.mode ?? (settings.get<string>("theme.mode") as ModeSetting);
					const dark = mode === "dark" || (mode === "system" && themes.mode === "dark");
					await settings.set(dark ? "theme.dark" : "theme.light", id);
					if (op.mode) await settings.set("theme.mode", op.mode);
				},
				list: () => themes.list().map((t) => t.def),
				current: () => ({ id: themes.activeId, mode: themes.mode })
			},
			settings: {
				get: <T>(key: string) => settings.get<T>(key),
				set: (key: string, v: unknown, op?: { scope?: "global" | "vault" | "window" }) => settings.set(key, v, op),
				inspect: (key: string) => settings.inspect(key),
				onDidChange: (fn: (keys: string[]) => void) => track(settings.onDidChange.on(fn))
			},
			vault,
			storage: {
				get: <T>(key: string, op?: { scope?: Scope }) => storage.get<T>(owner, key, op),
				set: (key: string, v: unknown, op?: { scope?: Scope }) => storage.set(owner, key, v, op),
				delete: (key: string, op?: { scope?: Scope }) => storage.delete(owner, key, op),
				toml: async <T extends Record<string, unknown>>(file: string, op: { scope?: "global" | "vault" } = {}) => {
					const dir = op.scope === "vault" ? vault.current?.configDir : host.dirs.config;
					if (!dir) throw new Error("No vault is open.");
					const f = new TomlFile<T>(host, joinPath(dir, file));
					await f.load();
					await f.watch();
					track(toDisposable(() => f.dispose()));
					return f;
				},
				onDidChange: (fn: Parameters<StorageService["onDidChange"]["on"]>[0]) => track(storage.onDidChange.on(fn))
			},
			persisted: <T>(key: string, initial: T, op?: { scope?: Scope }) => createPersisted(storage, owner, key, initial, op),
			db: {
				sql: (op?: { scope?: "global" | "vault" }) => db.sql(owner, { ...op, restrict: kk.modules.modules.get(owner)?.def.tier === "plugin" }),
				collection: <T extends Record<string, unknown>>(name: string, op?: { scope?: "global" | "vault" }) => db.sql(owner, op).collection<T>(name)
			},
			menus: {
				patch: (location: string, p: Omit<MenuPatch, "location">) => menus.patch(location, p),
				contribute: (location: string, items: MenuItem[]) => track(menus.contribute(location, items, owner)),
				show: (location: string, x: number, y: number, op?: { target?: unknown }) => menus.show(location, x, y, op),
				registerProvider: (id: string, p: Parameters<MenuService["registerProvider"]>[1]) => track(menus.registerProvider(id, p))
			},
			statusbar: {
				item: (id: string) => status.item(id, owner),
				add: (spec: StatusItemSpec) => track(status.add(spec, owner))
			},
			jobs: { run: (title: string, fn: Parameters<JobService["run"]>[1], op?: Parameters<JobService["run"]>[2]) => jobs.run(title, fn, { owner, ...op }) },
			i18n: { t: (key: string, p?: Record<string, unknown>) => i18n.t(key, p), formatDate: i18n.formatDate.bind(i18n), formatNumber: i18n.formatNumber.bind(i18n), add: (loc: string, m: Record<string, string>) => track(i18n.add(loc, m)) },
			icons: { register: (name: string, svg: string) => track(icons.register(name, svg)) },
			palette: { register: (p: PaletteProvider) => track(palette.register(p)), open: (prefix?: string) => palette.open(prefix) },
			sql
		};
	});

	// ----- modules: core first, then the app's -----
	const features = config.features ?? {};
	for (const m of coreModules(features)) k.modules.register(m);
	for (const m of config.modules ?? []) k.modules.register(m);
	k.lifecycle.mark("modules");

	// ----- user state -----
	await settings.init({ app: config.settings, overrides: info.overrides, env: (info as { env?: Record<string, string> }).env });
	settings.secrets = {
		get: (key) => (host.kind === "tauri" ? host.invoke<string | null>("fw_secret_get", { key }) : Promise.resolve(sessionStorage.getItem(`fw-secret:${key}`))),
		set: async (key, value) => {
			if (host.kind === "tauri") await host.invoke("fw_secret_set", { key, value });
			else if (value) sessionStorage.setItem(`fw-secret:${key}`, value);
			else sessionStorage.removeItem(`fw-secret:${key}`);
		}
	};
	void settings.loadSecrets().catch(() => {});
	wireSettings(k);
	k.context.configLookup = (key) => settings.get(key);

	const keysFile = new TomlFile(host, joinPath(host.dirs.config, "keys.toml"), {
		template: '# User keybindings. Later entries win. Prefix a command with "-" to remove a default.\n'
	});
	await keysFile.load();
	let userKeys = k.keys.loadUser(keysFile.text);
	keysFile.onDidChangeFromDisk.on(() => {
		userKeys.dispose.dispose();
		userKeys = k.keys.loadUser(keysFile.text);
		if (userKeys.errors.length) notify.send({ title: "keys.toml has problems", body: userKeys.errors.join("\n"), kind: "warning" });
	});
	await keysFile.watch();
	k.events.on("fw:user-keys" as never, () => {
		userKeys.dispose.dispose();
		userKeys = k.keys.loadUser(keysFile.text);
	});
	k.sys.keysFile = keysFile;

	await menus.load(host.dirs.config);
	await loadUserCommands(k);

	const history = await storage.get<NotificationItem[]>("fanwit", "notify/history").catch(() => undefined);
	if (history) notify.restore(history);
	commandsFrecency(k);
	logBridge(k);

	// ----- layout: per vault or global workspace -----
	const presetId = config.layout?.default ?? "workbench";
	const defaultText = layout.presets.get(presetId)?.text ?? presetWorkbench;
	const persist = config.data?.layout?.persist ?? "global";
	await layout.load(persist === "none" ? null : host.dirs.data, defaultText);
	vault.onDidOpen.on(async (v) => {
		if (persist === "vault") await layout.load(v.configDir, defaultText);
	});
	vault.onDidClose.on(async () => {
		if (persist === "vault") await layout.load(host.dirs.data, defaultText);
	});
	await vault.loadRecent();
	await loadUserThemes(k);

	k.keys.attach(document);
	k.context.trackDom();
	log.info(`kernel ready in ${Math.round(performance.now() - t0)} ms (${host.kind}, ${host.platform}, window ${host.windows.label})`);
	k.lifecycle.mark("kernel");
	return k;
}

/** Settings that drive systems: theme, density, zoom, motion, logging, dev mode, language. */
function wireSettings(k: Kernel) {
	const { settings, themes, i18n, notify } = k.sys;
	const apply = () => {
		themes.configure({ mode: settings.get<ModeSetting>("theme.mode"), light: settings.get<string>("theme.light"), dark: settings.get<string>("theme.dark") });
		const root = document.documentElement;
		const density = settings.get<string>("ui.density");
		if (density) root.dataset.density = density;
		root.style.setProperty("--font-size", `${settings.get<number>("ui.fontSize")}px`);
		root.style.setProperty("--ui-scale", String(settings.get<number>("ui.zoom") / 100));
		root.dataset.reducedMotion = String(!!settings.get("ui.reducedMotion"));
		logs.level = settings.get("log.level") ?? logs.level;
		logs.levels = (settings.get<Record<string, never>>("log.levels") ?? {}) as typeof logs.levels;
		k.context.set("devMode", !!settings.get("dev.mode"));
		i18n.locale = settings.get<string>("general.language") || "en";
		root.lang = i18n.locale === "pseudo" ? "en" : i18n.locale;
		root.dir = i18n.dir;
		notify.channelPrefs = (settings.get<Record<string, object>>("notify.channels") ?? {}) as typeof notify.channelPrefs;
		notify.quietHours = settings.get<string>("notify.quietHours") ?? "";
		const dnd = settings.get<boolean>("notify.dnd");
		if (dnd && !notify.dnd) notify.setDnd(24 * 60);
		if (!dnd && notify.dnd) notify.setDnd(null);
	};
	apply();
	settings.onDidChange.on(apply);
}

/** Frecency survives restarts. */
function commandsFrecency(k: Kernel) {
	void k.sys.storage.get<typeof k.commands.frecency>("fanwit", "commands/frecency").then((f) => f && Object.assign(k.commands.frecency, f));
	k.commands.onDidExecute.on(() => void k.sys.storage.set("fanwit", "commands/frecency", k.commands.frecency).catch(() => {}));
}

/** Rust log records (webview target) flow into the ring buffer for the Log Viewer. */
function logBridge(k: Kernel) {
	const map: Record<number, LogRecord["level"]> = { 1: "trace", 2: "debug", 3: "info", 4: "warn", 5: "error" };
	k.host.events.on<{ message: string; level: number }>("log://log", (p) => logs.pushBackend(map[p.level] ?? "info", p.message));
}

/** commands.toml: user commands composed of steps (Section 5.6). */
async function loadUserCommands(k: Kernel) {
	const file = new TomlFile<{ command?: { id: string; title: string; icon?: string; category?: string; steps: { run: string; args?: Record<string, unknown> }[] }[] }>(
		k.host,
		joinPath(k.host.dirs.config, "commands.toml"),
		{ template: "# User commands and recorded macros. Each appears in the palette, menus and key editor.\n" }
	);
	await file.load();
	await file.watch();
	k.sys.userCommands = file as unknown as TomlFile;
	let store = new DisposableStore();
	const apply = () => {
		store.dispose();
		store = new DisposableStore();
		for (const c of file.value.command ?? []) {
			if (!c?.id || !Array.isArray(c.steps)) continue;
			const def: CommandDefinition = { id: c.id, title: c.title ?? c.id, icon: c.icon, category: c.category ?? "User" };
			store.add(
				k.commands.register(
					def,
					async (_a, inv) => {
						for (const s of c.steps) await k.commands.run(s.run, s.args ?? {}, { source: "macro", element: inv.element });
					},
					"user"
				)
			);
		}
	};
	apply();
	file.onDidChangeFromDisk.on(apply);
	k.events.on("fw:user-commands" as never, apply);
}

/** Themes saved by Theme Studio live in <config>/themes/<id>/theme.toml. */
async function loadUserThemes(k: Kernel) {
	const dir = joinPath(k.host.dirs.config, "themes");
	for (const e of await k.host.fs.list(dir).catch(() => [])) {
		if (!e.dir) continue;
		try {
			k.sys.themes.add(parseTheme(await k.host.fs.readText(joinPath(e.path, "theme.toml"))), "user", e.path);
		} catch (err) {
			logs.scoped("themes").warn(`theme ${e.name}: ${(err as Error).message}`);
		}
	}
	k.sys.themes.apply();
}

/** Parse helper for modules that ship TOML presets. */
export function presetFromToml(id: string, title: string, text: string, description?: string): Preset {
	parse(text);
	return { id, title, text, description };
}
