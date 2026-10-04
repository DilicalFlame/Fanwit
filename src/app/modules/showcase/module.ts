import { defineModule } from "$fanwit";
import type { ViewContribution } from "$fanwit/layout/views";
import figma from "./presets/figma.toml?raw";
import blender from "./presets/blender.toml?raw";
import photoshop from "./presets/photoshop.toml?raw";
import notion from "./presets/notion.toml?raw";
import obsidian from "./presets/obsidian.toml?raw";
import discord from "./presets/discord.toml?raw";
import browser from "./presets/browser.toml?raw";
import excel from "./presets/excel.toml?raw";
import dashboard from "./presets/dashboard.toml?raw";
import terminal from "./presets/terminal.toml?raw";

/**
 * Layout showcase: rough copies of well known apps, each one a layout preset plus a few mock
 * views, to show that the layout system can shape any kind of desktop app. Apply one from
 * View > Layout preset or the status bar. Delete this folder (and its line in ../index.ts) to
 * drop the showcase.
 */
type Loader = ViewContribution["component"];
const v = (id: string, title: ViewContribution["title"], icon: string, component: Loader, more: Partial<ViewContribution> = {}): ViewContribution => ({ id, title, icon, component, category: "Showcase", ...more });
const preset = (id: string, title: string, text: string, description: string) => ({ id, title, text, description });

