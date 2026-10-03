/**
 * Settings service (Section 13.2). Resolution layers, each overriding the one before:
 *   default -> app (app.config.ts) -> global (settings.toml) -> vault (.appname/settings.toml)
 *   -> window -> cli (--set key=value, APPNAME_* env)
 * Invalid values are reported and fall back to the next lower layer.
 */
import { untrack } from "svelte";
import { Emitter, toDisposable, type Disposable } from "../kernel/disposable";
import { FanwitError } from "../kernel/errors";
import type { ScopedLogger } from "../kernel/logger";
import type { Host } from "../host/types";
import { joinPath } from "../host/types";
import { locate, TomlFile, type TomlDiagnostic } from "../data/toml-file.svelte";
import { checkSetting, coerceSetting, type SettingDef, type SettingScope, type SettingsContribution } from "./define";

export type Layer = "default" | "app" | "global" | "vault" | "window" | "cli";
export const LAYERS: Layer[] = ["default", "app", "global", "vault", "window", "cli"];

export interface Inspection {
	key: string;
	default: unknown;
	app?: unknown;
	global?: unknown;
	vault?: unknown;
	window?: unknown;
	cli?: unknown;
	effective: unknown;
	source: Layer;
}

const SETTINGS_TEMPLATE = "# Settings. Comments are preserved when the app writes this file.\n";

function getPath(obj: Record<string, unknown> | undefined, key: string): unknown {
	let cur: unknown = obj;
	for (const p of key.split(".")) {
		if (!cur || typeof cur !== "object") return undefined;
		cur = (cur as Record<string, unknown>)[p];
	}
	return cur;
}

function setPath(obj: Record<string, unknown>, key: string, value: unknown): Record<string, unknown> {
	const parts = key.split(".");
	const root = structuredClone(obj);
	let cur = root;
	for (const p of parts.slice(0, -1)) {
		if (!cur[p] || typeof cur[p] !== "object" || Array.isArray(cur[p])) cur[p] = {};
		cur = cur[p] as Record<string, unknown>;
	}
	const last = parts[parts.length - 1];
	if (value === undefined) delete cur[last];
	else cur[last] = value;
	// prune empty tables left behind by resets
	const prune = (o: Record<string, unknown>) => {
		for (const [k, v] of Object.entries(o)) {
			if (v && typeof v === "object" && !Array.isArray(v)) {
				prune(v as Record<string, unknown>);
				if (!Object.keys(v as object).length) delete o[k];
			}
		}
	};
	prune(root);
	return root;
}

function flatten(obj: Record<string, unknown>, prefix = "", out: string[] = []) {
	for (const [k, v] of Object.entries(obj)) {
		const key = prefix ? `${prefix}.${k}` : k;
		if (v && typeof v === "object" && !Array.isArray(v)) flatten(v as Record<string, unknown>, key, out);
		else out.push(key);
	}
	return out;
}

export interface SecretStore {
	get(key: string): Promise<string | null>;
	set(key: string, value: string | null): Promise<void>;
}

export class SettingsService {
	version = $state(0);
	readonly onDidChange = new Emitter<string[]>();
	private defs = new Map<string, SettingDef & { owner: string }>();
	private app: Record<string, unknown> = {};
	private windowLayer: Record<string, unknown> = {};
	private cli: Record<string, unknown> = {};
	global: TomlFile;
	vault: TomlFile | null = null;
	private rawEnv: Record<string, string> = {};
	private secretCache = new Map<string, string>();
	secrets: SecretStore | null = null;

	constructor(
		private host: Host,
		private log: ScopedLogger
	) {
		this.global = new TomlFile(host, joinPath(host.dirs.config, "settings.toml"), {
			template: SETTINGS_TEMPLATE,
			validate: (v, text) => this.validateFile(v, text, "settings.toml")
		});
		this.global.onDidChangeFromDisk.on(() => this.changed(["*"]));
	}

	async init(o: { app?: Record<string, unknown>; overrides?: Record<string, unknown>; env?: Record<string, string> } = {}) {
		this.app = o.app ?? {};
		for (const [k, v] of Object.entries(o.overrides ?? {})) this.cli[k] = v;
		this.rawEnv = o.env ?? {};
		await this.global.load();
		await this.global.watch();
		this.resolveEnv();
		this.changed(["*"]);
	}

	/** Map APPNAME_NOTES_EDITOR_FONTSIZE=18 style variables onto registered keys. */
	private resolveEnv() {
		for (const [name, raw] of Object.entries(this.rawEnv)) {
			const want = name.toLowerCase().replace(/_/g, ".");
			const def = [...this.defs.values()].find((d) => d.key.toLowerCase() === want);
			if (def) this.cli[def.key] = coerceSetting(def, raw);
		}
		for (const [k, v] of Object.entries(this.cli)) {
			const def = this.defs.get(k);
			if (def && typeof v === "string") this.cli[k] = coerceSetting(def, v);
		}
	}

	private validateFile(v: Record<string, unknown>, text: string, file: string): TomlDiagnostic[] {
		const diags: TomlDiagnostic[] = [];
		for (const key of flatten(v)) {
			const def = this.defs.get(key);
			const leaf = key.split(".").pop()!;
			const pos = locate(text, leaf);
			if (!def) {
				// unknown keys are kept (they may belong to a disabled plugin) but flagged
				diags.push({ file, ...pos, message: `Unknown setting "${key}" (kept).`, severity: "warning" });
				continue;
			}
			const problem = checkSetting(def, getPath(v, key));
			if (problem) diags.push({ file, ...pos, message: `${key}: ${problem}; using the next layer.`, severity: "warning" });
		}
		return diags;
	}

