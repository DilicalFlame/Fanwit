/**
 * Core modules. Everything in Fanwit, including the core systems, is a module: contributions
 * are data read at boot; activate() wires handlers. Optional feature modules can be switched
 * off in app.config.ts (`features`).
 */
import { defineModule, type ModuleDefinition } from "../kernel/module";
import type { AppConfig } from "../config";
import { coreCommands, coreKeybindings } from "./commands";
import { coreSettings } from "./settings";
import { coreLocations, coreMenus } from "./menus";
import { activateCore } from "./handlers.svelte";
import { builtinProviders } from "./palette";
import type { ViewContribution } from "../layout/views";
import type { WindowKindSpec } from "../windows/windows.svelte";
import type { MenuItemKind } from "../menus/menus.svelte";
import { attachCliBridge } from "./cli";
import { labsModule } from "./labs";
import { devtoolsModule } from "./devtools";
import { manualModule } from "./manual";
import { pluginsModule } from "./plugins";
import { explorerModule } from "./explorer";
import presetVscode from "../layout/presets/vscode.toml?raw";
import Toggle from "../workbench/menus/kinds/Toggle.svelte";
import IconRow from "../workbench/menus/kinds/IconRow.svelte";
import Segmented from "../workbench/menus/kinds/Segmented.svelte";
import Slider from "../workbench/menus/kinds/Slider.svelte";
import Stepper from "../workbench/menus/kinds/Stepper.svelte";
import Input from "../workbench/menus/kinds/Input.svelte";
import ColorSwatches from "../workbench/menus/kinds/ColorSwatches.svelte";
import Progress from "../workbench/menus/kinds/Progress.svelte";
import List from "../workbench/menus/kinds/List.svelte";

const v = (id: string, title: ViewContribution["title"], icon: string, component: ViewContribution["component"], extra: Partial<ViewContribution> = {}): ViewContribution => ({ id, title, icon, component, ...extra });

export const coreViews: ViewContribution[] = [
	v("fanwit.welcome", "Welcome", "house", () => import("../views/Welcome.svelte"), { singleton: true, help: "getting-started" }),
	v("fanwit.explorer", "Explorer", "files", () => import("../views/Explorer.svelte"), { regions: ["sidebar"], singleton: true, help: "vaults" }),
	v("fanwit.outline", "Outline", "list-tree", () => import("../views/Outline.svelte"), { regions: ["sidebar", "inspector"], singleton: true }),
	v("fanwit.search", "Search", "search", () => import("../views/Search.svelte"), { regions: ["sidebar"], singleton: true }),
	v("fanwit.commandList", "Commands", "square-terminal", () => import("../views/CommandList.svelte"), { regions: ["sidebar"], singleton: true, help: "commands" }),
	v("fanwit.properties", "Properties", "sliders-horizontal", () => import("../views/Properties.svelte"), { regions: ["inspector"], singleton: true }),
	v("fanwit.contextKeys", "Context keys", "key-round", () => import("../views/ContextKeys.svelte"), { regions: ["inspector"], singleton: true, category: "Developer", help: "context-keys" }),
	v("fanwit.logs", "Logs", "scroll-text", () => import("../views/Logs.svelte"), { regions: ["panel"], singleton: true, category: "Developer", help: "logging" }),
	v("fanwit.problems", "Problems", "circle-alert", () => import("../views/Problems.svelte"), { regions: ["panel"], singleton: true }),
	v("fanwit.jobs", "Jobs", "list-checks", () => import("../views/Jobs.svelte"), { regions: ["panel"], singleton: true }),
	v("fanwit.tomlEditor", (p: Record<string, unknown>) => `${String(p.file ?? "workspace")}.toml`, "file-code", () => import("../views/TomlEditor.svelte"), { identity: (p) => String(p.file ?? "workspace"), help: "toml" }),
	v("fanwit.textEditor", (p: Record<string, unknown>) => String(p.path ?? "Untitled").split("/").pop()!, "file-text", () => import("../views/TextEditor.svelte"), { identity: (p) => String(p.path), opens: ["*"] }),
	v("fanwit.settings", "Settings", "settings", () => import("../views/settings/Settings.svelte"), { singleton: true, help: "settings" }),
	v("fanwit.vaultManager", "Vaults", "library", () => import("../views/VaultManager.svelte"), { singleton: true, help: "vaults" }),
	v("fanwit.onboarding", "Welcome", "sparkles", () => import("../views/Onboarding.svelte"), { singleton: true }),
	v("fanwit.about", "About", "info", () => import("../views/system/About.svelte"), { singleton: true }),
	v("fanwit.update", "Update", "download", () => import("../views/system/Update.svelte"), { singleton: true }),
	v("fanwit.crash", "Crash report", "bug", () => import("../views/system/Crash.svelte"), { singleton: true }),
	v("fanwit.quickCapture", "Quick capture", "zap", () => import("../views/QuickCapture.svelte"), { singleton: true }),
	v("fanwit.menuEditor", "Context Menu Editor", "list-tree", () => import("../views/menu-editor/MenuEditor.svelte"), { singleton: true, help: "context-menus" }),
	v("fanwit.themeStudio", "Theme Studio", "swatch-book", () => import("../views/ThemeStudio.svelte"), { singleton: true, help: "themes", category: "Labs", description: "Generate a theme from one colour; check contrast" })
];

