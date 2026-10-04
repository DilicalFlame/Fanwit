import type { ModuleContext } from "$fanwit";
import type { ViewContribution } from "$fanwit/layout/views";

type Loader = ViewContribution["component"];

/** A showcase view: category "Showcase" plus the usual view fields. */
export const v = (id: string, title: ViewContribution["title"], icon: string, component: Loader, more: Partial<ViewContribution> = {}): ViewContribution => ({ id, title, icon, component, category: "Showcase", ...more });
export const preset = (id: string, title: string, text: string, description: string) => ({ id, title, text, description });

/** Tab set holding the first pane of a view, so new tabs open next to their siblings. */
export function tabsetOf(ctx: ModuleContext, view: string, fallback: string): string {
	const doc = ctx.kernel.sys.layout.doc;
	const pane = Object.entries(doc.pane).find(([, p]) => p.view === view)?.[0];
	return Object.entries(doc.node).find(([, n]) => (n as { panes?: string[] }).panes?.includes(pane ?? ""))?.[0] ?? fallback;
}
