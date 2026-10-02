/**
 * Docking drags (Section 8.11) with pointer events inside a window: drop on a tab strip
 * (insert at index), the centre of a tab set (add as tab), its four edges (split), empty space
 * with Shift (float), and outside the window (pop out, desktop). Esc cancels. A 4 px threshold
 * keeps clicks from being misread.
 */
import type { Kernel } from "../../kernel/kernel.svelte";

export type Zone = "center" | "left" | "right" | "top" | "bottom" | "strip";

export interface DragState {
	pane: string;
	title: string;
	x: number;
	y: number;
	over: { node: string; zone: Zone; index?: number; rect: DOMRect; preview: { x: number; y: number; w: number; h: number } } | null;
	float: boolean;
	outside: boolean;
}

export class DockDrag {
	state = $state<DragState | null>(null);

	constructor(private k: Kernel) {}

	/** Call from pointerdown on a tab or stack header. */
	begin(e: PointerEvent, pane: string, title: string) {
		if (e.button !== 0) return;
		const startX = e.clientX;
		const startY = e.clientY;
		const el = e.currentTarget as HTMLElement;
		let started = false;
		const move = (ev: PointerEvent) => {
			if (!started) {
				if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return;
				started = true;
				try {
					el.setPointerCapture(ev.pointerId);
				} catch {
					/* element gone */
				}
				this.state = { pane, title, x: ev.clientX, y: ev.clientY, over: null, float: false, outside: false };
			}
			this.track(ev);
		};
		const up = (ev: PointerEvent) => {
			cleanup();
			if (started) void this.commit(ev);
		};
		const key = (ev: KeyboardEvent) => {
			if (ev.key === "Escape") {
				ev.preventDefault();
				ev.stopPropagation();
				cleanup();
				this.state = null;
			}
		};
		const cleanup = () => {
			window.removeEventListener("pointermove", move, true);
			window.removeEventListener("pointerup", up, true);
			window.removeEventListener("keydown", key, true);
		};
		window.addEventListener("pointermove", move, true);
		window.addEventListener("pointerup", up, true);
		window.addEventListener("keydown", key, true);
	}

	private track(e: PointerEvent) {
		const s = this.state;
		if (!s) return;
		s.x = e.clientX;
		s.y = e.clientY;
		s.float = e.shiftKey;
		s.outside = e.clientX < 0 || e.clientY < 0 || e.clientX > window.innerWidth || e.clientY > window.innerHeight;
		s.over = null;
		if (s.float || s.outside) return;
		const under = document.elementFromPoint(e.clientX, e.clientY);
		const strip = under?.closest("[data-fw-strip]") as HTMLElement | null;
		if (strip) {
			const node = strip.dataset.fwStrip!;
			const tabs = [...strip.querySelectorAll<HTMLElement>("[data-fw-tab]")];
			let index = tabs.length;
			for (let i = 0; i < tabs.length; i++) {
				const r = tabs[i].getBoundingClientRect();
				if (e.clientX < r.left + r.width / 2) {
					index = i;
					break;
				}
			}
			const rect = strip.getBoundingClientRect();
			const ref = tabs[index]?.getBoundingClientRect();
			const x = ref ? ref.left : tabs.length ? tabs[tabs.length - 1].getBoundingClientRect().right : rect.left;
			s.over = { node, zone: "strip", index, rect, preview: { x: x - 1, y: rect.top + 4, w: 2, h: rect.height - 8 } };
			return;
		}
		const set = under?.closest("[data-fw-tabset]") as HTMLElement | null;
		if (!set) return;
		const node = set.dataset.fwTabset!;
		const r = set.getBoundingClientRect();
		const compass = this.k.sys.settings.get("layout.dockIndicator") === "compass";
		const fx = (e.clientX - r.left) / r.width;
		const fy = (e.clientY - r.top) / r.height;
		let zone: Zone = "center";
		if (compass) {
			// compass targets: five buttons around the centre
			const cx = r.left + r.width / 2;
			const cy = r.top + r.height / 2;
			const dx = e.clientX - cx;
			const dy = e.clientY - cy;
			if (Math.abs(dx) < 22 && Math.abs(dy) < 22) zone = "center";
			else if (Math.abs(dy) < 22 && dx < -22 && dx > -80) zone = "left";
			else if (Math.abs(dy) < 22 && dx > 22 && dx < 80) zone = "right";
			else if (Math.abs(dx) < 22 && dy < -22 && dy > -80) zone = "top";
			else if (Math.abs(dx) < 22 && dy > 22 && dy < 80) zone = "bottom";
			else zone = "center";
		} else {
			const edge = 0.25;
			const d = { left: fx, right: 1 - fx, top: fy, bottom: 1 - fy };
			const min = Math.min(d.left, d.right, d.top, d.bottom);
			if (min < edge) zone = (Object.entries(d).find(([, v]) => v === min)![0] as Zone) ?? "center";
		}
		const locked = (this.k.sys.layout.doc.node[node] as { locked?: boolean })?.locked;
		if (locked) return;
		const preview =
			zone === "left" ? { x: r.left, y: r.top, w: r.width / 2, h: r.height } :
			zone === "right" ? { x: r.left + r.width / 2, y: r.top, w: r.width / 2, h: r.height } :
			zone === "top" ? { x: r.left, y: r.top, w: r.width, h: r.height / 2 } :
			zone === "bottom" ? { x: r.left, y: r.top + r.height / 2, w: r.width, h: r.height / 2 } :
			{ x: r.left, y: r.top, w: r.width, h: r.height };
		s.over = { node, zone, rect: r, preview };
	}

	private async commit(e: PointerEvent) {
		const s = this.state;
		this.state = null;
		if (!s) return;
		const layout = this.k.sys.layout;
		try {
			if (s.outside && this.k.host.caps.nativeWindows) {
				await layout.dispatch({ type: "popOut", pane: s.pane });
				return;
			}
			if (s.float || s.outside) {
				await layout.dispatch({ type: "float", pane: s.pane, rect: [Math.max(0, e.clientX - 140), Math.max(0, e.clientY - 16), 320, 360] });
				return;
			}
			const o = s.over;
			if (!o) return;
			if (o.zone === "strip") await layout.dispatch({ type: "movePane", pane: s.pane, to: { node: o.node, index: o.index } });
			else if (o.zone === "center") await layout.dispatch({ type: "movePane", pane: s.pane, to: { node: o.node } });
			else await layout.dispatch({ type: "movePane", pane: s.pane, to: { edge: o.node, side: o.zone } });
		} catch (err) {
			this.k.sys.notify.error(err);
		}
	}
}