export const coreWindows: WindowKindSpec[] = [
	{ kind: "settings", base: "aux", view: "fanwit.settings", title: "Settings", size: [980, 680], minSize: [640, 420], instance: "single" },
	{ kind: "vaults", base: "aux", view: "fanwit.vaultManager", title: "Vaults", size: [760, 520], resizable: true, instance: "single", web: "modal" },
	{ kind: "onboarding", base: "aux", view: "fanwit.onboarding", title: "Welcome", size: [760, 560], instance: "single", web: "modal" },
	{ kind: "about", base: "child", view: "fanwit.about", title: "About", size: [420, 360], resizable: false, focus: "takeover", onBlocked: [] },
	{ kind: "update", base: "child", view: "fanwit.update", title: "Update", size: [480, 420], focus: "takeover" },
	{ kind: "crash", base: "child", view: "fanwit.crash", title: "Crash report", size: [480, 380], focus: "takeover" },
	{ kind: "quick-capture", base: "palette", view: "fanwit.quickCapture", title: "Quick capture", size: [560, 150], position: "cursor", decorations: "none", instance: "single" },
	{ kind: "menu-editor", base: "aux", view: "fanwit.menuEditor", title: "Context Menu Editor", size: [1200, 760], minSize: [800, 500], instance: "single" },
	{ kind: "theme-studio", base: "aux", view: "fanwit.themeStudio", title: "Theme Studio", size: [1200, 760], instance: "single" },
	/** Popped out panes: a layout window rendering its own tree. */
	{ kind: "view", base: "aux", view: "layout", title: "Fanwit", size: [900, 640], instance: "per-identity", route: "view" }
];

const builtinKinds: MenuItemKind[] = [
	{ kind: "toggle", title: "Toggle", description: "Row with a switch", component: Toggle, keyboard: "row", role: "menuitemcheckbox", nativeFallback: "action", props: { label: { type: "string", required: false } } },
	{ kind: "icon-row", title: "Icon row", description: "Quick actions as icon buttons", component: IconRow, keyboard: "grid", role: "group", nativeFallback: "submenu", props: { items: { type: "json", description: "[{ icon, label, command, args }]" } } },
	{ kind: "segmented", title: "Segmented", description: "Exclusive choice bound to a value", component: Segmented, keyboard: "grid", role: "radiogroup", nativeFallback: "submenu", props: { label: { type: "string", required: false }, options: { type: "json" }, valueFrom: { type: "string", required: false } } },
	{ kind: "slider", title: "Slider", description: "Live value with a preview command", component: Slider, keyboard: "slider", role: "group", nativeFallback: "hidden", props: { label: { type: "string", required: false }, min: { type: "number", default: 0 }, max: { type: "number", default: 100 }, step: { type: "number", default: 1 }, unit: { type: "string", required: false }, valueFrom: { type: "string", required: false } } },
	{ kind: "stepper", title: "Stepper", description: "Minus, value, plus", component: Stepper, keyboard: "grid", role: "group", nativeFallback: "hidden", props: { label: { type: "string", required: false }, min: { type: "number", default: 0 }, max: { type: "number", default: 100 }, step: { type: "number", default: 1 }, unit: { type: "string", required: false }, valueFrom: { type: "string", required: false } } },
	{ kind: "input", title: "Text input", description: "Inline field; Enter runs with { text }", component: Input, keyboard: "input", role: "group", nativeFallback: "hidden", props: { label: { type: "string", required: false }, placeholder: { type: "string", required: false } } },
	{ kind: "color-swatches", title: "Colour swatches", description: "Grid of colour circles with recent and custom colours", component: ColorSwatches, keyboard: "grid", role: "group", nativeFallback: "submenu", props: { label: { type: "string", default: "Colour" }, palette: { type: "enum", options: ["theme", "brand", "grey", "custom"], default: "theme" }, columns: { type: "number", default: 8 }, recent: { type: "boolean", default: true }, allowCustom: { type: "boolean", default: true } }, emits: { color: { type: "color" } } },
	{ kind: "progress", title: "Progress", description: "Read only progress row", component: Progress, keyboard: "none", role: "progressbar", nativeFallback: "hidden", props: { label: { type: "string", required: false }, value: { type: "number", default: 0.5 } } },
	{ kind: "list", title: "List", description: "Dynamic list with a filter box", component: List, keyboard: "row", role: "group", nativeFallback: "submenu", props: { items: { type: "json" }, searchable: { type: "boolean", default: false } } }
];

