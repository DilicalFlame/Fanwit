/**
 * Installer state shared by every page (Section 16.9.2). Pages read and write it through
 * `useInstaller()`; the Rust side plans and installs through the fanwit-install engine.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getContext, setContext, type Component } from "svelte";
import { evalWhen } from "$fanwit/kernel/when";
import { evaluate, type TsResult } from "./steps";

// every file in steps/ registers its TypeScript install step
import.meta.glob("./steps/*.ts", { eager: true });

export interface Info {
	app: { id: string; name: string; version: string; slug: string };
	installer: { preset: string; pages: string[]; scope: string; theme: string };
	components: { id: string; title: string; required: boolean; default: boolean; size?: string }[];
	options: { id: string; title: string; type: string; default?: unknown; when?: string }[];
	license: string;
	installDir: string;
	installed: { version: string; components: string[]; scope: string; dir: string; steps: { id: string; title: string; ours: boolean }[] } | null;
	/** default install folder per scope */
	installDirs: Record<string, string>;
	/** steps declared as runtime = "ts" in installer.toml */
	tsSteps: { id: string; handler: string; title: string }[];
	admin: boolean;
	/** "uninstall" when started from Apps and features' Uninstall button */
	launch: "uninstall" | null;
	simulated: boolean;
	payload: { name: string; size: number } | null;
	os: string;
}

export type Status = "satisfied" | "missing" | "outdated" | "deferred" | "blocked";
export interface PlanItem {
	id: string;
	title: string;
	phase: string;
	status: Status;
	detail: string;
	strategy?: string;
	actions: string[];
	download: number;
	disk: number;
	network: boolean;
	elevation: boolean;
}
export interface Plan {
	target: string;
	items: PlanItem[];
	download: number;
	disk: number;
	elevation: boolean;
	reboot: boolean;
	blocked: boolean;
}
export type StepState = "pending" | "running" | "done" | "ok" | "deferred" | "blocked" | "failed";

export interface PageDef {
	id: string;
	title: string;
	component: () => Promise<{ default: Component }>;
	/** insert after this page when it is not listed in installer.toml */
	after?: string;
	/** when clause over options, components, `silent` and `machine` */
	when?: string;
}

const BUILTIN: PageDef[] = [
	{ id: "welcome", title: "Welcome", component: () => import("./pages/Welcome.svelte") },
	{ id: "license", title: "Licence", component: () => import("./pages/License.svelte") },
	{ id: "scope", title: "Install for", component: () => import("./pages/Scope.svelte") },
	{ id: "components", title: "Components", component: () => import("./pages/Components.svelte") },
	{ id: "options", title: "Options", component: () => import("./pages/Options.svelte") },
	{ id: "prereqs", title: "Prerequisites", component: () => import("./pages/Prereqs.svelte") },
	{ id: "summary", title: "Summary", component: () => import("./pages/Summary.svelte") },
	{ id: "progress", title: "Install", component: () => import("./pages/Progress.svelte") },
	{ id: "finish", title: "Finish", component: () => import("./pages/Finish.svelte") },
	{ id: "maintenance", title: "Maintenance", component: () => import("./pages/Maintenance.svelte") }
];
const custom: PageDef[] = [];

/** Add or replace a page. Order comes from installer.toml `pages`, else `after`. */
export function defineInstallerPage(def: PageDef) {
	custom.push(def);
}

