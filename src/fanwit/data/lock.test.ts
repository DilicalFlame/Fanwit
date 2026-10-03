import { expect, test } from "vitest";
import { VaultService } from "./vault.svelte";
import type { Kernel } from "../kernel/kernel.svelte";

// a fresh lock from another instance blocks only while its process still runs
test("vault lock owner liveness", async () => {
	const host = { windows: { label: "aux-test" }, app: async () => ({ pid: 100 }), processAlive: async (pid: number) => pid === 200 };
	const v = new VaultService({ host } as unknown as Kernel) as unknown as { lockOwnerLive(pid?: number): Promise<boolean> };
	expect(await v.lockOwnerLive(200)).toBe(true); // another live process: really in use
	expect(await v.lockOwnerLive(300)).toBe(false); // killed or closed run: stale
	expect(await v.lockOwnerLive(100)).toBe(false); // this process (a reload): ours
	expect(await v.lockOwnerLive(undefined)).toBe(true); // old lock without pid: trust the heartbeat
});
