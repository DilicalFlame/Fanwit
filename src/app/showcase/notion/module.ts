import { defineModule } from "$fanwit";
import { preset, v } from "../_shared/contrib";
import notion from "./presets/notion.toml?raw";

/** Notion look-alike: one layout preset plus its mock views. Strip it with `pnpm fw strip showcase-notion`. */
export default defineModule({
	id: "showcase.notion",
	title: "Notion showcase",
	contributes: {
		layoutPresets: [preset("notion", "Notion", notion, "Page tree and one editable page of blocks")],
		views: [
			v("showcase.notion.titlebar", "Notion title bar", "app-window", () => import("./views/Titlebar.svelte"), { singleton: true }),
			v("showcase.notion.sidebar", "Pages", "notebook", () => import("./views/Sidebar.svelte"), { singleton: true }),
			v("showcase.notion.page", "Page", "file-text", () => import("./views/Page.svelte"), { singleton: true })
		]
	}
});
