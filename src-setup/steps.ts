/**
 * TypeScript install steps (Section 16.8). They run in the Setup app, where there is a webview,
 * for steps declared in installer.toml as `type = "custom"`, `runtime = "ts"`, `handler = "<id>"`.
 *
 * A step never changes the system itself: `check` looks (through the engine), `apply` queues
 * actions such as `ctx.download(...)`, and the engine performs them with the same journal,
 * rollback, receipt and elevation as every other step. Put steps in `src-setup/steps/*.ts`;
 * they are picked up automatically.
 */
import { invoke } from "@tauri-apps/api/core";

export type Action =
	| { op: "download"; url: string; sha256: string; to: string }
	| { op: "extract"; archive: string; to: string }
	| { op: "copy"; from: string; to: string }
	| { op: "remove"; path: string }
	| { op: "writeFile"; path: string; content: string; previous?: string | null }
	| { op: "exec"; command: string[]; env: Record<string, string>; optional?: boolean };

export type CheckResult = "satisfied" | "missing" | { status: "satisfied" | "missing"; detail?: string };

export interface StepContext {
	/** The user's choices. */
	options: Record<string, unknown>;
	components: string[];
	scope: string;
	/** Resolve `{appData}`, `{installDir}` and the other placeholders. */
	path(p: string): Promise<string>;
	exists(p: string): Promise<boolean>;
	/** SHA-256 of a file, or null when it does not exist. */
	sha256(p: string): Promise<string | null>;
	/** Run a command to look at the system (checks only; use `run` to change things). */
	probe(command: string): Promise<{ code: number; stdout: string }>;
	/** Queue a verified download (https, pinned SHA-256). */
	download(o: { url: string; sha256: string; to: string }): void;
	extract(archive: string, to: string): void;
	copy(from: string, to: string): void;
	writeFile(path: string, content: string): void;
	remove(path: string): void;
	/** Queue a command; `optional` ignores a failure. */
	run(command: string | string[], o?: { env?: Record<string, string>; optional?: boolean }): void;
	/** Extra undo for uninstall, besides the inverses of the queued actions. */
	undo: { remove(path: string): void; run(command: string | string[]): void };
}

export interface InstallStepDef {
	/** The `handler` used in installer.toml. */
	id: string;
	check(ctx: StepContext): Promise<CheckResult> | CheckResult;
	apply(ctx: StepContext): Promise<void> | void;
	/** A sentence for the plan, for example "Download the 1.2 GB base model". */
	summary?: string;
}

/** The result handed to the engine (matches TsStep in src-tauri/install/src/engine.rs). */
export interface TsResult {
	status: "satisfied" | "missing";
	detail: string;
	actions: Action[];
	undo: Action[];
}

const registry = new Map<string, InstallStepDef>();

export function defineInstallStep(def: InstallStepDef): InstallStepDef {
	registry.set(def.id, def);
	return def;
}

const words = (c: string | string[]) => (Array.isArray(c) ? c : c.split(/\s+/).filter(Boolean));

/** Evaluate one step: run its check, and when something is missing, collect what apply queues. */
export async function evaluate(handler: string, choices: { options: Record<string, unknown>; components: string[]; scope: string }): Promise<TsResult> {
	const def = registry.get(handler);
	if (!def) return { status: "missing", detail: `no TypeScript step "${handler}" in src-setup/steps`, actions: [], undo: [] };
	const queued: Promise<Action>[] = [];
	const undo: Promise<Action>[] = [];
	const resolve = (p: string) => invoke<string>("setup_resolve", { path: p });
	const probe = (o: { command?: string; path?: string }) => invoke<{ exists: boolean | null; sha256: string | null; exec: { code: number; stdout: string } | null }>("setup_probe", o);
	const runAction = async (c: string | string[], o?: { env?: Record<string, string>; optional?: boolean }): Promise<Action> => ({
		op: "exec",
		command: await Promise.all(words(c).map((w) => (w.includes("{") ? resolve(w) : w))),
		env: o?.env ?? {},
		optional: o?.optional ?? false
	});
	const ctx: StepContext = {
		...choices,
		path: resolve,
		exists: async (p) => !!(await probe({ path: p })).exists,
		sha256: async (p) => (await probe({ path: p })).sha256,
		probe: async (command) => (await probe({ command })).exec ?? { code: 127, stdout: "" },
		download: (o) => void queued.push(resolve(o.to).then((to) => ({ op: "download", url: o.url, sha256: o.sha256, to }))),
		extract: (archive, to) => void queued.push(Promise.all([resolve(archive), resolve(to)]).then(([a, t]) => ({ op: "extract", archive: a, to: t }))),
		copy: (from, to) => void queued.push(Promise.all([resolve(from), resolve(to)]).then(([f, t]) => ({ op: "copy", from: f, to: t }))),
		writeFile: (path, content) => void queued.push(resolve(path).then((p) => ({ op: "writeFile", path: p, content, previous: null }))),
		remove: (path) => void queued.push(resolve(path).then((p) => ({ op: "remove", path: p }))),
		run: (c, o) => void queued.push(runAction(c, o)),
		undo: {
			remove: (path) => void undo.push(resolve(path).then((p) => ({ op: "remove", path: p }))),
			run: (c) => void undo.push(runAction(c, { optional: true }))
		}
	};
	const checked = await def.check(ctx);
	const status = typeof checked === "string" ? checked : checked.status;
	const detail = (typeof checked === "string" ? undefined : checked.detail) ?? def.summary ?? "";
	if (status === "satisfied") return { status, detail, actions: [], undo: [] };
	await def.apply(ctx);
	return { status, detail, actions: await Promise.all(queued), undo: await Promise.all(undo) };
}
