import { expect, test } from "vitest";
import { createMemoryHost } from "../host/memory";
import { ThemeService, parseTheme, sanitizeCss } from "./themes.svelte";

test("a theme inherits every token it does not set, through extends", () => {
	const t = new ThemeService(createMemoryHost());
	t.add(parseTheme('[meta]\nid = "ocean"\nname = "Ocean"\nextends = "fanwit-high-contrast"\n[light]\nprimary = "#0369a1"\n'), "me");
	const light = t.resolve("ocean", "light");
	expect(light.primary).toBe("#0369a1");
	expect(light.background).toBe(t.resolve("fanwit-high-contrast", "light").background);
	expect(light["font-mono"]).toBe(t.resolve("fanwit-default", "light")["font-mono"]);
});

test("a single-mode theme serves both modes with its one palette", () => {
	const t = new ThemeService(createMemoryHost());
	t.add(parseTheme('[meta]\nid = "night"\nname = "Night"\nmodes = ["dark"]\n[dark]\nbackground = "#000000"\n'), "me");
	expect(t.resolve("night", "light").background).toBe("#000000");
});

test("tokens compile to custom properties, and nothing in them can close the rule", () => {
	const t = new ThemeService(createMemoryHost());
	expect(t.compile({ primary: "red", density: "compact", evil: "x;} body{display:none" })).toBe(":root:root{--primary:red;--evil:x bodydisplay:none;}");
});

test("theme CSS cannot import, load remote content or run script", () => {
	expect(sanitizeCss('@import "https://x.test/a.css"; .a{background:url(https://x.test/p.png)} .b{background:url(data:image/png;base64,AA)}')).toBe(" .a{background:none} .b{background:url(data:image/png;base64,AA)}");
	expect(() => parseTheme("[meta]\nname = \"No id\"\n")).toThrow(expect.objectContaining({ code: "THEME_INVALID" }));
});
