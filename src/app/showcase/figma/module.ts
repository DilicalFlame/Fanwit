import { defineModule } from "$fanwit";
import { preset, v } from "../_shared/contrib";
import figma from "./presets/figma.toml?raw";

/** Figma look-alike: one layout preset plus its mock views. Strip it with `pnpm fw strip showcase-figma`. */
export default defineModule({
	id: "showcase.figma",
	title: "Figma showcase",
	contributes: {
		layoutPresets: [preset("figma", "Figma", figma, "Infinite canvas with floating tool, layer and design panels")],
		views: [
			v("showcase.figma.titlebar", "Figma title bar", "app-window", () => import("./views/Titlebar.svelte"), { singleton: true }),
			v("showcase.figma.canvas", "Canvas", "pen-tool", () => import("./views/Canvas.svelte"), { singleton: true }),
			v("showcase.figma.layers", "Layers", "layers", () => import("./views/Layers.svelte"), { singleton: true }),
			v("showcase.figma.design", "Design", "sliders-horizontal", () => import("./views/Design.svelte"), { singleton: true }),
			v("showcase.figma.tools", "Tools", "mouse-pointer-2", () => import("./views/Tools.svelte"), { singleton: true })
		]
	}
});