const preset = (id: string, title: string, text: string, description: string) => ({ id, title, text, description });

export const coreModule = defineModule({
	id: "fanwit.core",
	title: "Fanwit core",
	tier: "core",
	activationEvents: ["onStartup"],
	contributes: {
		commands: [
			...coreCommands,
			{ id: "fanwit.setDensity", title: "Set density", category: "View", palette: false, args: { value: { type: "enum", options: ["compact", "comfortable", "spacious"] } } },
			{ id: "fanwit.setZoom", title: "Set zoom", category: "View", palette: false, args: { value: { type: "number", min: 50, max: 200 } } },
			{ id: "fanwit.notificationRead", title: "Mark notification read", palette: false, args: { id: { type: "string" } } },
			{ id: "fanwit.notificationSnooze", title: "Snooze notification", palette: false, args: { id: { type: "string" }, ms: { type: "number" } } },
			{ id: "fanwit.notificationRemove", title: "Remove notification", palette: false, args: { id: { type: "string" } } },
			{ id: "fanwit.createMenuHere", title: "Edit this menu", palette: false, args: { location: { type: "string" } } },
			{ id: "fanwit.inspectAt", title: "Inspect element at point", palette: false, args: { x: { type: "number" }, y: { type: "number" } } },
			{ id: "fanwit.openSource", title: "Open component source", palette: false, args: { file: { type: "string" }, line: { type: "number", default: 1 } } }
		],
		keybindings: coreKeybindings,
		settings: coreSettings,
		views: coreViews,
		windows: coreWindows,
		menuLocations: [...coreLocations, { id: "activity/manage", description: "The gear at the bottom of the activity bar" }, { id: "menubar/recent" }, { id: "menubar/presets" }],
		menus: {
			...coreMenus,
			"activity/manage": [
				{ id: "manage.palette", command: "palette.open", group: "navigation", order: 1 },
				{ id: "manage.settings", command: "app.settings", group: "navigation", order: 2 },
				{ id: "manage.keys", command: "keys.open", group: "navigation", order: 3 },
				{ id: "manage.menus", command: "menus.edit", group: "navigation", order: 4 },
				{ id: "manage.theme", command: "theme.select", group: "style", order: 1 },
				{ id: "manage.studio", command: "theme.studio", group: "style", order: 2 },
				{ id: "manage.plugins", command: "plugins.open", group: "other", order: 1 },
				{ id: "manage.vaults", command: "vault.switch", group: "other", order: 2 },
				{ id: "manage.dev", command: "dev.toggleMode", group: "dev", order: 1, kind: "checkbox" }
			]
		},
		menuKinds: builtinKinds,
		paletteProviders: builtinProviders,
		notificationChannels: [
			{ id: "default", title: "General" },
			{ id: "system", title: "System", description: "Updates, crashes and vault problems" },
			{ id: "jobs", title: "Background jobs" }
		],
		// the app's default; more showcases (Figma, Blender, Discord...) live in src/app/modules/showcase
		layoutPresets: [preset("vscode", "VS Code", presetVscode, "Activity bar, switchable sidebars, tabbed editor groups, bottom panel")],

		contextKeys: [
			{ key: "vault.open", type: "boolean", description: "A vault is open" },
			{ key: "vault.name", type: "string", description: "Name of the open vault" },
			{ key: "focusedView", type: "string", description: "Id of the focused view" },
			{ key: "activeTab", type: "string", description: "View id of the active tab" },
			{ key: "resource.ext", type: "string", description: "Extension of the file in the active tab" },
			{ key: "resource.path", type: "string", description: "Vault path of the file in the active tab" },
			{ key: "selection.count", type: "number", description: "App defined selection size" },
			{ key: "layout.maximized", type: "boolean", description: "A tab set is maximised" },
			{ key: "layout.zen", type: "boolean", description: "Zen mode" },
			{ key: "window.focused", type: "boolean", description: "This window has focus" },
			{ key: "menu.target", type: "string", description: "Location of the open context menu" }
		]
	},
	activate(ctx) {
		const k = ctx.kernel;
		activateCore(ctx);
		const { settings, notify, menus, layout, vault } = k.sys;
		ctx.commands.handle("fanwit.setDensity", ({ value }: { value: string }) => settings.set("ui.density", value));
		ctx.commands.handle("fanwit.setZoom", ({ value }: { value: number }) => settings.set("ui.zoom", value));
		ctx.commands.handle("fanwit.notificationRead", ({ id }: { id: string }) => notify.markRead(id));
		ctx.commands.handle("fanwit.notificationSnooze", ({ id, ms }: { id: string; ms: number }) => notify.snooze(id, ms));
		ctx.commands.handle("fanwit.notificationRemove", ({ id }: { id: string }) => notify.remove(id));
		ctx.commands.handle("fanwit.createMenuHere", ({ location }: { location: string }) => {
			menus.createUserLocation(location, `Created in developer mode for ${location.replace(/^auto\//, "")}`);
			return k.commands.run("menus.edit", { location });
		});
		ctx.commands.handle("fanwit.inspectAt", ({ x, y }: { x: number; y: number }) => k.events.emit("fw:inspect-at" as never, { x, y } as never));
		ctx.commands.handle("fanwit.openSource", async ({ file, line }: { file: string; line: number }) => {
			// dev builds: ask the Vite dev server to open the file in the configured editor
			const editor = settings.get<string>("dev.editor");
			await fetch(`/__open-in-editor?file=${encodeURIComponent(`${file}:${line}`)}${editor ? `&editor=${encodeURIComponent(editor)}` : ""}`).catch(() => notify.toast(`${file}:${line}`));
		});
		ctx.subscriptions.push(
			menus.registerProvider("recentVaults", () => vault.recentList.slice(0, 10).map((r) => ({ id: `recent:${r.path}`, label: r.name, description: r.path, icon: "library", command: "vault.open", args: { path: r.path } }))),
			menus.registerProvider("layoutPresets", () => [...layout.presets.values()].map((p) => ({ id: `preset:${p.id}`, label: p.title, description: p.description, icon: "layout-template", command: "layout.applyPreset", args: { preset: p.id } }))),
			menus.registerProvider("openWindows", async () => (await k.host.windows.list().catch(() => [])).filter((l) => l !== k.host.windows.label).map((l) => ({ id: `win:${l}`, label: l, icon: "app-window", command: "fanwit.focusWindow", args: { label: l } })))
		);
		ctx.commands.register({ id: "fanwit.menuDemo", title: "Menu demo", palette: false }, (args: Record<string, unknown>) => k.sys.notify.toast(`Menu item emitted ${JSON.stringify(args)}`));
		ctx.commands.register({ id: "fanwit.focusWindow", title: "Focus window", palette: false, args: { label: { type: "string" } } }, ({ label }: { label: string }) => k.host.windows.focus(label));
		if (k.windowKind === "main" && k.host.windows.label === "main") attachCliBridge(k);
	}
});

export function coreModules(features: NonNullable<AppConfig["features"]>): ModuleDefinition[] {
	const list: ModuleDefinition[] = [coreModule, explorerModule];
	if (features.labs !== false) list.push(labsModule);
	if (features.devtools !== false) list.push(devtoolsModule);
	if (features.manual !== false) list.push(manualModule);
	if (features.plugins !== false) list.push(pluginsModule);
	return list;
}
