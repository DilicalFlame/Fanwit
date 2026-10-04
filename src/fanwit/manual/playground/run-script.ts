/**
 * JavaScript and TypeScript playgrounds: the code runs as the script of an invisible component,
 * which is how TypeScript gets its types removed (the Svelte compiler strips them) with nothing
 * else to download. What it logs with console.log goes to the output pane; `await` works.
 */
import { runSvelte, type SvelteRun } from "./run-svelte";

type Print = (kind: "log" | "error" | "trace", text: string) => void;

const show = (v: unknown): string => {
	if (typeof v === "string") return v;
	if (v === undefined) return "undefined";
	if (v instanceof Error) return `${v.name}: ${v.message}`;
	try {
		return JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? `${x}n` : x === undefined ? "undefined" : x)) ?? String(v);
	} catch {
		return String(v);
	}
};

/** Lines the wrapper adds before the reader's code, so error positions point at their line. */
const BEFORE = 3;

export async function runScript(code: string, ts: boolean, print: Print): Promise<SvelteRun> {
	const out = (kind: "log" | "error") => (...a: unknown[]) => print(kind, a.map(show).join(" "));
	(globalThis as unknown as { __fw_console: unknown }).__fw_console = { log: out("log"), info: out("log"), warn: out("error"), error: out("error"), table: out("log") };
	const wrapped = `<script${ts ? ' lang="ts"' : ""}>
const console = globalThis.__fw_console;
(async () => {
${code}
})().catch((e) => console.error(e));
</script>`;
	try {
		return await runSvelte(wrapped, document.createElement("div"));
	} catch (e) {
		const err = e as Error & { line?: number; column?: number };
		if (err.line) err.line = Math.max(1, err.line - BEFORE);
		throw err;
	}
}
