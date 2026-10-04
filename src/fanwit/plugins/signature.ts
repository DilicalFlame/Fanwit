/**
 * Registry signatures (Section 14.8): `fw plugin pack` signs signedMessage(entry) with an Ed25519
 * key; the app installs only entries that verify against plugins.trustedKeys (or, with Allow
 * unsigned plugins on, entries with no signature at all).
 */
import type { RegistryEntry } from "./plugins.svelte";

type Signed = Pick<RegistryEntry, "id" | "version" | "files" | "signature">;

/** What a registry signature covers: id, version and every file's hash. `fw plugin pack` builds the same string. */
export function signedMessage(e: Omit<Signed, "signature">) {
	return JSON.stringify({ id: e.id, version: e.version, files: e.files.map((f) => ({ path: f.path, sha256: f.sha256 })) });
}

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** True when the entry's signature verifies against one of the trusted Ed25519 keys. */
export async function verifySignature(e: Signed, trustedKeys: string[]) {
	if (!e.signature) return false;
	const msg = new TextEncoder().encode(signedMessage(e));
	for (const k of trustedKeys) {
		try {
			const key = await crypto.subtle.importKey("raw", b64(k), { name: "Ed25519" }, false, ["verify"]);
			if (await crypto.subtle.verify({ name: "Ed25519" }, key, b64(e.signature), msg)) return true;
		} catch {
			// a malformed key or signature never verifies
		}
	}
	return false;
}
