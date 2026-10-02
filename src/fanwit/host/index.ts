import type { Host } from "./types";

export * from "./types";
export { createMemoryHost, MemoryFs } from "./memory";

/** Remote hosts are supplied by app.config.ts (`host: () => createMyRemoteHost()`). */
export type HostFactory = () => Host | Promise<Host>;

/** Picks the host once at boot: Tauri when its internals exist, otherwise the browser. */
export async function pickHost(custom?: HostFactory): Promise<Host> {
	if (custom) return custom();
	if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
		const { createTauriHost } = await import("./tauri");
		return createTauriHost();
	}
	const { createBrowserHost } = await import("./browser");
	return createBrowserHost();
}
