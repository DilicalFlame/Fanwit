/** Core commands shipped with every Fanwit app (Section 5.7) and their default keybindings. */
import type { CommandDefinition } from "../commands/types";
import type { Keybinding } from "../keys/keybindings.svelte";

const c = (id: string, title: string, category: string, extra: Partial<CommandDefinition> = {}): CommandDefinition => ({ id, title, category, ...extra });

export const coreCommands: CommandDefinition[] = [
	// palette
	c("palette.open", "Show all commands", "Palette", { icon: "square-terminal" }),
	c("palette.quickOpen", "Quick open", "Palette", { icon: "search" }),
	c("palette.help", "Palette help", "Palette", { icon: "circle-help" }),
	c("palette.windows", "Switch window", "Palette", { icon: "app-window" }),

	// app
	c("app.settings", "Open settings", "App", { icon: "settings", args: { page: { type: "string", required: false, description: "Settings page or @filter" } }, cli: true, uri: true }),
	c("app.about", "About", "App", { icon: "info", cli: true }),
	c("app.quit", "Quit", "App", { icon: "power", cli: true }),
	c("app.reload", "Reload all windows", "App", { icon: "rotate-cw" }),
	c("app.show", "Show main window", "App", { icon: "app-window" }),
	c("app.quickCapture", "Quick capture", "App", { icon: "zap" }),
	c("app.copySystemInfo", "Copy system info", "App", { icon: "clipboard-copy" }),
	c("app.diagnostics", "Create diagnostics bundle", "App", { icon: "package" }),
	c("app.onboarding", "Show first run tour", "App", { icon: "sparkles" }),
	c("app.checkForUpdates", "Check for updates", "App", { icon: "download", cli: true }),
	c("app.openPaths", "Open files or folders", "App", { args: { paths: { type: "json", description: "List of paths or deep links" } }, palette: false }),
	c("app.version", "Show version", "App", { cli: true, palette: false, runtime: "any" }),
	c("app.print", "Print", "App", { icon: "printer" }),
	c("app.exportConfig", "Export configuration", "App", { icon: "download", description: "Settings, keybindings, menus and user commands as one file", cli: true }),
	c("app.importConfig", "Import configuration", "App", { icon: "upload", args: { data: { type: "json", description: "A configuration exported by Export configuration" } }, cli: true }),
	c("commands.list", "List commands", "App", { cli: true, palette: false, runtime: "any" }),

	// windows
	c("window.new", "New window", "Window", { icon: "app-window" }),
	c("window.close", "Close window", "Window", { icon: "x" }),
	c("window.open", "Open window kind", "Window", { args: { kind: { type: "ref", ref: "window" }, props: { type: "json", required: false } }, cli: true }),
	c("window.popOut", "Pop out tab into a window", "Window", { icon: "square-arrow-out-up-right", when: "activeTab" }),
	c("window.minimize", "Minimize", "Window"),
	c("window.toggleMaximize", "Toggle maximize", "Window"),
	c("window.toggleFullscreen", "Toggle full screen", "Window", { icon: "maximize" }),
	c("window.cycle", "Cycle virtual windows", "Window", { visibleWhen: "!host.nativeWindows" }),
	c("window.list", "List windows", "Window", { cli: true, palette: false }),

	// layout
	c("layout.splitRight", "Split right", "Layout", { icon: "columns-2" }),
	c("layout.splitDown", "Split down", "Layout", { icon: "rows-2" }),
	c("layout.togglePrimarySidebar", "Toggle primary sidebar", "Layout", { icon: "panel-left" }),
	c("layout.toggleSecondarySidebar", "Toggle secondary sidebar", "Layout", { icon: "panel-right" }),
	c("layout.togglePanel", "Toggle panel", "Layout", { icon: "panel-bottom" }),
	c("layout.toggleZen", "Toggle zen mode", "Layout", { icon: "focus", toggled: "layout.zen" }),
	c("layout.maximizeTabset", "Maximize tab set", "Layout", { icon: "maximize-2", toggled: "layout.maximized" }),
	c("layout.equalize", "Equalize sizes", "Layout"),
	c("layout.applyPreset", "Apply layout preset", "Layout", { icon: "layout-template", args: { preset: { type: "ref", ref: "preset" } }, cli: true, undoable: true }),
	c("layout.reset", "Reset layout", "Layout", { icon: "rotate-ccw", cli: true }),
	c("layout.openToml", "Open workspace.toml", "Layout", { icon: "file-code" }),
	c("layout.openView", "Open view", "Layout", { args: { view: { type: "ref", ref: "view" }, region: { type: "string", required: false }, props: { type: "json", required: false } }, cli: true }),
	c("layout.focusNextRegion", "Focus next region", "Layout"),
	c("layout.focusPreviousRegion", "Focus previous region", "Layout"),
	c("layout.saveWorkspace", "Save workspace as", "Layout", { args: { name: { type: "string" } }, cli: true }),
	c("layout.loadWorkspace", "Load workspace", "Layout", { args: { name: { type: "string" } }, cli: true }),
	c("layout.floatPane", "Float tab", "Layout", { icon: "picture-in-picture-2", when: "activeTab" }),
	c("layout.moveToPanel", "Move tab to panel", "Layout", { when: "activeTab" }),

	// tabs
	c("tab.next", "Next tab", "Tabs"),
	c("tab.prev", "Previous tab", "Tabs"),
	c("tab.close", "Close tab", "Tabs", { icon: "x", when: "activeTab" }),
	c("tab.closeOthers", "Close other tabs", "Tabs", { when: "activeTab" }),
	c("tab.reopen", "Reopen closed tab", "Tabs", { icon: "undo-2" }),
	c("tab.pin", "Pin or unpin tab", "Tabs", { icon: "pin", when: "activeTab" }),
	c("tab.copyPath", "Copy path", "Tabs", { icon: "copy", when: "resource.path" }),

	// vaults
	c("vault.open", "Open folder as vault", "Vault", { icon: "folder-open", args: { path: { type: "path", kind: "folder", required: false } }, cli: true }),
	c("vault.create", "Create new vault", "Vault", { icon: "folder-plus", args: { name: { type: "string" }, template: { type: "enum", options: ["empty", "journal", "project"], default: "empty" } } }),
	c("vault.switch", "Switch vault", "Vault", { icon: "library" }),
	c("vault.close", "Close vault", "Vault", { when: "vault.open" }),
	c("vault.reveal", "Reveal vault folder", "Vault", { icon: "folder-search", when: "vault.open && host.nativeWindows" }),
	c("vault.openInNewWindow", "Open vault in new window", "Vault", { args: { path: { type: "path", kind: "folder" } } }),
	c("vault.backup", "Back up vault", "Vault", { icon: "archive", when: "vault.open", cli: true }),

	// themes
	c("theme.select", "Select color theme", "Theme", { icon: "palette", args: { theme: { type: "ref", ref: "theme" } }, cli: true }),
	c("theme.toggleMode", "Toggle light and dark", "Theme", { icon: "sun-moon" }),
	c("theme.setMode", "Set color mode", "Theme", { args: { mode: { type: "enum", options: ["light", "dark", "system"] } }, cli: true, uri: true }),
	c("theme.studio", "Open Theme Studio", "Theme", { icon: "swatch-book" }),

	// keys, menus
	c("keys.open", "Open keyboard shortcuts", "Keyboard", { icon: "keyboard" }),
	c("keys.showOverlay", "Show keyboard overlay", "Keyboard", { icon: "keyboard" }),
	c("menus.edit", "Open context menu editor", "Menus", { icon: "list-tree", args: { location: { type: "string", required: false }, item: { type: "string", required: false } } }),
	c("menus.resetAll", "Reset all menu customisations", "Menus", { confirm: { message: "Remove every menu customisation in menus.toml?", danger: true, okLabel: "Reset menus" } }),

	// notifications
	c("notify.toggleCenter", "Toggle notification centre", "Notifications", { icon: "bell" }),
	c("notify.clearAll", "Clear all notifications", "Notifications", { icon: "bell-off" }),
	c("notify.setDoNotDisturb", "Do not disturb", "Notifications", { icon: "bell-off", args: { minutes: { type: "number", min: 0, max: 1440, default: 60 } }, cli: true }),
	c("notify.send", "Send notification", "Notifications", { args: { title: { type: "string" }, body: { type: "string", required: false }, kind: { type: "enum", options: ["info", "success", "warning", "error"], default: "info" } }, cli: true, palette: false }),

	// history
	c("history.undo", "Undo", "Edit", { icon: "undo-2" }),
	c("history.redo", "Redo", "Edit", { icon: "redo-2" }),

	// clipboard and shell
	c("clipboard.copy", "Copy text", "Edit", { args: { text: { type: "string" } }, palette: false }),
	c("edit.cut", "Cut", "Edit", { icon: "scissors", palette: false }),
	c("edit.copy", "Copy", "Edit", { icon: "copy", palette: false }),
	c("edit.paste", "Paste", "Edit", { icon: "clipboard-paste", palette: false }),
	c("edit.selectAll", "Select all", "Edit", { icon: "text-select", palette: false }),
	c("shell.open", "Open with system app", "Shell", { args: { path: { type: "string" } }, palette: false }),
	c("shell.openExternal", "Open link in browser", "Shell", { args: { url: { type: "string" } }, palette: false }),

	// developer
	c("dev.toggleMode", "Toggle developer mode", "Developer", { icon: "code", toggled: "devMode" }),
	c("dev.inspect", "Inspect element", "Developer", { icon: "scan-search", when: "devMode" }),
	c("dev.logs", "Open log viewer", "Developer", { icon: "scroll-text" }),
	c("dev.console", "Open scripting console", "Developer", { icon: "terminal", when: "devMode" }),
	c("dev.recordMacro", "Record macro", "Developer", { icon: "circle-dot", toggled: "macro.recording" }),
	c("dev.reloadPlugins", "Reload plugins", "Developer", { icon: "refresh-cw" }),
	c("dev.openDevtools", "Open webview devtools", "Developer", { icon: "bug" }),
	c("dev.eventMonitor", "Open event monitor", "Developer", { icon: "activity" }),
	c("dev.commandLog", "Open command log", "Developer", { icon: "history" }),
	c("dev.contextKeys", "Show context keys", "Developer", { icon: "key-round" }),
	c("dev.crash", "Simulate a crash report", "Developer", { palette: false }),

	// manual
	c("manual.open", "Open manual", "Help", { icon: "book-open", args: { page: { type: "string", required: false } }, uri: true }),
	c("manual.search", "Search the manual", "Help", { icon: "book-search", args: { query: { type: "string" } } }),

	// plugins
	c("plugins.open", "Open plugin manager", "Plugins", { icon: "puzzle" })
];

