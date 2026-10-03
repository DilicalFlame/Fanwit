import { expect, test } from "vitest";
import { scriptManifest } from "./manifest";

test("user script headers become a worker manifest", () => {
	const m = scriptManifest("Daily Stats.js", "// @command scripts.stats Show vault stats\n// @key ctrl+alt+s scripts.stats\n// @permission vault.read\nexport default (ctx) => {};");
	expect(m.id).toBe("script-daily-stats");
	expect(m.isolation).toBe("worker");
	expect(m.permissions).toEqual(["vault.read"]);
	expect(m.contributes.commands).toEqual([{ id: "scripts.stats", title: "Show vault stats", category: "Scripts" }]);
	expect(m.contributes.keybindings).toEqual([{ key: "ctrl+alt+s", command: "scripts.stats" }]);
});
