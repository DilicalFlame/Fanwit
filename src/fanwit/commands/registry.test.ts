import { expect, test } from "vitest";
import { ContextKeyService } from "../kernel/context.svelte";
import { LogService } from "../kernel/logger";
import { HistoryService } from "./history.svelte";
import { CommandService } from "./registry.svelte";

/** A command service on its own, before there is a kernel to make one. */
function service() {
	const context = new ContextKeyService();
	const history = new HistoryService();
	const activated: string[] = [];
	const commands = new CommandService({ context, history, log: new LogService().scoped("commands"), windowLabel: () => "main", activate: async (e) => void activated.push(e) });
	return { commands, context, history, activated };
}

test("a declared command runs its handler with validated arguments", async () => {
	const { commands } = service();
	commands.register({ id: "t.greet", title: "Greet", args: { name: { type: "string", default: "world" } } }, ({ name }) => `hi ${name}`, "t");
	expect(await commands.run("t.greet")).toBe("hi world");
	expect(await commands.run("t.greet", { name: "Ada" })).toBe("hi Ada");
	expect(commands.label("t.greet")).toBe("Greet");
});

test("a command without a handler asks its module to activate first", async () => {
	const { commands, activated } = service();
	commands.declare({ id: "t.lazy", title: "Lazy" }, "t");
	await expect(commands.run("t.lazy")).rejects.toMatchObject({ code: "CMD_NO_HANDLER" });
	expect(activated).toEqual(["onCommand:t.lazy"]);
});

test("when clauses gate running, and say why", async () => {
	const { commands, context } = service();
	commands.register({ id: "t.save", title: "Save", when: "editorFocus" }, () => "saved", "t");
	await expect(commands.run("t.save")).rejects.toMatchObject({ code: "CMD_DISABLED", message: expect.stringContaining("editorFocus is false") });
	context.set("editorFocus", true);
	expect(await commands.run("t.save")).toBe("saved");
});

test("interceptors wrap the handler in priority order", async () => {
	const { commands } = service();
	const order: string[] = [];
	commands.register({ id: "notes.save", title: "Save" }, () => void order.push("handler"), "t");
	commands.intercept("notes.*", async (_inv, next) => (order.push("outer"), next()), "a", 10);
	commands.intercept("*", async (_inv, next) => (order.push("inner"), next()), "b");
	await commands.run("notes.save");
	expect(order).toEqual(["outer", "inner", "handler"]);
});

test("a handler that returns an undo record joins the history; transactions group steps", async () => {
	const { commands, history } = service();
	let n = 0;
	commands.register({ id: "t.inc", title: "Add one" }, () => (n++, { undo: () => void n--, label: "Add one" }), "t");
	await commands.run("t.inc");
	await commands.run("t.inc");
	expect(history.peek()).toEqual({ undo: "Add one", redo: undefined });
	await history.undo();
	expect(n).toBe(1);
	await history.redo(); // runs the handler again
	expect(n).toBe(2);
	await history.transaction("Add three", async () => {
		for (let i = 0; i < 3; i++) await commands.run("t.inc");
	});
	expect(n).toBe(5);
	await history.undo();
	expect(n).toBe(2);
});

test("renamed commands keep working under their old id", async () => {
	const { commands } = service();
	commands.register({ id: "layout.splitRight", title: "Split right", deprecatedAliases: ["view.splitRight"] }, () => "split", "t");
	expect(await commands.run("view.splitRight")).toBe("split");
});
