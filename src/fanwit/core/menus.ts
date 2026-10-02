/** Core menu locations and contributions (Sections 7.2, 7.8). */
import type { MenuItem, MenuLocation } from "../menus/menus.svelte";

export const coreLocations: MenuLocation[] = [
	{ id: "tab/context", description: "Right click on a tab", target: "Tab", samples: [{ pane: "welcome", view: "fanwit.welcome" }] },
	{ id: "explorer/item", description: "Right click on a file or folder in the explorer", target: "FileEntry", samples: [{ path: "notes/today.md", dir: "notes", name: "today.md", isDir: false }] },
	{ id: "explorer/empty", description: "Right click on empty space in the explorer", target: "Folder" },
	{ id: "editor/context", description: "Right click in an editor view", target: "Editor" },
	{ id: "text/context", description: "Right click in any text input", target: "TextInput" },
	{ id: "titlebar/app", description: "The app mark in the title bar" },
	{ id: "menubar/file", description: "Menu bar: File" },
	{ id: "menubar/edit", description: "Menu bar: Edit" },
	{ id: "menubar/view", description: "Menu bar: View" },
	{ id: "menubar/go", description: "Menu bar: Go" },
	{ id: "menubar/window", description: "Menu bar: Window" },
	{ id: "menubar/help", description: "Menu bar: Help" },
	{ id: "statusbar/item", description: "Right click on the status bar" },
	{ id: "activity/item", description: "Right click on an activity bar item", target: "ViewContainer" },
	{ id: "view/title", description: "Actions in a view's header", target: "Pane" },
	{ id: "notification/item", description: "A notification in the centre", target: "Notification" },
	{ id: "workbench/empty", description: "Empty tab set (no panes open)" },
	{ id: "tray", description: "The tray icon menu (always native)" }
];

const cmd = (command: string, group: string, order: number, extra: Partial<MenuItem> = {}): MenuItem => ({ id: command, command, group, order, ...extra });

