/**
 * Colour utilities for themes: parse hex, rgb() and oklch(), convert between OKLCH and sRGB,
 * WCAG contrast ratios, and perceptual palette generation from one brand colour.
 */

export interface Rgb {
	r: number;
	g: number;
	b: number;
	a: number;
}
export interface Oklch {
	l: number;
	c: number;
	h: number;
	a: number;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

export function oklchToRgb({ l, c, h, a }: Oklch): Rgb {
	const hr = (h * Math.PI) / 180;
	const A = c * Math.cos(hr);
	const B = c * Math.sin(hr);
	const l_ = l + 0.3963377774 * A + 0.2158037573 * B;
	const m_ = l - 0.1055613458 * A - 0.0638541728 * B;
	const s_ = l - 0.0894841775 * A - 1.291485548 * B;
	const L = l_ ** 3,
		M = m_ ** 3,
		S = s_ ** 3;
	return {
		r: clamp01(toGamma(4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S)),
		g: clamp01(toGamma(-1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S)),
		b: clamp01(toGamma(-0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S)),
		a
	};
}

export function rgbToOklch({ r, g, b, a }: Rgb): Oklch {
	const R = toLinear(r),
		G = toLinear(g),
		B = toLinear(b);
	const l_ = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
	const m_ = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
	const s_ = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
	const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
	const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
	const Bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
	const c = Math.sqrt(A * A + Bb * Bb);
	let h = (Math.atan2(Bb, A) * 180) / Math.PI;
	if (h < 0) h += 360;
	return { l: L, c, h: c < 1e-4 ? 0 : h, a };
}

/** Parses #rgb, #rrggbb(aa), rgb()/rgba() and oklch(); returns null for anything else. */
export function parseColor(input: string): Rgb | null {
	const s = input.trim().toLowerCase();
	let m = /^#([0-9a-f]{3,8})$/.exec(s);
	if (m) {
		let hex = m[1];
		if (hex.length === 3 || hex.length === 4) hex = [...hex].map((x) => x + x).join("");
		const n = (i: number) => parseInt(hex.slice(i, i + 2), 16) / 255;
		return { r: n(0), g: n(2), b: n(4), a: hex.length === 8 ? n(6) : 1 };
	}
	m = /^rgba?\(([^)]+)\)$/.exec(s);
	if (m) {
		const p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
		return { r: p[0] / 255, g: p[1] / 255, b: p[2] / 255, a: p[3] ?? 1 };
	}
	m = /^oklch\(([^)]+)\)$/.exec(s);
	if (m) {
		const [main, alpha] = m[1].split("/");
		const p = main.trim().split(/\s+/);
		const num = (v: string, scale = 1) => (v.endsWith("%") ? parseFloat(v) / 100 : parseFloat(v) * scale);
		const a = alpha ? num(alpha.trim()) : 1;
		return oklchToRgb({ l: num(p[0]), c: num(p[1] ?? "0"), h: parseFloat(p[2] ?? "0") || 0, a });
	}
	return null;
}

export function toHex({ r, g, b }: Rgb): string {
	const h = (x: number) => Math.round(clamp01(x) * 255).toString(16).padStart(2, "0");
	return `#${h(r)}${h(g)}${h(b)}`;
}

export function toOklchString({ l, c, h, a }: Oklch): string {
	const f = (x: number, d = 3) => +x.toFixed(d);
	return `oklch(${f(l)} ${f(c)} ${f(h, 1)}${a < 1 ? ` / ${f(a, 2)}` : ""})`;
}

