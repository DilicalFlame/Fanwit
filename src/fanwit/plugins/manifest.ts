/** plugin.toml schema and validation (Section 14.3). */
import * as v from "valibot";
import { parse } from "smol-toml";
import { FanwitError } from "../kernel/errors";

export const PERMISSIONS: Record<string, string> = {
	"vault.read": "Read files in the open vault",
	"vault.write": "Change files in the open vault",
	"fs.pick": "Read or write files you pick in a dialog",
	"clipboard.read": "Read the clipboard",
	"clipboard.write": "Write to the clipboard",
	"notify.os": "Show system notifications",
	windows: "Open its own windows",
	"commands.intercept": "Intercept or override other commands",
	"menus.global": "Add items to menus owned by others",
	"shell.open": "Open links and files with other apps",
	startup: "Start before the first paint (slows startup)",
	statusbar: "Show items in the status bar"
};

export function describePermission(p: string): string {
	if (p.startsWith("net:")) return `Connect to ${p.slice(4)}`;
	if (p.startsWith("sidecar:")) return `Run the bundled program "${p.slice(8)}"`;
	if (p.startsWith("vault.read:")) return `Read vault files matching ${p.slice(11)}`;
	return PERMISSIONS[p] ?? p;
}

const Setting = v.object({ key: v.string(), type: v.picklist(["string", "number", "boolean", "enum"]), default: v.unknown(), title: v.optional(v.string()), description: v.optional(v.string()), options: v.optional(v.array(v.string())) });

const View = v.object({
	id: v.string(),
	title: v.string(),
	icon: v.optional(v.string()),
	/** widgets: a JSON tree the app renders; iframe: the plugin's own page, sandboxed */
	ui: v.picklist(["widgets", "iframe"]),
	entry: v.optional(v.string()),
	regions: v.optional(v.array(v.string())),
	singleton: v.optional(v.boolean(), true)
});

export const ManifestSchema = v.object({
	id: v.pipe(v.string(), v.regex(/^[a-z0-9][a-z0-9-]*$/, "ids are lower case letters, digits and dashes")),
	name: v.string(),
	version: v.pipe(v.string(), v.regex(/^\d+\.\d+\.\d+/)),
	author: v.optional(v.string()),
	description: v.optional(v.string()),
	app: v.optional(v.string()),
	fanwit: v.optional(v.string()),
	entry: v.optional(v.string()),
	/** Feature plugins pick where their code runs; none of them run on the main thread except isolation = "none". */
	runtime: v.optional(v.picklist(["js", "wasm", "sidecar"]), "js"),
	isolation: v.optional(v.picklist(["none", "worker"]), "worker"),
	/** Shown as a filter chip in the plugin browser: appearance, editor, productivity, developer... */
	category: v.optional(v.string()),
	icon: v.optional(v.string()),
	activation: v.optional(v.array(v.string()), []),
	permissions: v.optional(v.array(v.string()), []),
	contributes: v.optional(
		v.object({
			commands: v.optional(v.array(v.object({ id: v.string(), title: v.string(), category: v.optional(v.string()), icon: v.optional(v.string()), palette: v.optional(v.boolean()) }))),
			keybindings: v.optional(v.array(v.object({ key: v.string(), command: v.string(), when: v.optional(v.string()) }))),
			statusItems: v.optional(v.array(v.object({ id: v.string(), align: v.optional(v.picklist(["left", "right"])), priority: v.optional(v.number()), text: v.optional(v.string()), command: v.optional(v.string()), tooltip: v.optional(v.string()) }))),
			settings: v.optional(v.array(Setting)),
			themes: v.optional(v.array(v.string())),
			menus: v.optional(v.record(v.string(), v.array(v.record(v.string(), v.unknown())))),
			layoutPresets: v.optional(v.array(v.string())),
			/** CSS files injected (sanitized) while the plugin is on; data only plugins can use it. */
			styles: v.optional(v.array(v.string())),
			views: v.optional(v.array(View))
		}),
		{}
	)
});

export type PluginManifest = v.InferOutput<typeof ManifestSchema>;

export function parseManifest(text: string, source = "plugin.toml"): PluginManifest {
	let raw: unknown;
	try {
		raw = parse(text);
	} catch (e) {
		throw new FanwitError("PLUGIN_MANIFEST", { message: `${source}: ${(e as Error).message.split("\n")[0]}` });
	}
	const r = v.safeParse(ManifestSchema, raw);
	if (!r.success) {
		const i = r.issues[0];
		throw new FanwitError("PLUGIN_MANIFEST", { message: `${source}: ${i.path?.map((p) => p.key).join(".") ?? ""} ${i.message}`, hint: "See manual://plugins#manifest" });
	}
	const bad = r.output.contributes.views?.find((x) => x.ui === "iframe" && !x.entry);
	if (bad) throw new FanwitError("PLUGIN_MANIFEST", { message: `${source}: view ${bad.id} has ui = "iframe" but no entry`, hint: 'Add entry = "ui/index.html".' });
	return r.output;
}

/** Data only plugins execute nothing and need no permissions. */
export const isDataOnly = (m: PluginManifest) => !m.entry;

/** Minimal semver range check: ">=1.2.0", "^1.0.0", "1.x", "*". */
export function satisfies(version: string, range = "*"): boolean {
	const n = (s: string) => s.replace(/^[^\d]*/, "").split(/[.-]/).slice(0, 3).map((x) => Number(x) || 0);
	const cmp = (a: number[], b: number[]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
	return range.split(/\s+/).every((part) => {
		if (!part || part === "*" || part === "x") return true;
		const v0 = n(version);
		if (part.startsWith(">=")) return cmp(v0, n(part)) >= 0;
		if (part.startsWith(">")) return cmp(v0, n(part)) > 0;
		if (part.startsWith("<=")) return cmp(v0, n(part)) <= 0;
		if (part.startsWith("<")) return cmp(v0, n(part)) < 0;
		if (part.startsWith("^")) return v0[0] === n(part)[0] && cmp(v0, n(part)) >= 0;
		if (/x/.test(part)) return part.split(".").every((p, i) => p === "x" || Number(p) === v0[i]);
		return cmp(v0, n(part)) === 0;
	});
}

/**
 * A user script (.fanwit/scripts/name.js) as a worker plugin manifest. Header comments declare
 * what it contributes: `// @command id Title`, `// @key ctrl+alt+d id`, `// @permission vault.read`.
 */
export function scriptManifest(file: string, src: string): PluginManifest {
	const name = file.replace(/\.js$/, "");
	const tags = [...src.matchAll(/^\s*\/\/\s*@(command|key|permission)\s+(\S+)(?:\s+(.*))?$/gm)];
	const pick = (t: string) => tags.filter((m) => m[1] === t);
	return {
		id: `script-${name.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`,
		name: `Script: ${name}`,
		version: "0.0.0",
		description: `User script ${file}`,
		entry: file,
		runtime: "js",
		isolation: "worker",
		activation: [],
		permissions: pick("permission").map((m) => m[2]),
		contributes: {
			commands: pick("command").map((m) => ({ id: m[2], title: m[3]?.trim() || m[2], category: "Scripts" })),
			keybindings: pick("key").map((m) => ({ key: m[2], command: (m[3] ?? "").trim() })).filter((b) => b.command)
		}
	};
}