	/** Open or close the vault layer. */
	async setVault(dir: string | null) {
		this.vault?.dispose();
		this.vault = null;
		if (dir) {
			this.vault = new TomlFile(this.host, joinPath(dir, "settings.toml"), {
				template: "# Vault settings override your user settings for this vault.\n",
				validate: (v, text) => this.validateFile(v, text, "vault settings.toml")
			});
			this.vault.onDidChangeFromDisk.on(() => this.changed(["*"]));
			await this.vault.load();
			await this.vault.watch();
		}
		this.changed(["*"]);
	}

	contribute(c: SettingsContribution, owner: string): Disposable {
		for (const d of c.settings) this.defs.set(d.key, { ...d, owner });
		this.resolveEnv();
		this.changed(c.settings.map((d) => d.key));
		return toDisposable(() => {
			for (const d of c.settings) if (this.defs.get(d.key)?.owner === owner) this.defs.delete(d.key);
			this.changed([]);
		});
	}

	private changed(keys: string[]) {
		this.version = untrack(() => this.version) + 1;
		this.onDidChange.fire(keys);
	}

	definition(key: string) {
		return this.defs.get(key);
	}

	list() {
		void this.version;
		return [...this.defs.values()];
	}

	private layerValue(layer: Layer, key: string, def?: SettingDef): unknown {
		switch (layer) {
			case "default":
				return def?.default;
			case "app":
				return this.app[key] ?? getPath(this.app, key);
			case "global":
				return getPath(this.global.value, key);
			case "vault":
				return this.vault ? getPath(this.vault.value, key) : undefined;
			case "window":
				return this.windowLayer[key];
			case "cli":
				return this.cli[key];
		}
	}

	/** Effective value (reactive: reads `version`). */
	get<T = unknown>(key: string): T {
		void this.version;
		const def = this.defs.get(key);
		if (def?.secret) return (this.secretCache.get(key) ?? "") as T;
		for (const layer of [...LAYERS].reverse()) {
			const v = this.layerValue(layer, key, def);
			if (v === undefined) continue;
			if (def && layer !== "default" && checkSetting(def, v)) continue; // invalid: fall back
			return v as T;
		}
		return undefined as T;
	}

	inspect(key: string): Inspection {
		void this.version;
		const def = this.defs.get(key);
		const out: Inspection = { key, default: def?.default, effective: undefined, source: "default" };
		for (const layer of LAYERS) {
			const v = this.layerValue(layer, key, def);
			if (layer !== "default" && v !== undefined) (out as unknown as Record<string, unknown>)[layer] = v;
		}
		for (const layer of [...LAYERS].reverse()) {
			const v = this.layerValue(layer, key, def);
			if (v !== undefined && (layer === "default" || !def || !checkSetting(def, v))) {
				out.effective = v;
				out.source = layer;
				break;
			}
		}
		return out;
	}

	isModified(key: string, scope: SettingScope = "global") {
		void this.version;
		return this.layerValue(scope, key) !== undefined;
	}

	async set(key: string, value: unknown, o: { scope?: SettingScope } = {}) {
		const scope = o.scope ?? "global";
		const def = this.defs.get(key);
		if (def) {
			if (def.scope && !def.scope.includes(scope)) {
				throw new FanwitError("SETTING_SCOPE", { message: `Setting "${key}" cannot be set in the ${scope} scope.`, hint: `Allowed: ${def.scope.join(", ")}.` });
			}
			if (value !== undefined) {
				const problem = checkSetting(def, value);
				if (problem) throw new FanwitError("SETTING_INVALID", { message: `Invalid value for ${key}: ${problem}.` });
			}
			if (def.secret) {
				await this.secrets?.set(key, (value as string) || null);
				if (value) this.secretCache.set(key, String(value));
				else this.secretCache.delete(key);
				this.changed([key]);
				return;
			}
		}
		if (scope === "window") {
			if (value === undefined) delete this.windowLayer[key];
			else this.windowLayer[key] = value;
		} else {
			const file = scope === "vault" ? this.vault : this.global;
			if (!file) throw new FanwitError("STORAGE_NO_VAULT", { message: "No vault is open.", hint: "Open a vault to change vault settings." });
			file.set(setPath(file.value, key, value));
		}
		this.changed([key]);
		if (def?.restart) this.log.info(`${key} changed; restart required`);
	}

	reset(key: string, o: { scope?: SettingScope } = {}) {
		return this.set(key, undefined, o);
	}

	/** Load secrets into memory for synchronous get(). */
	async loadSecrets() {
		for (const d of this.defs.values()) {
			if (!d.secret) continue;
			const v = await this.secrets?.get(d.key).catch(() => null);
			if (v) this.secretCache.set(d.key, v);
		}
		this.changed([]);
	}

	/** Copy as TOML snippet for one setting. */
	tomlFor(key: string, value = this.get(key)) {
		const parts = key.split(".");
		const leaf = parts.pop()!;
		const v = typeof value === "string" ? JSON.stringify(value) : Array.isArray(value) ? JSON.stringify(value) : String(value);
		return parts.length ? `[${parts.join(".")}]\n${leaf} = ${v}\n` : `${leaf} = ${v}\n`;
	}

	cliOverridden(key: string) {
		void this.version;
		return key in this.cli;
	}

	async flush() {
		await this.global.flush();
		await this.vault?.flush();
	}
}
