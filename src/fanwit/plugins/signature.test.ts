import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { verifySignature } from "./signature";

/** `fw plugin keygen` + `fw plugin pack` produce entries the app verifies, and tampering breaks them. */
test("registry signatures made by the CLI verify in the app", async () => {
	const root = mkdtempSync(join(tmpdir(), "fw-sign-"));
	const fw = (env: Record<string, string>, ...a: string[]) => execFileSync("node", ["packages/fw/fw.mjs", ...a], { env: { ...process.env, FW_ROOT: root, ...env }, encoding: "utf8" });
	try {
		mkdirSync(join(root, "plugins/hello"), { recursive: true });
		writeFileSync(join(root, "plugins/hello/plugin.toml"), 'id = "hello"\nname = "Hello"\nversion = "1.0.0"\n');
		writeFileSync(join(root, "plugins/hello/styles.css"), "body {}\n");
		const key = join(root, "signing.key");
		const pub = /public key:\s+(\S+)/.exec(fw({}, "plugin", "keygen", key))![1];
		fw({ FW_PLUGIN_KEY: key }, "plugin", "pack", "hello");
		const entry = JSON.parse(readFileSync(join(root, "dist/plugins/hello/1.0.0/entry.json"), "utf8"));

		expect(await verifySignature(entry, [pub])).toBe(true);
		expect(await verifySignature(entry, [])).toBe(false);
		expect(await verifySignature({ ...entry, signature: undefined }, [pub])).toBe(false);
		expect(await verifySignature({ ...entry, version: "1.0.1" }, [pub])).toBe(false);
		expect(await verifySignature({ ...entry, files: entry.files.map((f: { sha256: string }) => ({ ...f, sha256: "0".repeat(64) })) }, [pub])).toBe(false);
		expect(await verifySignature(entry, ["not a key"])).toBe(false);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
