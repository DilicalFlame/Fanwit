/** Built in settings categories (Section 13.5). */
import { defineSettings, s } from "../settings/define";

export const coreSettings = [
	defineSettings("general", {
		language: s.enum("en", ["en", "hi", "de", "ja", "ar", "pseudo"], {
			title: "Language",
			description: "Interface language. `pseudo` expands and accents text to test layouts.",
			category: "General",
			labels: { en: "English", hi: "हिन्दी", de: "Deutsch", ja: "日本語", ar: "العربية", pseudo: "Pseudo locale" }
		}),
		"startup.restoreVault": s.boolean(true, { title: "Reopen the last vault on start", category: "General" }),
		"startup.showWelcome": s.boolean(true, { title: "Show the welcome tab on start", category: "General" }),
		confirmQuit: s.boolean(false, { title: "Confirm before quitting", category: "General" }),
		autostart: s.boolean(false, { title: "Start at login", description: "Starts hidden in the tray (desktop only).", category: "General", scope: ["global"] }),
		"update.check": s.boolean(true, { title: "Check for updates automatically", category: "Privacy and Updates" })
	}),
	defineSettings("theme", {
		mode: s.enum("system", ["light", "dark", "system"], {
			title: "Mode",
			description: "Follow the operating system or force a mode.",
			category: "Appearance",
			widget: "segmented",
			labels: { light: "Light", dark: "Dark", system: "System" },
			scope: ["global", "vault", "window"]
		}),
		light: s.string("fanwit-default", { title: "Light theme", description: "Theme used in light mode.", category: "Appearance", widget: "theme" }),
		dark: s.string("fanwit-default", { title: "Dark theme", description: "Theme used in dark mode.", category: "Appearance", widget: "theme" })
	}),
	defineSettings("ui", {
		fontSize: s.number(13, { title: "UI font size", description: "Base size for all interface text.", category: "Appearance", min: 10, max: 20, step: 1, unit: "px", widget: "slider" }),
		density: s.enum("comfortable", ["compact", "comfortable", "spacious"], {
			title: "Density",
			description: "Spacing of controls and lists.",
			category: "Appearance",
			widget: "segmented",
			labels: { compact: "Compact", comfortable: "Comfortable", spacious: "Spacious" }
		}),
		zoom: s.number(100, { title: "Zoom", description: "Scale the whole interface.", category: "Appearance", min: 50, max: 200, step: 10, unit: "%", widget: "slider" }),
		reducedMotion: s.boolean(false, { title: "Reduce motion", description: "Replace movement with fades. The OS setting is always honoured.", category: "Appearance" }),
		haptics: s.boolean(true, { title: "Haptic feedback", description: "Short vibrations on devices that have them (phones and tablets running the web app).", category: "Appearance" }),
		effects: s.enum("none", ["none", "mica", "acrylic", "vibrancy"], { title: "Window effects", description: "Mica or acrylic background on Windows 11, vibrancy on macOS.", category: "Appearance", restart: true })
	}),
	defineSettings("layout", {
		dockIndicator: s.enum("edges", ["edges", "compass"], {
			title: "Docking indicator",
			description: "How drop targets are shown while dragging tabs.",
			category: "Layout and Windows",
			widget: "segmented",
			labels: { edges: "Edge zones", compass: "Compass" }
		}),
		previewTabs: s.boolean(true, { title: "Preview tabs", description: "Single click opens a temporary italic tab that the next preview replaces.", category: "Layout and Windows" }),
		closeButton: s.enum("right", ["right", "left", "hidden"], { title: "Tab close button", category: "Layout and Windows" }),
		titlebar: s.enum("custom", ["custom", "native"], { title: "Title bar style", category: "Layout and Windows", restart: true }),
		rememberPerVault: s.boolean(true, { title: "Remember window state per vault", category: "Layout and Windows" })
	}),
	defineSettings("keys", {
		chordTimeout: s.number(2000, { title: "Chord timeout", description: "How long a pending chord waits for the next key.", category: "Keyboard", min: 500, max: 5000, step: 100, unit: "ms" }),
		overlayTrigger: s.enum("ctrl+/", ["ctrl+/", "hold-mod", "off"], { title: "Keyboard overlay", description: "Shows the bindings available here.", category: "Keyboard" }),
		style: s.enum("default", ["default", "vscode", "sublime"], { title: "Keymap preset", category: "Keyboard" })
	}),
	defineSettings("menus", {
		menubar: s.enum("custom", ["custom", "native"], { title: "Menu bar style", description: "Native menus are always used on macOS.", category: "Menus" }),
		autoScrollSpeed: s.number(0.25, { title: "Auto scroll smoothing", description: "Pointer position auto scroll for long menus.", category: "Menus", min: 0.05, max: 1, step: 0.05, widget: "slider" }),
		editableInProduction: s.boolean(false, { title: "Edit menus in production builds", description: "Requires data-fw-id on elements.", category: "Menus" })
	}),
	defineSettings("notify", {
		dnd: s.boolean(false, { title: "Do not disturb", description: "Only urgent notifications reach the OS; everything else goes to the centre.", category: "Notifications" }),
		quietHours: s.string("", { title: "Quiet hours", description: "For example 22:00-07:00.", category: "Notifications", placeholder: "22:00-07:00" }),
		toastPosition: s.enum("bottom-right", ["bottom-right", "bottom-left", "top-right", "top-left"], { title: "Toast position", category: "Notifications" }),
		channels: s.json({}, { title: "Channels", description: "Per channel overrides: enabled, toast, os, sound, minPriority.", category: "Notifications" }),
		retentionDays: s.number(30, { title: "Keep history for", category: "Notifications", min: 1, max: 365, unit: "days" })
	}),
	defineSettings("vault", {
		defaultLocation: s.path("", { title: "Default vault location", category: "Vault and Data", kind: "folder" }),
		trash: s.enum("os", ["os", "vault"], { title: "Deleted files go to", category: "Vault and Data", labels: { os: "System trash", vault: ".trash in the vault" } }),
		backupSchedule: s.enum("off", ["off", "daily", "weekly"], { title: "Backups", category: "Vault and Data" }),
		cacheSize: s.number(512, { title: "Cache size limit", category: "Vault and Data", min: 64, max: 8192, unit: "MB" })
	}),
	defineSettings("plugins", {
		safeMode: s.boolean(false, { title: "Safe mode", description: "Disable all code plugins (start with --safe-mode for one session).", category: "Plugins", restart: true }),
		allowCode: s.boolean(false, {
			title: "Allow community code plugins",
			description: "Plugins with isolation = \"none\" run in the app's own realm. Their permissions are a contract, not a sandbox.",
			category: "Plugins"
		}),
		allowUnsigned: s.boolean(false, { title: "Allow unsigned plugins", category: "Plugins" }),
		autoUpdate: s.boolean(false, { title: "Update plugins automatically", category: "Plugins" })
	}),
	defineSettings("update", {
		channel: s.enum("stable", ["stable", "beta"], { title: "Update channel", category: "Privacy and Updates" }),
		crashReports: s.boolean(false, { title: "Share crash reports", description: "Off by default. Reports never leave this computer unless you send them.", category: "Privacy and Updates" })
	}),
	defineSettings("dev", {
		mode: s.boolean(false, { title: "Developer mode", description: "Inspect, edit and export any menu, layout, binding or theme.", category: "Developer", scope: ["global", "vault", "window"] }),
		ipcTimings: s.boolean(false, { title: "Show IPC timings", category: "Developer" }),
		reloadOnChange: s.boolean(true, { title: "Reload modules on change", category: "Developer" }),
		editor: s.string("code", { title: "Source editor command", description: "Used by Open component source (code, cursor, idea…).", category: "Developer" })
	}),
	defineSettings("log", {
		level: s.enum("info", ["trace", "debug", "info", "warn", "error"], { title: "Log level", category: "Developer" }),
		levels: s.json({}, { title: "Log levels per scope", description: 'For example { layout = "trace" }.', category: "Developer" })
	})
];

export const CATEGORY_ORDER = [
	"General",
	"Appearance",
	"Layout and Windows",
	"Keyboard",
	"Menus",
	"Notifications",
	"Vault and Data",
	"Plugins",
	"Privacy and Updates",
	"Developer",
	"About"
];