export const size = (b: number) => (b <= 0 ? "Nothing" : b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.ceil(b / 1e6))} MB`);

export class Installer {
	info = $state<Info | null>(null);
	error = $state("");
	index = $state(0);
	scope = $state("user");
	components = $state<string[]>([]);
	options = $state<Record<string, unknown>>({});
	installDir = $state("");
	licenseAccepted = $state(false);
	plan = $state<Plan | null>(null);
	/** what the TypeScript steps decided, by step id */
	ts = $state<Record<string, TsResult>>({});
	private dirTouched = false;
	planning = $state(false);
	steps = $state<Record<string, { state: StepState; detail: string }>>({});
	log = $state<string[]>([]);
	result = $state<number | null>(null);
	mode = $state<"install" | "maintenance" | "uninstall">("install");
	/** show the uninstall confirmation straight away (Apps and features, or the Uninstall choice) */
	confirmUninstall = $state(false);
	cancelling = $state(false);

	async load() {
		try {
			const info = await invoke<Info>("setup_info");
			this.info = info;
			this.scope = info.installer.scope === "machine" ? "machine" : "user";
			this.components = info.components.filter((c) => c.default).map((c) => c.id);
			this.options = Object.fromEntries(info.options.map((o) => [o.id, o.default ?? (o.type === "boolean" ? false : "")]));
			this.installDir = info.installDir;
			if (info.installed || info.launch === "uninstall") this.mode = "maintenance";
			this.confirmUninstall = info.launch === "uninstall";
		} catch (e) {
			this.error = String(e);
		}
	}

	truthy = (key: string): unknown => {
		if (key.startsWith("component.")) return this.components.includes(key.slice(10));
		if (key === "machine") return this.scope === "machine";
		if (key === "silent") return false;
		return this.options[key.replace(/^option\./, "")];
	};

	/** The page sequence for this run. */
	get pages(): PageDef[] {
		const info = this.info;
		if (!info) return [];
		if (this.mode !== "install") {
			const page = BUILTIN.find((p) => p.id === "maintenance")!;
			return [this.confirmUninstall || this.mode === "uninstall" ? { ...page, title: "Uninstall" } : page];
		}
		const all = new Map([...BUILTIN, ...custom].map((p) => [p.id, p]));
		const ids = info.installer.pages.length ? [...info.installer.pages] : ["welcome", "components", "options", "summary", "progress", "finish"];
		for (const c of custom) if (!ids.includes(c.id)) ids.splice(c.after ? ids.indexOf(c.after) + 1 : ids.length - 2, 0, c.id);
		if (!ids.includes("progress")) ids.push("progress");
		if (!ids.includes("finish")) ids.push("finish");
		return ids
			.map((id) => all.get(id))
			.filter((p): p is PageDef => !!p)
			.filter((p) => {
				if (p.id === "license") return !!info.license.trim();
				if (p.id === "options") return this.visibleOptions.length > 0;
				if (p.id === "components") return info.components.some((c) => !c.required);
				if (p.id === "prereqs") return info.components.length > 0;
				return evalWhen(p.when, this.truthy);
			});
	}

	get page(): PageDef | undefined {
		return this.pages[this.index];
	}

	get visibleOptions() {
		return (this.info?.options ?? []).filter((o) => evalWhen(o.when, this.truthy));
	}

	get selection() {
		return { scope: this.scope, components: this.components, options: $state.snapshot(this.options), installDir: this.installDir, ts: $state.snapshot(this.ts) };
	}

	/** Switch scope; the folder follows unless the user picked one. */
	setScope(scope: string) {
		this.scope = scope;
		if (!this.dirTouched && this.info?.installDirs[scope]) this.installDir = this.info.installDirs[scope];
	}

	setInstallDir(dir: string) {
		this.dirTouched = true;
		this.installDir = dir;
	}

	/** Run the TypeScript steps' checks and collect what they would do. */
	async evaluateTs() {
		const out: Record<string, TsResult> = {};
		for (const s of this.info?.tsSteps ?? []) {
			try {
				out[s.id] = await evaluate(s.handler, { options: $state.snapshot(this.options), components: [...this.components], scope: this.scope });
			} catch (e) {
				out[s.id] = { status: "missing", detail: `check failed: ${e}`, actions: [], undo: [] };
			}
		}
		this.ts = out;
	}

	get canNext(): boolean {
		const id = this.page?.id;
		if (id === "license") return this.licenseAccepted;
		if (id === "summary" || id === "prereqs") return !!this.plan && !this.plan.blocked && !this.planning;
		if (id === "progress") return this.result !== null && this.result !== 1603 && this.result !== 1602;
		return true;
	}

	get installing() {
		return this.page?.id === "progress" && this.result === null;
	}

	async refreshPlan() {
		this.planning = true;
		try {
			await this.evaluateTs();
			this.plan = await invoke<Plan>("setup_plan", { sel: this.selection });
			this.error = "";
		} catch (e) {
			this.error = String(e);
		} finally {
			this.planning = false;
		}
	}

	go(i: number) {
		this.index = Math.max(0, Math.min(i, this.pages.length - 1));
		const id = this.page?.id;
		if (id === "prereqs" || id === "summary") void this.refreshPlan();
		if (id === "progress" && this.result === null && !Object.keys(this.steps).length) void this.install();
	}
	next = () => this.go(this.index + 1);
	back = () => this.go(this.index - 1);

	async install() {
		await this.refreshPlan();
		if (!this.plan || this.plan.blocked) return;
		this.steps = Object.fromEntries(this.rows.map((r) => [r.id, { state: "pending" as StepState, detail: "" }]));
		this.log = [];
		this.result = null;
		const offs = await Promise.all([
			listen<{ id: string; state: StepState; detail: string }>("setup://step", (e) => (this.steps[e.payload.id] = { state: e.payload.state, detail: e.payload.detail })),
			listen<string>("setup://log", (e) => (this.log = [...this.log, e.payload])),
			listen<number>("setup://done", (e) => {
				this.result = e.payload;
				this.cancelling = false;
				// steps that only run on first launch
				for (const r of this.rows) if (this.steps[r.id]?.state === "pending" && r.phase === "firstRun") this.steps[r.id] = { state: "deferred", detail: "runs on first launch" };
				for (const off of offs) off();
				if (e.payload === 0 || e.payload === 3010) setTimeout(() => this.next(), this.info?.installer.preset === "one-click" ? 300 : 900);
			})
		]);
		await invoke("setup_install", { sel: this.selection });
	}

	/** Progress rows: bootstrap steps, the native package as one row, then the package and first run steps. */
	get rows(): { id: string; title: string; phase: string }[] {
		const items = this.plan?.items ?? [];
		const pkg = { id: "package", title: `Installing ${this.info?.app.name} ${this.info?.app.version}`, phase: "package" };
		return [...items.filter((i) => i.phase === "bootstrap"), pkg, ...items.filter((i) => i.phase !== "bootstrap")].map((i) => ({ id: i.id, title: i.title, phase: i.phase }));
	}

	get progress(): number {
		const rows = this.rows;
		if (!rows.length) return 0;
		const done = rows.filter((r) => ["done", "ok", "deferred"].includes(this.steps[r.id]?.state ?? "")).length;
		const running = rows.some((r) => this.steps[r.id]?.state === "running") ? 0.5 : 0;
		return Math.round(((done + running) / rows.length) * 100);
	}

	async cancel() {
		this.cancelling = true;
		await invoke("setup_cancel");
	}

	/** Pick the install folder with the system dialog; the app's own subfolder is added. */
	async browse() {
		const { open } = await import("@tauri-apps/plugin-dialog");
		const picked = await open({ directory: true, defaultPath: this.installDir, title: `Install ${this.info?.app.name} to` });
		if (typeof picked === "string") this.setInstallDir(await invoke<string>("setup_pick_dir", { picked }));
	}

	async launch() {
		await invoke("setup_launch", { dir: this.installDir }).catch((e) => (this.error = String(e)));
	}

	async uninstall(purge: boolean) {
		this.mode = "uninstall";
		this.log = [];
		const off = await listen<string>("setup://log", (e) => (this.log = [...this.log, e.payload]));
		try {
			this.result = await invoke<number>("setup_uninstall", { purge });
		} catch (e) {
			this.error = String(e);
		}
		off();
	}

	repair() {
		this.mode = "install";
		this.components = this.info?.installed?.components ?? this.components;
		this.index = this.pages.findIndex((p) => p.id === "summary");
		this.go(this.index);
	}
}

const KEY = Symbol("installer");
export const provideInstaller = (i: Installer) => setContext(KEY, i);
/** options, components, plan, next(), back() */
export const useInstaller = () => getContext<Installer>(KEY);
