import { defineModule } from "$fanwit";
import { preset, v } from "../_shared/contrib";
import blender from "./presets/blender.toml?raw";

/** Blender look-alike: one layout preset plus its mock views. Strip it with `pnpm fw strip showcase-blender`. */
export default defineModule({
	id: "showcase.blender",
	title: "Blender showcase",
	contributes: {
		layoutPresets: [preset("blender", "Blender", blender, "Screen split into areas, each one switches its own editor")],
		views: [
			v("showcase.blender.titlebar", "Blender title bar", "app-window", () => import("./views/Titlebar.svelte"), { singleton: true }),
			v("showcase.blender.area", (p) => AREA_TITLES[String(p.editor)] ?? "Area", "box", () => import("./views/Area.svelte"))
		]
	}
});

const AREA_TITLES: Record<string, string> = { viewport: "3D Viewport", outliner: "Outliner", properties: "Properties", timeline: "Timeline", nodes: "Shader Editor" };
