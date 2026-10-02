import { expect, test } from "vitest";
import { applyPatches, templateArgs, type MenuItem } from "./menus.svelte";

const items: MenuItem[] = [
	{ id: "tab.close", command: "tab.close", group: "navigation", order: 1 },
	{ id: "tab.copyRelativePath", command: "tab.copyPath", group: "clipboard", order: 2 },
	{ id: "window.popOut", command: "window.popOut", group: "window", order: 3 }
];

test("patches hide, move before, insert and change props", () => {
	const out = applyPatches(items, [
		{ location: "tab/context", op: "hide", item: "tab.copyRelativePath" },
		{ location: "tab/context", op: "move", item: "window.popOut", before: "tab.close" },
		{ location: "tab/context", op: "insert", group: "navigation", item: { id: "user.term", command: "shell.openTerminal", args: { cwd: "${target.dir}" } } },
		{ location: "tab/context", op: "props", item: "tab.close", props: { label: "Close it" } }
	]);
	expect(out.find((i) => i.id === "tab.copyRelativePath")!.hidden).toBe(true);
	expect(out.map((i) => i.id).indexOf("window.popOut")).toBeLessThan(out.map((i) => i.id).indexOf("tab.close"));
	expect(out.find((i) => i.id === "window.popOut")!.group).toBe("navigation");
	expect(out.find((i) => i.id === "user.term")!.userInserted).toBe(true);
	expect(out.find((i) => i.id === "tab.close")!.props).toEqual({ label: "Close it" });
	// contributions are never mutated
	expect(items[2].group).toBe("window");
});

test("target templating keeps raw types for whole-string templates", () => {
	const scope = { target: { dir: "notes", ids: [1, 2], path: "a.md" } };
	expect(templateArgs({ cwd: "${target.dir}", ids: "${target.ids}", label: "Open ${target.path}" }, scope)).toEqual({ cwd: "notes", ids: [1, 2], label: "Open a.md" });
});
