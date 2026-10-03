import { defineModule } from "$fanwit";
import { defineSettings, s } from "$fanwit/settings/define";

/** Sample notes module: Markdown editor and live preview, daily notes, word events for plugins. */
export default defineModule({
	id: "notes",
	title: "Notes",
	contributes: {
		commands: [
			{ id: "notes.newDaily", title: "Open today's daily note", category: "Notes", icon: "calendar", when: "vault.open", cli: true },
			{ id: "notes.togglePreview", title: "Toggle preview", category: "Notes", icon: "eye", when: "focusedView == 'notes.editor'" },
			{ id: "notes.openPreview", title: "Open preview to the side", category: "Notes", icon: "columns-2", when: "resource.ext == 'md'" }
		],
		keybindings: [
			{ key: "mod+e", command: "notes.togglePreview", when: "focusedView == 'notes.editor'" },
			{ key: "mod+k v", command: "notes.openPreview" }
		],
		settings: defineSettings("notes", {
			"editor.fontSize": s.number(15, { title: "Editor font size", min: 10, max: 32, step: 1, widget: "slider", unit: "px", category: "Editor" }),
			"editor.wrap": s.enum("soft", ["off", "soft", "bounded"], { title: "Line wrapping", category: "Editor", labels: { off: "Off", soft: "Soft wrap", bounded: "At column" } }),
			"editor.wrapColumn": s.number(80, { title: "Wrap column", category: "Editor", when: "config.notes.editor.wrap == 'bounded'" }),
			"daily.folder": s.path("Daily", { title: "Daily notes folder", kind: "folder", scope: ["vault", "global"], category: "Editor" })
		}),
		views: [
			{ id: "notes.editor", title: (p: Record<string, unknown>) => String(p.path ?? "Untitled").split("/").pop()!, icon: "file-text", component: () => import("./views/NoteEditor.svelte"), identity: (p: Record<string, unknown>) => String(p.path), opens: ["md", "markdown", "txt"], help: "recipes" },
			{ id: "notes.preview", title: (p: Record<string, unknown>) => `Preview ${String(p.path ?? "").split("/").pop()}`, icon: "eye", component: () => import("./views/NotePreview.svelte"), identity: (p: Record<string, unknown>) => `preview:${p.path}` }
		],
		menus: {
			"explorer/item": [{ id: "notes.openPreview", command: "notes.openPreview", group: "navigation", order: 3, args: { path: "${target.path}" }, when: "resource.ext == 'md'" }],
			"tab/context": [{ id: "notes.tabPreview", command: "notes.openPreview", group: "view", order: 2, args: { path: "${target.path}" }, when: "resource.ext == 'md'" }]
		}
	},
	activate: () => import("./activate")
});
