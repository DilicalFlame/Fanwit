/**
 * Database API (Section 12.5). Three shapes over SQLite per scope:
 *   const db = ctx.db.sql({ scope: "vault" });           // app.db of the current vault
 *   await db.migrate([{ version: 1, up: sql`CREATE TABLE notes__links (...)` }]);
 *   const rows = await db.query(sql`SELECT * FROM notes__links WHERE dst = ${path}`);
 *   ctx.db.collection<Bookmark>("bookmarks").insert({...})  // JSON documents
 * Every module owns the table prefix `<id>__`; runtime plugins are held to it in Rust.
 */
import { FanwitError } from "../kernel/errors";
import type { DbOptions, Host } from "../host/types";
import { joinPath } from "../host/types";

export interface SqlQuery {
	text: string;
	params: unknown[];
}

/** Tagged template: interpolations become parameters, never string concatenation. */
export function sql(strings: TemplateStringsArray, ...values: unknown[]): SqlQuery {
	let text = strings[0];
	const params: unknown[] = [];
	values.forEach((v, i) => {
		if (v && typeof v === "object" && "text" in (v as object) && "params" in (v as object)) {
			text += (v as SqlQuery).text;
			params.push(...(v as SqlQuery).params);
		} else {
			text += "?";
			params.push(v);
		}
		text += strings[i + 1];
	});
	return { text, params };
}

/** Raw SQL fragment (identifiers you control, never user input). */
sql.raw = (text: string): SqlQuery => ({ text, params: [] });

export interface Migration {
	version: number;
	up: SqlQuery | string;
	description?: string;
}

