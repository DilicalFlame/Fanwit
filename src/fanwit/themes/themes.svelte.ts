/**
 * Theme Manager (Chapter 11). Themes are TOML data: [meta], [common], [light], [dark], [window]
 * and an optional sanitised [css]. The active theme becomes one <style id="fw-theme"> element;
 * the compiled CSS is cached so the next window paints themed from its very first frame.
 */
import { parse } from "smol-toml";
import { Emitter, toDisposable, type Disposable } from "../kernel/disposable";
import { FanwitError } from "../kernel/errors";
import type { Host } from "../host/types";
import { parseColor, toHex } from "./color";
import defaultToml from "./builtin/fanwit-default.toml?raw";
import highContrastToml from "./builtin/high-contrast.toml?raw";

export type Mode = "light" | "dark";
export type ModeSetting = Mode | "system";

export interface ThemeDef {
	meta: { id: string; name: string; author?: string; version?: string; extends?: string; modes?: Mode[]; description?: string };
	common?: Record<string, string>;
	light?: Record<string, string>;
	dark?: Record<string, string>;
	window?: { effects?: "mica" | "acrylic" | "vibrancy" | "none" };
	css?: { file?: string; text?: string };
}

export interface ThemeEntry {
	def: ThemeDef;
	owner: string;
	source?: string;
}

/** Cache keys read by the inline boot script in app.html. */
export const THEME_CACHE = { css: "fw:theme-css", dark: "fw:theme-dark", bg: "fw:theme-bg" } as const;

export function parseTheme(text: string): ThemeDef {
	const t = parse(text) as unknown as ThemeDef;
	if (!t.meta?.id) throw new FanwitError("THEME_INVALID", { message: "Theme file has no [meta] id.", hint: 'Add [meta] with id = "my-theme".', docs: "manual://themes#file" });
	return t;
}

