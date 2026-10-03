/**
 * Command registry and execution pipeline (Section 5.2):
 *   resolve id and aliases -> activate owner -> check when -> parse and prompt args
 *   -> confirm -> interceptors -> handler -> history -> log, recents -> result
 */
import { untrack } from "svelte";
import { Emitter, toDisposable, type Disposable } from "../kernel/disposable";
import { FanwitError, toFanwitError } from "../kernel/errors";
import type { ContextKeyService } from "../kernel/context.svelte";
import type { ScopedLogger } from "../kernel/logger";
import { argSpecs, coerceArgs, missingArgs, validateArgs } from "./args";
import type { HistoryService } from "./history.svelte";
import type {
	ArgSpec,
	CommandDefinition,
	CommandHandler,
	ExecRecord,
	Interceptor,
	Invocation,
	InvocationSource,
	UndoRecord
} from "./types";

export interface CommandEntry {
	def: CommandDefinition;
	owner: string;
	handler?: CommandHandler;
	specs: Record<string, ArgSpec>;
}

export interface CommandDeps {
	context: ContextKeyService;
	history: HistoryService;
	log: ScopedLogger;
	windowLabel: () => string;
	/** Activate modules listening for an activation event (onCommand:<id>). */
	activate: (event: string) => Promise<void>;
	/** Ask for missing arguments interactively (provided by the palette). */
	prompt?: (entry: CommandEntry, missing: string[], given: Record<string, unknown>) => Promise<Record<string, unknown> | undefined>;
	confirm?: (message: string, danger: boolean, okLabel?: string) => Promise<boolean>;
}

export interface RunOptions {
	source?: InvocationSource;
	target?: unknown;
	element?: Element | null;
	signal?: AbortSignal;
	progress?: Invocation["progress"];
	interactive?: boolean;
	/** Skip `confirm` (already confirmed by the caller). */
	confirmed?: boolean;
}

interface InterceptorEntry {
	pattern: RegExp;
	fn: Interceptor;
	owner: string;
	priority: number;
}

