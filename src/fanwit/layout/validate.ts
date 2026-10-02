/**
 * Structural and semantic validation of a layout document (Section 8.7.2 step 3):
 * unknown view ids, dangling references, cycles, a pane listed twice, missing main region.
 */
import { locate, type TomlDiagnostic } from "../data/toml-file.svelte";
import { childNodes, nodePanes, type LayoutDoc } from "./model";

export interface ValidateOptions {
	views?: Set<string>;
	nodeTypes?: Set<string>;
	file?: string;
}

const BUILTIN_TYPES = new Set(["split", "tabs", "stack", "grid"]);

export function validateLayout(raw: Record<string, unknown>, text = "", o: ValidateOptions = {}): TomlDiagnostic[] {
	const file = o.file ?? "workspace.toml";
	const diags: TomlDiagnostic[] = [];
	const err = (message: string, needle?: string) => diags.push({ file, ...(needle ? locate(text, needle) : {}), message, severity: "error" });
	const warn = (message: string, needle?: string) => diags.push({ file, ...(needle ? locate(text, needle) : {}), message, severity: "warning" });
	const doc = raw as unknown as LayoutDoc;

	if (!doc.window || typeof doc.window !== "object") {
		err("Missing [window.main] table.");
		return diags;
	}
	if (!doc.window.main) err("Missing [window.main] table.");
	const nodes = (doc.node ?? {}) as LayoutDoc["node"];
	const panes = (doc.pane ?? {}) as LayoutDoc["pane"];

	for (const [wid, w] of Object.entries(doc.window)) {
		if (!w || typeof w !== "object") {
			err(`[window.${wid}] must be a table.`, `[window.${wid}]`);
			continue;
		}
		if ((w.frame ?? "workbench") === "workbench") {
			if (!w.regions?.main?.node) err(`Window "${wid}" has no main region node.`, `[window.${wid}`);
		} else if (!w.root && !w.regions?.main?.node) err(`Window "${wid}" needs root = "<node or pane id>".`, `[window.${wid}]`);
		for (const [r, st] of Object.entries(w.regions ?? {})) {
			for (const id of [st?.node, ...(st?.containers ?? [])].filter(Boolean) as string[]) {
				if (!nodes[id]) err(`Region ${wid}.${r} references missing node "${id}".`, `${r} =`);
			}
		}
		if (w.root && !nodes[w.root] && !panes[w.root]) err(`Window "${wid}" root "${w.root}" does not exist.`, `root = "${w.root}"`);
	}

	const seenPane = new Map<string, string>();
	for (const [nid, n] of Object.entries(nodes)) {
		if (!n || typeof n !== "object" || typeof n.type !== "string") {
			err(`[node.${nid}] needs a type.`, `[node.${nid}]`);
			continue;
		}
		if (!BUILTIN_TYPES.has(n.type) && !o.nodeTypes?.has(n.type)) err(`Unknown node type "${n.type}" in [node.${nid}].`, `[node.${nid}]`);
		if (n.type === "split") {
			const s = n as { dir?: string; children?: unknown; sizes?: unknown[] };
			if (s.dir !== "row" && s.dir !== "column") err(`[node.${nid}] dir must be "row" or "column".`, `[node.${nid}]`);
			if (!Array.isArray(s.children)) err(`[node.${nid}] children must be a list of node ids.`, `[node.${nid}]`);
			if (s.sizes && Array.isArray(s.children) && s.sizes.length !== s.children.length) warn(`[node.${nid}] sizes has ${s.sizes.length} entries for ${s.children.length} children.`, `[node.${nid}]`);
		}
		for (const c of childNodes(n)) if (!nodes[c]) err(`[node.${nid}] references missing node "${c}".`, `[node.${nid}]`);
		for (const p of nodePanes(n)) {
			if (!panes[p]) err(`[node.${nid}] references missing pane "${p}".`, `[node.${nid}]`);
			const prev = seenPane.get(p);
			if (prev) err(`Pane "${p}" is listed in both [node.${prev}] and [node.${nid}].`, `[node.${nid}]`);
			seenPane.set(p, nid);
		}
	}

	// cycles
	const state = new Map<string, 1 | 2>();
	const visit = (id: string, path: string[]): boolean => {
		if (state.get(id) === 2) return false;
		if (state.get(id) === 1) {
			err(`Cycle in layout: ${[...path, id].join(" -> ")}.`, `[node.${id}]`);
			return true;
		}
		state.set(id, 1);
		const n = nodes[id];
		for (const c of n ? childNodes(n) : []) if (visit(c, [...path, id])) return true;
		state.set(id, 2);
		return false;
	};
	for (const id of Object.keys(nodes)) if (visit(id, [])) break;

	for (const [pid, p] of Object.entries(panes)) {
		if (!p || typeof p.view !== "string") err(`[pane.${pid}] needs view = "<view id>".`, `[pane.${pid}]`);
		else if (o.views && !o.views.has(p.view)) warn(`Unknown view "${p.view}" in [pane.${pid}]; a placeholder is shown.`, `[pane.${pid}]`);
	}
	for (const [kind, table] of [["float", doc.float], ["drawer", doc.drawer], ["overlay", doc.overlay]] as const) {
		for (const [id, f] of Object.entries(table ?? {})) {
			if (!f?.pane || !panes[f.pane]) err(`[${kind}.${id}] references missing pane "${f?.pane}".`, `[${kind}.${id}]`);
			if (f?.window && !doc.window[f.window]) err(`[${kind}.${id}] references missing window "${f.window}".`, `[${kind}.${id}]`);
		}
	}
	return diags;
}
