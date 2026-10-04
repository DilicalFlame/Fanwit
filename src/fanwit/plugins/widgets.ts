/**
 * Declarative plugin UI: a plugin (in any runtime) sends a JSON tree of these nodes with
 * `ui.render(viewId, tree)`, and PluginView renders it with the app's own components, so it
 * is themed, keyboard reachable and costs the plugin nothing on the main thread. User actions
 * come back to the plugin as {t:"ui", view, action, value}.
 */
export type Tone = "muted" | "danger" | "success" | "warning";
export type Widget =
	| { type: "stack" | "row"; gap?: number; children: Widget[] }
	| { type: "text"; text: string; tone?: Tone; size?: "sm" | "lg" | "xl"; mono?: boolean }
	| { type: "markdown"; text: string }
	| { type: "badge"; text: string; tone?: Tone }
	| { type: "icon"; name: string }
	| { type: "button"; label: string; icon?: string; action: string; variant?: "primary" | "ghost" | "danger"; value?: unknown }
	| { type: "input"; id: string; value?: string; placeholder?: string; action: string }
	| { type: "toggle"; id: string; label: string; value: boolean; action: string }
	| { type: "select"; id: string; value: string; options: string[]; action: string }
	| { type: "list"; items: { label: string; description?: string; icon?: string; action?: string; value?: unknown }[] }
	| { type: "table"; columns: string[]; rows: (string | number)[][] }
	| { type: "progress"; value: number; label?: string };

export const WIDGET_LIMITS = { nodes: 2000, bytes: 256 * 1024 };

/** Size check before a tree reaches the renderer; unknown node types are rendered as nothing. */
export function checkTree(tree: unknown): Widget | null {
	if (!tree || typeof tree !== "object") return null;
	if (JSON.stringify(tree).length > WIDGET_LIMITS.bytes) throw new Error(`widget tree is larger than ${WIDGET_LIMITS.bytes / 1024} KB`);
	let n = 0;
	const walk = (w: { children?: unknown[] }) => {
		if (++n > WIDGET_LIMITS.nodes) throw new Error(`widget tree has more than ${WIDGET_LIMITS.nodes} nodes`);
		for (const c of Array.isArray(w.children) ? w.children : []) if (c && typeof c === "object") walk(c as { children?: unknown[] });
	};
	walk(tree as { children?: unknown[] });
	return tree as Widget;
}
