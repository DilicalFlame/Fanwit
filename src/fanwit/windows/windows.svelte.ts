/**
 * Windows API (Chapter 9). Developers state intent with a window kind; the presentation policy
 * maps it to a native OS window on the desktop or an in page virtual window / modal on the web.
 *   const win = await ctx.windows.open("app.export", { doc: id });
 *   const choice = await win.result;   // resolves when the child calls close(value)
 */
import { getContext, mount, setContext, unmount, untrack, type Component } from "svelte";
import { toDisposable, type Disposable } from "../kernel/disposable";
import { FanwitError } from "../kernel/errors";
import { haptic } from "../motion/motion";
import type { Kernel } from "../kernel/kernel.svelte";
import { beep } from "../notify/notify.svelte";

export type WindowBase = "main" | "aux" | "child" | "panel" | "sheet" | "palette" | "splash" | "tray";
export type FocusPolicy = "none" | "takeover" | "lock";
export type BlockedEffect = "bell" | "shake" | "flash" | "attention";
export type WebPresentation = "virtual" | "modal" | "popup" | "tab" | "pip";

/**
 * A kind of window, described by intent: its base (aux, child, sheet, palette, panel), focus
 * policy, size and instance rule. The host decides the presentation: a native window on the
 * desktop; a virtual window, modal, tab or picture-in-picture on the web (`web`). Register with
 * `contributes.windows`; open with `ctx.windows.open(kind, props)`.
 *
 * @example
 * ```ts
 * contributes: {
 *   windows: [{ kind: "export", base: "child", view: "notes.export", title: "Export", size: [520, 420], focus: "lock" }]
 * }
 * const result = await (await ctx.windows.open("export", { path })).result;
 * ```
 * @see manual://fanwit/guides/windows
 */
export interface WindowKindSpec {
	kind: string;
	base: WindowBase;
	/** Root view rendered in the window (a registered view id), or "layout" for a layout tree. */
	view?: string;
	/**
	 * A layout preset id: the window runs its own workbench with this preset as its document,
	 * saved to `<data>/<kind>.layout.toml` instead of the workspace (the Manual window does this).
	 */
	layout?: string;
	title?: string | ((props: Record<string, unknown>) => string);
	size?: [number, number];
	minSize?: [number, number];
	maxSize?: [number, number];
	position?: "remember" | "center" | "center-parent" | "cascade" | "cursor" | "tray";
	parent?: "opener" | "main" | string;
	focus?: FocusPolicy;
	onBlocked?: BlockedEffect[];
	dimParent?: boolean;
	alwaysOnTop?: boolean;
	skipTaskbar?: boolean;
	decorations?: "custom" | "native" | "none";
	transparent?: boolean;
	shadow?: boolean | "css";
	effects?: "mica" | "acrylic" | "vibrancy" | "none";
	resizable?: boolean;
	maximizable?: boolean;
	minimizable?: boolean;
	closable?: boolean;
	instance?: "single" | "per-identity" | "multiple";
	identity?: (props: Record<string, unknown>) => string;
	persist?: "global" | "vault" | "none";
	closeBehavior?: "close" | "hide" | "confirm";
	web?: WebPresentation;
	/** Route for fully custom windows (/w/<route>); defaults to /w/<kind>. */
	route?: string;
}

export interface WindowHandle<R = unknown> {
	label: string;
	kind: string;
	result: Promise<R | undefined>;
	close(value?: R): Promise<void>;
	focus(): Promise<void>;
}

export interface VirtualWindow {
	id: string;
	kind: string;
	spec: WindowKindSpec;
	props: Record<string, unknown>;
	title: string;
	rect: { x: number; y: number; w: number; h: number };
	z: number;
	minimized: boolean;
	maximized: boolean;
	modal: boolean;
	opener: string;
	resolve: (v: unknown) => void;
	/** Animation request: "shake" | "flash", cleared by the component. */
	feedback: string | null;
	/** Root layout window id for aux layout windows (pop out). */
	layoutWindow?: string;
}

