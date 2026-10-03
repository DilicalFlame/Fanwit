/** Runtime plugin system (Chapter 14) as a core feature module. */
import { defineModule } from "../kernel/module";
import { PluginService } from "../plugins/plugins.svelte";

declare module "../kernel/kernel.svelte" {
	interface KernelSystems {
		plugins?: PluginService;
	}
}

export const pluginsModule = defineModule({
	id: "fanwit.plugins",
	title: "Plugins",
	activationEvents: ["onStartupFinished"],
	contributes: {
		views: [
			{ id: "fanwit.pluginList", title: "Plugins", icon: "puzzle", component: () => import("../views/PluginList.svelte"), regions: ["sidebar"], singleton: true },
			{ id: "fanwit.pluginManager", title: "Plugin Manager", icon: "puzzle", component: () => import("../views/PluginManager.svelte"), singleton: true, help: "plugins" }
		],
		windows: [{ kind: "plugins", base: "aux", view: "fanwit.pluginManager", title: "Plugins", size: [1000, 680], instance: "single" }]
	},
	async activate(ctx) {
		const k = ctx.kernel;
		const svc = new PluginService(k);
		svc.safeMode = k.sys.info.safeMode;
		k.sys.plugins = svc;
		await svc.scan();
		ctx.subscriptions.push(
			k.sys.vault.onDidOpen.on(() => void svc.scan()),
			k.events.on("fw:plugins-reload" as never, () => void svc.reload().then(() => k.sys.notify.toast("Plugins reloaded", "success")))
		);
	}
});
