/**
 * Shortcuts Manager (Chapter 6). Decides which command a key press means in the current
 * context and hands over to the command pipeline. Precedence: user > plugin > module > core;
 * within a tier the most recently registered wins. `command = "-id"` removes a lower binding.
 */
import { untrack } from "svelte";
import { parse as parseToml } from "smol-toml";
import { toDisposable, type Disposable } from "../kernel/disposable";
import type { ContextKeyService } from "../kernel/context.svelte";
import type { ScopedLogger } from "../kernel/logger";
import type { Host, Platform } from "../host/types";
import type { CommandService } from "../commands/registry.svelte";
import { compileWhen } from "../kernel/when";
import { eventToSteps, formatSteps, parseBinding, toAccelerator, loadLayoutMap } from "./notation";
import { measure } from "../kernel/budget";

export type BindingSource = "core" | "module" | "plugin" | "user";

export interface Keybinding {
	key: string;
	command: string;
	args?: Record<string, unknown>;
	when?: string;
	mac?: string;
	win?: string;
	linux?: string;
	web?: string;
	global?: boolean;
	source?: BindingSource;
}

export interface ResolvedBinding extends Keybinding {
	steps: string[];
	source: BindingSource;
	owner: string;
	order: number;
	removal: boolean;
	/** Set when OS wide registration failed. */
	globalError?: string;
}

const TIER: Record<BindingSource, number> = { core: 0, module: 1, plugin: 2, user: 3 };
const CHORD_TIMEOUT = 2000;

export class KeybindingService {
	version = $state(0);
	/** Pending chord steps, shown in the status bar. */
	chord = $state<string[]>([]);
	/** When set, the next key press is delivered here instead of being dispatched (recorder). */
	recorder: ((steps: string) => void) | null = null;
	private bindings: ResolvedBinding[] = [];
	private seq = 0;
	private chordTimer: ReturnType<typeof setTimeout> | undefined;
	private globals = new Map<string, Disposable>();
	userFile: string | null = null;

	constructor(
		private platform: Platform,
		private commands: CommandService,
		private context: ContextKeyService,
		private log: ScopedLogger,
		private host: Host
	) {}

	private pickKey(b: Keybinding) {
		const p = this.platform;
		return (p === "macos" ? b.mac : p === "windows" ? b.win : p === "linux" ? b.linux : b.web) ?? b.key;
	}

	add(b: Keybinding, owner: string, source: BindingSource = b.source ?? "module"): Disposable {
		const removal = b.command.startsWith("-");
		const rb: ResolvedBinding = {
			...b,
			command: removal ? b.command.slice(1) : b.command,
			steps: this.pickKey(b) ? parseBinding(this.pickKey(b), this.platform) : [],
			source,
			owner,
			order: ++this.seq,
			removal
		};
		this.bindings.push(rb);
		if (rb.global && !removal) void this.registerGlobal(rb);
		this.version = untrack(() => this.version) + 1;
		return toDisposable(() => {
			this.bindings = this.bindings.filter((x) => x !== rb);
			this.globals.get(rb.steps.join(" "))?.dispose();
			this.version = untrack(() => this.version) + 1;
		});
	}

	private async registerGlobal(b: ResolvedBinding) {
		// global shortcuts are app wide: the main window registers them once
		if (!this.host.caps.globalShortcuts || b.steps.length !== 1 || this.host.windows.label !== "main") return;
		const accel = toAccelerator(b.steps[0]);
		try {
			const d = await this.host.keys.registerGlobal(accel, () => {
				void this.commands.run(b.command, b.args ?? {}, { source: "key" }).catch((e) => this.log.error(`global ${accel}:`, e));
			});
			this.globals.set(b.steps.join(" "), d);
		} catch (e) {
			b.globalError = String((e as Error)?.message ?? e);
			this.log.warn(`could not register global shortcut ${accel}: ${b.globalError}`);
			this.version = untrack(() => this.version) + 1;
		}
	}

	/** Bindings that survive removals, highest precedence first. */
	effective(): ResolvedBinding[] {
		void this.version;
		const sorted = [...this.bindings].sort((a, b) => TIER[b.source] - TIER[a.source] || b.order - a.order);
		const removals = sorted.filter((b) => b.removal);
		return sorted.filter(
			(b) =>
				!b.removal &&
				!removals.some(
					(r) => r.command === b.command && TIER[r.source] >= TIER[b.source] && (r.steps.length === 0 || r.steps.join(" ") === b.steps.join(" "))
				)
		);
	}

	all(): ResolvedBinding[] {
		void this.version;
		return [...this.bindings];
	}

