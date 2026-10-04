/**
 * Service container (Section 4.3): lazy singletons resolved by a typed token.
 *   declare module "$fanwit" { interface Services { "notes.index": NotesIndex } }
 *   ctx.services.provide("notes.index", () => new NotesIndex(ctx));
 *   const index = await ctx.services.get("notes.index");
 */
import { toDisposable, type Disposable } from "./disposable";
import { FanwitError } from "./errors";

/**
 * The typed service map: lazy singletons modules share by id. Declare them here by declaration
 * merging; a module that lists the id in `contributes.services` is activated on first `get`.
 *
 * @example
 * ```ts
 * declare module "$fanwit" {
 *   interface Services { "notes.index": NotesIndex }
 * }
 * ctx.services.provide("notes.index", () => new NotesIndex(ctx));
 * const index = await ctx.services.get("notes.index");
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Services {}

export type ServiceId = keyof Services | (string & {});
export type ServiceOf<K> = K extends keyof Services ? Services[K] : unknown;

interface Entry {
	factory: () => unknown;
	owner: string;
	instance?: Promise<unknown>;
}

export class ServiceRegistry {
	private entries = new Map<string, Entry>();
	/** Called when a service is requested but not provided yet (activates `onService:<id>`). */
	resolveMissing?: (id: string) => Promise<void>;

	provide<K extends ServiceId>(id: K, factory: () => ServiceOf<K> | Promise<ServiceOf<K>>, owner = "app"): Disposable {
		const key = String(id);
		const prev = this.entries.get(key);
		if (prev) {
			throw new FanwitError("SERVICE_DUPLICATE", {
				message: `Service "${key}" is already provided by "${prev.owner}".`,
				hint: "Service ids must be unique. Prefix them with your module id.",
				docs: "manual://kernel#services",
				owner
			});
		}
		this.entries.set(key, { factory, owner });
		return toDisposable(() => this.entries.delete(key));
	}

	has(id: ServiceId) {
		return this.entries.has(String(id));
	}

	async get<K extends ServiceId>(id: K): Promise<ServiceOf<K>> {
		const key = String(id);
		let e = this.entries.get(key);
		if (!e && this.resolveMissing) {
			await this.resolveMissing(key);
			e = this.entries.get(key);
		}
		if (!e) {
			throw new FanwitError("SERVICE_MISSING", {
				message: `No module provides the service "${key}".`,
				hint: "Check that the providing module is enabled and calls ctx.services.provide().",
				docs: "manual://kernel#services"
			});
		}
		e.instance ??= Promise.resolve(e.factory());
		return e.instance as Promise<ServiceOf<K>>;
	}

	list() {
		return [...this.entries.entries()].map(([id, e]) => ({ id, owner: e.owner, created: !!e.instance }));
	}
}
