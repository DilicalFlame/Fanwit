import { expect, test } from "vitest";
import { compileWhen, evalWhen } from "./when";

const ctx: Record<string, unknown> = {
	inputFocus: true,
	textSelected: false,
	"resource.ext": "md",
	"vault.open": true,
	"window.kind": "main",
	"selection.count": 2,
	"resource.path": "daily/2026.md"
};
const l = (k: string) => ctx[k];

test("spec examples", () => {
	expect(evalWhen("inputFocus && !textSelected", l)).toBe(true);
	expect(evalWhen("resource.ext in ['md', 'txt'] && vault.open", l)).toBe(true);
	expect(evalWhen("window.kind == 'main' && selection.count > 1", l)).toBe(true);
	expect(evalWhen("resource.path =~ /^daily\\//", l)).toBe(true);
	expect(evalWhen("resource.path =~ /^weekly/", l)).toBe(false);
});

test("precedence, parens, not in", () => {
	expect(evalWhen("false || true && false", l)).toBe(false);
	expect(evalWhen("(false || true) && true", l)).toBe(true);
	expect(evalWhen("resource.ext not in ['png']", l)).toBe(true);
	expect(evalWhen("missing == ''", l)).toBe(true);
	expect(evalWhen("", l)).toBe(true);
});

test("keys recorded and explain names the failing clause", () => {
	const c = compileWhen("vault.open && selection.count > 5");
	expect([...c.keys]).toEqual(["vault.open", "selection.count"]);
	expect(c.explain(l)).toBe("selection.count > 5");
});

test("syntax errors are FanwitErrors", () => {
	expect(() => compileWhen("a == ")).toThrow(/Invalid when clause/);
});
