/**
 * The kernel (Chapter 4): boots once per window, owns every system and hands each module a
 * typed `ctx` whose calls are attributed to the module (namespacing, cleanup, diagnostics).
 */
import type { Host } from "../host/types";
import { CommandService } from "../commands/registry.svelte";
import { HistoryService } from "../commands/history.svelte";
import type { CommandDefinition, CommandHandler, Interceptor } from "../commands/types";
import type { RunOptions } from "../commands/registry.svelte";
import { KeybindingService, type Keybinding } from "../keys/keybindings.svelte";
import { ContextKeyService, setActiveContext } from "./context.svelte";
import { DisposableStore, type Disposable } from "./disposable";
import { EventBus, type EventName, type EventPayload, type EventScope } from "./events";
import { Lifecycle } from "./lifecycle.svelte";
import { logs, type ScopedLogger } from "./logger";
import type { ModuleDefinition } from "./module";
import { ModuleRegistry } from "./modules.svelte";
import { ServiceRegistry, type ServiceId, type ServiceOf } from "./services";

export interface KernelOptions {
	host: Host;
	/** Window kind this kernel boots for ("main", "settings", ...). */
	windowKind?: string;
	modules?: ModuleDefinition[];
}

type ExtensionFactory = (k: Kernel, owner: string, subs: DisposableStore) => Record<string, unknown>;

export class Kernel {
	readonly host: Host;
	readonly windowKind: string;
	readonly log: ScopedLogger;
	readonly context = new ContextKeyService();
	readonly events: EventBus;
	readonly services = new ServiceRegistry();
	readonly lifecycle = new Lifecycle();
	readonly history: HistoryService;
	readonly commands: CommandService;
	readonly keys: KeybindingService;
	readonly modules: ModuleRegistry;
	/** Systems added after construction (layout, menus, notify, ...) contribute ctx facades here. */
	private extensions: ExtensionFactory[] = [];
	private contexts = new WeakMap<object, DisposableStore>();
	/** Free-form system slots, typed via declaration merging on KernelSystems. */
	readonly sys = {} as KernelSystems;

	constructor(o: KernelOptions) {
		this.host = o.host;
		this.windowKind = o.windowKind ?? "main";
		logs.attach(o.host);
		this.log = logs.scoped("kernel");
		this.events = new EventBus(o.host, o.host.windows.label);
		setActiveContext(this.context);
		this.history = new HistoryService(() => String(this.context.get("history.scope") ?? `window:${o.host.windows.label}`));
		this.modules = new ModuleRegistry(
			logs.scoped("modules"),
			(owner) => this.createContext(owner),
			(ctx) => this.disposeContext(ctx)
		);
		this.commands = new CommandService({
			context: this.context,
			history: this.history,
			log: logs.scoped("commands"),
			windowLabel: () => this.host.windows.label,
			activate: (ev) => this.modules.fire(ev)
		});
		this.keys = new KeybindingService(o.host.platform, this.commands, this.context, logs.scoped("keys"), o.host);
		this.services.resolveMissing = (id) => this.modules.fire(`onService:${id}`);

		this.context.set("platform", o.host.platform);
		this.context.set("window.kind", this.windowKind);
		for (const [k, v] of Object.entries(o.host.caps)) this.context.set(`host.${k}`, v);
		this.context.declare("platform", "string", "windows, macos, linux, web");
		this.context.declare("window.kind", "string", "Current window kind");
		this.context.declare("inputFocus", "boolean", "A text input has focus");
		this.context.declare("textSelected", "boolean", "Text selection present");
		this.context.declare("devMode", "boolean", "Developer mode enabled");

		this.modules.definePoint("commands", (owner, list) => {
			const s = new DisposableStore();
			for (const c of list as CommandDefinition[]) s.add(this.commands.declare(c, owner));
			return s;
		});
		this.modules.definePoint("keybindings", (owner, list, mod) => {
			const s = new DisposableStore();
			const source = mod.tier === "core" ? "core" : mod.tier === "plugin" ? "plugin" : "module";
			for (const b of list as Keybinding[]) s.add(this.keys.add(b, owner, source));
			return s;
		});
		this.modules.definePoint("contextKeys", (_owner, list) => {
			for (const k of list as { key: string; type: string; description?: string }[]) this.context.declare(k.key, k.type, k.description);
		});

		for (const m of o.modules ?? []) this.modules.register(m);
	}

