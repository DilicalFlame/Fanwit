import { expect, test } from "vitest";
import type { ModuleContext } from "../kernel/context-api";
import { createTestKernel } from "../testing";
import { handleDeepLink } from "./handlers.svelte";

test("links run only commands marked uri: true, with query parameters as arguments", async () => {
	const k = await createTestKernel();
	const ctx = { kernel: k } as unknown as ModuleContext;
	k.commands.register({ id: "theme.setMode", title: "Set mode", uri: true, args: { mode: { type: "enum", options: ["light", "dark"] } } }, (a) => a, "t");
	k.commands.register({ id: "vault.delete", title: "Delete vault" }, () => "deleted", "t");
	expect(await handleDeepLink(ctx, "fanwit://run/theme.setMode?mode=dark")).toEqual({ mode: "dark" });
	await expect(handleDeepLink(ctx, "fanwit://run/vault.delete")).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
	// arguments are still validated: a link cannot smuggle in a value the command does not accept
	await expect(handleDeepLink(ctx, "fanwit://run/theme.setMode?mode=neon")).rejects.toMatchObject({ code: "CMD_ARGS" });
});
