import type { Component } from "svelte";

/**
 * A registered component type that panes instantiate (Section 8.5). The component receives
 * `{ paneId, props }`. `identity(props)` makes `openView` focus an existing pane instead of
 * opening a second; `regions` says where it may live.
 *
 * @example
 * ```ts
 * views: [{
 *   id: "notes.editor",
 *   title: (p) => String(p.path).split("/").pop()!,
 *   icon: "file-text",
 *   component: () => import("./views/NoteEditor.svelte"),
 *   identity: (p) => String(p.path),
 *   opens: ["md"]
 * }]
 * ```
 * @see manual://fanwit/guides/layout#views
 */
export interface ViewContribution {
	id: string;
	title: string | ((props: Record<string, unknown>) => string);
	icon?: string;
	description?: string;
	/** Lazy component loader (code split per view) or the component itself. */
	component: (() => Promise<{ default: Component<any> }>) | Component<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
	/** Regions where the view may be docked; first one is its default home. */
	regions?: string[];
	singleton?: boolean;
	/** openView focuses an existing pane with the same identity. */
	identity?: (props: Record<string, unknown>) => string;
	keepAlive?: "dom" | "visibility" | "none";
	/** Volatile view state saved outside workspace.toml (state.db). */
	state?: { save?: boolean };
	web?: { allowPopout?: boolean };
	/** Manual page opened by F1 while the view is focused. */
	help?: string;
	/** Group in view pickers (Labs, Developer, ...). */
	category?: string;
	when?: string;
	/** File extensions this view opens (file associations, quick open); "*" for any. */
	opens?: string[];
}

export interface ViewEntry extends ViewContribution {
	owner: string;
}

export function viewTitle(v: ViewContribution | undefined, props: Record<string, unknown> = {}, fallback = "Untitled"): string {
	if (!v) return fallback;
	try {
		return typeof v.title === "function" ? v.title(props) : v.title;
	} catch {
		return fallback;
	}
}