	/** First effective binding for a command, for key chips. */
	keysFor(command: string): string[] | null {
		const b = this.effective().find((x) => x.command === command && !x.when?.includes("inputFocus"));
		return b ? b.steps : null;
	}

	label(command: string): string[] | null {
		const s = this.keysFor(command);
		return s ? formatSteps(s, this.platform) : null;
	}

	format(steps: string[]) {
		return formatSteps(steps, this.platform);
	}

	conflicts(steps: string[], except?: ResolvedBinding) {
		const k = steps.join(" ");
		return this.effective().filter((b) => b !== except && b.steps.join(" ") === k);
	}

	private resetChord() {
		clearTimeout(this.chordTimer);
		this.chord = [];
	}

	/** keydown handler (capture phase). Returns true when the event was consumed. */
	handle = (e: KeyboardEvent): boolean => {
		if (e.isComposing) return false;
		const steps = eventToSteps(e);
		if (steps.modifierOnly) return false;
		if (this.recorder) {
			e.preventDefault();
			e.stopPropagation();
			this.recorder(steps.logical);
			return true;
		}
		const t0 = performance.now();
		const buffer = [...this.chord];
		const target = e.target instanceof Element ? e.target : document.activeElement;
		const lookup = this.context.lookup(target);
		const inputFocus = !!lookup("inputFocus");

		const matchesAt = (b: ResolvedBinding, i: number) => {
			const s = b.steps[i];
			return s === steps.logical || s === steps.physical;
		};
		const live = this.effective().filter((b) => {
			if (b.steps.length <= buffer.length) return false;
			for (let i = 0; i < buffer.length; i++) if (b.steps[i] !== buffer[i]) return false;
			if (!matchesAt(b, buffer.length)) return false;
			// text input rule: unmodified keys never fire while typing unless the clause opts in
			if (inputFocus && !steps.hasModifier && !(b.when ?? "").includes("inputFocus") && !/^f\d+$|escape/.test(b.steps[buffer.length].split("+").pop()!)) return false;
			return !b.when || compileWhen(b.when).eval(lookup);
		});

		if (!live.length) {
			if (buffer.length) {
				this.resetChord();
				e.preventDefault();
				return true;
			}
			return false;
		}
		const complete = live.filter((b) => b.steps.length === buffer.length + 1);
		const longer = live.filter((b) => b.steps.length > buffer.length + 1);
		e.preventDefault();
		e.stopPropagation();
		if (longer.length && !complete.length) {
			clearTimeout(this.chordTimer);
			this.chord = [...buffer, live[0].steps[buffer.length]];
			this.chordTimer = setTimeout(() => this.resetChord(), CHORD_TIMEOUT);
			return true;
		}
		const winner = complete[0] ?? live[0];
		this.resetChord();
		measure("fw:keys.dispatch", t0, this.log, winner.command);
		void this.commands
			.run(winner.command, winner.args ?? {}, { source: "key", element: target })
			.catch((err) => this.onError?.(err, winner.command));
		return true;
	};

	onError?: (e: unknown, command: string) => void;

	attach(target: Document | HTMLElement = document): Disposable {
		void loadLayoutMap();
		const h = (e: Event) => this.handle(e as KeyboardEvent);
		target.addEventListener("keydown", h, true);
		return toDisposable(() => target.removeEventListener("keydown", h, true));
	}

	/** Load user bindings from keys.toml (`[[bind]]` entries). Returns diagnostics. */
	loadUser(text: string, owner = "user"): { dispose: Disposable; errors: string[] } {
		const errors: string[] = [];
		const disposables: Disposable[] = [];
		try {
			const doc = parseToml(text) as { bind?: Keybinding[] };
			for (const [i, b] of (doc.bind ?? []).entries()) {
				if (!b || typeof b.command !== "string") {
					errors.push(`bind #${i + 1}: missing command`);
					continue;
				}
				disposables.push(this.add({ ...b, key: b.key ?? "" }, owner, "user"));
			}
		} catch (e) {
			errors.push(String((e as Error).message));
		}
		return { dispose: toDisposable(() => disposables.forEach((d) => d.dispose())), errors };
	}

	/** Serialise user bindings back to keys.toml data. */
	userBindings(): Keybinding[] {
		return this.bindings
			.filter((b) => b.source === "user")
			.map((b) => {
				const out: Keybinding = { key: b.key, command: (b.removal ? "-" : "") + b.command };
				if (b.when) out.when = b.when;
				if (b.args) out.args = b.args;
				if (b.global) out.global = true;
				return out;
			});
	}
}
