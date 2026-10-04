import { defineModule } from "$fanwit";
import { preset, v } from "../_shared/contrib";
import browser from "./presets/browser.toml?raw";

/** Web browser look-alike: one layout preset plus its mock views. Strip it with `pnpm fw strip showcase-browser`. */
export default defineModule({
	id: "showcase.browser",
	title: "Web browser showcase",
	contributes: {
		layoutPresets: [preset("browser", "Web browser", browser, "Address bar over tabs you can drag into side by side views")],
		commands: [{ id: "showcase.browser.newTab", title: "New browser tab", category: "Showcase", icon: "plus", args: { url: { type: "string", default: "about:newtab" } } }],
		views: [
			v("showcase.browser.titlebar", "Browser title bar", "app-window", () => import("./views/Titlebar.svelte"), { singleton: true }),
			v("showcase.browser.toolbar", "Address bar", "globe", () => import("./views/Toolbar.svelte"), { singleton: true }),
			v("showcase.browser.page", (p) => pageTitle(String(p.url ?? "")), "globe", () => import("./views/Page.svelte"))
		]
	},
	activate: () => import("./activate")
});

function pageTitle(url: string): string {
	if (!url || url === "about:newtab") return "New Tab";
	if (url.startsWith("search.example")) return `${decodeURIComponent(url.split("q=")[1] ?? "")} - Search`;
	return url.split("/")[0];
}
