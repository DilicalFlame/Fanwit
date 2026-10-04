import { existsSync, readdirSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { parseManifest } from "./manifest";

/** Every plugin that ships with the app (plugins/<id>) has a valid manifest and the files it names. */
test("bundled plugin manifests parse and point at real files", () => {
	const ids = existsSync("plugins") ? readdirSync("plugins").filter((d) => existsSync(`plugins/${d}/plugin.toml`)) : [];
	for (const id of ids) {
		const m = parseManifest(readFileSync(`plugins/${id}/plugin.toml`, "utf8"), `${id}/plugin.toml`);
		expect(m.id, `${id}: id matches its folder`).toBe(id);
		const c = m.contributes;
		for (const f of [...(c.styles ?? []), ...(c.themes ?? []), ...(c.layoutPresets ?? []), ...(c.views ?? []).flatMap((v) => (v.entry ? [v.entry] : []))]) expect(existsSync(`plugins/${id}/${f}`), `${id}/${f}`).toBe(true);
		if (m.runtime === "js" && m.entry) expect(existsSync(`plugins/${id}/${m.entry}`), `${id}/${m.entry}`).toBe(true);
		if (m.runtime === "wasm") expect(existsSync(`plugins/${id}/wasm/Cargo.toml`), `${id}/wasm/Cargo.toml`).toBe(true);
		if (m.runtime === "sidecar") {
			expect(m.permissions, `${id} declares its sidecar`).toContain(`sidecar:${id}`);
			expect(readFileSync(`plugins/${id}/native/Cargo.toml`, "utf8"), `${id} binary name`).toContain(`name = "fanwit-plugin-${id}"`);
		}
	}
});
