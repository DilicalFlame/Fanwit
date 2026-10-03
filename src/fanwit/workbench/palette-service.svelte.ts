/**
 * Command palette (Section 5.4): a provider based quick input. Prefixes pick the mode:
 *   (none) quick open   > commands   @ symbols   # tags   : go to   ? help   ~ windows
 * When a command needs arguments, the palette turns into prompt steps generated from the schema.
 */
import { toDisposable, type Disposable } from "../kernel/disposable";
import { haptic } from "../motion/motion";
import type { Kernel } from "../kernel/kernel.svelte";
import type { ArgSpec } from "../commands/types";
import { optionValues } from "../commands/args";
import { fuzzy } from "./fuzzy";

export interface PaletteItem {
	id: string;
	label: string;
	description?: string;
	detail?: string;
	category?: string;
	icon?: string;
	keys?: string[] | null;
	disabled?: string | null;
	positions?: number[];
	run(o: { keepOpen: boolean }): unknown;
	score?: number;
}

export interface PaletteProvider {
	prefix: string;
	title: string;
	placeholder?: string;
	provide(query: string, k: Kernel): PaletteItem[] | Promise<PaletteItem[]>;
}

export interface PromptStep {
	name: string;
	spec: ArgSpec;
	title: string;
}

export class PaletteService {
	visible = $state(false);
	query = $state("");
	items = $state.raw<PaletteItem[]>([]);
	selected = $state(0);
	loading = $state(false);
	/** Argument prompt mode. */
	prompt = $state<{ title: string; steps: PromptStep[]; index: number; values: Record<string, unknown>; resolve: (v: Record<string, unknown> | undefined) => void } | null>(null);
	providers = new Map<string, PaletteProvider>();
	private returnFocus: Element | null = null;
	private seq = 0;

	constructor(private k: Kernel) {}

	register(p: PaletteProvider): Disposable {
		this.providers.set(p.prefix, p);
		return toDisposable(() => this.providers.delete(p.prefix));
	}

	get mode(): PaletteProvider | undefined {
		const prefixes = [...this.providers.keys()].filter(Boolean).sort((a, b) => b.length - a.length);
		const p = prefixes.find((x) => this.query.startsWith(x));
		return this.providers.get(p ?? "");
	}

	open(prefix = "") {
		if (!this.visible) this.returnFocus = document.activeElement;
		this.visible = true;
		this.query = prefix;
		this.selected = 0;
		void this.refresh();
	}

	close() {
		this.visible = false;
		if (this.prompt) {
			this.prompt.resolve(undefined);
			this.prompt = null;
		}
		const el = this.returnFocus as HTMLElement | null;
		this.returnFocus = null;
		queueMicrotask(() => el?.focus?.());
	}

	async refresh() {
		const id = ++this.seq;
		if (this.prompt) {
			this.items = this.promptItems();
			return;
		}
		const mode = this.mode;
		if (!mode) {
			this.items = [];
			return;
		}
		const q = this.query.slice(mode.prefix.length).trim();
		this.loading = true;
		try {
			const list = await mode.provide(q, this.k);
			if (id !== this.seq) return;
			this.items = list;
			this.selected = Math.min(this.selected, Math.max(0, list.length - 1));
		} finally {
			if (id === this.seq) this.loading = false;
		}
	}

	setQuery(q: string) {
		this.query = q;
		this.selected = 0;
		void this.refresh();
	}

	async accept(index = this.selected, keepOpen = false) {
		const item = this.items[index];
		if (!item || item.disabled) return;
		haptic("tick");
		if (!keepOpen && !this.prompt) this.visible = false;
		await item.run({ keepOpen });
	}

	// ----- argument prompting -----

	/** Used as the command service's prompter. Resolves with the collected values or undefined. */
	ask(title: string, steps: PromptStep[], given: Record<string, unknown>): Promise<Record<string, unknown> | undefined> {
		return new Promise((resolve) => {
			if (!this.visible) this.returnFocus = document.activeElement;
			this.prompt = { title, steps, index: 0, values: { ...given }, resolve };
			this.visible = true;
			this.query = "";
			this.items = this.promptItems();
			this.selected = 0;
		});
	}

	get step(): PromptStep | undefined {
		return this.prompt?.steps[this.prompt.index];
	}

	private promptItems(): PaletteItem[] {
		const step = this.step;
		if (!step) return [];
		const s = step.spec;
		const q = this.query.trim();
		const choose = (value: unknown) => () => this.submitStep(value);
		let options: { value: string; label?: string; description?: string }[] = [];
		if (s.type === "enum") options = optionValues(s);
		else if (s.type === "boolean") options = [{ value: "true", label: "Yes" }, { value: "false", label: "No" }];
		else if (s.type === "ref") options = this.refOptions(s.ref);
		if (options.length) {
			return options
				.map((o) => ({ o, m: fuzzy(q, o.label ?? o.value) }))
				.filter((x) => x.m)
				.sort((a, b) => b.m!.score - a.m!.score)
				.map(({ o, m }) => ({ id: o.value, label: o.label ?? o.value, description: o.description, positions: m!.positions, run: choose(s.type === "boolean" ? o.value === "true" : o.value) }));
		}
		const hint = s.type === "number" ? `Enter a number${s.min !== undefined ? ` (${s.min}–${s.max ?? "∞"})` : ""}` : s.type === "color" ? "Enter a colour (#ff8800, oklch(...))" : s.type === "path" ? "Type a path, or choose Browse…" : s.type === "json" ? "Enter JSON" : "Type a value and press Enter";
		const items: PaletteItem[] = [{ id: "value", label: q || hint, description: q ? `Use "${q}"` : undefined, run: choose(s.type === "number" ? Number(q) : s.type === "json" ? safeJson(q) : q) }];
		if (s.type === "path") {
			items.push({
				id: "browse",
				label: "Browse…",
				run: async () => {
					const p = s.kind === "folder" ? await this.k.host.fs.pickFolder() : s.kind === "save" ? await this.k.host.dialog.save({}) : await this.k.host.dialog.open({});
					if (p) this.submitStep(Array.isArray(p) ? p[0] : p);
				}
			});
		}
		return items;
	}

	private refOptions(ref?: ArgSpec["ref"]) {
		const sys = this.k.sys;
		if (ref === "command") return this.k.commands.list().map((c) => ({ value: c.def.id, label: this.k.commands.label(c.def.id) }));
		if (ref === "view") return [...sys.layout.views.values()].map((v) => ({ value: v.id, label: typeof v.title === "string" ? v.title : v.id }));
		if (ref === "theme") return sys.themes.list().map((t) => ({ value: t.def.meta.id, label: t.def.meta.name }));
		if (ref === "preset") return [...sys.layout.presets.values()].map((p) => ({ value: p.id, label: p.title, description: p.description }));
		if (ref === "window") return [...sys.windows.kinds.values()].map((w) => ({ value: w.kind, label: w.kind }));
		return [];
	}

	submitStep(value: unknown) {
		const p = this.prompt;
		if (!p) return;
		const step = p.steps[p.index];
		if (step.spec.type === "number" && Number.isNaN(value)) return;
		p.values[step.name] = value;
		p.index++;
		this.query = "";
		if (p.index >= p.steps.length) {
			this.prompt = null;
			this.visible = false;
			p.resolve(p.values);
			return;
		}
		this.items = this.promptItems();
		this.selected = 0;
	}

	back() {
		if (this.prompt && this.prompt.index > 0) {
			this.prompt.index--;
			this.items = this.promptItems();
		}
	}
}

function safeJson(s: string) {
	try {
		return JSON.parse(s);
	} catch {
		return s;
	}
}
