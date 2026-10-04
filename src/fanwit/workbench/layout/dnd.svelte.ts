/**
 * Docking drags (Section 8.11) with pointer events inside a window: drop on a tab strip
 * (insert at index), the centre of a tab set (add as tab), its four edges (split), empty space
 * with Shift (float), onto another app window (dock there), and outside every window (pop out,
 * desktop). Esc cancels. A 4 px threshold keeps clicks from being misread.
 */
import type { Kernel } from "../../kernel/kernel.svelte";
import { haptic } from "../../motion/motion";
import { parentOf, type TabsNode } from "../../layout/model";

export type Zone = "center" | "left" | "right" | "top" | "bottom" | "strip";

type Over = NonNullable<DragState["over"]>;

export interface DragState {
	pane: string;
	title: string;
	x: number;
	y: number;
	over: { node: string; zone: Zone; index?: number; rect: DOMRect; preview: { x: number; y: number; w: number; h: number } } | null;
	float: boolean;
	outside: boolean;
	/** Shown for a drag happening in another window that is over this one. */
	remote?: boolean;
}

type Hover = { to: string; pane?: string; title?: string; x?: number; y?: number };

export class DockDrag {
	state = $state<DragState | null>(null);
	/** Window that is showing the drop hint for a drag out of this one. */
	private hoverTo: string | null = null;
	private probing = false;

	constructor(private k: Kernel) {
		// a tab dragged out of another window: show where it lands here (no pane = it left)
		k.events.on("fw:dock-hover" as never, (m: Hover) => {
			if (m.to !== k.host.windows.label || (this.state && !this.state.remote)) return;
			if (!m.pane || !k.sys.layout.doc.pane[m.pane]) return void (this.state = null);
			this.state = { pane: m.pane, title: m.title ?? "", x: m.x!, y: m.y!, over: this.hit(m.x!, m.y!) ?? this.fallback(), float: false, outside: false, remote: true };
		});
		// ... and released over this one
		k.events.on("fw:dock-drop" as never, (m: { to: string; pane: string; x: number; y: number }) => {
			if (m.to !== k.host.windows.label || !k.sys.layout.doc.pane[m.pane]) return; // another window, or another vault
			if (this.state?.remote) this.state = null;
			this.drop(m.pane, this.hit(m.x, m.y) ?? this.fallback())
				.then(() => k.host.windows.focus())
				.catch((err) => k.sys.notify.error(err));
		});
	}

	/** Off any tab set: the focused tab set, else the main area's first. */
	private fallback(): Over | null {
		const set = document.querySelector<HTMLElement>("[data-fw-tabset].fw-focused") ?? document.querySelector<HTMLElement>('[data-fw-region="main"] [data-fw-tabset]');
		if (!set) return null;
		const r = set.getBoundingClientRect();
		return { node: set.dataset.fwTabset!, zone: "center", rect: r, preview: { x: r.left, y: r.top, w: r.width, h: r.height } };
	}

	/** Over another window: ask which one (one query in flight) and let it draw the hint. */
	private async probe(s: DragState) {
		if (this.probing) return;
		this.probing = true;
		const [x, y] = [s.x, s.y];
		const other = await this.k.host.windows.at?.().catch(() => null);
		this.probing = false;
		if (this.state !== s) return; // the drag ended meanwhile
		if (s.x !== x || s.y !== y) void this.probe(s); // moved while asking: follow up so the hint ends where the cursor stops
		if (this.hoverTo && this.hoverTo !== other?.label) this.leave();
		if (!other) return;
		this.hoverTo = other.label;
		this.k.events.emit("fw:dock-hover" as never, { to: other.label, pane: s.pane, title: s.title, x: other.x, y: other.y } as never, { scope: "app" });
	}

