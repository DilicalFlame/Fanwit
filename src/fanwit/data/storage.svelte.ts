/**
 * Storage API (Section 12.5.1): key value pairs in five scopes, plus `persisted()`, the one
 * line answer to "where do I keep this?".
 *   memory   lost on reload
 *   session  survives reload, not restart
 *   window   per window identity
 *   global   app data dir (state.db / state.json)
 *   vault    <vault>/.appname/data (requires an open vault)
 */
import { debounce, Emitter } from "../kernel/disposable";
import { FanwitError } from "../kernel/errors";
import type { Host } from "../host/types";
import { joinPath } from "../host/types";

export type Scope = "memory" | "session" | "window" | "global" | "vault";

export interface KvStore {
	get(key: string): Promise<unknown>;
	set(key: string, value: unknown): Promise<void>;
	delete(key: string): Promise<void>;
	keys(prefix?: string): Promise<string[]>;
	flush?(): Promise<void>;
}

class MemoryKv implements KvStore {
	m = new Map<string, unknown>();
	async get(k: string) {
		return this.m.get(k);
	}
	async set(k: string, v: unknown) {
		this.m.set(k, v);
	}
	async delete(k: string) {
		this.m.delete(k);
	}
	async keys(prefix = "") {
		return [...this.m.keys()].filter((k) => k.startsWith(prefix));
	}
}

class WebStorageKv implements KvStore {
	constructor(
		private s: Storage | undefined,
		private prefix: string
	) {}
	async get(k: string) {
		const raw = this.s?.getItem(this.prefix + k);
		return raw == null ? undefined : JSON.parse(raw);
	}
	async set(k: string, v: unknown) {
		this.s?.setItem(this.prefix + k, JSON.stringify(v));
	}
	async delete(k: string) {
		this.s?.removeItem(this.prefix + k);
	}
	async keys(prefix = "") {
		const out: string[] = [];
		for (let i = 0; i < (this.s?.length ?? 0); i++) {
			const k = this.s!.key(i)!;
			if (k.startsWith(this.prefix + prefix)) out.push(k.slice(this.prefix.length));
		}
		return out;
	}
}

