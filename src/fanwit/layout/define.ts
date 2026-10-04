/**
 * Typed layout builder (Section 8.16) emitting the same model as workspace.toml, and custom node
 * types (Section 8.15).
 */
import type { CustomNodeType } from "./layout.svelte";
import type { LayoutDoc, PaneModel, RegionName, WindowModel } from "./model";

interface Built {
	id: string;
}
type Region = Built & { opts?: Record<string, unknown> };

export interface LayoutBuilder {
	window(id: string, opts: Partial<WindowModel>, regions: Partial<Record<RegionName, Region>>): void;
	split(dir: "row" | "column", children: Region[], opts?: Record<string, unknown>): Region;
	tabs(panes: Built[], opts?: Record<string, unknown>): Region;
	stack(panes: Built[], opts?: Record<string, unknown>): Region;
	grid(panes: Built[], opts?: Record<string, unknown>): Region;
	pane(view: string, props?: Record<string, unknown>, opts?: Partial<PaneModel>): Built;
}

const REGION_KEYS = ["size", "visible", "collapsible", "side"];

/**
 * Build a layout document in code instead of TOML: the result is the same model as
 * `workspace.toml`, ready to contribute as a preset (`toToml`) or apply with a `replace` action.
 * Node and pane ids are generated unless you pass `{ id }`.
 *
 * @example
 * ```ts
 * const doc = defineLayout((b) => {
 *   const editor = b.tabs([b.pane("notes.editor", { path: "Welcome.md" })], { id: "center" });
 *   const side = b.stack([b.pane("fanwit.explorer")], { size: "260px" });
 *   b.window("main", { title: "Notes" }, { sidebar: side, main: editor });
 * });
 * ```
 * @see manual://fanwit/guides/layout
 */
export function defineLayout(fn: (b: LayoutBuilder) => void | unknown[]): LayoutDoc {
	const doc: LayoutDoc = { version: 1, window: {}, node: {}, pane: {} };
	let n = 0;
	const id = (p: string) => `${p}-${++n}`;
	const node = (type: string, extra: Record<string, unknown>, opts: Record<string, unknown> = {}): Region => {
		const nid = (opts.id as string) ?? id(type);
		const own = Object.fromEntries(Object.entries(opts).filter(([k]) => !REGION_KEYS.includes(k) && k !== "id"));
		doc.node[nid] = { type, ...extra, ...own } as never;
		return { id: nid, opts };
	};
	fn({
		window(wid, opts, regions) {
			const w: WindowModel = { kind: "main", frame: "workbench", ...opts, regions: {} };
			for (const [r, region] of Object.entries(regions)) {
				const attrs = Object.fromEntries(Object.entries(region!.opts ?? {}).filter(([k]) => REGION_KEYS.includes(k)));
				w.regions![r as RegionName] = { node: region!.id, ...attrs };
			}
			doc.window[wid] = w;
		},
		split: (dir, children, opts) => {
			const sizes = children.map((c) => c.opts?.size as number | string | undefined);
			return node("split", { dir, children: children.map((c) => c.id), ...(sizes.some((s) => s !== undefined) ? { sizes: sizes.map((s) => s ?? 1) } : {}) }, opts);
		},
		tabs: (panes, opts) => node("tabs", { panes: panes.map((p) => p.id), active: panes[0]?.id }, opts),
		stack: (panes, opts) => node("stack", { panes: panes.map((p) => p.id) }, opts),
		grid: (panes, opts) => node("grid", { panes: panes.map((p) => p.id) }, opts),
		pane(view, props, opts) {
			const pid = id(view.split(".").pop()!);
			doc.pane[pid] = { view, ...(props && Object.keys(props).length ? { props } : {}), ...opts };
			return { id: pid };
		}
	});
	return doc;
}

/**
 * Declare a custom layout node type (beyond split, tabs, stack and grid), for example a carousel
 * or a dashboard canvas. Contribute it with `contributes.layoutNodes`; layouts then use
 * `type = "<your type>"` and the component renders the node.
 *
 * @example
 * ```ts
 * export const carousel = defineLayoutNode({
 *   type: "carousel",
 *   component: () => import("./Carousel.svelte"),
 *   children: (node) => node.panes as string[]
 * });
 * ```
 */
export function defineLayoutNode(t: CustomNodeType): CustomNodeType {
	return t;
}
