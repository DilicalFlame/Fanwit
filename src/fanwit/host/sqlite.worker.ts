/**
 * Web SQLite engine (Section 12.5.4): the official SQLite WASM build in a dedicated Worker with
 * the opfs-sahpool VFS (no cross origin isolation headers needed, so static hosting works).
 * One connection per database file, matching the single writer model of the desktop.
 */
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";

type Db = { exec: (o: Record<string, unknown>) => unknown; changes: () => number; pointer: number; close: () => void; selectValue: (sql: string) => unknown };
type Msg = { id: number; op: "open" | "exec" | "query" | "batch" | "close"; path?: string; handle?: number; sql?: string; params?: unknown[]; statements?: { sql: string; params?: unknown[] }[]; owner?: string | null; readonly?: boolean };

let ready: Promise<{ sqlite3: any; pool: any }> | null = null; // eslint-disable-line @typescript-eslint/no-explicit-any
const dbs = new Map<number, Db>();
const byPath = new Map<string, number>();
let next = 0;

function init() {
	ready ??= (async () => {
		const sqlite3 = await sqlite3InitModule();
		const pool = await sqlite3.installOpfsSAHPoolVfs({ name: "fanwit-sahpool", directory: "/.fanwit-sqlite", initialCapacity: 12 });
		return { sqlite3, pool };
	})();
	return ready;
}

// SQLite authorizer action codes that name a table in their first or second argument
const TABLE_ARG0 = new Set([2, 4, 9, 11, 13, 18, 20, 23, 28, 29, 30]);
const TABLE_ARG1 = new Set([1, 3, 5, 7, 10, 12, 26]);
const ATTACH = new Set([24, 25]);
const PRAGMA = 19;
const PRAGMAS = new Set(["table_info", "table_xinfo", "index_list", "index_info", "foreign_key_list"]);

function withOwner<T>(sqlite3: any, db: Db, owner: string | null | undefined, fn: () => T): T { // eslint-disable-line @typescript-eslint/no-explicit-any
	if (!owner) return fn();
	const prefix = `${owner}__`;
	const ok = (t: string | null) => !t || t.startsWith(prefix) || t === "_fanwit_migrations" || t.startsWith("sqlite_");
	const cb = (_p: number, code: number, a0: string | null, a1: string | null) => {
		if (ATTACH.has(code)) return 1;
		if (code === PRAGMA) return PRAGMAS.has(String(a0)) ? 0 : 1;
		if (TABLE_ARG0.has(code)) return ok(a0) ? 0 : 1;
		if (TABLE_ARG1.has(code)) return ok(a1) ? 0 : 1;
		return 0;
	};
	sqlite3.capi.sqlite3_set_authorizer(db.pointer, cb, 0);
	try {
		return fn();
	} catch (e) {
		const m = String((e as Error).message ?? e);
		throw new Error(m.includes("not authorized") ? `PERMISSION_DENIED: ${m}. Plugins may only use tables prefixed with their id.` : m);
	} finally {
		sqlite3.capi.sqlite3_set_authorizer(db.pointer, 0, 0);
	}
}

function isReadonly(sqlite3: any, db: Db, sql: string) { // eslint-disable-line @typescript-eslint/no-explicit-any
	const stmt = (db as unknown as { prepare: (s: string) => { pointer: number; finalize: () => void } }).prepare(sql);
	try {
		return sqlite3.capi.sqlite3_stmt_readonly(stmt.pointer) !== 0;
	} finally {
		stmt.finalize();
	}
}

self.onmessage = async (e: MessageEvent<Msg>) => {
	const m = e.data;
	try {
		const { sqlite3, pool } = await init();
		const db = () => {
			const d = dbs.get(m.handle!);
			if (!d) throw new Error(`Database handle ${m.handle} is not open`);
			return d;
		};
		let value: unknown;
		switch (m.op) {
			case "open": {
				const name = "/" + m.path!.replace(/^\/+/, "").replace(/[^\w./-]/g, "_");
				const hit = byPath.get(name);
				if (hit) {
					value = hit;
					break;
				}
				const d = new pool.OpfsSAHPoolDb(name) as Db;
				d.exec({ sql: "PRAGMA foreign_keys=ON" });
				const h = ++next;
				dbs.set(h, d);
				byPath.set(name, h);
				value = h;
				break;
			}
			case "exec": {
				const d = db();
				if (m.readonly && !isReadonly(sqlite3, d, m.sql!)) throw new Error("Writes are disabled here (enable developer mode to allow them)");
				withOwner(sqlite3, d, m.owner, () => d.exec({ sql: m.sql!, bind: m.params?.length ? m.params : undefined }));
				value = { changes: d.changes(), lastId: Number(d.selectValue("SELECT last_insert_rowid()") ?? 0) };
				break;
			}
			case "query": {
				const d = db();
				if (m.readonly && !isReadonly(sqlite3, d, m.sql!)) throw new Error("Writes are disabled here (enable developer mode to allow them)");
				const rows: Record<string, unknown>[] = [];
				withOwner(sqlite3, d, m.owner, () => d.exec({ sql: m.sql!, bind: m.params?.length ? m.params : undefined, rowMode: "object", resultRows: rows }));
				value = rows;
				break;
			}
			case "batch": {
				const d = db();
				withOwner(sqlite3, d, m.owner, () => {
					d.exec({ sql: "BEGIN" });
					try {
						for (const s of m.statements ?? []) d.exec({ sql: s.sql, bind: s.params?.length ? s.params : undefined });
						d.exec({ sql: "COMMIT" });
					} catch (err) {
						d.exec({ sql: "ROLLBACK" });
						throw err;
					}
				});
				break;
			}
			case "close": {
				const d = dbs.get(m.handle!);
				d?.close();
				dbs.delete(m.handle!);
				for (const [p, h] of byPath) if (h === m.handle) byPath.delete(p);
				break;
			}
		}
		postMessage({ id: m.id, ok: true, value });
	} catch (err) {
		postMessage({ id: m.id, ok: false, error: String((err as Error)?.message ?? err) });
	}
};