function luminance({ r, g, b }: Rgb) {
	return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** Composite a translucent colour over a background (for contrast on alpha tokens). */
function over(fg: Rgb, bg: Rgb): Rgb {
	return { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 };
}

/** WCAG 2 contrast ratio, 1 to 21. */
export function contrast(fg: string, bg: string): number | null {
	const f = parseColor(fg);
	const b = parseColor(bg);
	if (!f || !b) return null;
	const L1 = luminance(over(f, b));
	const L2 = luminance(b);
	return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
}

export function wcagLevel(ratio: number): "AAA" | "AA" | "AA large" | "fail" {
	return ratio >= 7 ? "AAA" : ratio >= 4.5 ? "AA" : ratio >= 3 ? "AA large" : "fail";
}

/** Adjust lightness of `fg` until it reaches `target` contrast on `bg` (one click fix). */
export function fixContrast(fg: string, bg: string, target = 4.5): string {
	const f = parseColor(fg);
	const b = parseColor(bg);
	if (!f || !b) return fg;
	const o = rgbToOklch(f);
	const darker = luminance(b) > 0.4;
	for (let i = 0; i < 100; i++) {
		const s = toOklchString(o);
		if ((contrast(s, bg) ?? 0) >= target) return s;
		o.l = clamp01(o.l + (darker ? -0.01 : 0.01));
	}
	return toOklchString(o);
}

/** Build both modes' core tokens from one brand colour using OKLCH ramps (Theme Studio). */
export function paletteFromBrand(brand: string): { light: Record<string, string>; dark: Record<string, string> } {
	const rgb = parseColor(brand) ?? { r: 0.3, g: 0.4, b: 0.9, a: 1 };
	const { c, h } = rgbToOklch(rgb);
	const tint = Math.min(c, 0.03);
	const k = (l: number, chroma = tint, a = 1) => toOklchString({ l, c: chroma, h, a });
	const accentC = Math.max(0.08, Math.min(c, 0.2));
	return {
		light: {
			background: k(0.99, tint * 0.2),
			foreground: k(0.22, tint * 0.6),
			card: k(1, 0),
			"card-foreground": k(0.22, tint * 0.6),
			popover: k(1, 0),
			"popover-foreground": k(0.22, tint * 0.6),
			primary: k(0.52, accentC),
			"primary-foreground": k(0.98, 0),
			secondary: k(0.95, tint * 0.5),
			"secondary-foreground": k(0.3, tint),
			muted: k(0.95, tint * 0.5),
			"muted-foreground": k(0.5, tint),
			accent: k(0.93, tint),
			"accent-foreground": k(0.3, tint),
			border: k(0.9, tint * 0.5),
			input: k(0.9, tint * 0.5),
			ring: k(0.6, accentC * 0.8),
			titlebar: k(0.96, tint * 0.6),
			"titlebar-foreground": k(0.3, tint),
			activity: k(0.94, tint * 0.7),
			"activity-foreground": k(0.5, tint),
			"activity-active": k(0.25, tint),
			tab: k(0.96, tint * 0.6),
			"tab-active": k(1, 0),
			"tab-border": k(0.55, accentC),
			statusbar: k(0.52, accentC),
			"statusbar-foreground": k(0.98, 0),
			sidebar: k(0.975, tint * 0.6),
			splitter: k(0.9, tint * 0.5),
			"splitter-hover": k(0.55, accentC),
			selection: k(0.55, accentC, 0.18),
			"drop-target": k(0.55, accentC, 0.18)
		},
		dark: {
			background: k(0.2, tint * 0.6),
			foreground: k(0.93, tint * 0.3),
			card: k(0.24, tint * 0.6),
			"card-foreground": k(0.93, tint * 0.3),
			popover: k(0.24, tint * 0.6),
			"popover-foreground": k(0.93, tint * 0.3),
			primary: k(0.72, accentC),
			"primary-foreground": k(0.18, tint),
			secondary: k(0.3, tint * 0.6),
			"secondary-foreground": k(0.93, tint * 0.3),
			muted: k(0.28, tint * 0.6),
			"muted-foreground": k(0.7, tint * 0.6),
			accent: k(0.32, tint),
			"accent-foreground": k(0.95, tint * 0.3),
			border: k(1, 0, 0.1),
			input: k(1, 0, 0.15),
			ring: k(0.6, accentC * 0.8),
			titlebar: k(0.17, tint * 0.6),
			"titlebar-foreground": k(0.85, tint * 0.4),
			activity: k(0.16, tint * 0.6),
			"activity-foreground": k(0.6, tint * 0.6),
			"activity-active": k(0.97, tint * 0.2),
			tab: k(0.17, tint * 0.6),
			"tab-active": k(0.2, tint * 0.6),
			"tab-border": k(0.72, accentC),
			statusbar: k(0.17, tint * 0.6),
			"statusbar-foreground": k(0.78, tint * 0.4),
			sidebar: k(0.18, tint * 0.6),
			splitter: k(1, 0, 0.1),
			"splitter-hover": k(0.72, accentC),
			selection: k(0.72, accentC, 0.25),
			"drop-target": k(0.72, accentC, 0.22)
		}
	};
}

/** Parse a shadcn theme CSS block (:root { --x: ... } .dark { ... }) into light and dark maps. */
export function parseShadcnCss(css: string): { light: Record<string, string>; dark: Record<string, string>; common: Record<string, string> } {
	const out = { light: {} as Record<string, string>, dark: {} as Record<string, string>, common: {} as Record<string, string> };
	const block = /([^{}]+)\{([^{}]*)\}/g;
	let m: RegExpExecArray | null;
	while ((m = block.exec(css))) {
		const sel = m[1].trim();
		const target = /\.dark/.test(sel) ? out.dark : /:root/.test(sel) ? out.light : null;
		if (!target) continue;
		for (const decl of m[2].split(";")) {
			const d = /^\s*--([\w-]+)\s*:\s*(.+?)\s*$/.exec(decl);
			if (!d) continue;
			if (d[1] === "radius") out.common.radius = d[2];
			else target[d[1]] = d[2];
		}
	}
	return out;
}
