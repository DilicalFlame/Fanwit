/**
 * Manual activation. In a window that shows the manual (the Manual window, the docs site) it
 * applies the reading settings, opens the page the window was opened for and follows
 * `manual.open` from other windows.
 */
import { buildMode } from "virtual:fw-docs";
import type { ModuleContext } from "../kernel/context-api";
import { manualState } from "./state.svelte";
import "./reading.css";

const FONTS: Record<string, string> = {
	sans: "var(--font-sans)",
	serif: 'Charter, "Bitstream Charter", "Sitka Text", Cambria, Georgia, serif',
	mono: "var(--font-mono)",
	system: "system-ui, sans-serif",
	hyperlegible: '"Atkinson Hyperlegible", system-ui, sans-serif',
	dyslexic: '"OpenDyslexic", system-ui, sans-serif'
};
/** Accessibility fonts download only when chosen. */
const loadFont: Record<string, () => Promise<unknown>> = {
	hyperlegible: () => Promise.all([import("@fontsource/atkinson-hyperlegible/400.css"), import("@fontsource/atkinson-hyperlegible/700.css")]),
	dyslexic: () => Promise.all([import("@fontsource/opendyslexic/400.css"), import("@fontsource/opendyslexic/700.css")])
};
const DARK = new Set(["dark", "coal", "navy", "ayu"]);

export default function activate(ctx: ModuleContext) {
	const k = ctx.kernel;
	const st = manualState(k);
	const here = k.sys.layout.scope === "manual" || buildMode === "docs";
	k.context.set("manual.window", here);

	ctx.commands.handle("manual.focusSearch", () => (st.searchRequest = { query: "", n: Date.now() }));
	ctx.commands.handle("manual.toggleKind", () => (st.kind = st.kind === "manual" ? "reference" : "manual"));
	ctx.commands.handle("manual.readingSettings", () => {
		const anchor = document.querySelector("[data-manual-reading]");
		if (anchor) ctx.windows.popover(anchor, "manual.reading", { align: "end" });
	});
	if (!here) return;

	// manual.open and manual.search, from this window or any other (Section 5.7)
	ctx.subscriptions.push(
		k.events.on("fw:manual-open" as never, (e: { page?: string }) => (e.page ? st.open(e.page) : st.open(st.home() ?? ""))),
		k.events.on("fw:manual-search" as never, (e: { query: string }) => (st.searchRequest = { query: e.query, n: Date.now() }))
	);

	// the page this window was opened for (props) or linked to (?page= on the docs site)
	const params = new URLSearchParams(location.search);
	let props: { page?: string; search?: string } = {};
	try {
		props = JSON.parse(params.get("props") ?? "{}");
	} catch {
		/* no props */
	}
	const first = props.page || params.get("page");
	if (first) queueMicrotask(() => st.open(first, { newTab: true }));
	if (props.search) st.searchRequest = { query: props.search, n: Date.now() };

	// reading settings drive CSS variables on the document; the app theme is left alone
	const cleanup = $effect.root(() => {
		$effect(() => {
			const get = <T>(key: string) => k.sys.settings.get<T>(`manual.${key}`);
			const root = document.documentElement;
			const theme = get<string>("theme");
			const font = get<string>("font");
			void loadFont[font]?.().catch(() => {});
			root.dataset.readingTheme = theme;
			root.dataset.readingTone = theme === "app" ? (root.classList.contains("dark") ? "dark" : "light") : DARK.has(theme) ? "dark" : "light";
			const vars: Record<string, string> = {
				"--doc-font": FONTS[font] ?? FONTS.sans,
				"--doc-size": `${get<number>("fontSize")}px`,
				"--doc-leading": String(get<number>("lineHeight")),
				"--doc-measure": `${get<number>("measure")}ch`,
				"--doc-para": `${get<number>("paragraphSpacing")}em`,
				"--doc-letter": `${get<number>("letterSpacing")}em`,
				"--doc-word": `${get<number>("wordSpacing")}em`,
				"--doc-code-size": `${get<number>("codeSize")}px`,
				"--doc-align": get<boolean>("justify") ? "justify" : "start",
				"--doc-hyphens": get<boolean>("hyphenate") ? "auto" : "manual",
				"--doc-code-wrap": get<boolean>("codeWrap") ? "pre-wrap" : "pre",
				"--doc-ligatures": get<boolean>("ligatures") ? "normal" : "none"
			};
			for (const [name, v] of Object.entries(vars)) root.style.setProperty(name, v);
		});
		// "Follow the app": the tone follows dark mode changes
		$effect(() => {
			void k.sys.themes.version;
			const root = document.documentElement;
			if (root.dataset.readingTheme === "app") root.dataset.readingTone = root.classList.contains("dark") ? "dark" : "light";
		});
	});
	ctx.subscriptions.push({ dispose: cleanup });
}
