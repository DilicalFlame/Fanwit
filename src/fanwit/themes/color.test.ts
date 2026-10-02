import { expect, test } from "vitest";
import { contrast, fixContrast, paletteFromBrand, parseColor, parseShadcnCss, rgbToOklch, toHex } from "./color";

test("oklch round trips through sRGB", () => {
	const white = parseColor("oklch(1 0 0)")!;
	expect(toHex(white)).toBe("#ffffff");
	const blue = parseColor("#3366cc")!;
	const back = parseColor(`oklch(${rgbToOklch(blue).l} ${rgbToOklch(blue).c} ${rgbToOklch(blue).h})`)!;
	expect(toHex(back)).toBe("#3366cc");
});

test("contrast ratios match WCAG", () => {
	expect(contrast("#000", "#fff")!).toBeCloseTo(21, 0);
	expect(contrast("#777", "#fff")!).toBeCloseTo(4.48, 1);
	expect(contrast(fixContrast("#999", "#fff", 4.5), "#fff")!).toBeGreaterThanOrEqual(4.5);
});

test("palette generation and shadcn import", () => {
	const p = paletteFromBrand("#e5484d");
	expect(contrast(p.light["primary-foreground"], p.light.primary)!).toBeGreaterThan(3);
	const parsed = parseShadcnCss(":root { --radius: 0.6rem; --background: oklch(1 0 0); } .dark { --background: oklch(0.1 0 0); }");
	expect(parsed.common.radius).toBe("0.6rem");
	expect(parsed.dark.background).toBe("oklch(0.1 0 0)");
});