export const DEFAULTS: Record<WindowBase, Partial<WindowKindSpec>> = {
	main: { size: [1280, 800], position: "remember", persist: "global", web: "tab" },
	aux: { size: [960, 680], position: "cascade", persist: "global", web: "virtual" },
	child: { size: [520, 420], position: "center-parent", parent: "opener", focus: "lock", onBlocked: ["bell", "shake"], skipTaskbar: true, persist: "none", web: "modal", minimizable: false },
	panel: { size: [320, 420], parent: "opener", focus: "none", alwaysOnTop: true, skipTaskbar: true, persist: "global", web: "virtual", minimizable: false },
	sheet: { size: [520, 360], parent: "opener", focus: "lock", skipTaskbar: true, persist: "none", web: "modal", resizable: false },
	palette: { size: [640, 120], position: "cursor", focus: "takeover", alwaysOnTop: true, skipTaskbar: true, persist: "none", web: "modal", resizable: false },
	splash: { size: [420, 260], position: "center", decorations: "none", skipTaskbar: true, persist: "none", web: "modal", resizable: false },
	tray: { size: [320, 400], position: "tray", alwaysOnTop: true, skipTaskbar: true, persist: "none", web: "virtual", resizable: false }
};

export function resolveSpec(s: WindowKindSpec): WindowKindSpec {
	return { ...DEFAULTS[s.base], ...s };
}

/** What a window's own code sees through useWindow(). */
export interface WindowSelf<R = unknown> {
	label: string;
	kind: string;
	props: Record<string, unknown>;
	opener: string | null;
	close(value?: R): Promise<void>;
	setTitle(t: string): void;
}

const SELF_KEY = Symbol("fw-window-self");

export function provideWindowSelf(self: WindowSelf) {
	setContext(SELF_KEY, self);
}

/**
 * Inside a window's view: its label, props and `close(value)`, which resolves the opener's
 * `result` promise.
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { useWindow } from "$fanwit";
 *   const win = useWindow<{ format: string }>();
 * </script>
 * <button onclick={() => win.close({ format: "pdf" })}>Export as PDF</button>
 * ```
 */
export function useWindow<R = unknown>(): WindowSelf<R> {
	const self = getContext<WindowSelf<R> | undefined>(SELF_KEY);
	if (!self) throw new FanwitError("WINDOW_CONTEXT", { message: "useWindow() must be called inside a window view." });
	return self;
}

let seq = 0;
const shortId = () => (Date.now().toString(36).slice(-4) + (++seq).toString(36)).slice(-6);

export class WindowService {
	version = $state(0);
	kinds = new Map<string, WindowKindSpec & { owner: string }>();
	/** Web host: virtual windows rendered by <VirtualWindows/>. */
	virtual = $state<VirtualWindow[]>([]);
	/** Native windows opened by this window: label -> resolver. */
	private pending = new Map<string, (v: unknown) => void>();
	/** Locked by a native child (desktop) or a modal virtual window (web). */
	locked = $state(false);
	private zTop = 10;
	/** Last rectangle per kind for cascade placement. */
	private lastRect = new Map<string, { x: number; y: number }>();
	/** Component that renders a view inside a virtual window. Set by the workbench. */
	viewHost: Component<{ view: string; props: Record<string, unknown>; self: WindowSelf }> | null = null;

	constructor(private k: Kernel) {
		k.events.on("fw:window-result" as never, (m: { label: string; value: unknown }) => {
			this.pending.get(m.label)?.(m.value);
			this.pending.delete(m.label);
		});
		k.host.events.on<{ label: string }>("fw://window-destroyed", (m) => {
			this.pending.get(m.label)?.(undefined);
			this.pending.delete(m.label);
			void k.modules.fire(`onWindowClosed:${m.label}`);
		});
		k.host.events.on<{ locked: boolean }>("fw://lock", (m) => (this.locked = m.locked));
	}

	register(spec: WindowKindSpec, owner: string): Disposable {
		this.kinds.set(spec.kind, { ...resolveSpec(spec), owner });
		this.version = untrack(() => this.version) + 1;
		return toDisposable(() => {
			this.kinds.delete(spec.kind);
			this.version = untrack(() => this.version) + 1;
		});
	}

	spec(kind: string) {
		const s = this.kinds.get(kind);
		if (!s) throw new FanwitError("WINDOW_KIND_UNKNOWN", { message: `Unknown window kind "${kind}".`, hint: "Declare it in contributes.windows or with defineWindowKind.", docs: "manual://windows#kinds" });
		return s;
	}

	title(spec: WindowKindSpec, props: Record<string, unknown>) {
		const t = typeof spec.title === "function" ? spec.title(props) : spec.title;
		return t ?? spec.kind;
	}