export const coreMenus: Record<string, MenuItem[]> = {
	"tab/context": [
		cmd("tab.close", "navigation", 1, { args: { pane: "${target.pane}" } }),
		cmd("tab.closeOthers", "navigation", 2),
		cmd("tab.reopen", "navigation", 3),
		cmd("tab.pin", "modify", 1),
		cmd("tab.copyPath", "clipboard", 1, { id: "tab.copyRelativePath" }),
		cmd("layout.splitRight", "window", 1),
		cmd("layout.splitDown", "window", 2),
		cmd("layout.floatPane", "window", 3),
		cmd("window.popOut", "window", 4),
		cmd("layout.moveToPanel", "window", 5),
		cmd("layout.maximizeTabset", "view", 1)
	],
	"text/context": [
		cmd("edit.cut", "clipboard", 1, { when: "textSelected" }),
		cmd("edit.copy", "clipboard", 2, { when: "textSelected" }),
		cmd("edit.paste", "clipboard", 3),
		cmd("edit.selectAll", "edit", 1)
	],
	"titlebar/app": [
		cmd("palette.open", "navigation", 1),
		cmd("vault.switch", "navigation", 2),
		cmd("app.settings", "app", 1),
		cmd("app.about", "app", 2),
		cmd("app.quit", "danger", 1)
	],
	"menubar/file": [
		cmd("vault.open", "open", 1),
		cmd("vault.create", "open", 2),
		cmd("vault.switch", "open", 3),
		{ id: "file.recent", kind: "submenu", group: "open", order: 4, label: "Open recent", icon: "history", provider: undefined, submenu: "menubar/recent" },
		cmd("window.new", "window", 1),
		cmd("app.settings", "other", 1),
		cmd("vault.close", "other", 2),
		cmd("window.close", "danger", 1),
		cmd("app.quit", "danger", 2)
	],
	"menubar/recent": [{ id: "recent.vaults", provider: "recentVaults", group: "navigation" }],
	"menubar/edit": [cmd("history.undo", "edit", 1), cmd("history.redo", "edit", 2), cmd("edit.cut", "clipboard", 1), cmd("edit.copy", "clipboard", 2), cmd("edit.paste", "clipboard", 3), cmd("palette.open", "navigation", 1)],
	"menubar/view": [
		cmd("palette.open", "navigation", 1),
		cmd("layout.togglePrimarySidebar", "view", 1, { kind: "checkbox" }),
		cmd("layout.toggleSecondarySidebar", "view", 2),
		cmd("layout.togglePanel", "view", 3),
		cmd("layout.toggleZen", "view", 4),
		cmd("layout.maximizeTabset", "view", 5),
		{ id: "view.presets", kind: "submenu", group: "arrange", order: 1, label: "Layout preset", icon: "layout-template", submenu: "menubar/presets" },
		cmd("layout.openToml", "arrange", 2),
		cmd("layout.reset", "arrange", 3),
		cmd("theme.toggleMode", "style", 1),
		cmd("theme.select", "style", 2),
		{ id: "view.density", kind: "segmented", group: "style", order: 3, command: "fanwit.setDensity", props: { label: "Density", options: [{ value: "compact", label: "Compact" }, { value: "comfortable", label: "Default" }, { value: "spacious", label: "Spacious" }], valueFrom: "config.ui.density" } },
		{ id: "view.zoom", kind: "stepper", group: "style", order: 4, command: "fanwit.setZoom", props: { label: "Zoom", min: 50, max: 200, step: 10, unit: "%", valueFrom: "config.ui.zoom" } },
		cmd("window.toggleFullscreen", "window", 1)
	],
	"menubar/presets": [{ id: "presets.list", provider: "layoutPresets", group: "navigation" }],
	"menubar/go": [cmd("palette.quickOpen", "navigation", 1), cmd("tab.next", "navigation", 2), cmd("tab.prev", "navigation", 3), cmd("tab.reopen", "navigation", 4), cmd("layout.focusNextRegion", "view", 1)],
	"menubar/window": [cmd("window.new", "window", 1), cmd("window.minimize", "window", 2), cmd("window.toggleMaximize", "window", 3), cmd("window.popOut", "window", 4), { id: "window.list", provider: "openWindows", group: "navigation" }],
	"menubar/help": [
		cmd("manual.open", "navigation", 1),
		cmd("palette.help", "navigation", 2),
		cmd("keys.showOverlay", "navigation", 3),
		cmd("keys.open", "navigation", 4),
		cmd("dev.toggleMode", "dev", 1, { kind: "checkbox" }),
		cmd("dev.logs", "dev", 2),
		cmd("app.diagnostics", "dev", 3),
		cmd("app.checkForUpdates", "other", 1),
		cmd("app.about", "other", 2)
	],
	"statusbar/item": [cmd("notify.toggleCenter", "navigation", 1), cmd("layout.togglePanel", "view", 1), cmd("theme.toggleMode", "view", 2)],
	"activity/item": [cmd("layout.togglePrimarySidebar", "view", 1)],
	"notification/item": [
		{ id: "notification.read", command: "fanwit.notificationRead", group: "navigation", order: 1, label: "Mark as read", args: { id: "${target.id}" } },
		{ id: "notification.snooze1h", command: "fanwit.notificationSnooze", group: "modify", order: 1, label: "Snooze for 1 hour", args: { id: "${target.id}", ms: 3600000 } },
		{ id: "notification.snoozeTomorrow", command: "fanwit.notificationSnooze", group: "modify", order: 2, label: "Snooze until tomorrow", args: { id: "${target.id}", ms: 86400000 } },
		{ id: "notification.remove", command: "fanwit.notificationRemove", group: "danger", order: 1, label: "Remove", args: { id: "${target.id}" } }
	],
	"workbench/empty": [cmd("palette.quickOpen", "navigation", 1), cmd("palette.open", "navigation", 2), cmd("vault.open", "open", 1), cmd("layout.reset", "arrange", 1)],
	tray: [cmd("app.show", "navigation", 1), cmd("app.quickCapture", "navigation", 2), cmd("vault.switch", "navigation", 3), cmd("app.quit", "danger", 1)]
};
