import { expect, test } from "vitest";
import { createTestKernel } from "../../testing";
import { runModule } from "./run-module";

const code = `
import { defineModule } from "$fanwit";
export default defineModule({
	id: "greeter",
	contributes: { commands: [{ id: "greeter.greet", title: "Greet me" }] },
	activate(ctx) {
		ctx.commands.handle("greeter.greet", ({ name }) => { console.log("hi", name); return name; });
	}
});`;

test("a playground module joins the running app and leaves nothing behind", async () => {
	const k = await createTestKernel();
	const out: string[] = [];
	const run = await runModule(k, code, (_kind, text) => out.push(text));
	expect(run.commands).toEqual([{ id: "greeter.greet", title: "Greet me" }]);
	expect(await k.commands.run("greeter.greet", { name: "Ada" })).toBe("Ada");
	expect(out).toContain("hi Ada");
	await run.stop();
	expect(k.commands.get("greeter.greet")).toBeUndefined();
	// a second run works again after the first one stopped
	const again = await runModule(k, code, () => {});
	await again.stop();
});

test("a command id the app already has is refused, not overwritten", async () => {
	const k = await createTestKernel();
	const first = await runModule(k, code, () => {});
	await expect(runModule(k, code, () => {})).rejects.toThrow(/already exists/);
	await first.stop();
});