	/** Open a window of a registered kind. */
	async open<R = unknown>(kind: string, props: Record<string, unknown> = {}, o: { web?: WebPresentation } = {}): Promise<WindowHandle<R>> {
		const spec = this.spec(kind);
		await this.k.modules.fire(`onWindow:${kind}`);
		const identity = spec.identity?.(props);
		const title = this.title(spec, props);

		if (!this.k.host.caps.nativeWindows) {
			// a window with its own layout needs its own kernel: a browser tab or popup
			const web = spec.layout && o.web !== "popup" ? "tab" : (o.web ?? spec.web ?? "virtual");
			if (web === "pip" && "documentPictureInPicture" in window && this.viewHost) return this.openPip<R>(spec, props, title);
			return this.openVirtual<R>(spec, props, title, web === "pip" ? "virtual" : web);
		}

		// single instance kinds: focus the existing window
		const base = spec.base === "main" ? "main" : spec.base;
		const label = spec.instance === "single" || spec.instance === undefined && spec.base !== "child" ? `${base}-${slug(kind)}${identity ? "-" + slug(identity) : ""}` : `${base}-${shortId()}`;
		const existing = (await this.k.host.windows.list()).includes(label);
		if (existing) {
			await this.k.host.windows.show(label);
			await this.k.host.windows.focus(label);
			return this.handle<R>(label, kind, new Promise(() => {}));
		}
		const opener = this.k.host.windows.label;
		const parent = spec.parent === "opener" ? opener : spec.parent;
		const route = spec.route ?? kind;
		const q = new URLSearchParams({ label, opener });
		if (this.k.sys.vault.current) q.set("vault", this.k.sys.vault.current.path);
		if (Object.keys(props).length) q.set("props", JSON.stringify(props));
		// kinds registered at runtime (Window Lab, defineWindowKind in a view) are unknown to the new window's kernel
		q.set("spec", JSON.stringify({ ...spec, owner: undefined }));
		const result = new Promise<R | undefined>((resolve) => this.pending.set(label, resolve as (v: unknown) => void));
		const cascade = spec.position === "cascade" ? this.cascade(kind) : undefined;
		await this.k.host.windows.open({
			label,
			url: `/w/${route}?${q}`,
			title,
			width: spec.size?.[0],
			height: spec.size?.[1],
			minWidth: spec.minSize?.[0],
			minHeight: spec.minSize?.[1],
			x: cascade?.x,
			y: cascade?.y,
			center: spec.position === "center" || spec.position === "remember" || !spec.position,
			parent: spec.base === "aux" ? undefined : parent,
			focus: spec.focus,
			alwaysOnTop: spec.alwaysOnTop,
			skipTaskbar: spec.skipTaskbar,
			decorations: spec.decorations === "native",
			transparent: spec.transparent || spec.shadow === "css",
			shadow: spec.shadow !== "css",
			resizable: spec.resizable,
			maximizable: spec.maximizable,
			minimizable: spec.minimizable,
			closable: spec.closable,
			stateKey: spec.persist === "none" ? undefined : `${kind}${identity ? ":" + identity : ""}`,
			visible: false,
			onBlocked: spec.onBlocked,
			position: spec.position === "cursor" || spec.position === "tray" ? spec.position : undefined
		});
		return this.handle<R>(label, kind, result);
	}

	private cascade(kind: string) {
		const last = this.lastRect.get(kind) ?? { x: 120, y: 90 };
		const next = { x: last.x + 24, y: last.y + 24 };
		this.lastRect.set(kind, next.x > 600 ? { x: 120, y: 90 } : next);
		return next;
	}

	private handle<R>(label: string, kind: string, result: Promise<R | undefined>): WindowHandle<R> {
		return {
			label,
			kind,
			result,
			close: async (value?: R) => {
				this.k.events.emit("fw:window-result" as never, { label, value } as never, { scope: "app" });
				await this.k.host.windows.close(label);
			},
			focus: () => this.k.host.windows.focus(label)
		};
	}

