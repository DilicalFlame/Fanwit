/**
 * Module registry: reads contributions through registered contribution points, routes activation
 * events, and profiles activation (Section 20.5 module profiler).
 */
import { DisposableStore, Emitter, toDisposable, type Disposable } from "./disposable";
import { FanwitError, toFanwitError } from "./errors";
import type { ScopedLogger } from "./logger";
import { eventMatches, implicitEvents, type ActivateFn, type ModuleDefinition } from "./module";
import type { ModuleContext } from "./context-api";

export type ContributionPoint = (owner: string, value: unknown, mod: ModuleDefinition) => Disposable | void;

export interface ModuleState {
	def: ModuleDefinition;
	events: string[];
	status: "idle" | "activating" | "active" | "failed" | "disabled";
	activationMs?: number;
	activatedBy?: string;
	error?: string;
	contributions: DisposableStore;
	ctx?: ModuleContext;
}

export class ModuleRegistry {
	version = $state(0);
	readonly modules = new Map<string, ModuleState>();
	private points = new Map<string, ContributionPoint>();
	private fired = new Set<string>();
	readonly onDidActivate = new Emitter<ModuleState>();

	constructor(
		private log: ScopedLogger,
		private makeContext: (owner: string, mod: ModuleDefinition) => ModuleContext,
		private disposeContext: (ctx: ModuleContext) => void
	) {}

	definePoint(key: string, handler: ContributionPoint): Disposable {
		this.points.set(key, handler);
		// apply to modules registered before the point existed
		for (const m of this.modules.values()) {
			const val = (m.def.contributes as Record<string, unknown> | undefined)?.[key];
			if (val !== undefined) this.applyPoint(m, key, val);
		}
		return toDisposable(() => this.points.delete(key));
	}

	private applyPoint(m: ModuleState, key: string, value: unknown) {
		const p = this.points.get(key);
		if (!p) return;
		try {
			const d = p(m.def.id, value, m.def);
			if (d) m.contributions.add(d);
		} catch (e) {
			this.log.error(`contribution "${key}" of module "${m.def.id}" failed:`, e);
		}
	}

	register(def: ModuleDefinition): Disposable {
		if (this.modules.has(def.id)) {
			throw new FanwitError("MODULE_DUPLICATE", {
				message: `A module with id "${def.id}" is already registered.`,
				hint: "Module and plugin ids must be unique.",
				docs: "manual://modules"
			});
		}
		const state: ModuleState = {
			def,
			events: [...(def.activationEvents ?? []), ...implicitEvents(def)],
			status: "idle",
			contributions: new DisposableStore()
		};
		this.modules.set(def.id, state);
		for (const [key, value] of Object.entries(def.contributes ?? {})) {
			if (value === undefined) continue;
			if (!this.points.has(key)) this.log.debug(`module "${def.id}" contributes to unknown point "${key}" (applied when defined)`);
			this.applyPoint(state, key, value);
		}
		this.version++;
		// events that already fired (onStartupFinished, onVault) activate late registrations too
		for (const ev of this.fired) if (state.events.some((p) => eventMatches(p, ev))) void this.activate(def.id, ev);
		return toDisposable(() => this.unregister(def.id));
	}

	async unregister(id: string) {
		const m = this.modules.get(id);
		if (!m) return;
		await this.deactivate(id);
		m.contributions.dispose();
		this.modules.delete(id);
		this.version++;
	}

	/** Fire an activation event: activates every module that declared a matching event. */
	async fire(event: string, sticky = false) {
		if (sticky) this.fired.add(event);
		const targets = [...this.modules.values()].filter((m) => m.status === "idle" && m.events.some((p) => eventMatches(p, event)));
		await Promise.all(targets.map((m) => this.activate(m.def.id, event)));
	}

	private pending = new Map<string, Promise<void>>();

	async activate(id: string, reason = "api"): Promise<void> {
		const m = this.modules.get(id);
		if (!m || m.status === "active" || m.status === "disabled") return;
		const running = this.pending.get(id);
		if (running) return running;
		if (!m.def.activate) {
			m.status = "active";
			return;
		}
		const p = (async () => {
			m.status = "activating";
			const t0 = performance.now();
			try {
				let fn = m.def.activate as ActivateFn | (() => Promise<unknown>);
				// loaders take no parameters; activate functions take ctx
				if (fn.length === 0) {
					const loaded = await (fn as () => Promise<unknown>)();
					if (loaded && typeof loaded === "object" && "default" in (loaded as object)) fn = (loaded as { default: ActivateFn }).default;
					else if (typeof loaded === "function") fn = loaded as ActivateFn;
					else fn = () => {};
				}
				m.ctx = this.makeContext(id, m.def);
				await (fn as ActivateFn)(m.ctx);
				m.status = "active";
				m.activatedBy = reason;
				m.activationMs = Math.round((performance.now() - t0) * 10) / 10;
				if (m.activationMs > 50) this.log.warn(`module "${id}" took ${m.activationMs} ms to activate (budget 50 ms)`);
				else this.log.debug(`activated ${id} (${reason}) ${m.activationMs} ms`);
				this.onDidActivate.fire(m);
			} catch (e) {
				m.status = "failed";
				m.error = toFanwitError(e).message;
				this.log.error(`module "${id}" failed to activate:`, e);
			} finally {
				this.pending.delete(id);
				this.version++;
			}
		})();
		this.pending.set(id, p);
		return p;
	}

	async deactivate(id: string) {
		const m = this.modules.get(id);
		if (!m?.ctx) return;
		this.disposeContext(m.ctx);
		m.ctx = undefined;
		m.status = "idle";
		this.version++;
	}

	list() {
		void this.version;
		return [...this.modules.values()];
	}
}