	/** Clear the hint in the window the drag was over. */
	private leave() {
		if (this.hoverTo) this.k.events.emit("fw:dock-hover" as never, { to: this.hoverTo } as never, { scope: "app" });
		this.hoverTo = null;
	}

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
				this.leave();
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
		s.over = s.float || s.outside ? null : this.hit(e.clientX, e.clientY);
		if (s.outside && !s.float && this.k.host.caps.nativeWindows) void this.probe(s);
		else if (this.hoverTo) this.leave();
	}

	/** Drop target under a client point: a tab strip slot, or a tab set's centre or edge. */
	private hit(x: number, y: number): Over | null {
		const under = document.elementFromPoint(x, y);
		const strip = under?.closest("[data-fw-strip]") as HTMLElement | null;
		if (strip) {
			const node = strip.dataset.fwStrip!;
			const tabs = [...strip.querySelectorAll<HTMLElement>("[data-fw-tab]")];
			let index = tabs.length;
			for (let i = 0; i < tabs.length; i++) {
				const r = tabs[i].getBoundingClientRect();
				if (x < r.left + r.width / 2) {
					index = i;
					break;
				}
			}
			const rect = strip.getBoundingClientRect();
			const ref = tabs[index]?.getBoundingClientRect();
			const left = ref ? ref.left : tabs.length ? tabs[tabs.length - 1].getBoundingClientRect().right : rect.left;
			return { node, zone: "strip", index, rect, preview: { x: left - 1, y: rect.top + 4, w: 2, h: rect.height - 8 } };
		}
		const set = under?.closest("[data-fw-tabset]") as HTMLElement | null;
		if (!set) return null;
		const node = set.dataset.fwTabset!;
		const r = set.getBoundingClientRect();
		const compass = this.k.sys.settings.get("layout.dockIndicator") === "compass";
		const fx = (x - r.left) / r.width;
		const fy = (y - r.top) / r.height;
		let zone: Zone = "center";
		if (compass) {
			// compass targets: five buttons around the centre
			const cx = r.left + r.width / 2;
			const cy = r.top + r.height / 2;
			const dx = x - cx;
			const dy = y - cy;
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
		if (locked) return null;
		const preview =
			zone === "left" ? { x: r.left, y: r.top, w: r.width / 2, h: r.height } :
			zone === "right" ? { x: r.left + r.width / 2, y: r.top, w: r.width / 2, h: r.height } :
			zone === "top" ? { x: r.left, y: r.top, w: r.width, h: r.height / 2 } :
			zone === "bottom" ? { x: r.left, y: r.top + r.height / 2, w: r.width, h: r.height / 2 } :
			{ x: r.left, y: r.top, w: r.width, h: r.height };
		return { node, zone, rect: r, preview };
	}

	private async commit(e: PointerEvent) {
		const s = this.state;
		this.state = null;
		this.leave();
		if (!s) return;
		const layout = this.k.sys.layout;
		try {
			if (s.outside && this.k.host.caps.nativeWindows) {
				const other = await this.k.host.windows.at?.().catch(() => null);
				if (other) this.k.events.emit("fw:dock-drop" as never, { to: other.label, pane: s.pane, x: other.x, y: other.y } as never, { scope: "app" });
				else await layout.dispatch({ type: "popOut", pane: s.pane });
				return;
			}
			if (s.float || s.outside) {
				await layout.dispatch({ type: "float", pane: s.pane, rect: [Math.max(0, e.clientX - 140), Math.max(0, e.clientY - 16), 320, 360] });
				return;
			}
			await this.drop(s.pane, s.over);
		} catch (err) {
			this.k.sys.notify.error(err);
		}
	}

	private async drop(pane: string, o: Over | null) {
		if (!o) return;
		haptic("select");
		const layout = this.k.sys.layout;
		const own = parentOf(layout.doc, pane)?.parent;
		const edge = o.zone !== "strip" && o.zone !== "center";
		// a tab set's only tab on its own edge: split it (a copy beside, like Split right), not move it beside itself
		if (edge && own === o.node && (layout.doc.node[own] as TabsNode).panes.length === 1) {
			await layout.dispatch({ type: "split", node: own, pane, dir: o.zone === "left" || o.zone === "right" ? "row" : "column", side: o.zone as "left" | "right" | "top" | "bottom" });
			return;
		}
		if (o.zone === "strip") await layout.dispatch({ type: "movePane", pane, to: { node: o.node, index: o.index } });
		else if (o.zone === "center") await layout.dispatch({ type: "movePane", pane, to: { node: o.node } });
		else await layout.dispatch({ type: "movePane", pane, to: { edge: o.node, side: o.zone } });
	}
}
