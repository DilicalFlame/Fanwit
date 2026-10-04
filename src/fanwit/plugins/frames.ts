/** Loading a plugin iframe page: from the host's fanwit-plugin scheme, or inlined as srcdoc. */
import type { Kernel } from "../kernel/kernel.svelte";
import type { InstalledPlugin, PluginService } from "./plugins.svelte";
import { FRAME_CLIENT } from "./worker-prelude";

const served = new Set<string>();
const CLIENT = "_fw/ui.js";

const client = (p: InstalledPlugin) => FRAME_CLIENT.replace("__ID__", p.manifest.id);

/** Serve the plugin's page files once per session and return the entry URL. */
export async function frameUrl(k: Kernel, svc: PluginService, p: InstalledPlugin, entry: string): Promise<string> {
	const host = k.host.plugins!;
	const key = `${p.manifest.id}@${p.manifest.version}`;
	if (!served.has(key)) {
		const enc = new TextEncoder();
		const files = Object.fromEntries(Object.entries(await svc.frameFiles(p)).map(([rel, text]) => [rel, enc.encode(text)]));
		files[CLIENT] = enc.encode(client(p));
		await host.serve!(p.manifest.id, files);
		served.add(key);
	}
	return host.url!(p.manifest.id, entry);
}

/** The entry page with its local scripts and styles inlined (hosts without the scheme). */
export async function frameDocument(svc: PluginService, p: InstalledPlugin, entry: string): Promise<string> {
	const files = await svc.frameFiles(p);
	const dir = entry.includes("/") ? entry.slice(0, entry.lastIndexOf("/") + 1) : "";
	const resolve = (ref: string) => {
		if (ref.startsWith("/")) return ref.split("/").slice(2).join("/"); // /<id>/path
		const parts = (dir + ref).split("/");
		const out: string[] = [];
		for (const s of parts) s === ".." ? out.pop() : s !== "." && out.push(s);
		return out.join("/");
	};
	const file = (ref: string) => (resolve(ref) === CLIENT ? client(p) : (files[resolve(ref)] ?? ""));
	const html = files[entry] ?? `<p>Missing ${entry}</p>`;
	return html
		.replace(/<script([^>]*)\ssrc="([^"]+)"([^>]*)><\/script>/g, (_, a, ref, b) => `<script${a}${b}>${file(ref).replace(/<\/script/gi, "<\/script")}</script>`)
		.replace(/<link([^>]*)rel="stylesheet"([^>]*)href="([^"]+)"([^>]*)>/g, (_, _a, _b, ref) => `<style>${file(ref)}</style>`);
}
