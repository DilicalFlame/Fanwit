import { expect, test } from "vitest";
import { ContextKeyService } from "../kernel/context.svelte";
import { LogService } from "../kernel/logger";
import { HistoryService } from "../commands/history.svelte";
import { CommandService } from "../commands/registry.svelte";
import { createMemoryHost } from "../host/memory";
import { KeybindingService } from "./keybindings.svelte";

function keys(platform: "windows" | "macos" = "windows") {
	const context = new ContextKeyService();
	const log = new LogService().scoped("keys");
	const commands = new CommandService({ context, history: new HistoryService(), log, windowLabel: () => "main", activate: async () => {} });
	return new KeybindingService(platform, commands, context, log, createMemoryHost());
}

test("mod means Ctrl on Windows and Cmd on macOS, and labels follow the platform", () => {
	const win = keys("windows");
	win.add({ key: "mod+shift+p", command: "palette.open" }, "core", "core");
	expect(win.keysFor("palette.open")).toEqual(["ctrl+shift+p"]);
	expect(win.label("palette.open")).toEqual(["Ctrl+Shift+P"]);
	const mac = keys("macos");
	mac.add({ key: "mod+shift+p", command: "palette.open" }, "core", "core");
	expect(mac.label("palette.open")).toEqual(["⇧⌘P"]);
});

test("user bindings beat module and core ones; a later one wins within a tier", () => {
	const k = keys();
	k.add({ key: "mod+b", command: "layout.togglePrimarySidebar" }, "core", "core");
	k.add({ key: "mod+b", command: "editor.bold" }, "notes", "module");
	k.add({ key: "mod+b", command: "my.thing" }, "user", "user");
	expect(k.effective().filter((b) => b.steps.join(" ") === "ctrl+b").map((b) => b.command)).toEqual(["my.thing", "editor.bold", "layout.togglePrimarySidebar"]);
	expect(k.conflicts(["ctrl+b"])).toHaveLength(3);
});

test("keys.toml adds bindings, removes defaults with -command, and reports bad entries", () => {
	const k = keys();
	k.add({ key: "mod+k mod+t", command: "theme.select" }, "core", "core");
	const r = k.loadUser('[[bind]]\nkey = "mod+t"\ncommand = "theme.select"\n\n[[bind]]\ncommand = "-theme.select"\nkey = "mod+k mod+t"\n\n[[bind]]\nkey = "x"\n');
	expect(r.errors).toEqual(["bind #3: missing command"]);
	expect(k.effective().filter((b) => b.command === "theme.select").map((b) => b.steps.join(" "))).toEqual(["ctrl+t"]);
	expect(k.userBindings()).toEqual([{ key: "mod+t", command: "theme.select" }, { key: "mod+k mod+t", command: "-theme.select" }]);
	r.dispose.dispose();
	expect(k.keysFor("theme.select")).toEqual(["ctrl+k", "ctrl+t"]);
});

test("platform specific keys replace the default key", () => {
	const k = keys("macos");
	k.add({ key: "ctrl+tab", mac: "cmd+alt+right", command: "tab.next" }, "core", "core");
	expect(k.keysFor("tab.next")).toEqual(["alt+meta+arrowright"]);
});
