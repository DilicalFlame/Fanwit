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

export const ManifestSchema = v.object({
	id: v.pipe(v.string(), v.regex(/^[a-z0-9][a-z0-9-]*$/, "ids are lower case letters, digits and dashes")),
	name: v.string(),
	version: v.pipe(v.string(), v.regex(/^\d+\.\d+\.\d+/)),
	author: v.optional(v.string()),
	description: v.optional(v.string()),
	app: v.optional(v.string()),
	fanwit: v.optional(v.string()),
	entry: v.optional(v.string()),
	isolation: v.optional(v.picklist(["none", "worker"]), "worker"),
	activation: v.optional(v.array(v.string()), []),
	permissions: v.optional(v.array(v.string()), []),
	contributes: v.optional(
		v.object({
			commands: v.optional(v.array(v.object({ id: v.string(), title: v.string(), category: v.optional(v.string()), icon: v.optional(v.string()) }))),
			keybindings: v.optional(v.array(v.object({ key: v.string(), command: v.string(), when: v.optional(v.string()) }))),
			statusItems: v.optional(v.array(v.object({ id: v.string(), align: v.optional(v.picklist(["left", "right"])), priority: v.optional(v.number()), text: v.optional(v.string()), command: v.optional(v.string()), tooltip: v.optional(v.string()) }))),
			settings: v.optional(v.array(Setting)),
			themes: v.optional(v.array(v.string())),
			menus: v.optional(v.record(v.string(), v.array(v.record(v.string(), v.unknown())))),
			layoutPresets: v.optional(v.array(v.string()))
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
