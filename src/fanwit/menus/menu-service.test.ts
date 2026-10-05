import { expect, test } from "vitest";
import { createTestKernel } from "../testing";
import { MenuService } from "./menus.svelte";

async function menus() {
	const k = await createTestKernel();
	k.commands.register({ id: "t.rename", title: "Rename", when: "!readonly" }, () => {}, "t");
	k.commands.register({ id: "t.delete", title: "Delete" }, () => {}, "t");
	k.commands.register({ id: "t.open", title: "Open" }, () => {}, "t");
	const m = new MenuService(k);
	await m.load("/global");
	m.contribute("t/item", [
		{ id: "t.delete", command: "t.delete", group: "danger" },
		{ id: "t.rename", command: "t.rename", group: "modify", args: { path: "${target.path}" } },
		{ id: "t.open", command: "t.open", group: "navigation" },
		{ id: "t.gone", command: "t.notRegistered", group: "navigation" }
	], "t");
	return { k, m };
}

test("a location resolves into ordered groups, with templated args and disabled reasons", async () => {
	const { k, m } = await menus();
	k.context.set("readonly", true);
	const groups = await m.resolve("t/item", { target: { path: "a.md" } });
	expect(groups.map((g) => g.id)).toEqual(["navigation", "modify", "danger"]);
	const rename = groups[1].items[0];
	expect(rename).toMatchObject({ label: "Rename", enabled: false, args: { path: "a.md" } });
	expect(rename.disabledReason).toBeTruthy();
	// an item whose command does not exist is hidden, not shown dead
	expect(groups[0].items.map((i) => i.id)).toEqual(["t.open"]);
});

test("user changes are patches saved to menus.toml, and resetting removes them", async () => {
	const { k, m } = await menus();
	m.patch("t/item", { op: "rename", item: "t.open", label: "Open here" });
	expect((await m.resolve("t/item"))[0].items[0].label).toBe("Open here");
	await m.file!.flush();
	expect(await k.host.fs.readText("/global/menus.toml")).toContain('label = "Open here"');
	m.resetItem("t/item", "t.open");
	expect((await m.resolve("t/item"))[0].items[0].label).toBe("Open");
});