export default defineModule({
	id: "showcase",
	title: "Layout showcase",
	contributes: {
		layoutPresets: [
			preset("figma", "Figma", figma, "Infinite canvas with floating tool, layer and design panels"),
			preset("blender", "Blender", blender, "Screen split into areas, each one switches its own editor"),
			preset("photoshop", "Photoshop", photoshop, "Canvas centric documents, tool strip, docked panel groups"),
			preset("notion", "Notion", notion, "Page tree and one editable page of blocks"),
			preset("obsidian", "Obsidian", obsidian, "Ribbon, file tree, split note tabs, graph and backlinks"),
			preset("discord", "Discord", discord, "Servers, channels, chat and members side by side"),
			preset("browser", "Web browser", browser, "Address bar over tabs you can drag into side by side views"),
			preset("excel", "Excel", excel, "Formula bar, a cell grid and sheet tabs at the bottom"),
			preset("dashboard", "Dashboard", dashboard, "A grid of live metric cards, charts and images"),
			preset("terminal", "Terminal", terminal, "Terminal tabs that split like tmux")
		],
		commands: [
			{ id: "showcase.browser.newTab", title: "New browser tab", category: "Showcase", icon: "plus", args: { url: { type: "string", default: "about:newtab" } } },
			{ id: "showcase.excel.newSheet", title: "New sheet", category: "Showcase", icon: "sheet" },
			{ id: "showcase.terminal.new", title: "New terminal", category: "Showcase", icon: "square-terminal" }
		],
		views: [
			// each app's own title bar, placed in the titlebar region of its preset
			v("showcase.figma.titlebar", "Figma title bar", "app-window", () => import("./views/figma/Titlebar.svelte"), { singleton: true }),
			v("showcase.blender.titlebar", "Blender title bar", "app-window", () => import("./views/blender/Titlebar.svelte"), { singleton: true }),
			v("showcase.photoshop.titlebar", "Photoshop title bar", "app-window", () => import("./views/photoshop/Titlebar.svelte"), { singleton: true }),
			v("showcase.notion.titlebar", "Notion title bar", "app-window", () => import("./views/notion/Titlebar.svelte"), { singleton: true }),
			v("showcase.obsidian.titlebar", "Obsidian title bar", "app-window", () => import("./views/obsidian/Titlebar.svelte"), { singleton: true }),
			v("showcase.discord.titlebar", "Discord title bar", "app-window", () => import("./views/discord/Titlebar.svelte"), { singleton: true }),
			v("showcase.browser.titlebar", "Browser title bar", "app-window", () => import("./views/browser/Titlebar.svelte"), { singleton: true }),
			v("showcase.excel.titlebar", "Excel title bar", "app-window", () => import("./views/excel/Titlebar.svelte"), { singleton: true }),
			v("showcase.dashboard.titlebar", "Dashboard title bar", "app-window", () => import("./views/dashboard/Titlebar.svelte"), { singleton: true }),
			v("showcase.terminal.titlebar", "Terminal title bar", "app-window", () => import("./views/terminal/Titlebar.svelte"), { singleton: true }),

			v("showcase.figma.canvas", "Canvas", "pen-tool", () => import("./views/figma/Canvas.svelte"), { singleton: true }),
			v("showcase.figma.layers", "Layers", "layers", () => import("./views/figma/Layers.svelte"), { singleton: true }),
			v("showcase.figma.design", "Design", "sliders-horizontal", () => import("./views/figma/Design.svelte"), { singleton: true }),
			v("showcase.figma.tools", "Tools", "mouse-pointer-2", () => import("./views/figma/Tools.svelte"), { singleton: true }),

			v("showcase.blender.area", (p) => AREA_TITLES[String(p.editor)] ?? "Area", "box", () => import("./views/blender/Area.svelte")),

			v("showcase.photoshop.tools", "Tools", "brush", () => import("./views/photoshop/Tools.svelte"), { singleton: true }),
			v("showcase.photoshop.options", "Options", "settings-2", () => import("./views/photoshop/Options.svelte"), { singleton: true }),
			v("showcase.photoshop.canvas", (p) => String(p.name ?? "Untitled"), "image", () => import("./views/photoshop/Canvas.svelte"), { identity: (p) => String(p.name) }),
			v("showcase.photoshop.color", "Color", "palette", () => import("./views/photoshop/Color.svelte"), { singleton: true }),
			v("showcase.photoshop.swatches", "Swatches", "grid-3x3", () => import("./views/photoshop/Swatches.svelte"), { singleton: true }),
			v("showcase.photoshop.layers", "Layers", "layers", () => import("./views/photoshop/Layers.svelte"), { singleton: true }),
			v("showcase.photoshop.adjustments", "Adjustments", "sun-medium", () => import("./views/photoshop/Adjustments.svelte"), { singleton: true }),
			v("showcase.photoshop.history", "History", "rotate-ccw-clock", () => import("./views/photoshop/History.svelte"), { singleton: true }),

			v("showcase.notion.sidebar", "Pages", "notebook", () => import("./views/notion/Sidebar.svelte"), { singleton: true }),
			v("showcase.notion.page", "Page", "file-text", () => import("./views/notion/Page.svelte"), { singleton: true }),

			v("showcase.obsidian.files", "Files", "folder", () => import("./views/obsidian/Files.svelte"), { singleton: true }),
			v("showcase.obsidian.search", "Search", "search", () => import("./views/obsidian/Search.svelte"), { singleton: true }),
			v("showcase.obsidian.bookmarks", "Bookmarks", "bookmark", () => import("./views/obsidian/Bookmarks.svelte"), { singleton: true }),
			v("showcase.obsidian.note", (p) => String(p.note ?? "Note").replace(/\.md$/, ""), "file-text", () => import("./views/obsidian/Note.svelte"), { identity: (p) => String(p.note) }),
			v("showcase.obsidian.graph", "Graph", "waypoints", () => import("./views/obsidian/Graph.svelte"), { singleton: true }),
			v("showcase.obsidian.backlinks", "Backlinks", "link", () => import("./views/obsidian/Backlinks.svelte"), { singleton: true }),

			v("showcase.discord.servers", "Servers", "server", () => import("./views/discord/Servers.svelte"), { singleton: true }),
			v("showcase.discord.channels", "Channels", "hash", () => import("./views/discord/Channels.svelte"), { singleton: true }),
			v("showcase.discord.chat", "Chat", "message-square", () => import("./views/discord/Chat.svelte"), { singleton: true }),
			v("showcase.discord.members", "Members", "users", () => import("./views/discord/Members.svelte"), { singleton: true }),

			v("showcase.browser.toolbar", "Address bar", "globe", () => import("./views/browser/Toolbar.svelte"), { singleton: true }),
			v("showcase.browser.page", (p) => pageTitle(String(p.url ?? "")), "globe", () => import("./views/browser/Page.svelte")),

			v("showcase.excel.formulaBar", "Formula bar", "square-function", () => import("./views/excel/FormulaBar.svelte"), { singleton: true }),
			v("showcase.excel.sheet", (p) => String(p.name ?? "Sheet"), "sheet", () => import("./views/excel/Sheet.svelte"), { identity: (p) => String(p.sheet) }),

			v("showcase.dashboard.kpi", (p) => String(p.label ?? "Metric"), "activity", () => import("./views/dashboard/Kpi.svelte"), { identity: (p) => String(p.metric) }),
			v("showcase.dashboard.revenue", "Revenue", "chart-line", () => import("./views/dashboard/Revenue.svelte"), { singleton: true }),
			v("showcase.dashboard.regions", "Sales by region", "chart-column", () => import("./views/dashboard/Regions.svelte"), { singleton: true }),
			v("showcase.dashboard.traffic", "Traffic sources", "chart-pie", () => import("./views/dashboard/Traffic.svelte"), { singleton: true }),
			v("showcase.dashboard.gallery", "Campaign images", "images", () => import("./views/dashboard/Gallery.svelte"), { singleton: true }),
			v("showcase.dashboard.image", (p) => `Image ${Number(p.seed ?? 0) + 1}`, "image", () => import("./views/dashboard/Image.svelte"), { identity: (p) => String(p.seed) }),
			v("showcase.dashboard.orders", "Recent orders", "receipt", () => import("./views/dashboard/Orders.svelte"), { singleton: true }),

			v("showcase.terminal", (p) => String(p.name ?? "Terminal"), "square-terminal", () => import("./views/terminal/Terminal.svelte"), { identity: (p) => String(p.name) })
		]
	},
	activate: () => import("./activate")
});

const AREA_TITLES: Record<string, string> = { viewport: "3D Viewport", outliner: "Outliner", properties: "Properties", timeline: "Timeline", nodes: "Shader Editor" };

function pageTitle(url: string): string {
	if (!url || url === "about:newtab") return "New Tab";
	if (url.startsWith("search.example")) return `${decodeURIComponent(url.split("q=")[1] ?? "")} - Search`;
	return url.split("/")[0];
}