function globToRegExp(glob: string) {
	return new RegExp("^" + glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
}

const DECAY_MS = 7 * 24 * 3600 * 1000;

export class CommandService {
	/** Bumped on registration changes; read it in $derived for reactive lists. */
	version = $state(0);
	readonly onDidExecute = new Emitter<ExecRecord>();
	readonly onDidChange = new Emitter<void>();
	private entries = new Map<string, CommandEntry>();
	private aliases = new Map<string, string>();
	private warnedAliases = new Set<string>();
	private interceptors: InterceptorEntry[] = [];
	/** id -> { count, last } for frecency ranking in the palette. */
	frecency: Record<string, { count: number; last: number }> = {};

	constructor(private deps: CommandDeps) {}

	setPrompter(p: CommandDeps["prompt"]) {
		this.deps.prompt = p;
	}
	setConfirmer(c: CommandDeps["confirm"]) {
		this.deps.confirm = c;
	}

	private changed() {
		this.version = untrack(() => this.version) + 1;
		this.onDidChange.fire();
	}

	/** Declare a command (manifest data). The handler arrives later via handle(). */
	declare(def: CommandDefinition, owner: string): Disposable {
		const prev = this.entries.get(def.id);
		if (prev && prev.owner !== owner) {
			throw new FanwitError("CMD_DUPLICATE", {
				message: `Command "${def.id}" is already registered by "${prev.owner}".`,
				hint: "Command ids must be unique. Prefix them with your module id.",
				docs: "manual://commands#ids",
				owner
			});
		}
		const entry: CommandEntry = { def, owner, handler: prev?.handler, specs: argSpecs(def.args) };
		this.entries.set(def.id, entry);
		for (const a of def.deprecatedAliases ?? []) this.aliases.set(a, def.id);
		this.changed();
		return toDisposable(() => {
			if (this.entries.get(def.id) === entry) this.entries.delete(def.id);
			for (const a of def.deprecatedAliases ?? []) this.aliases.delete(a);
			this.changed();
		});
	}

	/** Attach a handler to a declared command (or a bare id, declared on the fly). */
	handle(id: string, handler: CommandHandler, owner: string): Disposable {
		let e = this.entries.get(id);
		if (!e) {
			const d = this.declare({ id, title: id, palette: false }, owner);
			e = this.entries.get(id)!;
			e.handler = handler;
			return toDisposable(() => d.dispose());
		}
		e.handler = handler;
		this.changed();
		return toDisposable(() => {
			if (e!.handler === handler) e!.handler = undefined;
		});
	}

	/** Declare and handle in one call. */
	register(def: CommandDefinition, handler: CommandHandler, owner: string): Disposable {
		const d1 = this.declare(def, owner);
		const d2 = this.handle(def.id, handler, owner);
		return toDisposable(() => {
			d2.dispose();
			d1.dispose();
		});
	}

	intercept(pattern: string, fn: Interceptor, owner: string, priority = 0): Disposable {
		const entry = { pattern: globToRegExp(pattern), fn, owner, priority };
		this.interceptors.push(entry);
		this.interceptors.sort((a, b) => b.priority - a.priority);
		return toDisposable(() => (this.interceptors = this.interceptors.filter((i) => i !== entry)));
	}

	resolve(id: string): CommandEntry | undefined {
		const real = this.aliases.get(id);
		if (real) {
			if (!this.warnedAliases.has(id)) {
				this.warnedAliases.add(id);
				this.deps.log.warn(`Command "${id}" is deprecated; use "${real}".`);
			}
			return this.entries.get(real);
		}
		return this.entries.get(id);
	}

	get(id: string) {
		return this.resolve(id);
	}

	list(): CommandEntry[] {
		void this.version;
		return [...this.entries.values()];
	}

	/** Translation hook: `command.<id>` and `category.<name>` message keys (i18n). */
	translate: (key: string, fallback: string) => string = (_k, f) => f;

	title(id: string) {
		const e = this.resolve(id);
		return e ? this.translate(`command.${e.def.id}`, e.def.title) : id;
	}

	category(id: string) {
		const c = this.resolve(id)?.def.category;
		return c ? this.translate(`category.${c}`, c) : undefined;
	}

	label(id: string) {
		const e = this.resolve(id);
		if (!e) return id;
		const cat = this.category(id);
		return cat ? `${cat}: ${this.title(id)}` : this.title(id);
	}

	isEnabled(id: string, el?: Element | null, extra?: Record<string, unknown>) {
		const e = this.resolve(id);
		return !!e && this.deps.context.evaluate(e.def.when, el, extra);
	}
	isVisible(id: string, el?: Element | null, extra?: Record<string, unknown>) {
		const e = this.resolve(id);
		return !!e && this.deps.context.evaluate(e.def.visibleWhen, el, extra);
	}
	isToggled(id: string, el?: Element | null, extra?: Record<string, unknown>) {
		const e = this.resolve(id);
		return !!e?.def.toggled && this.deps.context.evaluate(e.def.toggled, el, extra);
	}
	disabledReason(id: string, el?: Element | null): string | null {
		const e = this.resolve(id);
		if (!e?.def.when) return null;
		return this.deps.context.explain(e.def.when, this.deps.context.lookup(el));
	}

	frecencyScore(id: string, now = Date.now()) {
		const f = this.frecency[id];
		if (!f) return 0;
		return f.count * Math.pow(0.5, (now - f.last) / DECAY_MS);
	}

	async run<R = unknown>(id: string, rawArgs: Record<string, unknown> = {}, o: RunOptions = {}): Promise<R> {
		const started = performance.now();
		const source = o.source ?? "api";
		let args: Record<string, unknown> = { ...rawArgs };
		let entry = this.resolve(id);

		// 1. resolution, activating the owning module if needed
		if (!entry?.handler) {
			await this.deps.activate(`onCommand:${entry?.def.id ?? id}`);
			entry = this.resolve(id);
		}
		if (!entry) {
			throw new FanwitError("CMD_UNKNOWN", {
				message: `Unknown command "${id}".`,
				hint: "Run `commands list` or open the palette to see every command.",
				docs: "manual://commands"
			});
		}
		if (!entry.handler) {
			throw new FanwitError("CMD_NO_HANDLER", {
				message: `Command "${entry.def.id}" has no handler.`,
				hint: `Module "${entry.owner}" declares it but never called ctx.commands.handle().`,
				owner: entry.owner
			});
		}
		const def = entry.def;

		// 2. enablement against the invocation's context snapshot
		const element = o.element ?? (typeof document !== "undefined" ? document.activeElement : null);
		const context = this.deps.context.snapshot(element, { "menu.target": o.target });
		const lookup = (k: string) => context[k];
		if (def.when && !this.deps.context.evaluate(def.when, element)) {
			const failing = this.deps.context.explain(def.when, lookup) ?? def.when;
			throw new FanwitError("CMD_DISABLED", {
				message: `Command "${def.id}" is not available here (${failing} is false).`,
				hint: "The command's when clause does not hold in the current context.",
				owner: entry.owner
			});
		}

		// 3. arguments: coerce, prompt for missing ones when interactive, validate
		args = coerceArgs(def.args, args);
		const interactive = o.interactive ?? ["palette", "menu", "key", "toolbar", "notification"].includes(source);
		const missing = missingArgs(def.args, args);
		if (missing.length) {
			if (interactive && this.deps.prompt) {
				const more = await this.deps.prompt(entry, missing, args);
				if (!more) throw new FanwitError("CANCELLED", { message: "Cancelled." });
				args = coerceArgs(def.args, { ...args, ...more });
			} else {
				throw new FanwitError("CMD_ARGS_MISSING", {
					message: `Missing argument${missing.length > 1 ? "s" : ""} ${missing.map((m) => `"${m}"`).join(", ")} for ${def.id}.`,
					hint: missing.map((m) => `--${m} <value>`).join(" "),
					docs: "manual://commands#arguments"
				});
			}
		}
		args = validateArgs(def.id, def.args, args);

		// 4. confirmation (deep links always confirm)
		if (def.confirm && !o.confirmed && source !== "test") {
			const ok = (await this.deps.confirm?.(def.confirm.message, !!def.confirm.danger, def.confirm.okLabel)) ?? true;
			if (!ok) throw new FanwitError("CANCELLED", { message: "Cancelled." });
		}

		const ac = new AbortController();
		o.signal?.addEventListener("abort", () => ac.abort(o.signal?.reason));
		const invocation: Invocation = {
			source,
			window: this.deps.windowLabel(),
			target: o.target,
			signal: ac.signal,
			progress: o.progress ?? { report: () => {} },
			context,
			element,
			interactive
		};

		// 5. interceptors, then the handler
		const chain = this.interceptors.filter((i) => i.pattern.test(def.id));
		const handler = entry.handler;
		const callHandler = () => Promise.resolve(handler(args, invocation));
		const dispatch = (i: number): Promise<unknown> =>
			i >= chain.length ? callHandler() : Promise.resolve(chain[i].fn({ id: def.id, args, invocation }, () => dispatch(i + 1)));

		let result: unknown;
		try {
			result = await dispatch(0);
		} catch (e) {
			const err = toFanwitError(e, "CMD_FAILED");
			this.record(def.id, args, source, started, false, undefined, err);
			throw err;
		}

		// 6. history: undoable commands return an undo record
		if (isUndo(result)) {
			let current = result;
			this.deps.history.push({
				label: result.label ?? this.label(def.id),
				undo: () => current.undo(),
				redo:
					result.redo ??
					(async () => {
						const again = await handler(args, invocation);
						if (isUndo(again)) current = again;
					})
			});
			result = "result" in result ? (result as { result: unknown }).result : undefined;
		}

		this.record(def.id, args, source, started, true, result);
		return result as R;
	}

	private record(id: string, args: Record<string, unknown>, source: InvocationSource, started: number, ok: boolean, result?: unknown, error?: unknown) {
		const ms = Math.round((performance.now() - started) * 10) / 10;
		if (ok) {
			const f = (this.frecency[id] ??= { count: 0, last: 0 });
			f.count = this.frecencyScore(id) + 1;
			f.last = Date.now();
		}
		this.deps.log.debug(`${ok ? "ran" : "failed"} ${id} (${source}, ${ms} ms)`, ok ? undefined : { error: String((error as Error)?.message ?? error) });
		this.onDidExecute.fire({ id, args, source, ms, ok, result, error, time: Date.now() });
	}
}

function isUndo(r: unknown): r is UndoRecord & { result?: unknown } {
	return !!r && typeof r === "object" && typeof (r as UndoRecord).undo === "function";
}
