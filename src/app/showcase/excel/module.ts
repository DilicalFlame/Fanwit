import { defineModule } from "$fanwit";
import { preset, v } from "../_shared/contrib";
import excel from "./presets/excel.toml?raw";

/** Excel look-alike: one layout preset plus its mock views. Strip it with `pnpm fw strip showcase-excel`. */
export default defineModule({
	id: "showcase.excel",
	title: "Excel showcase",
	contributes: {
		layoutPresets: [preset("excel", "Excel", excel, "Formula bar, a cell grid and sheet tabs at the bottom")],
		commands: [{ id: "showcase.excel.newSheet", title: "New sheet", category: "Showcase", icon: "sheet" }],
		views: [
			v("showcase.excel.titlebar", "Excel title bar", "app-window", () => import("./views/Titlebar.svelte"), { singleton: true }),
			v("showcase.excel.formulaBar", "Formula bar", "square-function", () => import("./views/FormulaBar.svelte"), { singleton: true }),
			v("showcase.excel.sheet", (p) => String(p.name ?? "Sheet"), "sheet", () => import("./views/Sheet.svelte"), { identity: (p) => String(p.sheet) })
		]
	},
	activate: () => import("./activate")
});
