<script lang="ts">
	import type { TomlDiagnostic } from "../data/toml-file.svelte";

	/**
	 * Lightweight code editor: textarea with a line number gutter and diagnostic markers.
	 * ponytail: plain textarea; swap in CodeMirror 6 for TOML grammar and schema completion.
	 */
	let { value = $bindable(""), diagnostics = [], gotoLine, label = "Editor", readonly = false }: { value?: string; diagnostics?: TomlDiagnostic[]; gotoLine?: number; label?: string; readonly?: boolean } = $props();
	let ta = $state<HTMLTextAreaElement>();
	let gutter = $state<HTMLDivElement>();
	const lines = $derived(value.split("\n").length);
	const marks = $derived(new Map(diagnostics.filter((d) => d.line).map((d) => [d.line!, d])));

	export function reveal(line: number) {
		if (!ta) return;
		const idx = value.split("\n").slice(0, line - 1).join("\n").length + (line > 1 ? 1 : 0);
		ta.focus();
		ta.setSelectionRange(idx, idx);
		ta.scrollTop = Math.max(0, (line - 5) * 20);
	}
	$effect(() => {
		if (gotoLine && ta) queueMicrotask(() => reveal(gotoLine));
	});
	function tab(e: KeyboardEvent) {
		if (e.key !== "Tab" || readonly || !ta) return;
		e.preventDefault();
		ta.setRangeText("\t", ta.selectionStart, ta.selectionEnd, "end");
		value = ta.value;
	}
</script>

<div class="relative flex min-h-0 flex-1 font-mono text-[12.5px] leading-5">
	<div bind:this={gutter} class="shrink-0 overflow-hidden bg-muted/40 py-2 text-right text-muted-foreground select-none" aria-hidden="true">
		{#each Array(lines) as _, i (i)}
			{@const d = marks.get(i + 1)}
			<div class="flex items-center justify-end gap-1 px-2 {d ? (d.severity === 'error' ? 'bg-destructive/15 text-destructive' : 'bg-warning-muted text-warning') : ''}" title={d?.message}>
				{#if d}●{/if}{i + 1}
			</div>
		{/each}
	</div>
	<textarea
		bind:this={ta}
		bind:value
		{readonly}
		aria-label={label}
		spellcheck="false"
		class="min-h-0 flex-1 resize-none bg-background px-3 py-2 whitespace-pre outline-none"
		style:tab-size="4"
		onscroll={() => gutter && ta && (gutter.scrollTop = ta.scrollTop)}
		onkeydown={tab}
	></textarea>
	{#if diagnostics.length}
		<div class="absolute right-2 bottom-2 max-w-md rounded-md border border-border bg-popover p-2 text-[11px] shadow-md">
			{#each diagnostics.slice(0, 4) as d, i (i)}
				<button class="block w-full truncate text-left hover:underline {d.severity === 'error' ? 'text-destructive' : 'text-warning'}" onclick={() => d.line && reveal(d.line)}>{d.line ? `${d.line}: ` : ""}{d.message}</button>
			{/each}
		</div>
	{/if}
</div>
