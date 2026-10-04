import { defineModule } from "$fanwit";
import { preset, v } from "../_shared/contrib";
import dashboard from "./presets/dashboard.toml?raw";

/** Dashboard look-alike: one layout preset plus its mock views. Strip it with `pnpm fw strip showcase-dashboard`. */
export default defineModule({
	id: "showcase.dashboard",
	title: "Dashboard showcase",
	contributes: {
		layoutPresets: [preset("dashboard", "Dashboard", dashboard, "A grid of live metric cards, charts and images")],
		views: [
			v("showcase.dashboard.titlebar", "Dashboard title bar", "app-window", () => import("./views/Titlebar.svelte"), { singleton: true }),
			v("showcase.dashboard.kpi", (p) => String(p.label ?? "Metric"), "activity", () => import("./views/Kpi.svelte"), { identity: (p) => String(p.metric) }),
			v("showcase.dashboard.revenue", "Revenue", "chart-line", () => import("./views/Revenue.svelte"), { singleton: true }),
			v("showcase.dashboard.regions", "Sales by region", "chart-column", () => import("./views/Regions.svelte"), { singleton: true }),
			v("showcase.dashboard.traffic", "Traffic sources", "chart-pie", () => import("./views/Traffic.svelte"), { singleton: true }),
			v("showcase.dashboard.gallery", "Campaign images", "images", () => import("./views/Gallery.svelte"), { singleton: true }),
			v("showcase.dashboard.image", (p) => `Image ${Number(p.seed ?? 0) + 1}`, "image", () => import("./views/Image.svelte"), { identity: (p) => String(p.seed) }),
			v("showcase.dashboard.orders", "Recent orders", "receipt", () => import("./views/Orders.svelte"), { singleton: true })
		]
	}
});