/** Default bindings. Every core binding that collides with a browser reserved key has a web override. */
export const coreKeybindings: Keybinding[] = [
	{ key: "mod+shift+p", command: "palette.open" },
	{ key: "f1", command: "manual.open" },
	{ key: "mod+p", command: "palette.quickOpen" },
	{ key: "mod+,", command: "app.settings" },
	{ key: "mod+q", command: "app.quit", web: "" },
	{ key: "mod+shift+n", command: "window.new", web: "alt+shift+n" },
	{ key: "mod+shift+w", command: "window.close", web: "" },
	{ key: "mod+\\", command: "layout.splitRight" },
	{ key: "mod+k mod+\\", command: "layout.splitDown" },
	{ key: "mod+b", command: "layout.togglePrimarySidebar" },
	{ key: "mod+alt+b", command: "layout.toggleSecondarySidebar" },
	{ key: "mod+j", command: "layout.togglePanel" },
	{ key: "mod+k z", command: "layout.toggleZen" },
	{ key: "mod+shift+m", command: "layout.maximizeTabset" },
	{ key: "f6", command: "layout.focusNextRegion" },
	{ key: "shift+f6", command: "layout.focusPreviousRegion" },
	{ key: "ctrl+tab", command: "tab.next", web: "alt+]" },
	{ key: "ctrl+shift+tab", command: "tab.prev", web: "alt+[" },
	{ key: "mod+w", command: "tab.close", web: "alt+w" },
	{ key: "mod+shift+t", command: "tab.reopen", web: "alt+shift+t" },
	{ key: "mod+o", command: "vault.open" },
	{ key: "mod+k mod+o", command: "vault.switch" },
	{ key: "mod+k mod+t", command: "theme.select" },
	{ key: "mod+k mod+l", command: "theme.toggleMode" },
	{ key: "mod+k mod+s", command: "keys.open" },
	{ key: "ctrl+/", command: "keys.showOverlay" },
	{ key: "mod+z", command: "history.undo", when: "!inputFocus" },
	{ key: "mod+shift+z", command: "history.redo", when: "!inputFocus" },
	{ key: "mod+y", command: "history.redo", when: "!inputFocus && platform != 'macos'" },
	{ key: "mod+alt+i", command: "dev.inspect", when: "devMode" },
	{ key: "mod+shift+j", command: "dev.console", when: "devMode" },
	{ key: "mod+shift+u", command: "dev.logs" },
	{ key: "alt+`", command: "window.cycle", when: "!host.nativeWindows" },
	{ key: "ctrl+alt+space", command: "app.quickCapture", global: true },
	{ key: "f11", command: "window.toggleFullscreen" }
];
