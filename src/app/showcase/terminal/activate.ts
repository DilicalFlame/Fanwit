import type { ModuleContext } from "$fanwit";
import { tabsetOf } from "../_shared/contrib";

export default function activate(ctx: ModuleContext) {
	let terminals = 1;
	ctx.commands.handle("showcase.terminal.new", () => ctx.layout.openView("showcase.terminal", { name: `Terminal ${++terminals}` }, { target: tabsetOf(ctx, "showcase.terminal", "terminals") }));
}
