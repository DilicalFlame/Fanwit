import * as v from "valibot";
import { expect, test } from "vitest";
import { defineModule } from "../kernel/module";
import type { ModuleContext } from "../kernel/context-api";
import { createTestKernel } from "../testing";

test("lazy module activates on first invocation and returns results", async () => {
	let activations = 0;
	const hello = defineModule({
		id: "hello",
		contributes: {
			commands: [{ id: "hello.greet", title: "Say hello", args: { name: { type: "string", default: "world" } }, cli: true }]
		},
		activate: async () => ({
			default: (ctx: ModuleContext) => {
				activations++;
				ctx.commands.handle("hello.greet", ({ name }: { name: string }) => ({ greeted: name }));
			}
		})
	});
	const k = await createTestKernel({ modules: [hello] });
	expect(activations).toBe(0);
	expect(await k.commands.run("hello.greet", { name: "Asha" })).toEqual({ greeted: "Asha" });
	expect(await k.commands.run("hello.greet")).toEqual({ greeted: "world" });
	expect(activations).toBe(1);
});

test("when clauses, missing args and unknown ids fail with stable codes", async () => {
	const k = await createTestKernel();
	k.commands.register({ id: "t.needsVault", title: "x", when: "vault.open" }, () => 1, "t");
	k.commands.register({ id: "t.args", title: "x", args: v.object({ path: v.string(), n: v.optional(v.number(), 3) }) }, (a) => a, "t");
	await expect(k.commands.run("t.needsVault")).rejects.toMatchObject({ code: "CMD_DISABLED" });
	k.context.set("vault.open", true);
	expect(await k.commands.run("t.needsVault")).toBe(1);
	await expect(k.commands.run("t.args", {})).rejects.toMatchObject({ code: "CMD_ARGS_MISSING" });
	expect(await k.commands.run("t.args", { path: "a.md" })).toEqual({ path: "a.md", n: 3 });
	await expect(k.commands.run("t.args", { path: "a", n: "x" })).rejects.toMatchObject({ code: "CMD_ARGS" });
	await expect(k.commands.run("nope.nope")).rejects.toMatchObject({ code: "CMD_UNKNOWN" });
});

test("interceptors wrap handlers; undo records go to history", async () => {
	const k = await createTestKernel();
	let value = 0;
	const seen: string[] = [];
	k.commands.register({ id: "t.inc", title: "Inc", undoable: true }, () => {
		value++;
		return { undo: () => value--, label: "Increment" };
	}, "t");
	k.commands.intercept("t.*", async (inv, next) => {
		seen.push(inv.id);
		return next();
	}, "spy");
	await k.commands.run("t.inc");
	await k.commands.run("t.inc");
	expect(value).toBe(2);
	expect(seen).toEqual(["t.inc", "t.inc"]);
	await k.history.undo();
	expect(value).toBe(1);
	await k.history.redo();
	expect(value).toBe(2);
	await k.history.transaction("both", async () => {
		await k.commands.run("t.inc");
		await k.commands.run("t.inc");
	});
	expect(value).toBe(4);
	await k.history.undo();
	expect(value).toBe(2);
});

test("deactivating a module disposes everything it registered", async () => {
	const mod = defineModule({ id: "m", activate: (ctx) => void ctx.commands.register({ id: "m.x", title: "X" }, () => "x") });
	const k = await createTestKernel({ modules: [mod] });
	await k.modules.activate("m");
	expect(await k.commands.run("m.x")).toBe("x");
	await k.modules.deactivate("m");
	await expect(k.commands.run("m.x")).rejects.toBeTruthy();
});
