/**
 * Layout model (Section 8.3). One document captures every window, region, split, tab set,
 * pane, floating card, drawer and overlay. It maps 1:1 to workspace.toml: flat keyed tables
 * ([window.<id>], [node.<id>], [pane.<id>], [float.<id>]...), parents list children by id.
 */

export type RegionName = "titlebar" | "header" | "activity" | "sidebar" | "main" | "inspector" | "activity2" | "panel" | "footer" | "statusbar";
export const REGIONS: RegionName[] = ["titlebar", "header", "activity", "sidebar", "main", "inspector", "activity2", "panel", "footer", "statusbar"];
/** Regions that host a layout node. */
export const NODE_REGIONS = ["sidebar", "main", "inspector", "panel", "footer", "header"] as const;
export type NodeRegion = (typeof NODE_REGIONS)[number];

export interface RegionState {
	/** Active node shown in the region. */
	node?: string;
	/** View containers the activity bar switches between (node ids). */
	containers?: string[];
	size?: string | number;
	visible?: boolean;
	collapsible?: boolean;
	/** panel: "bottom" | "right" */
	side?: string;
	maximized?: boolean;
}

export interface WindowModel {
	kind: string;
	frame?: string;
	title?: string;
	regions?: Partial<Record<RegionName, RegionState>>;
	/** "< 900px" = { sidebar = "drawer" } */
	responsive?: Record<string, Record<string, string>>;
	parent?: string;
	focus?: "none" | "takeover" | "lock";
	on_blocked?: string[];
	size?: [number, number];
	position?: string;
	web?: string;
	desktop?: string;
	/** Root node or pane for non-workbench frames. */
	root?: string;
	/** Node maximised within the window. */
	maximized?: string;
	zen?: boolean;
}

export interface SplitNode {
	type: "split";
	dir: "row" | "column";
	children: string[];
	sizes?: (number | string)[];
	min?: (number | string)[];
}
export interface TabsNode {
	type: "tabs";
	panes: string[];
	active?: string;
	strip?: "top" | "bottom" | "left" | "right" | "hidden";
	locked?: boolean;
	title?: string;
	icon?: string;
	closable?: boolean;
}
export interface StackNode {
	type: "stack";
	panes: string[];
	title?: string;
	icon?: string;
	/** Section sizes as weights; collapsed sections ignore theirs. */
	sizes?: number[];
}
export interface GridNode {
	type: "grid";
	panes: string[];
	columns?: string;
	rows?: string;
	gap?: string | number;
	title?: string;
	icon?: string;
}
export interface CustomNode {
	type: string;
	panes?: string[];
	children?: string[];
	[k: string]: unknown;
}
export type LayoutNode = SplitNode | TabsNode | StackNode | GridNode | CustomNode;

export interface PaneModel {
	view: string;
	props?: Record<string, unknown>;
	title?: string;
	icon?: string;
	pinned?: boolean;
	preview?: boolean;
	collapsed?: boolean;
	/** grid placement: CSS grid-area */
	area?: string;
	/** tab group colour */
	group?: string;
}

export interface FloatModel {
	window: string;
	pane: string;
	/** [x, y, w, h]; negative x/y measure from the right/bottom edge */
	rect: [number, number, number, number];
	anchor?: string;
	snap?: boolean;
	collapsed?: boolean;
	opacity?: number;
	/** Pane's origin tab set, used by dock(). */
	origin?: string;
}
export interface DrawerModel {
	window: string;
	pane: string;
	side: "left" | "right" | "top" | "bottom";
	size?: string | number;
	mode?: "overlay" | "push";
	modal?: boolean;
	open?: boolean;
}
export interface OverlayModel {
	window: string;
	pane: string;
	variant: "dialog" | "fullscreen" | "sheet" | "lightbox";
	backdrop?: "dim" | "blur" | "none";
	size?: [number, number];
}

export interface LayoutDoc {
	version: 1;
	preset?: string;
	window: Record<string, WindowModel>;
	node: Record<string, LayoutNode>;
	pane: Record<string, PaneModel>;
	float?: Record<string, FloatModel>;
	drawer?: Record<string, DrawerModel>;
	overlay?: Record<string, OverlayModel>;
}

export function emptyDoc(): LayoutDoc {
	return { version: 1, window: { main: { kind: "main", frame: "workbench", regions: { main: { node: "center" } } } }, node: { center: { type: "tabs", panes: [] } }, pane: {} };
}

/** Children (node ids) of a node. */
export function childNodes(n: LayoutNode): string[] {
	return n.type === "split" ? (n as SplitNode).children : ((n as CustomNode).children as string[] | undefined) ?? [];
}
/** Panes directly held by a node. */
export function nodePanes(n: LayoutNode): string[] {
	return n.type === "split" ? [] : ((n as TabsNode).panes ?? []);
}

export function newId(doc: LayoutDoc, prefix: string): string {
	const taken = new Set([...Object.keys(doc.node), ...Object.keys(doc.pane), ...Object.keys(doc.float ?? {}), ...Object.keys(doc.drawer ?? {}), ...Object.keys(doc.overlay ?? {}), ...Object.keys(doc.window)]);
	for (let i = 1; ; i++) {
		const id = `${prefix}-${i}`;
		if (!taken.has(id)) return id;
	}
}

/** Find the node holding a pane or the parent split of a node. */
export function parentOf(doc: LayoutDoc, id: string): { parent: string; index: number } | null {
	for (const [nid, n] of Object.entries(doc.node)) {
		const list = n.type === "split" ? (n as SplitNode).children : nodePanes(n);
		const i = list.indexOf(id);
		if (i >= 0) return { parent: nid, index: i };
	}
	return null;
}

/** Window and region a node (or any ancestor) is mounted in. */
export function locateNode(doc: LayoutDoc, nodeId: string): { window: string; region?: RegionName } | null {
	let cur = nodeId;
	for (let guard = 0; guard < 100; guard++) {
		for (const [wid, w] of Object.entries(doc.window)) {
			if (w.root === cur) return { window: wid };
			for (const [r, st] of Object.entries(w.regions ?? {})) if (st?.node === cur || st?.containers?.includes(cur)) return { window: wid, region: r as RegionName };
		}
		const p = parentOf(doc, cur);
		if (!p) return null;
		cur = p.parent;
	}
	return null;
}

export function allTabsets(doc: LayoutDoc, windowId?: string): string[] {
	return Object.entries(doc.node)
		.filter(([id, n]) => n.type === "tabs" && (!windowId || locateNode(doc, id)?.window === windowId))
		.map(([id]) => id);
}

/** Remove keys equal to undefined, empty arrays/objects and attribute defaults ("defaults are omitted"). */
export function clean<T>(v: T): T {
	if (Array.isArray(v)) return v.map(clean) as T;
	if (v && typeof v === "object") {
		const out: Record<string, unknown> = {};
		for (const [k, x] of Object.entries(v)) {
			if (x === undefined || x === null) continue;
			const c = clean(x);
			if (c && typeof c === "object" && !Array.isArray(c) && !Object.keys(c).length && k !== "props") continue;
			out[k] = c;
		}
		return out as T;
	}
	return v;
}
