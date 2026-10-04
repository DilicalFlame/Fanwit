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

test("a sandbox module runs in its own kernel and traces what it does", async () => {
	const { runSandbox } = await import("./run-kernel");
	const app = await createTestKernel();
	const before = app.commands.list().length;
	const trace: string[] = [];
	const run = await runSandbox(code, () => {}, (t) => trace.push(t));
	expect(await run.kernel.commands.run("greeter.greet", { name: "Ada" })).toBe("Ada");
	expect(trace.some((t) => t.startsWith("run    greeter.greet") && t.includes('-> "Ada"'))).toBe(true);
	expect(app.commands.list().length).toBe(before);
	await run.stop();
});

test("Rust output leaves out cargo's progress lines", async () => {
	const { runRust } = await import("./run-rust");
	const real = globalThis.fetch;
	globalThis.fetch = (async () =>
		new Response(JSON.stringify({ success: true, stdout: "hi 3\n", stderr: "   Compiling playground v0.0.1 (/playground)\n    Finished `dev` profile\n     Running `target/debug/playground`\nwarning: unused variable" }))) as typeof fetch;
	try {
		expect(await runRust("fn main() {}")).toEqual({ ok: true, stdout: "hi 3\n", stderr: "warning: unused variable" });
	} finally {
		globalThis.fetch = real;
	}
});