	/**
	 * Web: an always on top panel through Document Picture-in-Picture. Styles are copied into the
	 * PiP document so the theme applies; the view mounts with this window's kernel.
	 */
	private async openPip<R>(spec: WindowKindSpec, props: Record<string, unknown>, title: string): Promise<WindowHandle<R>> {
		const [w, h] = spec.size ?? [320, 420];
		const dpip = (window as unknown as { documentPictureInPicture: { requestWindow(o: object): Promise<Window> } }).documentPictureInPicture;
		const pip = await dpip.requestWindow({ width: w, height: h });
		for (const node of document.head.querySelectorAll("style, link[rel=stylesheet]")) pip.document.head.appendChild(node.cloneNode(true));
		pip.document.documentElement.className = document.documentElement.className;
		pip.document.title = title;
		pip.document.body.style.cssText = "margin:0;height:100vh;display:flex;flex-direction:column";
		const label = `pip-${shortId()}`;
		let resolve!: (v: R | undefined) => void;
		const result = new Promise<R | undefined>((r) => (resolve = r));
		const self: WindowSelf<R> = { label, kind: spec.kind, props, opener: "main", close: async (v) => { resolve(v); pip.close(); }, setTitle: (t) => (pip.document.title = t) };
		const app = mount(this.viewHost!, { target: pip.document.body, props: { view: spec.view!, props, self } as never, context: new Map([["fanwit", this.k]]) });
		pip.addEventListener("pagehide", () => {
			void unmount(app);
			resolve(undefined);
		});
		return { label, kind: spec.kind, result, close: async (v?: R) => self.close(v), focus: async () => pip.focus() };
	}

	/** Web presentation: a virtual window (draggable card) or a modal with an inert background. */
	private openVirtual<R>(spec: WindowKindSpec, props: Record<string, unknown>, title: string, web: WebPresentation): WindowHandle<R> {
		if (spec.instance !== "multiple") {
			const ex = this.virtual.find((v) => v.kind === spec.kind && JSON.stringify(v.props) === JSON.stringify(props));
			if (ex) {
				this.raise(ex.id);
				return this.virtualHandle<R>(ex, new Promise(() => {}));
			}
		}
		const [w, h] = spec.size ?? [640, 480];
		const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
		const vh = typeof window !== "undefined" ? window.innerHeight : 800;
		const cascade = spec.position === "cascade" ? this.virtual.length * 24 : 0;
		const modal = web === "modal" || spec.focus === "lock";
		let resolve!: (v: unknown) => void;
		const result = new Promise<R | undefined>((r) => (resolve = r as (v: unknown) => void));
		const vwin: VirtualWindow = {
			id: `${spec.base}-${shortId()}`,
			kind: spec.kind,
			spec,
			props,
			title,
			rect: { x: Math.max(8, (vw - Math.min(w, vw - 16)) / 2 + cascade), y: Math.max(8, (vh - Math.min(h, vh - 16)) / 3 + cascade), w: Math.min(w, vw - 16), h: Math.min(h, vh - 16) },
			z: ++this.zTop,
			minimized: false,
			maximized: false,
			modal,
			opener: "main",
			resolve,
			feedback: null
		};
		if (web === "popup" || web === "tab") {
			const route = spec.route ?? spec.kind;
			const q = new URLSearchParams({ label: vwin.id, opener: "main" });
			if (this.k.sys.vault.current) q.set("vault", this.k.sys.vault.current.path);
			if (Object.keys(props).length) q.set("props", JSON.stringify(props));
			q.set("spec", JSON.stringify({ ...spec, owner: undefined }));
			// single instance layout windows reuse their tab (it navigates to the new props)
			const target = web === "popup" ? vwin.id : spec.layout && spec.instance === "single" ? `fw-${spec.kind}` : "_blank";
			const opened = window.open(`/w/${route}?${q}`, target, web === "popup" ? `width=${w},height=${h}` : undefined);
			if (!opened) throw new FanwitError("WINDOW_BLOCKED", { message: "The browser blocked the new window.", hint: "Allow pop-ups for this site, or use the virtual or modal presentation." });
			// close(value) in the new tab arrives as fw:window-result; closing it without one resolves undefined
			this.pending.set(vwin.id, resolve);
			const poll = setInterval(() => {
				if (!opened.closed) return;
				clearInterval(poll);
				this.pending.get(vwin.id)?.(undefined);
				this.pending.delete(vwin.id);
			}, 500);
			return { label: vwin.id, kind: vwin.kind, result, close: async (value?: R) => { this.pending.get(vwin.id)?.(value); this.pending.delete(vwin.id); opened.close(); }, focus: async () => opened.focus() };
		}
		this.virtual = [...this.virtual, vwin];
		if (modal) this.locked = true;
		return this.virtualHandle<R>(vwin, result);
	}

	private virtualHandle<R>(v: VirtualWindow, result: Promise<R | undefined>): WindowHandle<R> {
		return {
			label: v.id,
			kind: v.kind,
			result,
			close: async (value?: R) => this.closeVirtual(v.id, value),
			focus: async () => this.raise(v.id)
		};
	}