/** Strip anything that could load remote content or run code from theme CSS. */
export function sanitizeCss(css: string): string {
	return css
		.replace(/@import[^;]*;?/gi, "")
		.replace(/url\(\s*(['"]?)(?!data:)[^)]*\1\s*\)/gi, "none")
		.replace(/expression\s*\(/gi, "")
		.replace(/<\/?style[^>]*>/gi, "")
		.replace(/javascript:/gi, "");
}

const DENSITY = new Set(["compact", "comfortable", "spacious"]);

export class ThemeService {
	version = $state(0);
	/** The mode actually shown (system resolved). */
	mode = $state<Mode>("light");
	activeId = $state("fanwit-default");
	/** Theme being previewed by Theme Studio (overrides tokens live without saving). */
	preview = $state.raw<{ mode: Mode; tokens: Record<string, string> } | null>(null);
	readonly onDidApply = new Emitter<{ id: string; mode: Mode }>();
	private themes = new Map<string, ThemeEntry>();
	private systemDark = false;
	private settingMode: ModeSetting = "system";
	private light = "fanwit-default";
	private dark = "fanwit-default";

	constructor(private host: Host) {
		this.add(parseTheme(defaultToml), "core");
		this.add(parseTheme(highContrastToml), "core");
		if (typeof matchMedia !== "undefined") {
			const mq = matchMedia("(prefers-color-scheme: dark)");
			this.systemDark = mq.matches;
			mq.addEventListener("change", (e) => {
				this.systemDark = e.matches;
				if (this.settingMode === "system") this.apply();
			});
		}
	}

	add(def: ThemeDef, owner: string, source?: string): Disposable {
		this.themes.set(def.meta.id, { def, owner, source });
		this.version++;
		return toDisposable(() => {
			if (this.themes.get(def.meta.id)?.owner === owner) this.themes.delete(def.meta.id);
			this.version++;
		});
	}

	list(): ThemeEntry[] {
		void this.version;
		return [...this.themes.values()];
	}

	get(id: string) {
		return this.themes.get(id)?.def;
	}

	/** Token map for a theme and mode, following `extends`. Unspecified tokens come from the parent. */
	resolve(id: string, mode: Mode, seen = new Set<string>()): Record<string, string> {
		const t = this.themes.get(id)?.def ?? this.themes.get("fanwit-default")!.def;
		if (seen.has(t.meta.id)) return {};
		seen.add(t.meta.id);
		const parent = t.meta.extends ? this.resolve(t.meta.extends, mode, seen) : t.meta.id === "fanwit-default" ? {} : this.resolve("fanwit-default", mode, seen);
		// a single-mode theme serves both modes with its only palette
		const own = t[mode] ?? (t.meta.modes?.length === 1 ? t[t.meta.modes[0]] : undefined) ?? {};
		return { ...parent, ...(t.common ?? {}), ...own };
	}

	/** Compile tokens into the CSS text placed in <style id="fw-theme">. */
	compile(tokens: Record<string, string>, extraCss = ""): string {
		const decls = Object.entries(tokens)
			.filter(([k]) => k !== "density")
			.map(([k, v]) => `--${k}:${String(v).replace(/[;{}<>]/g, "")};`)
			.join("");
		return `:root{${decls}}${extraCss ? "\n" + sanitizeCss(extraCss) : ""}`;
	}

	configure(o: { mode?: ModeSetting; light?: string; dark?: string }) {
		if (o.mode) this.settingMode = o.mode;
		if (o.light) this.light = o.light;
		if (o.dark) this.dark = o.dark;
		this.apply();
	}

	/** Apply the configured theme and mode (or the Studio preview) to the document. */
	apply(transition = false) {
		const mode: Mode = this.preview?.mode ?? (this.settingMode === "system" ? (this.systemDark ? "dark" : "light") : this.settingMode);
		const id = mode === "dark" ? this.dark : this.light;
		const tokens = { ...this.resolve(id, mode), ...(this.preview?.tokens ?? {}) };
		const def = this.themes.get(id)?.def;
		const css = this.compile(tokens, def?.css?.text);
		const run = () => {
			if (typeof document === "undefined") return;
			let el = document.getElementById("fw-theme") as HTMLStyleElement | null;
			if (!el) {
				el = document.createElement("style");
				el.id = "fw-theme";
				document.head.appendChild(el);
			}
			el.textContent = css;
			const root = document.documentElement;
			root.classList.toggle("dark", mode === "dark");
			root.style.colorScheme = mode;
			const density = tokens.density;
			if (density && DENSITY.has(density)) root.dataset.density = density;
		};
		const doc = typeof document !== "undefined" ? (document as Document & { startViewTransition?: (f: () => void) => unknown }) : null;
		if (transition && doc?.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) doc.startViewTransition(run);
		else run();

		this.mode = mode;
		this.activeId = id;
		const bg = parseColor(tokens.background ?? "#ffffff");
		const bgHex = bg ? toHex(bg) : "#ffffff";
		try {
			localStorage.setItem(THEME_CACHE.css, css);
			localStorage.setItem(THEME_CACHE.dark, mode === "dark" ? "1" : "0");
			localStorage.setItem(THEME_CACHE.bg, bgHex);
		} catch {
			/* storage unavailable */
		}
		void this.host.windows.setTheme(mode).catch(() => {});
		void this.host.windows.setBackgroundColor(bgHex).catch(() => {});
		this.version++;
		this.onDidApply.fire({ id, mode });
	}

	/** Serialise a theme definition back to TOML text (export from Theme Studio). */
	toToml(def: ThemeDef): string {
		const q = (v: string) => JSON.stringify(v);
		const section = (name: string, o?: Record<string, unknown>) =>
			o && Object.keys(o).length ? `\n[${name}]\n` + Object.entries(o).map(([k, v]) => `${k} = ${Array.isArray(v) ? JSON.stringify(v) : q(String(v))}`).join("\n") + "\n" : "";
		return (
			`# ${def.meta.name} theme for Fanwit\n` +
			section("meta", def.meta as Record<string, unknown>).trimStart() +
			section("common", def.common) +
			section("light", def.light) +
			section("dark", def.dark) +
			section("window", def.window as Record<string, unknown>)
		);
	}

	toCss(id: string): string {
		const light = this.resolve(id, "light");
		const dark = this.resolve(id, "dark");
		const body = (t: Record<string, string>) =>
			Object.entries(t)
				.filter(([k]) => k !== "density")
				.map(([k, v]) => `  --${k}: ${v};`)
				.join("\n");
		return `:root {\n${body(light)}\n}\n\n.dark {\n${body(dark)}\n}\n`;
	}
}
