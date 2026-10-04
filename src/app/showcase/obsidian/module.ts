import { defineModule } from "$fanwit";
import { preset, v } from "../_shared/contrib";
import obsidian from "./presets/obsidian.toml?raw";

/** Obsidian look-alike: one layout preset plus its mock views. Strip it with `pnpm fw strip showcase-obsidian`. */
export default defineModule({
	id: "showcase.obsidian",
	title: "Obsidian showcase",
	contributes: {
		layoutPresets: [preset("obsidian", "Obsidian", obsidian, "Ribbon, file tree, split note tabs, graph and backlinks")],
		views: [
			v("showcase.obsidian.titlebar", "Obsidian title bar", "app-window", () => import("./views/Titlebar.svelte"), { singleton: true }),
			v("showcase.obsidian.files", "Files", "folder", () => import("./views/Files.svelte"), { singleton: true }),
			v("showcase.obsidian.search", "Search", "search", () => import("./views/Search.svelte"), { singleton: true }),
			v("showcase.obsidian.bookmarks", "Bookmarks", "bookmark", () => import("./views/Bookmarks.svelte"), { singleton: true }),
			v("showcase.obsidian.note", (p) => String(p.note ?? "Note").replace(/\.md$/, ""), "file-text", () => import("./views/Note.svelte"), { identity: (p) => String(p.note) }),
			v("showcase.obsidian.graph", "Graph", "waypoints", () => import("./views/Graph.svelte"), { singleton: true }),
			v("showcase.obsidian.backlinks", "Backlinks", "link", () => import("./views/Backlinks.svelte"), { singleton: true })
		]
	}
});