async function checksum(s: string) {
	const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
	return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const q = (x: SqlQuery | string): SqlQuery => (typeof x === "string" ? { text: x, params: [] } : x);

export class SqlHandle {
	private lock: Promise<unknown> = Promise.resolve();
	constructor(
		private host: Host,
		private handle: Promise<number>,
		private owner: string,
		private opts: DbOptions = {}
	) {}

	/** Serialise statements from this window so transactions do not interleave. */
	private serial<T>(fn: () => Promise<T>): Promise<T> {
		const run = this.lock.then(fn, fn);
		this.lock = run.catch(() => {});
		return run;
	}

	async exec(query: SqlQuery | string) {
		const { text, params } = q(query);
		return this.serial(async () => this.host.db.exec(await this.handle, text, params, this.opts));
	}

	async query<T = Record<string, unknown>>(query: SqlQuery | string): Promise<T[]> {
		const { text, params } = q(query);
		return this.serial(async () => this.host.db.query<T>(await this.handle, text, params, this.opts));
	}

	async get<T = Record<string, unknown>>(query: SqlQuery | string): Promise<T | undefined> {
		return (await this.query<T>(query))[0];
	}

	/** Collect statements and commit them atomically in one transaction. */
	async transaction(fn: (tx: { exec(q: SqlQuery | string): void }) => void | Promise<void>) {
		const statements: { sql: string; params: unknown[] }[] = [];
		await fn({ exec: (x) => void statements.push({ sql: q(x).text, params: q(x).params }) });
		if (!statements.length) return;
		await this.serial(async () => this.host.db.batch(await this.handle, statements, this.opts));
	}

	/** Idempotent, checksummed, per module. A changed applied migration is a startup error. */
	async migrate(list: Migration[]) {
		await this.exec("CREATE TABLE IF NOT EXISTS _fanwit_migrations (module TEXT NOT NULL, version INTEGER NOT NULL, checksum TEXT NOT NULL, applied_at TEXT NOT NULL, PRIMARY KEY (module, version))");
		const applied = await this.query<{ version: number; checksum: string }>(sql`SELECT version, checksum FROM _fanwit_migrations WHERE module = ${this.owner}`);
		const max = Math.max(0, ...applied.map((a) => a.version));
		const known = Math.max(0, ...list.map((m) => m.version));
		if (max > known) {
			throw new FanwitError("DB_DOWNGRADE", {
				message: `Database for "${this.owner}" is at migration ${max}, newer than this app (${known}).`,
				hint: "Downgrades are refused. Use a newer version of the app or restore a backup.",
				docs: "manual://data#migrations"
			});
		}
		for (const m of [...list].sort((a, b) => a.version - b.version)) {
			const sum = await checksum(q(m.up).text);
			const prev = applied.find((a) => a.version === m.version);
			if (prev) {
				if (prev.checksum !== sum) {
					throw new FanwitError("DB_MIGRATION_CHANGED", {
						message: `Migration ${m.version} of "${this.owner}" changed after it was applied.`,
						hint: "Never edit an applied migration; add a new one instead.",
						docs: "manual://data#migrations"
					});
				}
				continue;
			}
			await this.transaction((tx) => {
				tx.exec(m.up);
				tx.exec(sql`INSERT INTO _fanwit_migrations (module, version, checksum, applied_at) VALUES (${this.owner}, ${m.version}, ${sum}, ${new Date().toISOString()})`);
			});
		}
	}

	async tables(): Promise<string[]> {
		return (await this.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")).map((r) => r.name);
	}

	/** JSON documents in `<owner>__<name>` with id, doc. */
	collection<T extends Record<string, unknown>>(name: string) {
		const table = sql.raw(`"${this.owner}__${name.replace(/[^\w]/g, "_")}"`);
		const ready = this.exec(sql`CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, doc TEXT NOT NULL)`);
		const self = this;
		return {
			async insert(doc: T & { id?: string }) {
				await ready;
				const id = doc.id ?? crypto.randomUUID();
				await self.exec(sql`INSERT INTO ${table} (id, doc) VALUES (${id}, ${JSON.stringify({ ...doc, id })})`);
				return id;
			},
			async find(where: Partial<T> = {}): Promise<(T & { id: string })[]> {
				await ready;
				const keys = Object.keys(where);
				let query = sql`SELECT doc FROM ${table}`;
				if (keys.length) {
					const parts = keys.map((k) => sql`json_extract(doc, ${"$." + k}) = ${where[k] as unknown}`);
					query = parts.reduce((acc, p, i) => sql`${acc}${sql.raw(i ? " AND " : " WHERE ")}${p}`, query);
				}
				return (await self.query<{ doc: string }>(query)).map((r) => JSON.parse(r.doc));
			},
			async get(id: string): Promise<(T & { id: string }) | undefined> {
				await ready;
				const r = await self.get<{ doc: string }>(sql`SELECT doc FROM ${table} WHERE id = ${id}`);
				return r ? JSON.parse(r.doc) : undefined;
			},
			async update(id: string, patch: Partial<T>) {
				const cur = await this.get(id);
				if (!cur) return false;
				await self.exec(sql`UPDATE ${table} SET doc = ${JSON.stringify({ ...cur, ...patch, id })} WHERE id = ${id}`);
				return true;
			},
			async remove(id: string) {
				await ready;
				return (await self.exec(sql`DELETE FROM ${table} WHERE id = ${id}`)).changes > 0;
			}
		};
	}
}

export class DbService {
	private handles = new Map<string, Promise<number>>();
	constructor(
		private host: Host,
		private vaultDataDir: () => string | null
	) {}

	path(scope: "global" | "vault", name = "app.db") {
		if (scope === "vault") {
			const d = this.vaultDataDir();
			if (!d) throw new FanwitError("STORAGE_NO_VAULT", { message: "No vault is open, so the vault database is unavailable.", hint: 'Use { scope: "global" } or open a vault.' });
			return joinPath(d, name);
		}
		return joinPath(this.host.dirs.data, name === "app.db" ? "global.db" : name);
	}

	sql(owner: string, o: { scope?: "global" | "vault"; file?: string; restrict?: boolean; readonly?: boolean } = {}) {
		if (!this.host.caps.sql) {
			throw new FanwitError("DB_UNAVAILABLE", {
				message: "SQL is not available on this host.",
				hint: "The browser host needs the SQLite WASM worker (planned); use ctx.storage for key value data.",
				docs: "manual://data#engines"
			});
		}
		const path = this.path(o.scope ?? "global", o.file);
		let h = this.handles.get(path);
		if (!h) {
			h = this.host.db.open(path);
			this.handles.set(path, h);
		}
		return new SqlHandle(this.host, h, owner, { owner: o.restrict ? owner : undefined, readonly: o.readonly });
	}
}
