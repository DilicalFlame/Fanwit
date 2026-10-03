/** Developer tools (Section 20.5). */
import { defineModule } from "../kernel/module";

export const devtoolsModule = defineModule({
	id: "fanwit.devtools",
	title: "Developer tools",
	contributes: {
		views: [
			{ id: "fanwit.events", title: "Events", icon: "activity", component: () => import("../views/dev/EventMonitor.svelte"), regions: ["panel"], singleton: true, category: "Developer" },
			{ id: "fanwit.commandLog", title: "Command log", icon: "history", component: () => import("../views/dev/CommandLog.svelte"), regions: ["panel"], singleton: true, category: "Developer" },
			{ id: "fanwit.console", title: "Console", icon: "terminal", component: () => import("../views/dev/Console.svelte"), regions: ["panel"], singleton: true, category: "Developer" },
			{ id: "fanwit.profiler", title: "Module profiler", icon: "gauge", component: () => import("../views/dev/ModuleProfiler.svelte"), regions: ["panel"], singleton: true, category: "Developer" }
		],
		commands: [{ id: "dev.profiler", title: "Open module profiler", category: "Developer", icon: "gauge" }]
	},
	activate(ctx) {
		ctx.commands.handle("dev.profiler", () => ctx.layout.openView("fanwit.profiler", {}, { target: "panel" }));
	}
});
