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

test("--help prints help and never runs the command", () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "fw-help-"));
	fs.mkdirSync(path.join(root, "src/app/showcase/a"), { recursive: true });
	fs.writeFileSync(path.join(root, "src/app/showcase/a/part.toml"), 'id = "showcase-a"\nkind = "showcase"\n');
	fs.writeFileSync(path.join(root, "app.config.ts"), "features: { labs: true }\n");
	for (const h of ["--help", "-h"]) {
		const out = execFileSync("node", [FW, "strip", h], { env: { ...process.env, FW_ROOT: root }, encoding: "utf8", stdio: "pipe" });
		assert.match(out, /Fanwit developer CLI/);
	}
	assert.ok(fs.existsSync(path.join(root, "src/app/showcase/a/part.toml")) && !fs.existsSync(path.join(root, ".trash")));
	fs.rmSync(root, { recursive: true, force: true });
});

test("docs publish builds a versioned site", () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "fw-docs-"));
	const put = (p, text) => (fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true }), fs.writeFileSync(path.join(root, p), text));
	const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
	const fw = (...a) => execFileSync("node", [FW, ...a], { env: { ...process.env, FW_ROOT: root }, encoding: "utf8", stdio: "pipe" });
	const build = (v) => (fs.rmSync(path.join(root, "build-docs"), { recursive: true, force: true }), put("build-docs/index.html", v), put("build-docs/llms.txt", "- [A](./md/a.md)\n"));

	build("one");
	fw("docs", "publish", "site", "--version", "1.0.0");
	build("next");
	fw("docs", "publish", "site", "--version", "next");
	build("two");
	fw("docs", "publish", "site", "--version", "1.10.0");
	build("pre");
	fw("docs", "publish", "site", "--version", "1.10.0-beta.1");

	assert.deepEqual(JSON.parse(read("site/versions.json")), { latest: "1.10.0", versions: ["next", "1.10.0", "1.10.0-beta.1", "1.0.0"] });
	assert.equal(read("site/v/1.0.0/index.html"), "one");
	assert.match(read("site/index.html"), /v\/1\.10\.0\//);
	assert.match(read("site/llms.txt"), /\]\(\.\/v\/1\.10\.0\/md\/a\.md\)/);
	fs.rmSync(root, { recursive: true, force: true });
});
