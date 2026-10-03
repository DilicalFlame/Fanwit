<script lang="ts">
	import { getKernel } from "../../ui.svelte";

	/**
	 * Scripting console (Section 21.3): in developer mode the full ctx API is in scope.
	 * Needs 'unsafe-eval', which only the dev CSP allows; release builds explain that instead.
	 */
	const k = getKernel();
	const ctx = k.createContext("console");
	let input = $state("");
	let history = $state<{ code: string; out: string; ok: boolean }[]>([]);
	let past: string[] = [];
	let cursor = -1;

	async function run() {
		const code = input.trim();
		if (!code) return;
		past = [code, ...past];
		cursor = -1;
		input = "";
		try {
			const fn = new Function("ctx", "k", `return (async () => { return (${code}); })()`);
			const r = await fn(ctx, k);
			history = [...history, { code, ok: true, out: r === undefined ? "undefined" : typeof r === "string" ? r : JSON.stringify(r, null, 2) ?? String(r) }];
		} catch (e) {
			// statements (for loops, const) do not fit in an expression: run them as a body
			if (e instanceof SyntaxError) {
				try {
					const fn = new Function("ctx", "k", `return (async () => { ${code} })()`);
					const r = await fn(ctx, k);
					history = [...history, { code, ok: true, out: r === undefined ? "undefined" : JSON.stringify(r, null, 2) }];
					return;
				} catch (e2) {
					e = e2;
				}
			}
			const msg = String((e as Error).message ?? e);
			history = [...history, { code, ok: false, out: msg.includes("unsafe-eval") || msg.includes("Content Security") ? "The scripting console needs a development build (the release CSP blocks eval)." : msg }];
		}
	}
	function keys(e: KeyboardEvent) {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			void run();
		} else if (e.key === "ArrowUp" && !input.includes("\n")) {
			cursor = Math.min(past.length - 1, cursor + 1);
			input = past[cursor] ?? input;
		} else if (e.key === "ArrowDown" && !input.includes("\n")) {
			cursor = Math.max(-1, cursor - 1);
			input = cursor < 0 ? "" : past[cursor];
		}
	}
</script>

<div class="flex h-full flex-col font-mono text-[11.5px]">
	<div class="selectable min-h-0 flex-1 overflow-auto p-2">
		<div class="text-muted-foreground">// ctx is a module context: ctx.commands.run("theme.toggleMode"), ctx.layout.openView("fanwit.logs"), await ctx.vault.fs.list("")</div>
		{#each history as h, i (i)}
			<div class="mt-1"><span class="text-info">›</span> {h.code}</div>
			<pre class="whitespace-pre-wrap {h.ok ? 'text-foreground/80' : 'text-destructive'}">{h.out}</pre>
		{/each}
	</div>
	<textarea class="h-14 resize-none border-t border-border bg-background px-2 py-1 outline-none" placeholder="Expression or statements; Enter runs, Shift+Enter for a new line" aria-label="Console input" bind:value={input} onkeydown={keys}></textarea>
</div>
