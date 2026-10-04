import { expect, test } from "vitest";
import { createMemoryHost } from "../host/memory";
import type { Kernel } from "../kernel/kernel.svelte";
import { VaultService } from "./vault.svelte";

/** Without an OS trash (web), "move to trash" keeps the file in the vault's .trash, never deletes it. */
test("trash falls back to the vault's .trash folder", async () => {
	const host = createMemoryHost({ files: { "/v/a.md": "one", "/v/d/a.md": "two" } });
	expect(host.caps.osTrash).toBe(false);
	const k = { windowKind: "aux", host, sys: { settings: { get: () => "os" } }, events: { emit() {} } } as unknown as Kernel;
	const vault = new VaultService(k);
	(vault as unknown as { current: object }).current = { path: "/v", configDir: "/v/.fanwit" };

	expect(vault.trashMode()).toBe("vault");
	await vault.fs.trash("a.md");
	await vault.fs.trash("d/a.md");
	expect(await host.fs.readText("/v/.trash/a.md")).toBe("one");
	expect(await host.fs.readText("/v/.trash/a 2.md")).toBe("two");
	expect(await host.fs.exists("/v/a.md")).toBe(false);
});
