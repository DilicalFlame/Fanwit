import { expect, test } from "vitest";
import { ContextKeyService } from "./context.svelte";

test("keys are set, bound for a while, and evaluated in when clauses", () => {
	const c = new ContextKeyService();
	c.set("vault.open", true);
	const sel = c.bind("selection.count", 3);
	expect(c.evaluate("vault.open && selection.count > 1", null)).toBe(true);
	sel.dispose();
	expect(c.get("selection.count")).toBeUndefined();
	expect(c.evaluate("vault.open && selection.count > 1", null)).toBe(false);
	expect(c.explain("vault.open && selection.count > 1", c.lookup(null))).toBe("selection.count > 1");
});

test("extra values win over globals, and config.* reads settings", () => {
	const c = new ContextKeyService();
	c.set("window.kind", "main");
	c.configLookup = (key) => (key === "editor.wrap" ? true : undefined);
	expect(c.evaluate("window.kind == 'settings'", null, { "window.kind": "settings" })).toBe(true);
	expect(c.evaluate("config.editor.wrap", null)).toBe(true);
});

test("every change bumps the version and tells listeners which keys changed", () => {
	const c = new ContextKeyService();
	const seen: string[][] = [];
	c.onDidChange.on((keys) => seen.push(keys));
	const v = c.version;
	c.set("a", 1);
	c.set("a", 1); // same value: no change
	c.set("a", 2);
	expect(c.version).toBe(v + 2);
	expect(seen).toEqual([["a"], ["a"]]);
});
