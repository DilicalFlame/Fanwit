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
		svc.safeMode = !!k.sys.info?.safeMode;
		k.sys.plugins = svc;
		// one session in safe mode, asked for by the crash report's "Start in safe mode"
		if (await k.sys.storage?.get<boolean>("fanwit", "safeModeOnce").catch(() => false)) {
			svc.safeMode = true;
			await k.sys.storage.delete("fanwit", "safeModeOnce");
			await k.sys.storage.flush();
		}
		// not awaited: the scan reads files and must not count against this module's start budget
		const ready = svc.scan();
		ctx.commands.register(
			{ id: "plugins.reveal", title: "Show what a plugin added", category: "Plugins", palette: false, args: { view: { type: "string" }, preset: { type: "string" }, theme: { type: "string" } } },
			(a: { view?: string; preset?: string; theme?: string }) => svc.reveal(a)
		);
		ctx.subscriptions.push(
			k.sys.vault.onDidOpen.on(() => void svc.scan()),
			// the plugin browser runs in its own window on desktop: changes there reach this window here
			k.events.on("fw:plugins-changed" as never, (m: { from?: string }) => m?.from !== svc.instance && void svc.scan()),
			k.events.on("fw:plugins-reveal" as never, async (m: { view?: string; preset?: string; theme?: string }) => {
				if (k.host.windows.label !== "main") return;
				await ready;
				if (m.view && !k.sys.layout.views.has(m.view)) await svc.scan();
				if (m.view) await k.sys.layout.openView(m.view);
				if (m.preset) await k.sys.layout.applyPreset(m.preset);
				if (m.theme) await k.commands.run("theme.select", { theme: m.theme });
				void k.host.windows.focus("main");
			}),
			k.events.on("fw:plugins-reload" as never, () => void svc.reload().then(() => k.sys.notify.toast("Plugins reloaded", "success"))),
			{ dispose: () => svc.dispose() }
		);
	}
});
