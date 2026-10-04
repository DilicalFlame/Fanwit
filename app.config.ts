import { defineAppConfig } from "./src/fanwit/config";
import { appModules } from "./src/app/modules";

/**
 * App configuration (Section 3.4). Which core modules are on, the host, data strategies,
 * presets and feature flags. Your code lives in src/app; the core in src/fanwit.
 */
export default defineAppConfig({
	modules: appModules,
	data: {
		mode: "hybrid", // works without a vault; vaults add project scoped data
		windowState: "global",
		layout: { persist: "vault" }, // per vault workspace.toml (global when no vault is open)
		notifications: { history: "global", retentionDays: 30 }
	},
	layout: { default: "vscode" },
	settings: {},
	plugins: { allow: ["data", "worker", "none"], registries: [] },
	features: { labs: true, devtools: true, manual: true, plugins: true, tray: true, onboarding: true, samples: true }
});
