import { defineModule } from "$fanwit";
import { preset, v } from "../_shared/contrib";
import terminal from "./presets/terminal.toml?raw";

/** Terminal look-alike: one layout preset plus its mock views. Strip it with `pnpm fw strip showcase-terminal`. */
export default defineModule({
	id: "showcase.terminal",
	title: "Terminal showcase",
	contributes: {
		layoutPresets: [preset("terminal", "Terminal", terminal, "Terminal tabs that split like tmux")],
		commands: [{ id: "showcase.terminal.new", title: "New terminal", category: "Showcase", icon: "square-terminal" }],
		views: [
			v("showcase.terminal.titlebar", "Terminal title bar", "app-window", () => import("./views/Titlebar.svelte"), { singleton: true }),
			v("showcase.terminal", (p) => String(p.name ?? "Terminal"), "square-terminal", () => import("./views/Terminal.svelte"), { identity: (p) => String(p.name) })
		]
	},
	activate: () => import("./activate")
});
