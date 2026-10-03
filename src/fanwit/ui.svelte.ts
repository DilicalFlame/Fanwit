/** UI helpers shared by workbench components and app views. */
import { getContext, onDestroy } from "svelte";
import type { Kernel } from "./kernel/kernel.svelte";
import type { Disposable } from "./kernel/disposable";

export const KERNEL_KEY = "fanwit";

/**
 * The ui.zoom factor (CSS zoom on body). Pointer and getBoundingClientRect values are screen
 * pixels; divide by this before writing them to left/top/width/height inside the app.
 */
export const uiZoom = () => parseFloat(getComputedStyle(document.body).zoom) || 1;

/** The window's kernel (set by the root layout and by mounted panes). */
export function getKernel(): Kernel {
	const k = getContext<Kernel>(KERNEL_KEY);
	if (!k) throw new Error("getKernel() called outside a Fanwit window");
	return k;
}

/** Dispose automatically when the component unmounts (Section 4.4 useDisposable). */
export function useDisposable<T extends Disposable>(d: T): T {
	onDestroy(() => d.dispose());
	return d;
}

let activeKernel: Kernel | null = null;
export function setActiveKernel(k: Kernel) {
	activeKernel = k;
}

export interface MenuActionOptions {
	location: string;
	target?: unknown;
	/** Keep the browser's own menu here. */
	native?: boolean;
	/** Disable the menu. */
	disabled?: boolean;
}

/**
 * `<li use:menu={{ location: "explorer/item", target: { path } }}>`: opens a context menu on
 * right click, Shift+F10, the Menu key and long press. Works on any element (Section 7.6).
 */
export function menu(node: HTMLElement, opts: MenuActionOptions) {
	let o = opts;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const open = (x: number, y: number, anchor?: DOMRect) => {
		const k = activeKernel;
		if (!k || o.disabled) return;
		k.sys.menus.show(o.location, x, y, { target: o.target, element: node, anchor });
	};
	const onContext = (e: MouseEvent) => {
		if (o.native) return;
		e.preventDefault();
		e.stopPropagation();
		open(e.clientX, e.clientY);
	};
	const onKey = (e: KeyboardEvent) => {
		if ((e.key === "F10" && e.shiftKey) || e.key === "ContextMenu") {
			e.preventDefault();
			e.stopPropagation();
			const r = node.getBoundingClientRect();
			open(r.left + 8, r.bottom, r);
		}
	};
	const onDown = (e: PointerEvent) => {
		if (e.pointerType !== "touch") return;
		timer = setTimeout(() => open(e.clientX, e.clientY), 550);
	};
	const cancel = () => clearTimeout(timer);
	node.addEventListener("contextmenu", onContext);
	node.addEventListener("keydown", onKey);
	node.addEventListener("pointerdown", onDown);
	node.addEventListener("pointerup", cancel);
	node.addEventListener("pointermove", cancel);
	node.dataset.fwMenu = opts.location;
	return {
		update(n: MenuActionOptions) {
			o = n;
			node.dataset.fwMenu = n.location;
		},
		destroy() {
			node.removeEventListener("contextmenu", onContext);
			node.removeEventListener("keydown", onKey);
			node.removeEventListener("pointerdown", onDown);
			node.removeEventListener("pointerup", cancel);
			node.removeEventListener("pointermove", cancel);
		}
	};
}

/** Svelte dev metadata: component file and line of an element (dev builds only). */
export function svelteMeta(el: Element | null): { file: string; line: number; column: number } | null {
	for (let n: Element | null = el; n; n = n.parentElement) {
		const meta = (n as Element & { __svelte_meta?: { loc?: { file: string; line: number; column: number } } }).__svelte_meta;
		if (meta?.loc) return meta.loc;
	}
	return null;
}

/** A stable location id for elements without a menu (developer mode, Section 7.6.1). */
export function candidateLocation(el: Element): string {
	const withId = el.closest("[data-fw-id]") as HTMLElement | null;
	if (withId) return `auto/${withId.dataset.fwId}`;
	const meta = svelteMeta(el);
	if (meta) return `auto/${meta.file.split("/").pop()}:${meta.line}`;
	return `auto/${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : ""}`;
}

export function cssSelector(el: Element): string {
	const parts: string[] = [];
	for (let n: Element | null = el; n && n !== document.body && parts.length < 6; n = n.parentElement) {
		const id = (n as HTMLElement).dataset?.fwId;
		if (id) {
			parts.unshift(`[data-fw-id="${id}"]`);
			break;
		}
		const idx = n.parentElement ? [...n.parentElement.children].indexOf(n) + 1 : 1;
		parts.unshift(`${n.tagName.toLowerCase()}:nth-child(${idx})`);
	}
	return parts.join(" > ");
}

/** Relative time like "2m", "1h", "Mon". */
export function shortAgo(t: number) {
	const s = (Date.now() - t) / 1000;
	if (s < 60) return "now";
	if (s < 3600) return `${Math.floor(s / 60)}m`;
	if (s < 86400) return `${Math.floor(s / 3600)}h`;
	return new Date(t).toLocaleDateString(undefined, { weekday: "short" });
}
