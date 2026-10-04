import type { ModuleContext } from "$fanwit";
import { tabsetOf } from "../_shared/contrib";
import { book } from "./views/excel.svelte";

export default function activate(ctx: ModuleContext) {
	ctx.commands.handle("showcase.excel.newSheet", () => {
		let n = Object.keys(book.sheets).length + 1;
		while (book.sheets[`sheet${n}`]) n++;
		book.sheets[`sheet${n}`] = {};
		return ctx.layout.openView("showcase.excel.sheet", { sheet: `sheet${n}`, name: `Sheet${n}` }, { target: tabsetOf(ctx, "showcase.excel.sheet", "sheets") });
	});
}
