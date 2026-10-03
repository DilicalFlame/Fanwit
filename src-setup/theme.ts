import { parse } from "smol-toml";

/** Apply an app theme by id, so the Setup app looks like the product (installer.toml `theme`). */
const THEMES = import.meta.glob("../src/fanwit/themes/builtin/*.toml", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
export function applyTheme(id: string) {
	const dark = matchMedia("(prefers-color-scheme: dark)").matches;
	const text = Object.entries(THEMES).find(([p]) => p.endsWith(`/${id}.toml`))?.[1] ?? Object.values(THEMES)[0];
	const t = parse(text) as Record<string, Record<string, string>>;
	const mode = dark && t.dark ? "dark" : t.light ? "light" : "dark";
	const tokens = { ...(t.common ?? {}), ...(t[mode] ?? {}) };
	const css = `:root,:root.dark{${Object.entries(tokens).map(([k, v]) => `--${k}:${v};`).join("")}}`;
	let style = document.getElementById("fw-theme");
	if (!style) {
		style = document.createElement("style");
		style.id = "fw-theme";
		document.head.append(style);
	}
	style.textContent = css;
	document.documentElement.classList.toggle("dark", mode === "dark");
}

