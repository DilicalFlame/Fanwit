/**
 * Typed event bus (Section 4.6). Extend `Events` by declaration merging:
 *   declare module "$fanwit" { interface Events { "notes:saved": { path: string } } }
 * Scopes: window (default, this window only), app (all windows, through the host), backend.
 */
import { Emitter, toDisposable, type Disposable } from "./disposable";
import type { Host } from "../host/types";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Events {}

export type EventName = keyof Events | (string & {});
export type EventPayload<K> = K extends keyof Events ? Events[K] : unknown;
export type EventScope = "window" | "app" | "backend";

export interface BusRecord {
	name: string;
	payload: unknown;
	scope: EventScope;
	time: number;
	origin: string;
}

const PREFIX = "fw-ev:";

export class EventBus {
	private local = new Map<string, Emitter<unknown>>();
	private bridged = new Map<string, Disposable>();
	/** Every event that passes through this window, for the event monitor. */
	readonly onAny = new Emitter<BusRecord>();

	constructor(
		private host: Host | null,
		private origin = "main"
	) {}

	setHost(host: Host, origin: string) {
		this.host = host;
		this.origin = origin;
	}

	emit<K extends EventName>(name: K, payload: EventPayload<K>, o: { scope?: EventScope } = {}) {
		const scope = o.scope ?? "window";
		if (scope !== "window" && this.host) {
			void this.host.events.emit(PREFIX + String(name), { payload, origin: this.origin });
			this.bridge(String(name));
			return;
		}
		this.deliver(String(name), payload, scope, this.origin);
	}

	on<K extends EventName>(name: K, fn: (payload: EventPayload<K>) => void): Disposable {
		const key = String(name);
		let e = this.local.get(key);
		if (!e) this.local.set(key, (e = new Emitter()));
		const d = e.on(fn as (p: unknown) => void);
		this.bridge(key);
		return d;
	}

	once<K extends EventName>(name: K, fn: (payload: EventPayload<K>) => void): Disposable {
		const d = this.on(name, (p) => {
			d.dispose();
			fn(p);
		});
		return d;
	}

	private deliver(name: string, payload: unknown, scope: EventScope, origin: string) {
		this.onAny.fire({ name, payload, scope, time: Date.now(), origin });
		this.local.get(name)?.fire(payload);
	}

	/** Listen once per name for app scoped deliveries coming from any window. */
	private bridge(name: string) {
		if (!this.host || this.bridged.has(name)) return;
		this.bridged.set(
			name,
			this.host.events.on<{ payload: unknown; origin: string }>(PREFIX + name, (m) => this.deliver(name, m?.payload, "app", m?.origin ?? "?"))
		);
	}

	dispose() {
		for (const d of this.bridged.values()) d.dispose();
		this.bridged.clear();
		this.local.clear();
	}
}

export { toDisposable };
