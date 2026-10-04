import type { ModuleContext } from "$fanwit";
import { openTab } from "./views/browser.svelte";

export default function activate(ctx: ModuleContext) {
	ctx.commands.handle("showcase.browser.newTab", ({ url }: { url: string }) => openTab(ctx.kernel, url));
}
