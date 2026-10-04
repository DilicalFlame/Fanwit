/** Photoshop showcase state. Panels follow the document in the focused canvas tab. */
import type { Kernel } from "$fanwit/kernel/kernel.svelte";

export type Tool = "move" | "brush" | "eraser" | "fill" | "eyedropper";
export interface Layer {
	id: string;
	name: string;
	visible: boolean;
	opacity: number;
}
export interface Doc {
	layers: Layer[];
	active: string;
	history: string[];
	adjust: { brightness: number; contrast: number; saturation: number; hue: number };
}

let seq = 0;
export const ps = $state({
	tool: "brush" as Tool,
	color: "#e11d48",
	color2: "#ffffff",
	size: 18,
	opacity: 100,
	docs: {} as Record<string, Doc>
});

export function ensureDoc(name: string): Doc {
	ps.docs[name] ??= { layers: [{ id: `l${++seq}`, name: "Background", visible: true, opacity: 100 }], active: `l${seq}`, history: ["Open"], adjust: { brightness: 100, contrast: 100, saturation: 100, hue: 0 } };
	return ps.docs[name];
}

/** The document of the last focused canvas tab (the layout tracks it as the active document). */
export function activeDoc(k: Kernel): { name: string; doc: Doc } | null {
	const layout = k.sys.layout;
	const pane = layout.activeDocument ? layout.doc.pane[layout.activeDocument] : undefined;
	const name = pane?.view === "showcase.photoshop.canvas" ? String(pane.props?.name) : Object.keys(ps.docs)[0];
	return name && ps.docs[name] ? { name, doc: ps.docs[name] } : null;
}

export function addLayer(doc: Doc) {
	const l = { id: `l${++seq}`, name: `Layer ${doc.layers.length}`, visible: true, opacity: 100 };
	doc.layers.push(l);
	doc.active = l.id;
	doc.history.push("New Layer");
}
