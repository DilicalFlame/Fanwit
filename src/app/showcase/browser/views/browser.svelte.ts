/** Browser showcase: tabs are panes whose props.url is the page; history is kept per pane. */
import type { Kernel } from "$fanwit/kernel/kernel.svelte";

export const NEW_TAB = "about:newtab";
const history = new Map<string, { stack: string[]; index: number }>();

export const browser = $state({
	bookmarks: ["wiki.example/Layout", "news.example", "shop.example", "fanwit.dev"],
	/** Bumped to re-render after back/forward (history lives outside $state). */
	version: 0
});

/** Address bar text to a mock URL: a search unless it looks like a host. */
export function toUrl(input: string): string {
	const t = input.trim().replace(/^https?:\/\//, "");
	if (!t) return NEW_TAB;
	if (t.startsWith("about:")) return t;
	return /\s/.test(t) || !/\.[a-z]{2,}/i.test(t) ? `search.example/?q=${encodeURIComponent(t)}` : t;
}

/** The page tab the toolbar acts on: the focused one, else the first. */
export function activePage(k: Kernel): string | undefined {
	const layout = k.sys.layout;
	const d = layout.activeDocument;
	if (d && layout.doc.pane[d]?.view === "showcase.browser.page") return d;
	return Object.entries(layout.doc.pane).find(([, p]) => p.view === "showcase.browser.page")?.[0];
}

function setUrl(k: Kernel, pane: string, url: string) {
	const p = k.sys.layout.doc.pane[pane];
	if (p) void k.sys.layout.dispatch({ type: "setAttrs", table: "pane", id: pane, attrs: { props: { ...p.props, url } } }, { undoable: false });
}

export function navigate(k: Kernel, pane: string, url: string) {
	const cur = String(k.sys.layout.doc.pane[pane]?.props?.url ?? NEW_TAB);
	const h = history.get(pane) ?? { stack: [cur], index: 0 };
	h.stack = [...h.stack.slice(0, h.index + 1), url];
	h.index = h.stack.length - 1;
	history.set(pane, h);
	browser.version++;
	setUrl(k, pane, url);
}

export function go(k: Kernel, pane: string, delta: 1 | -1) {
	const h = history.get(pane);
	if (!h || !h.stack[h.index + delta]) return;
	h.index += delta;
	browser.version++;
	setUrl(k, pane, h.stack[h.index]);
}

export const canGo = (pane: string | undefined, delta: 1 | -1) => (void browser.version, !!pane && !!history.get(pane)?.stack[(history.get(pane)?.index ?? 0) + delta]);

export function openTab(k: Kernel, url = NEW_TAB) {
	const page = activePage(k);
	const node = page ? Object.entries(k.sys.layout.doc.node).find(([, n]) => (n as { panes?: string[] }).panes?.includes(page))?.[0] : undefined;
	return k.sys.layout.openView("showcase.browser.page", { url }, { target: node ?? "pages" });
}
