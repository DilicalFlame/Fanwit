/**
 * Format preserving TOML merge for hosts without Rust at hand (web, memory): the same toml_edit
 * code the desktop links (packages/toml-merge), compiled to WebAssembly and loaded on first write.
 */
import init from "./toml-merge.wasm?init";

interface Exports {
	memory: WebAssembly.Memory;
	alloc(len: number): number;
	dealloc(ptr: number, len: number): void;
	merge(ptr: number, len: number): bigint;
}

let exports: Promise<Exports> | undefined;

/** Merge `value` into the TOML `text` in place: comments, order and formatting survive. */
export async function mergeToml(text: string, value: Record<string, unknown>): Promise<string> {
	const x = await (exports ??= init().then((i) => i.exports as unknown as Exports));
	const input = new TextEncoder().encode(JSON.stringify({ text, value }));
	const ptr = x.alloc(input.length);
	new Uint8Array(x.memory.buffer, ptr, input.length).set(input);
	const r = x.merge(ptr, input.length); // frees the input
	const [out, len] = [Number(r >> 32n), Number(r & 0xffffffffn)];
	const res = JSON.parse(new TextDecoder().decode(new Uint8Array(x.memory.buffer, out, len))) as { ok?: string; err?: string };
	x.dealloc(out, len);
	if (res.err !== undefined) throw new Error(res.err);
	return res.ok!;
}
