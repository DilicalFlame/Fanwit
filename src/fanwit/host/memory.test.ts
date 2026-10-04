import { expect, test } from "vitest";
import { basename, createMemoryHost, dirname, extname, joinPath } from "./index";

test("paths use forward slashes and join without doubling them", () => {
	expect(joinPath("/vault/", "/notes/", "a.md")).toBe("/vault/notes/a.md");
	expect(joinPath("C:\\Users\\ada", "notes")).toBe("C:/Users/ada/notes");
	expect(dirname("/vault/notes/a.md")).toBe("/vault/notes");
	expect(dirname("/a")).toBe("/");
	expect(basename("/vault/notes/a.md")).toBe("a.md");
	expect(extname("/vault/A.MD")).toBe("md");
	expect(extname("/vault/.trash")).toBe("");
});

test("the memory file system behaves like a disk", async () => {
	const { fs } = createMemoryHost({ files: { "/vault/a.md": "# A" } });
	expect(await fs.readText("/vault/a.md")).toBe("# A");
	await fs.writeText("/vault/notes/b.md", "# B");
	expect(await fs.exists("/vault/notes")).toBe(true);
	expect((await fs.list("/vault")).map((e) => e.name)).toEqual(["a.md", "notes"]);
	expect((await fs.list("/vault", { recursive: true })).map((e) => e.path)).toContain("/vault/notes/b.md");
	await fs.rename("/vault/notes", "/vault/archive");
	expect(await fs.readText("/vault/archive/b.md")).toBe("# B");
	await fs.remove("/vault/archive");
	expect(await fs.exists("/vault/archive/b.md")).toBe(false);
	await expect(fs.readText("/vault/gone.md")).rejects.toMatchObject({ code: "ENOENT" });
});

test("watchers hear about changes below their path, and stop when disposed", async () => {
	const { fs } = createMemoryHost();
	const seen: string[] = [];
	const w = await fs.watch("/vault", (events) => seen.push(...events.map((e) => `${e.kind} ${e.path}`)));
	await fs.writeText("/vault/a.md", "1");
	await fs.writeText("/vault/a.md", "2");
	await fs.writeText("/elsewhere.md", "x");
	w.dispose();
	await fs.writeText("/vault/b.md", "3");
	expect(seen).toEqual(["created /vault/a.md", "modified /vault/a.md"]);
});

test("TOML writes keep the comments already in the file", async () => {
	const { fs } = createMemoryHost({ files: { "/config/settings.toml": "# my settings\ntheme = \"light\" # the default\n" } });
	await fs.writeToml("/config/settings.toml", { theme: "dark" });
	expect(await fs.readText("/config/settings.toml")).toBe("# my settings\ntheme = \"dark\" # the default\n");
});
