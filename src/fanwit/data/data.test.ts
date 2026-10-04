import { expect, test, vi } from "vitest";
import { createMemoryHost } from "../host/memory";
import type { DbExecResult, Host } from "../host/types";
import { SqlHandle, sql } from "./db";
import { StorageService, createPersisted } from "./storage.svelte";
import { TomlFile } from "./toml-file.svelte";

test("storage keeps values per scope and owner; vault scope needs an open vault", async () => {
	const host = createMemoryHost();
	const s = new StorageService(host, () => "main");
	await s.set("notes", "sort", "name");
	await s.set("notes", "draft", "x", { scope: "memory" });
	expect(await s.get("notes", "sort")).toBe("name");
	expect(await s.get("other", "sort")).toBeUndefined();
	expect(await s.get("notes", "draft", { scope: "memory" })).toBe("x");
	expect(() => s.store("vault")).toThrow(expect.objectContaining({ code: "STORAGE_NO_VAULT" }));
	await s.flush();
	expect(JSON.parse(await host.fs.readText("/global/state.json"))).toEqual({ "notes/sort": "name" });
});

test("persisted values load once, and save (debounced) when set", async () => {
	vi.useFakeTimers();
	const s = new StorageService(createMemoryHost(), () => "main");
	await s.set("notes", "width", 320);
	const width = createPersisted(s, "notes", "width", 280, { debounce: 50 });
	expect(width.value).toBe(280);
	await vi.waitFor(() => expect(width.loaded).toBe(true));
	expect(width.value).toBe(320);
	width.value = 400;
	await vi.advanceTimersByTimeAsync(50);
	expect(await s.get("notes", "width")).toBe(400);
	vi.useRealTimers();
});

test("a TOML file writes changes, reads edits from disk, and ignores its own echo", async () => {
	const host = createMemoryHost();
	const file = new TomlFile<{ theme?: string }>(host, "/config/settings.toml", { template: "# my settings\n", debounce: 10 });
	await file.load();
	await file.watch();
	const fromDisk = vi.fn();
	file.onDidChangeFromDisk.on(fromDisk);
	file.set({ theme: "dark" });
	await vi.waitFor(async () => expect(await host.fs.readText("/config/settings.toml")).toBe('# my settings\ntheme = "dark"\n'));
	await new Promise((r) => setTimeout(r, 80));
	expect(fromDisk).not.toHaveBeenCalled(); // our own write
	await host.fs.writeText("/config/settings.toml", '# my settings\ntheme = "light"\n');
	await vi.waitFor(() => expect(fromDisk).toHaveBeenCalledWith({ theme: "light" }));
	await host.fs.writeText("/config/settings.toml", "theme = = broken");
	await vi.waitFor(() => expect(file.diagnostics[0]).toMatchObject({ severity: "error", line: 1 }));
	expect(file.value).toEqual({ theme: "light" }); // the last good value stays
	file.dispose();
});

test("the sql tag turns values into parameters, never into SQL text", () => {
	const name = "x'); DROP TABLE notes; --";
	expect(sql`SELECT * FROM notes__links WHERE dst = ${name} AND n > ${2}`).toEqual({ text: "SELECT * FROM notes__links WHERE dst = ? AND n > ?", params: [name, 2] });
	const where = sql`dst = ${"a.md"}`;
	expect(sql`SELECT * FROM t WHERE ${where}${sql.raw(" LIMIT 1")}`).toEqual({ text: "SELECT * FROM t WHERE dst = ? LIMIT 1", params: ["a.md"] });
});

test("migrations run once, in order, and refuse an applied migration that changed", async () => {
	// a fake engine that records statements and answers the migrations table
	const applied: { version: number; checksum: string }[] = [];
	const ran: string[] = [];
	const host = {
		db: {
			exec: async (_h: number, text: string): Promise<DbExecResult> => (ran.push(text), { changes: 0, lastId: 0 }),
			query: async () => applied,
			batch: async (_h: number, st: { sql: string; params: unknown[] }[]) => {
				for (const s of st) {
					ran.push(s.sql);
					if (s.sql.startsWith("INSERT INTO _fanwit_migrations")) applied.push({ version: s.params[1] as number, checksum: s.params[2] as string });
				}
			}
		}
	} as unknown as Host;
	const db = new SqlHandle(host, Promise.resolve(1), "notes");
	const list = [
		{ version: 2, up: "CREATE INDEX notes__by_dst ON notes__links (dst)" },
		{ version: 1, up: "CREATE TABLE notes__links (src TEXT, dst TEXT)" }
	];
	await db.migrate(list);
	expect(ran.filter((s) => s.startsWith("CREATE TABLE notes") || s.startsWith("CREATE INDEX"))).toEqual([list[1].up, list[0].up]);
	ran.length = 0;
	await db.migrate(list);
	expect(ran.filter((s) => !s.startsWith("CREATE TABLE IF NOT EXISTS _fanwit"))).toEqual([]);
	await expect(db.migrate([{ version: 1, up: "CREATE TABLE notes__links (src TEXT)" }, list[0]])).rejects.toMatchObject({ code: "DB_MIGRATION_CHANGED" });
});
