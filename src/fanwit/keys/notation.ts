/**
 * Key notation (Section 6.1.1). Bindings are written with printed characters ("mod+shift+p",
 * chords "mod+k mod+s", physical keys "[KeyZ]"). Canonical steps sort modifiers as
 * ctrl, alt, shift, meta.
 */
import type { Platform } from "../host/types";

const MOD_ORDER = ["ctrl", "alt", "shift", "meta"] as const;
const MOD_ALIASES: Record<string, string> = {
	control: "ctrl",
	ctl: "ctrl",
	option: "alt",
	opt: "alt",
	cmd: "meta",
	command: "meta",
	win: "meta",
	super: "meta",
	windows: "meta"
};
const KEY_ALIASES: Record<string, string> = {
	" ": "space",
	esc: "escape",
	return: "enter",
	del: "delete",
	ins: "insert",
	up: "arrowup",
	down: "arrowdown",
	left: "arrowleft",
	right: "arrowright",
	pgup: "pageup",
	pgdn: "pagedown",
	"+": "plus",
	os: "meta"
};

/** Unshifted characters for physical codes (US layout fallback when no layout map is available). */
const CODE_CHARS: Record<string, string> = {
	Backquote: "`",
	Minus: "-",
	Equal: "=",
	BracketLeft: "[",
	BracketRight: "]",
	Backslash: "\\",
	IntlBackslash: "\\",
	Semicolon: ";",
	Quote: "'",
	Comma: ",",
	Period: ".",
	Slash: "/",
	Space: "space",
	NumpadAdd: "plus",
	NumpadSubtract: "-",
	NumpadMultiply: "*",
	NumpadDivide: "/",
	NumpadDecimal: "."
};

export function normalizeKeyName(k: string): string {
	const l = k.length === 1 ? k.toLowerCase() : k.toLowerCase();
	return KEY_ALIASES[l] ?? l;
}

/** Canonical form of one step ("Shift+Mod+P" on windows -> "ctrl+shift+p"). */
export function canonicalStep(step: string, platform: Platform): string {
	// split on "+" but keep a trailing "+" key ("ctrl++")
	const parts = step.trim().split(/\+(?!$)/).filter(Boolean);
	const mods = new Set<string>();
	let key = "";
	for (const raw of parts) {
		let p = raw.trim();
		if (/^\[.+\]$/.test(p)) {
			key = p;
			continue;
		}
		p = p.toLowerCase();
		if (p === "mod") p = platform === "macos" ? "meta" : "ctrl";
		p = MOD_ALIASES[p] ?? p;
		if ((MOD_ORDER as readonly string[]).includes(p)) mods.add(p);
		else key = normalizeKeyName(p);
	}
	return [...MOD_ORDER.filter((m) => mods.has(m)), key].filter(Boolean).join("+");
}

export function parseBinding(key: string, platform: Platform): string[] {
	return key
		.trim()
		.split(/\s+/)
		.map((s) => canonicalStep(s, platform));
}

let layoutMap: Map<string, string> | null = null;

/** Load the OS keyboard layout map where the browser exposes it; rebuild on layout change. */
export async function loadLayoutMap() {
	const kb = (navigator as Navigator & { keyboard?: { getLayoutMap?: () => Promise<Map<string, string>>; addEventListener?: (t: string, f: () => void) => void } }).keyboard;
	if (!kb?.getLayoutMap) return;
	try {
		layoutMap = new Map(await kb.getLayoutMap());
		kb.addEventListener?.("layoutchange", () => void loadLayoutMap());
	} catch {
		layoutMap = null;
	}
}

function charForCode(code: string): string | undefined {
	if (/^Key[A-Z]$/.test(code)) return layoutMap?.get(code)?.toLowerCase() ?? code.slice(3).toLowerCase();
	if (/^Digit\d$/.test(code)) return layoutMap?.get(code) ?? code.slice(5);
	if (/^Numpad\d$/.test(code)) return code.slice(6);
	const fromLayout = layoutMap?.get(code);
	return fromLayout ? normalizeKeyName(fromLayout) : CODE_CHARS[code];
}

export interface EventSteps {
	/** Step built from the printed character (layout aware). */
	logical: string;
	/** Step built from the physical key position, e.g. "ctrl+[KeyZ]". */
	physical: string;
	/** True when the event is only a modifier press. */
	modifierOnly: boolean;
	hasModifier: boolean;
}

export function eventToSteps(e: KeyboardEvent): EventSteps {
	const mods: string[] = [];
	if (e.ctrlKey) mods.push("ctrl");
	if (e.altKey) mods.push("alt");
	if (e.shiftKey) mods.push("shift");
	if (e.metaKey) mods.push("meta");
	const modifierOnly = ["Control", "Alt", "Shift", "Meta", "OS", "AltGraph", "CapsLock"].includes(e.key);
	let key = normalizeKeyName(e.key ?? "");
	// Modifiers change e.key (shift+1 -> "!", alt+k -> "˚" on macOS, ctrl+letters in some layouts);
	// for printable keys fall back to the unshifted character of the physical key.
	const printable = key.length === 1 || key === "dead" || key === "unidentified" || key === "process";
	if (printable && (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey || key.length !== 1)) {
		const c = charForCode(e.code);
		if (c) key = c;
	}
	if (key === "+") key = "plus";
	return {
		logical: [...mods, key].join("+"),
		physical: [...mods, `[${e.code}]`].join("+"),
		modifierOnly,
		hasModifier: e.ctrlKey || e.altKey || e.metaKey
	};
}

const MAC_SYMBOLS: Record<string, string> = { ctrl: "⌃", alt: "⌥", shift: "⇧", meta: "⌘" };
const NAMES: Record<string, string> = {
	arrowup: "↑",
	arrowdown: "↓",
	arrowleft: "←",
	arrowright: "→",
	escape: "Esc",
	enter: "Enter",
	space: "Space",
	backspace: "Backspace",
	delete: "Del",
	tab: "Tab",
	pageup: "PgUp",
	pagedown: "PgDn",
	plus: "+"
};

/** Human label for chips: "Ctrl+Shift+P" or "⌘⇧P". Returns one string per chord step. */
export function formatSteps(steps: string[], platform: Platform): string[] {
	return steps.map((step) => {
		const parts = step.split("+");
		const key = parts.pop() ?? "";
		const label = /^\[(.+)\]$/.test(key)
			? key.slice(1, -1).replace(/^Key|^Digit/, "")
			: NAMES[key] ?? (key.length === 1 ? key.toUpperCase() : key[0].toUpperCase() + key.slice(1));
		if (platform === "macos") return parts.map((m) => MAC_SYMBOLS[m] ?? m).join("") + label;
		const names: Record<string, string> = { ctrl: "Ctrl", alt: "Alt", shift: "Shift", meta: platform === "windows" ? "Win" : "Super" };
		return [...parts.map((m) => names[m] ?? m), label].join("+");
	});
}

/** Tauri global shortcut accelerator for a single step. */
export function toAccelerator(step: string): string {
	return step
		.split("+")
		.map((p) => (p === "ctrl" ? "Control" : p === "meta" ? "Super" : p === "alt" ? "Alt" : p === "shift" ? "Shift" : p.length === 1 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1)))
		.join("+");
}
