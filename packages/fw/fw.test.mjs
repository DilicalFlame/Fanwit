// node --test packages/fw: strip, undo and restore against a throwaway checkout
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const FW = path.join(import.meta.dirname, "fw.mjs");

test("strip, undo and restore round trip", () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "fw-parts-"));
	const put = (p, text) => (fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true }), fs.writeFileSync(path.join(root, p), text));
	const has = (p) => fs.existsSync(path.join(root, p));
	const fw = (...a) => execFileSync("node", [FW, ...a], { env: { ...process.env, FW_ROOT: root }, encoding: "utf8", stdio: "pipe" });
	put("app.config.ts", "features: { labs: true }\n");
	put("src/app/showcase/_shared/part.toml", 'id = "showcase-shared"\nkind = "showcase"\n');
	put("src/app/showcase/a/part.toml", 'id = "showcase-a"\nkind = "showcase"\nrequires = ["showcase-shared"]\n');
	put("src/app/showcase/a/x.ts", "x");
	put("plugins/p/plugin.toml", 'id = "p"\n');
	put("plugins/p/part.toml", 'id = "plugin-p"\nkind = "plugin"\nrequires = ["showcase-a"]\n');

	assert.throws(() => fw("strip", "showcase-shared"), /requires showcase-shared/);
	fw("strip", "showcase-a", "--with-dependents");
	assert.ok(!has("src/app/showcase/a") && !has("plugins/p") && has(".trash/showcase-a/src/app/showcase/a/x.ts"));
	fw("strip", "--undo");
	assert.ok(has("src/app/showcase/a/x.ts") && has("plugins/p/plugin.toml") && !has(".trash/showcase-a"));

	fw("strip"); // everything, and Labs off
	assert.ok(!has("src/app/showcase") && fs.readFileSync(path.join(root, "app.config.ts"), "utf8").includes("labs: false"));
	fw("restore", "plugin-p"); // pulls in what it requires
	assert.ok(has("plugins/p") && has("src/app/showcase/a") && has("src/app/showcase/_shared"));
	fw("strip", "--undo"); // undoes the restore
	assert.ok(!has("plugins/p"));
	fw("strip", "--undo"); // undoes the bare strip, edits included
	assert.ok(has("plugins/p") && fs.readFileSync(path.join(root, "app.config.ts"), "utf8").includes("labs: true"));
	fs.rmSync(root, { recursive: true, force: true });
});