	closeVirtual(id: string, value?: unknown) {
		const v = this.virtual.find((x) => x.id === id);
		if (!v) return;
		this.virtual = this.virtual.filter((x) => x.id !== id);
		this.locked = this.virtual.some((x) => x.modal);
		v.resolve(value);
	}

	raise(id: string) {
		const v = this.virtual.find((x) => x.id === id);
		if (!v) return;
		v.z = ++this.zTop;
		v.minimized = false;
	}

	/** Clicking the locked parent: feedback on the modal (web; Rust does this on desktop). */
	blocked() {
		const top = [...this.virtual].filter((v) => v.modal).sort((a, b) => b.z - a.z)[0];
		if (!top) return;
		const effects = top.spec.onBlocked ?? ["bell", "shake"];
		if (!effects.length) return;
		haptic("warning");
		if (effects.includes("bell")) beep("bell");
		const reduced = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
		// reduced motion turns a shake into a flash
		top.feedback = effects.includes("shake") && !reduced ? "shake" : effects.includes("shake") || effects.includes("flash") ? "flash" : null;
		setTimeout(() => (top.feedback = null), 420);
		if (effects.includes("attention")) void this.k.host.notify.attention();
	}

	/** Cycle virtual windows (Alt+`). */
	cycle() {
		const list = [...this.virtual].sort((a, b) => a.z - b.z);
		if (list.length) this.raise(list[0].id);
	}
}

function slug(s: string) {
	return s.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase().slice(0, 40);
}

/**
 * Declare a window kind in code (it returns it unchanged, typed), for kinds registered at runtime
 * rather than contributed. `pnpm fw add window <kind> --base child` writes a contributed one.
 *
 * @example
 * ```ts
 * const exportKind = defineWindowKind({ kind: "app.export", base: "child", view: "app.export", size: [520, 420] });
 * ```
 */
export function defineWindowKind(spec: WindowKindSpec): WindowKindSpec {
	return spec;
}

export interface OptionNote {
	ok: boolean;
	/** Why the option does nothing here (shown next to the greyed control). */
	why?: string;
}

/**
 * Which window options take effect for a kind on this platform (Window Lab, Section 9). The spec
 * is resolved (base defaults applied).
 */
export function windowOptions(s: WindowKindSpec, env: { native: boolean; platform: string; pip?: boolean }) {
	const no = (why: string): OptionNote => ({ ok: false, why });
	const yes: OptionNote = { ok: true };
	const owned = s.base !== "aux" && s.base !== "main";
	const web = s.web ?? "virtual";
	if (env.native) {
		const locks = s.focus === "lock" && owned;
		return {
			focus: yes,
			lock: owned ? yes : no(`${s.base} windows have no owner window to lock.`),
			onBlocked: locks ? yes : no(owned ? "Only a parent locked by its child (focus = lock) blocks clicks." : `${s.base} windows have no owner window to lock.`),
			alwaysOnTop: yes,
			skipTaskbar: env.platform === "macos" ? no("macOS has no per window taskbar entries.") : env.platform === "windows" && owned ? no("Windows never gives owned windows a taskbar button.") : yes,
			cssShadow: env.platform === "macos" ? no("Needs a transparent window, which macOS builds do not enable.") : yes,
			web: no("Desktop builds open native windows; this applies to the web build.")
		};
	}
	const modal = web === "modal" || (web === "virtual" && s.focus === "lock");
	const tab = web === "popup" || web === "tab";
	const pip = web === "pip" && env.pip;
	return {
		focus: web === "virtual" ? yes : no(web === "modal" ? "A modal always locks the page." : "A browser tab or Picture-in-Picture window cannot block the page."),
		lock: web === "virtual" ? yes : no(web === "modal" ? "A modal always locks the page." : "A browser tab or Picture-in-Picture window cannot block the page."),
		onBlocked: modal ? yes : no(tab || pip ? "A separate browser window cannot block the page." : "Only a modal (focus = lock) blocks clicks."),
		alwaysOnTop: no(pip ? "Picture-in-Picture is always on top." : "Browsers keep only Picture-in-Picture windows on top: pick the pip presentation."),
		skipTaskbar: no("Browser windows have no taskbar entries of their own."),
		cssShadow: no("Desktop only: browser windows draw their own frame."),
		web: web === "pip" && !env.pip ? no("This browser has no Document Picture-in-Picture: it opens as a virtual window.") : yes
	};
}
