/** Obsidian showcase: an in memory vault of linked notes. */
import type { Kernel } from "$fanwit/kernel/kernel.svelte";

export const vault = $state({
	bookmarks: ["Welcome.md"] as string[],
	notes: {
		"Welcome.md": "# Welcome\n\nThis is a mock vault. Notes link with [[Ideas]] and [[Layouts]].\n\n- Open a note from the file tree\n- Drag a tab to split the editor\n- Toggle reading view with the book icon\n\nSee also [[Daily/2026-10-04]].",
		"Ideas.md": "# Ideas\n\n- A plugin gallery\n- Linked [[Layouts]] for every app\n- Back to [[Welcome]]",
		"Layouts.md": "# Layouts\n\nEvery preset is a TOML document: regions, splits, tab sets, floats.\n\nRelated: [[Ideas]], [[Projects/Showcase]].",
		"Projects/Showcase.md": "# Showcase\n\nFigma, Blender, Photoshop, Notion, Obsidian, Discord, a browser, Excel, a dashboard and a terminal.\n\nUp: [[Layouts]]",
		"Daily/2026-10-04.md": "# 2026-10-04\n\n- [x] Rename the workbench preset\n- [ ] Write the [[Projects/Showcase]] notes"
	} as Record<string, string>
});

export const LINK = /\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g;
export const resolve = (name: string) => (name.endsWith(".md") ? name : `${name}.md`);
export const linksOf = (text: string) => [...text.matchAll(LINK)].map((m) => resolve(m[1].trim()));

export const openNote = (k: Kernel, note: string, beside = false) => k.sys.layout.openView("showcase.obsidian.note", { note }, beside ? { target: "beside" } : {});

/** Note of the last focused note tab (the layout's active document). */
export function activeNote(k: Kernel): string | null {
	const layout = k.sys.layout;
	const pane = layout.activeDocument ? layout.doc.pane[layout.activeDocument] : undefined;
	if (pane?.view === "showcase.obsidian.note") return String(pane.props?.note);
	const any = Object.values(layout.doc.pane).find((p) => p.view === "showcase.obsidian.note");
	return any ? String(any.props?.note) : null;
}
