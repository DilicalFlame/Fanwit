<script lang="ts">
	import { getKernel } from "$fanwit/ui.svelte";
	import Icon from "$fanwit/icons/Icon.svelte";
	import { activeSheet, book } from "./excel.svelte";
	import { parseRef } from "./formula";

	/** Ribbon row (AutoSum, clear, new sheet) and the name box + formula input for the selected cell. */
	const k = getKernel();
	const sheet = $derived(activeSheet(k));
	const ref = $derived(book.sel.sheet === sheet ? book.sel.ref : "A1");
	const cells = $derived(book.sheets[sheet] ?? {});
	let tab = $state("Home");

	function set(v: string) {
		if (v) cells[ref] = v;
		else delete cells[ref];
	}
	/** =SUM over the numbers directly above the selected cell. */
	function autoSum() {
		const { col, row } = parseRef(ref);
		const letter = String.fromCharCode(65 + col);
		const numeric = (v?: string) => v !== undefined && (v.startsWith("=") || !Number.isNaN(Number(v)));
		let top = row; // 1-based row of the cell just above the selection
		while (top > 0 && numeric(cells[`${letter}${top}`])) top--;
		if (top < row) set(`=SUM(${letter}${top + 1}:${letter}${row})`);
	}
</script>

<div class="flex h-full w-full flex-col bg-[#f3f3f3] text-[13px] dark:bg-[#2b2b2b]">
	<div class="flex h-9 items-center gap-1 border-b border-black/10 px-2 dark:border-white/10">
		{#each ["File", "Home", "Insert", "Formulas", "Data", "View"] as t (t)}
			<button class="rounded px-2.5 py-1 {tab === t ? 'border-b-2 border-[#107c41] font-semibold text-[#107c41]' : 'hover:bg-black/5 dark:hover:bg-white/10'}" onclick={() => (tab = t)}>{t}</button>
		{/each}
		<div class="ml-4 flex items-center gap-1 border-l border-black/10 pl-3 dark:border-white/10">
			<button class="flex items-center gap-1 rounded px-2 py-1 hover:bg-black/5 dark:hover:bg-white/10" title="Sum the numbers above" onclick={autoSum}><Icon name="sigma" size={15} />AutoSum</button>
			<button class="flex items-center gap-1 rounded px-2 py-1 hover:bg-black/5 dark:hover:bg-white/10" onclick={() => set("")}><Icon name="eraser" size={14} />Clear</button>
			<button class="flex items-center gap-1 rounded px-2 py-1 hover:bg-black/5 dark:hover:bg-white/10" onclick={() => k.commands.run("showcase.excel.newSheet", {}, { source: "toolbar" })}><Icon name="plus" size={14} />New sheet</button>
		</div>
	</div>
	<div class="flex h-8 items-center gap-2 px-2">
		<span class="w-16 rounded border border-black/15 bg-white px-1.5 py-0.5 text-center font-mono dark:border-white/15 dark:bg-[#1f1f1f]" aria-label="Selected cell">{ref}</span>
		<span class="font-serif italic opacity-60">fx</span>
		<input class="h-6 flex-1 rounded border border-black/15 bg-white px-2 font-mono outline-none focus:border-[#107c41] dark:border-white/15 dark:bg-[#1f1f1f]" value={cells[ref] ?? ""} oninput={(e) => set(e.currentTarget.value)} aria-label="Formula" />
	</div>
</div>
