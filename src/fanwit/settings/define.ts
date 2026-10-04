/**
 * Declaring settings (Section 13.1):
 *   export default defineSettings("notes", {
 *     "editor.fontSize": s.number(15, { title: "Editor font size", min: 10, max: 32, widget: "slider" }),
 *   });
 */
export type SettingType = "string" | "number" | "boolean" | "enum" | "path" | "color" | "secret" | "keybinding" | "json" | "string[]";
export type SettingScope = "global" | "vault" | "window";

export interface SettingMeta {
	title?: string;
	description?: string;
	category?: string;
	order?: number;
	scope?: SettingScope[];
	widget?: "slider" | "segmented" | "select" | "color" | "path" | "keybinding" | "code" | "theme" | "font" | "switch" | "text" | (string & {});
	when?: string;
	restart?: boolean;
	reload?: boolean;
	experimental?: boolean;
	deprecated?: boolean | string;
	/** Deprecated settings migrate to their replacement. */
	replacedBy?: string;
	min?: number;
	max?: number;
	step?: number;
	unit?: string;
	options?: string[];
	labels?: Record<string, string>;
	/** path settings */
	kind?: "file" | "folder";
	placeholder?: string;
	/** Manual page for the row's help link. */
	help?: string;
}

export interface SettingDef extends SettingMeta {
	type: SettingType;
	default: unknown;
	/** Full key, filled in by defineSettings ("notes.editor.fontSize"). */
	key: string;
	secret?: boolean;
}

export interface SettingsContribution {
	ns: string;
	settings: SettingDef[];
}

type Builder = Omit<SettingDef, "key">;

/**
 * Setting builders: `s.<type>(default, meta)`. The type and metadata drive validation, the
 * Settings window's widget, the generated reference and `settings.toml`. `s.secret` lives in the
 * OS keychain instead of TOML.
 *
 * @example
 * ```ts
 * defineSettings("notes", {
 *   "editor.fontSize": s.number(15, { title: "Editor font size", min: 10, max: 32, widget: "slider", unit: "px" }),
 *   "editor.wrap": s.enum("soft", ["off", "soft", "bounded"], { title: "Line wrapping" }),
 *   "sync.token": s.secret({ title: "Sync token" })
 * });
 * ```
 */
export const s = {
	string: (def = "", meta: SettingMeta = {}): Builder => ({ type: "string", default: def, ...meta }),
	number: (def = 0, meta: SettingMeta = {}): Builder => ({ type: "number", default: def, ...meta }),
	boolean: (def = false, meta: SettingMeta = {}): Builder => ({ type: "boolean", default: def, widget: "switch", ...meta }),
	enum: <T extends string>(def: T, options: readonly T[], meta: SettingMeta = {}): Builder => ({ type: "enum", default: def, options: [...options], ...meta }),
	path: (def = "", meta: SettingMeta = {}): Builder => ({ type: "path", default: def, widget: "path", ...meta }),
	color: (def = "#000000", meta: SettingMeta = {}): Builder => ({ type: "color", default: def, widget: "color", ...meta }),
	keybinding: (def = "", meta: SettingMeta = {}): Builder => ({ type: "keybinding", default: def, widget: "keybinding", ...meta }),
	json: (def: unknown = {}, meta: SettingMeta = {}): Builder => ({ type: "json", default: def, widget: "code", ...meta }),
	list: (def: string[] = [], meta: SettingMeta = {}): Builder => ({ type: "string[]", default: def, ...meta }),
	/** Stored in the OS keychain, never written to TOML. */
	secret: (meta: SettingMeta = {}): Builder => ({ type: "secret", default: "", secret: true, scope: ["global"], ...meta })
};

/**
 * Declare a module's settings under a namespace: keys become `<ns>.<key>`. Contribute the result
 * as `contributes.settings`; read with `ctx.settings.get(key)` (reactive in views), write with
 * `ctx.settings.set(key, value, { scope })`. `pnpm fw add setting <ns>.<key>` adds one.
 *
 * @example
 * ```ts
 * contributes: {
 *   settings: defineSettings("notes", {
 *     "daily.folder": s.path("Daily", { title: "Daily notes folder", kind: "folder", scope: ["vault", "global"] })
 *   })
 * }
 * // later: ctx.settings.get<string>("notes.daily.folder")
 * ```
 * @see manual://fanwit/guides/settings
 */
export function defineSettings(ns: string, defs: Record<string, Builder>): SettingsContribution {
	return {
		ns,
		settings: Object.entries(defs).map(([k, d], i) => ({ order: i, ...d, key: ns ? `${ns}.${k}` : k }))
	};
}

/** Check a value against its definition; returns an error message or null. */
export function checkSetting(def: SettingDef, v: unknown): string | null {
	switch (def.type) {
		case "number":
			if (typeof v !== "number" || Number.isNaN(v)) return "expected a number";
			if (def.min !== undefined && v < def.min) return `must be at least ${def.min}`;
			if (def.max !== undefined && v > def.max) return `must be at most ${def.max}`;
			return null;
		case "boolean":
			return typeof v === "boolean" ? null : "expected true or false";
		case "enum":
			return def.options?.includes(String(v)) ? null : `expected one of ${def.options?.join(", ")}`;
		case "string[]":
			return Array.isArray(v) && v.every((x) => typeof x === "string") ? null : "expected a list of strings";
		case "json":
			return null;
		default:
			return typeof v === "string" ? null : "expected text";
	}
}

/** Coerce a string from the CLI or environment to the setting's type. */
export function coerceSetting(def: SettingDef, raw: string): unknown {
	if (def.type === "number") return Number(raw);
	if (def.type === "boolean") return !["false", "0", "no", "off"].includes(raw.toLowerCase());
	if (def.type === "json" || def.type === "string[]") {
		try {
			return JSON.parse(raw);
		} catch {
			return def.type === "string[]" ? raw.split(",") : raw;
		}
	}
	return raw;
}
