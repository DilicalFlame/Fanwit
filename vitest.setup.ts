// Vite's ?init and ?url imports fetch "/src/..." paths; under Node, serve them from disk.
import { readFile } from "node:fs/promises";

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
	const url = String(input instanceof Request ? input.url : input);
	if (!url.startsWith("/")) return realFetch(input, init);
	const body = await readFile("." + url.split("?")[0]);
	return new Response(body, { headers: url.includes(".wasm") ? { "content-type": "application/wasm" } : {} });
}) as typeof fetch;