	/** Register a system's ctx facade: `k.extend((k, owner, subs) => ({ layout: ... }))`. */
	extend(f: ExtensionFactory) {
		this.extensions.push(f);
	}

	scopedLog(scope: string) {
		return logs.scoped(scope);
	}

	/** Build an owner-attributed context. Everything registered through it is disposed together. */
	createContext(owner: string) {
		const subs = new DisposableStore();
		const track = <T extends Disposable>(d: T) => subs.add(d);
		const k = this;
		const ctx = {
			id: owner,
			host: this.host,
			kernel: this,
			log: logs.scoped(owner),
			subscriptions: {
				push: (...ds: Disposable[]) => ds.forEach((d) => subs.add(d))
			},
			commands: {
				register: (def: CommandDefinition, handler: CommandHandler) => track(k.commands.register(def, handler, owner)),
				handle: (id: string, handler: CommandHandler) => track(k.commands.handle(id, handler, owner)),
				run: <R = unknown>(id: string, args?: Record<string, unknown>, o?: RunOptions) => k.commands.run<R>(id, args, o),
				intercept: (pattern: string, fn: Interceptor, priority?: number) => track(k.commands.intercept(pattern, fn, owner, priority)),
				list: () => k.commands.list(),
				get: (id: string) => k.commands.get(id)
			},
			keys: {
				bind: (b: Keybinding) => track(k.keys.add(b, owner)),
				label: (command: string) => k.keys.label(command)
			},
			context: {
				set: (key: string, value: unknown) => k.context.set(key, value),
				bind: (key: string, value: unknown) => track(k.context.bind(key, value)),
				get: (key: string) => k.context.get(key),
				evaluate: (when: string, el?: Element | null) => k.context.evaluate(when, el)
			},
			events: {
				emit: <K extends EventName>(name: K, payload: EventPayload<K>, o?: { scope?: EventScope }) => k.events.emit(name, payload, o),
				on: <K extends EventName>(name: K, fn: (p: EventPayload<K>) => void) => track(k.events.on(name, fn))
			},
			services: {
				provide: <K extends ServiceId>(id: K, factory: () => ServiceOf<K> | Promise<ServiceOf<K>>) => track(k.services.provide(id, factory, owner)),
				get: <K extends ServiceId>(id: K) => k.services.get(id)
			},
			history: {
				push: (rec: Parameters<HistoryService["push"]>[0]) => k.history.push(rec),
				transaction: <T>(label: string, fn: () => T | Promise<T>) => k.history.transaction(label, fn),
				undo: () => k.history.undo(),
				redo: () => k.history.redo()
			},
			lifecycle: {
				onWillShutdown: (fn: Parameters<Lifecycle["onWillShutdown"]>[0]) => track(k.lifecycle.onWillShutdown(fn)),
				when: (p: Parameters<Lifecycle["when"]>[0]) => k.lifecycle.when(p)
			}
		};
		let full = ctx as typeof ctx & ContextExtensions;
		for (const f of this.extensions) full = Object.assign(full, f(this, owner, subs));
		this.contexts.set(full, subs);
		return full;
	}

	disposeContext(ctx: object) {
		this.contexts.get(ctx)?.dispose();
		this.contexts.delete(ctx);
	}
}

/** Systems attach themselves here (`k.sys.layout = ...`); extend by declaration merging. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface KernelSystems {}
/** ctx facades contributed by systems; extend by declaration merging. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ContextExtensions {}
