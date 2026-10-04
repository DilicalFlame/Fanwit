import { existsSync, readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, test } from "vitest";
import { WORKER_PRELUDE } from "./worker-prelude";

/** The worker prelude plus a real Rust plugin (plugins/text-stats) through the WASM ABI. */
const WASM = "plugins/text-stats/plugin.wasm";

test.skipIf(!existsSync(WASM))("a Rust plugin answers the protocol from inside the worker prelude", async () => {
	const out: { t: string; method?: string; args?: unknown[]; value?: unknown; error?: unknown }[] = [];
	const self: { onmessage?: (e: { data: unknown }) => Promise<void> } = {};
	runInNewContext(WORKER_PRELUDE.replace("__ID__", "text-stats"), { self, postMessage: (m: never) => out.push(m), WebAssembly, TextEncoder, TextDecoder, BigInt, console });
	const send = (data: unknown) => self.onmessage!({ data });

	const wasm = readFileSync(WASM);
	await send({ t: "activate", settings: {}, wasm: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) });
	expect(out.map((m) => m.method ?? m.t)).toEqual(["events.on", "events.on", "commands.handle", "activated"]);

	// the plugin only reports on the note in front
	await send({ t: "event", name: "layout:activePane", payload: { view: "notes.editor", path: "a.md" } });
	out.length = 0;
	await send({ t: "event", name: "notes:changed", payload: { path: "a.md", text: "The cat sat on the mat. It was happy!" } });
	expect(out[0]).toMatchObject({ t: "call", method: "statusbar.set" });
	expect((out[0].args![1] as { tooltip: string }).tooltip).toContain("9 words, 2 sentences");

	// a pane that is not a note hides the item instead of showing stale numbers
	out.length = 0;
	await send({ t: "event", name: "layout:activePane", payload: { view: "fanwit.welcome", path: null } });
	expect(out[0]).toMatchObject({ method: "statusbar.set", args: ["textStats.item", { text: "" }] });

	out.length = 0;
	await send({ t: "invoke", id: 1, command: "textStats.show", args: {} });
	expect(out.find((m) => m.t === "invoked")).toMatchObject({ t: "invoked", value: { words: 9, sentences: 2 } });
});
