import { expect, test } from "vitest";
import { createTestKernel } from "../testing";
import { runCli, kebab } from "./cli";

test("argv maps to commands with typed flags, JSON output and exit codes", async () => {
	const k = await createTestKernel();
	k.commands.register(
		{ id: "notes.renameFile", title: "Rename note", cli: true, args: { path: { type: "path", kind: "file" }, to: { type: "string" }, force: { type: "boolean" }, size: { type: "number", default: 1 } } },
		(a) => a,
		"notes"
	);
	k.commands.register({ id: "notes.secret", title: "Hidden", args: {} }, () => 1, "notes");
	expect(kebab("renameFile")).toBe("rename-file");
	const r = await runCli(k, ["notes", "rename-file", "a.md", "--to", "b.md", "--force", "--size=3", "--json"], () => {});
	expect(r.code).toBe(0);
	expect(JSON.parse(r.stdout!)).toEqual({ path: "a.md", to: "b.md", force: true, size: 3 });
	expect((await runCli(k, ["notes", "rename-file", "a.md"], () => {})).code).toBe(2);
	expect((await runCli(k, ["nope", "x"], () => {})).code).toBe(4);
	expect((await runCli(k, ["notes.secret"], () => {})).code).toBe(5);
	expect((await runCli(k, ["commands", "list"], () => {})).stdout).toContain("notes rename-file");
	expect((await runCli(k, ["help", "notes.renameFile"], () => {})).stdout).toContain("--to <string>");
});