/** SQLite `kv` table (desktop state.db). */
class SqlKv implements KvStore {
	private ready: Promise<number>;
	constructor(
		private host: Host,
		path: string
	) {
		this.ready = (async () => {
			const h = await host.db.open(path);
			await host.db.exec(h, "CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
			return h;
		})();
	}
	async get(k: string) {
		const rows = await this.host.db.query<{ value: string }>(await this.ready, "SELECT value FROM kv WHERE key = ?", [k]);
		return rows[0] ? JSON.parse(rows[0].value) : undefined;
	}
	async set(k: string, v: unknown) {
		await this.host.db.exec(await this.ready, "INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [k, JSON.stringify(v)]);
	}
	async delete(k: string) {
		await this.host.db.exec(await this.ready, "DELETE FROM kv WHERE key = ?", [k]);
	}
	async keys(prefix = "") {
		const rows = await this.host.db.query<{ key: string }>(await this.ready, "SELECT key FROM kv WHERE key LIKE ? ESCAPE '\\'", [prefix.replace(/[%_\\]/g, "\\$&") + "%"]);
		return rows.map((r) => r.key);
	}
}

/** JSON file kv for hosts without SQL (web, tests). Writes are debounced. */
class FileKv implements KvStore {
	private data: Record<string, unknown> | null = null;
	private save = debounce(() => void this.host.fs.writeText(this.path, JSON.stringify(this.data, null, 1)).catch(() => {}), 300);
	constructor(
		private host: Host,
		private path: string
	) {}
	private async load() {
		if (this.data) return this.data;
		try {
			this.data = JSON.parse(await this.host.fs.readText(this.path));
		} catch {
			this.data = {};
		}
		return this.data!;
	}
	async get(k: string) {
		return (await this.load())[k];
	}
	async set(k: string, v: unknown) {
		(await this.load())[k] = v;
		this.save();
	}
	async delete(k: string) {
		delete (await this.load())[k];
		this.save();
	}
	async keys(prefix = "") {
		return Object.keys(await this.load()).filter((k) => k.startsWith(prefix));
	}
	async flush() {
		this.save.flush();
	}
}

export function openKv(host: Host, dir: string): KvStore {
	return host.caps.sql ? new SqlKv(host, joinPath(dir, "state.db")) : new FileKv(host, joinPath(dir, "state.json"));
}

export interface StorageChange {
	scope: Scope;
	key: string;
	value: unknown;
}

export class StorageService {
	readonly onDidChange = new Emitter<StorageChange>();
	private stores = new Map<Scope, KvStore>();
	private vaultStore: KvStore | null = null;

	constructor(
		private host: Host,
		private windowIdentity: () => string
	) {
		this.stores.set("memory", new MemoryKv());
		const ss = typeof sessionStorage !== "undefined" ? sessionStorage : undefined;
		this.stores.set("session", ss ? new WebStorageKv(ss, "fw:") : new MemoryKv());
		this.stores.set("global", openKv(host, host.dirs.data));
		this.stores.set("window", this.stores.get("global")!);
	}

	/** Called by the vault service when a vault opens or closes. */
	setVaultDir(dataDir: string | null) {
		this.vaultStore = dataDir ? openKv(this.host, dataDir) : null;
	}

	store(scope: Scope): KvStore {
		if (scope === "vault") {
			if (!this.vaultStore) {
				throw new FanwitError("STORAGE_NO_VAULT", {
					message: "No vault is open, so vault scoped storage is unavailable.",
					hint: "Use scope \"global\" or check ctx.vault.current first.",
					docs: "manual://data#scopes"
				});
			}
			return this.vaultStore;
		}
		return this.stores.get(scope)!;
	}

	private key(scope: Scope, owner: string, key: string) {
		const base = `${owner}/${key}`;
		return scope === "window" ? `window:${this.windowIdentity()}/${base}` : base;
	}

	async get<T>(owner: string, key: string, o: { scope?: Scope } = {}): Promise<T | undefined> {
		const scope = o.scope ?? "global";
		return (await this.store(scope).get(this.key(scope, owner, key))) as T | undefined;
	}

	async set(owner: string, key: string, value: unknown, o: { scope?: Scope } = {}) {
		const scope = o.scope ?? "global";
		await this.store(scope).set(this.key(scope, owner, key), value);
		this.onDidChange.fire({ scope, key: `${owner}/${key}`, value });
	}

	async delete(owner: string, key: string, o: { scope?: Scope } = {}) {
		const scope = o.scope ?? "global";
		await this.store(scope).delete(this.key(scope, owner, key));
		this.onDidChange.fire({ scope, key: `${owner}/${key}`, value: undefined });
	}

	async flush() {
		for (const s of [...this.stores.values(), this.vaultStore]) await s?.flush?.();
	}
}

export interface Persisted<T> {
	value: T;
	readonly loaded: boolean;
}

/**
 * Reactive persisted state:
 *   const width = persisted("notes.sidebarWidth", 280, { scope: "vault" });
 *   width.value = 320; // saved (debounced)
 */
export function createPersisted<T>(storage: StorageService, owner: string, key: string, initial: T, o: { scope?: Scope; debounce?: number } = {}): Persisted<T> {
	let current = $state<T>(initial);
	let loaded = $state(false);
	const save = debounce(() => void storage.set(owner, key, $state.snapshot(current), o).catch(() => {}), o.debounce ?? 250);
	storage
		.get<T>(owner, key, o)
		.then((v) => {
			if (v !== undefined) current = v;
		})
		.catch(() => {})
		.finally(() => (loaded = true));
	return {
		get value() {
			return current;
		},
		set value(v: T) {
			current = v;
			save();
		},
		get loaded() {
			return loaded;
		}
	};
}
