/**
 * The manual lives in the app (principle P8). The Manual window is a layout preset of ordinary
 * views (title bar, navigation, pages as tabs, outline), so it can be rearranged like any other
 * window; the docs site is the same window on the web host (`fw docs serve`).
 */
import { defineModule } from "../kernel/module";
import type { ViewContribution } from "../layout/views";
import type { Kernel } from "../kernel/kernel.svelte";
import { defineSettings, s } from "../settings/define";
import { titleOf } from "../manual/docs";
import { helpProvider } from "./palette";
import presetManual from "../manual/presets/manual.toml?raw";

const v = (id: string, title: string, icon: string, component: ViewContribution["component"], extra: Partial<ViewContribution> = {}): ViewContribution => ({ id, title, icon, component, singleton: true, help: "fanwit/guides/manual", ...extra });

/** Reading and appearance (Section 21.6): applied to the Manual window only, never to the app. */
export const manualSettings = defineSettings("manual", {
	theme: s.enum("app", ["app", "light", "paper", "solarized", "dark", "coal", "navy", "ayu", "contrast"], {
		title: "Reading theme",
		description: "Colours of the Manual window. **App** follows the app theme.",
		category: "Manual",
		labels: { app: "Follow the app", light: "Light", paper: "Paper", solarized: "Solarized", dark: "Dark", coal: "Coal", navy: "Navy", ayu: "Ayu", contrast: "High contrast" }
	}),
	font: s.enum("sans", ["sans", "serif", "mono", "system", "hyperlegible", "dyslexic"], {
		title: "Font",
		description: "Atkinson Hyperlegible is designed for low vision; OpenDyslexic for dyslexia. They download only when chosen.",
		category: "Manual",
		labels: { sans: "Sans", serif: "Serif", mono: "Monospace", system: "System UI", hyperlegible: "Atkinson Hyperlegible", dyslexic: "OpenDyslexic" }
	}),
	fontSize: s.number(16, { title: "Text size", category: "Manual", min: 12, max: 26, step: 1, unit: "px", widget: "slider" }),
	lineHeight: s.number(1.7, { title: "Line height", category: "Manual", min: 1.2, max: 2.4, step: 0.05, widget: "slider" }),
	measure: s.number(72, { title: "Line length", description: "Characters per line. 60 to 80 is easiest to read.", category: "Manual", min: 40, max: 120, step: 2, unit: "ch", widget: "slider" }),
	paragraphSpacing: s.number(1, { title: "Paragraph spacing", category: "Manual", min: 0.5, max: 2.5, step: 0.1, unit: "em", widget: "slider" }),
	letterSpacing: s.number(0, { title: "Letter spacing", category: "Manual", min: 0, max: 0.15, step: 0.01, unit: "em", widget: "slider" }),
	wordSpacing: s.number(0, { title: "Word spacing", category: "Manual", min: 0, max: 0.5, step: 0.02, unit: "em", widget: "slider" }),
	justify: s.boolean(false, { title: "Justify text", category: "Manual" }),
	hyphenate: s.boolean(false, { title: "Hyphenate long words", category: "Manual" }),
	codeSize: s.number(13.5, { title: "Code size", category: "Manual", min: 11, max: 20, step: 0.5, unit: "px", widget: "slider" }),
	codeWrap: s.boolean(false, { title: "Wrap long code lines", category: "Manual" }),
	ligatures: s.boolean(false, { title: "Code ligatures", description: "Joins character pairs such as => into one glyph. Off by default: it can disguise flags like |--.", category: "Manual" }),
	bionic: s.boolean(false, { title: "Bionic reading", description: "Bolds the start of each word to guide the eye. Prose only; code is left alone.", category: "Manual" }),
	focus: s.boolean(false, { title: "Focus mode", description: "Dims everything but the paragraph you are reading.", category: "Manual" }),
	ruler: s.boolean(false, { title: "Reading ruler", description: "A band that follows the pointer, to keep your place.", category: "Manual" }),
	explain: s.enum("guided", ["guided", "expert"], {
		title: "Explanations",
		description: "**Guided** opens the *why* and *under the hood* notes in every page; **Expert** folds them away.",
		category: "Manual",
		widget: "segmented",
		labels: { guided: "Guided", expert: "Expert" }
	}),
	speechRate: s.number(1, { title: "Read aloud speed", category: "Manual", min: 0.5, max: 2, step: 0.1, unit: "×", widget: "slider" })
});

export const manualModule = defineModule({
	id: "fanwit.manual",
	title: "Manual",
	contributes: {
		views: [
			v("manual.page", "Manual", "book-open", () => import("../views/manual/ManualPage.svelte"), {
				singleton: false,
				regions: ["main"],
				title: (p: Record<string, unknown>) => titleOf(String(p.page ?? "")),
				identity: (p: Record<string, unknown>) => String(p.page ?? "")
			}),
			v("manual.titlebar", "Manual title bar", "app-window", () => import("../views/manual/ManualTitlebar.svelte")),
			v("manual.nav", "Manual contents", "list-tree", () => import("../views/manual/ManualNav.svelte"), { regions: ["sidebar"] }),
			v("manual.outline", "On this page", "list", () => import("../views/manual/ManualOutline.svelte"), { regions: ["inspector"] }),
			v("manual.reading", "Reading settings", "a-large-small", () => import("../views/manual/ReadingPanel.svelte")),
			// a page's diagram, large and zoomable, in a lightbox overlay
			v("manual.figure", "Diagram", "image", () => import("../views/manual/FigureView.svelte")),
			// the main window's sidebar list; pages open in the Manual window
			v("fanwit.manualToc", "Manual", "book-open", () => import("../views/ManualToc.svelte"), { regions: ["sidebar"] })
		],
		windows: [{ kind: "manual", base: "aux", layout: "manual", title: "Manual", size: [1180, 800], minSize: [420, 360], instance: "single" }],
		layoutPresets: [{ id: "manual", title: "Manual", text: presetManual, description: "Navigation, pages as tabs, an outline: the Manual window and the docs site" }],
		settings: manualSettings,
		commands: [
			{ id: "manual.focusSearch", title: "Search the manual", category: "Help", icon: "search", palette: false },
			{ id: "manual.readingSettings", title: "Reading settings", category: "Help", icon: "a-large-small", when: "manual.window" },
			{ id: "manual.toggleKind", title: "Switch between Manual and Reference", category: "Help", icon: "arrow-left-right", when: "manual.window" }
		],
		keybindings: [
			{ key: "/", command: "manual.focusSearch", when: "manual.window && !inputFocus" },
			{ key: "ctrl+k", mac: "cmd+k", command: "manual.focusSearch", when: "manual.window" }
		],
		// `?` lists the palette modes, and searches the manual once you type (Section 5.4)
		paletteProviders: [
			{
				prefix: "?",
				title: "Help",
				placeholder: "Search the manual",
				provide: async (q: string, k: Kernel) => (q.trim() ? (await import("../manual/search")).paletteSearch(q, k) : helpProvider.provide(q, k))
			}
		],
		contextKeys: [{ key: "manual.window", type: "boolean", description: "This window shows the manual (the Manual window or the docs site)" }]
	},
	activate: () => import("../manual/activate.svelte")
});
