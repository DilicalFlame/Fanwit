import type { HostFactory } from "./host";
import type { ModuleDefinition } from "./kernel/module";

/**
 * app.config.ts: which modules are on, the host, data strategies, presets, feature flags.
 *
 * @example
 * ```ts
 * export default defineAppConfig({
 *   modules: appModules,
 *   data: { mode: "vault", layout: { persist: "vault" } },
 *   features: { labs: false, plugins: true }
 * });
 * ```
 */
export interface AppConfig {
	/** Your compile time modules (src/app/modules/*). */
	modules?: ModuleDefinition[];
	/** Supply a RemoteHost for a web build backed by your server. */
	host?: HostFactory;
	data?: {
		mode?: "global" | "vault" | "hybrid";
		windowState?: "vault" | "global";
		layout?: { persist?: "vault" | "global" | "none" };
		notifications?: { history?: "global" | "vault"; retentionDays?: number };
	};
	layout?: {
		/** Preset used as the app default and reset target. */
		default?: string;
	};
	/** App layer of settings (between schema defaults and the user's settings.toml). */
	settings?: Record<string, unknown>;
	plugins?: {
		/** Isolation levels this app accepts for runtime plugins. */
		allow?: ("data" | "worker" | "none")[];
		/** Static registry.json URLs the app trusts. */
		registries?: string[];
	};
	/** Turn core feature modules off (tree shaken when false). */
	features?: Partial<Record<"labs" | "devtools" | "manual" | "plugins" | "tray" | "onboarding" | "samples", boolean>>;
}

/**
 * Type `app.config.ts` (it returns the config unchanged). The one place to choose core features,
 * the default layout, data strategies and plugin policy.
 *
 * @example
 * ```ts
 * export default defineAppConfig({
 *   modules: appModules,
 *   layout: { default: "vscode" },
 *   features: { labs: false, devtools: true }
 * });
 * ```
 */
export function defineAppConfig(c: AppConfig): AppConfig {
	return c;
}
