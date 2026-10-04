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
			{ id: "notes.openPreview", title: "Open preview to the side", category: "Notes", icon: "columns-2", when: "resource.ext == 'md'" },
			{ id: "notes.showBacklinks", title: "Show backlinks", category: "Notes", icon: "link", when: "vault.open" }
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
			{ id: "notes.preview", title: (p: Record<string, unknown>) => `Preview ${String(p.path ?? "").split("/").pop()}`, icon: "eye", component: () => import("./views/NotePreview.svelte"), identity: (p: Record<string, unknown>) => `preview:${p.path}` },
			{ id: "notes.backlinks", title: "Backlinks", icon: "link", component: () => import("./views/Backlinks.svelte"), regions: ["inspector"], singleton: true }
		],
		menus: {
			"explorer/item": [{ id: "notes.openPreview", command: "notes.openPreview", group: "navigation", order: 3, args: { path: "${target.path}" }, when: "resource.ext == 'md'" }],
			"tab/context": [{ id: "notes.tabPreview", command: "notes.openPreview", group: "view", order: 2, args: { path: "${target.path}" }, when: "resource.ext == 'md'" }]
		},
		// translations travel with the module; English stays in the definitions above
		i18n: {
			hi: {
				"category.Notes": "नोट्स",
				"command.notes.newDaily": "आज का दैनिक नोट खोलें",
				"command.notes.togglePreview": "पूर्वावलोकन दिखाएँ या छिपाएँ",
				"command.notes.openPreview": "बगल में पूर्वावलोकन खोलें",
				"command.notes.showBacklinks": "बैकलिंक दिखाएँ",
				"settingsCategory.Editor": "एडिटर",
				"setting.notes.editor.fontSize": "एडिटर फ़ॉन्ट आकार",
				"setting.notes.editor.wrap": "पंक्ति लपेटना",
				"setting.notes.editor.wrap.off": "बंद",
				"setting.notes.editor.wrap.soft": "सॉफ़्ट रैप",
				"setting.notes.editor.wrap.bounded": "कॉलम पर",
				"setting.notes.editor.wrapColumn": "लपेटने का कॉलम",
				"setting.notes.daily.folder": "दैनिक नोट्स का फ़ोल्डर",
				"view.notes.backlinks": "बैकलिंक"
			},
			de: {
				"category.Notes": "Notizen",
				"command.notes.newDaily": "Heutige Tagesnotiz öffnen",
				"command.notes.togglePreview": "Vorschau umschalten",
				"command.notes.openPreview": "Vorschau seitlich öffnen",
				"command.notes.showBacklinks": "Rückverweise anzeigen",
				"settingsCategory.Editor": "Editor",
				"setting.notes.editor.fontSize": "Schriftgröße im Editor",
				"setting.notes.editor.wrap": "Zeilenumbruch",
				"setting.notes.editor.wrap.off": "Aus",
				"setting.notes.editor.wrap.soft": "Weicher Umbruch",
				"setting.notes.editor.wrap.bounded": "An Spalte",
				"setting.notes.editor.wrapColumn": "Umbruchspalte",
				"setting.notes.daily.folder": "Ordner für Tagesnotizen",
				"view.notes.backlinks": "Rückverweise"
			}
		}
	},
	activationEvents: ["onVault"],
	activate: () => import("./activate")
});
