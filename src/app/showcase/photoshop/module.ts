import { defineModule } from "$fanwit";
import { preset, v } from "../_shared/contrib";
import photoshop from "./presets/photoshop.toml?raw";

/** Photoshop look-alike: one layout preset plus its mock views. Strip it with `pnpm fw strip showcase-photoshop`. */
export default defineModule({
	id: "showcase.photoshop",
	title: "Photoshop showcase",
	contributes: {
		layoutPresets: [preset("photoshop", "Photoshop", photoshop, "Canvas centric documents, tool strip, docked panel groups")],
		views: [
			v("showcase.photoshop.titlebar", "Photoshop title bar", "app-window", () => import("./views/Titlebar.svelte"), { singleton: true }),
			v("showcase.photoshop.tools", "Tools", "brush", () => import("./views/Tools.svelte"), { singleton: true }),
			v("showcase.photoshop.options", "Options", "settings-2", () => import("./views/Options.svelte"), { singleton: true }),
			v("showcase.photoshop.canvas", (p) => String(p.name ?? "Untitled"), "image", () => import("./views/Canvas.svelte"), { identity: (p) => String(p.name) }),
			v("showcase.photoshop.color", "Color", "palette", () => import("./views/Color.svelte"), { singleton: true }),
			v("showcase.photoshop.swatches", "Swatches", "grid-3x3", () => import("./views/Swatches.svelte"), { singleton: true }),
			v("showcase.photoshop.layers", "Layers", "layers", () => import("./views/Layers.svelte"), { singleton: true }),
			v("showcase.photoshop.adjustments", "Adjustments", "sun-medium", () => import("./views/Adjustments.svelte"), { singleton: true }),
			v("showcase.photoshop.history", "History", "rotate-ccw-clock", () => import("./views/History.svelte"), { singleton: true })
		]
	}
});
