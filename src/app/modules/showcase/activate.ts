import type { ModuleContext } from "$fanwit";
import { openTab } from "./views/browser/browser.svelte";
import { book } from "./views/excel/excel.svelte";

/** Tab set holding the first pane of a view, so new tabs open next to their siblings. */
function tabsetOf(ctx: ModuleContext, view: string, fallback: string): string {
	const doc = ctx.kernel.sys.layout.doc;
	const pane = Object.entries(doc.pane).find(([, p]) => p.view === view)?.[0];
	return Object.entries(doc.node).find(([, n]) => (n as { panes?: string[] }).panes?.includes(pane ?? ""))?.[0] ?? fallback;
}

export default function activate(ctx: ModuleContext) {
	const k = ctx.kernel;
	ctx.commands.handle("showcase.browser.newTab", ({ url }: { url: string }) => openTab(k, url));
	ctx.commands.handle("showcase.excel.newSheet", () => {
		let n = Object.keys(book.sheets).length + 1;
		while (book.sheets[`sheet${n}`]) n++;
		book.sheets[`sheet${n}`] = {};
		return ctx.layout.openView("showcase.excel.sheet", { sheet: `sheet${n}`, name: `Sheet${n}` }, { target: tabsetOf(ctx, "showcase.excel.sheet", "sheets") });
	});
	let terminals = 1;
	ctx.commands.handle("showcase.terminal.new", () => ctx.layout.openView("showcase.terminal", { name: `Terminal ${++terminals}` }, { target: tabsetOf(ctx, "showcase.terminal", "terminals") }));
}
