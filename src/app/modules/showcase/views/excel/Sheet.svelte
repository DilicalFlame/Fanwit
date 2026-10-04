<script lang="ts">
	import { tick, untrack } from "svelte";
	import { book } from "./excel.svelte";
	import { colName, display, evaluate, isError, parseRef } from "./formula";

	/**
	 * The cell grid. Click selects (Shift extends), typing or double click edits, Enter and Tab
	 * commit and move, arrows move, Delete clears. Formulas start with "=".
	 */
	let { props }: { props: { sheet?: string } } = $props();
	const sheet = untrack(() => props.sheet) ?? "sheet"; // the pane's identity
	book.sheets[sheet] ??= {};
	const cells = book.sheets[sheet];
	const COLS = 12;
	const ROWS = 60;
	let editing = $state<string | null>(null);
	let draft = $state("");
	let grid = $state<HTMLDivElement>();
	const sel = $derived(book.sel.sheet === sheet ? book.sel : { sheet, ref: "A1", anchor: "A1" });

	const box = $derived.by(() => {
		const a = parseRef(sel.anchor);
		const b = parseRef(sel.ref);
		return { c0: Math.min(a.col, b.col), c1: Math.max(a.col, b.col), r0: Math.min(a.row, b.row), r1: Math.max(a.row, b.row) };
	});
	const inBox = (c: number, r: number) => c >= box.c0 && c <= box.c1 && r >= box.r0 && r <= box.r1;
	const stats = $derived.by(() => {
		const nums: number[] = [];
		for (let r = box.r0; r <= box.r1; r++) for (let c = box.c0; c <= box.c1; c++) {
			const v = evaluate(cells, `${colName(c)}${r + 1}`);
			if (typeof v === "number") nums.push(v);
		}
		return nums.length > 1 ? { sum: nums.reduce((s, x) => s + x, 0), count: nums.length } : null;
	});

	function select(ref: string, extend = false) {
		book.sel = { sheet, ref, anchor: extend ? sel.anchor : ref };
		void tick().then(() => grid?.querySelector(`[data-ref="${ref}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" }));
	}
	function move(dc: number, dr: number, extend = false) {
		const p = parseRef(sel.ref);
		select(`${colName(Math.min(COLS - 1, Math.max(0, p.col + dc)))}${Math.min(ROWS, Math.max(1, p.row + 1 + dr))}`, extend);
	}
	async function edit(ref: string, initial?: string) {
		editing = ref;
		draft = initial ?? cells[ref] ?? "";
		await tick();
		grid?.querySelector<HTMLInputElement>("input[data-editor]")?.focus();
	}
	function commit(dc = 0, dr = 0) {
		if (!editing) return;
		if (draft) cells[editing] = draft;
		else delete cells[editing];
		editing = null;
		grid?.focus();
		move(dc, dr);
	}
	function keys(e: KeyboardEvent) {
		if (editing) return;
		const arrows: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
		if (arrows[e.key]) move(...arrows[e.key], e.shiftKey);
		else if (e.key === "Enter" || e.key === "F2") void edit(sel.ref);
		else if (e.key === "Tab") move(e.shiftKey ? -1 : 1, 0);
		else if (e.key === "Delete" || e.key === "Backspace") {
			for (let r = box.r0; r <= box.r1; r++) for (let c = box.c0; c <= box.c1; c++) delete cells[`${colName(c)}${r + 1}`];
		} else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) void edit(sel.ref, e.key);
		else return;
		e.preventDefault();
	}
</script>

<div class="flex h-full w-full flex-col bg-white text-[13px] text-[#1f1f1f] dark:bg-[#1f1f1f] dark:text-[#e0e0e0]">
	<!-- svelte-ignore a11y_no_noninteractive_tabindex (the grid takes keys: arrows move, typing edits) -->
	<div bind:this={grid} class="min-h-0 flex-1 overflow-auto outline-none" tabindex="0" role="grid" aria-label="Sheet {sheet}" onkeydown={keys}>
		<table class="border-separate border-spacing-0">
			<thead>
				<tr>
					<th class="sticky top-0 left-0 z-20 h-6 w-10 border-r border-b border-black/15 bg-[#f3f3f3] dark:border-white/15 dark:bg-[#2b2b2b]"></th>
					{#each { length: COLS } as _, c (c)}
						<th class="sticky top-0 z-10 h-6 w-24 min-w-24 border-r border-b border-black/15 bg-[#f3f3f3] font-normal dark:border-white/15 dark:bg-[#2b2b2b] {c >= box.c0 && c <= box.c1 ? 'bg-[#d3e3d6] font-semibold text-[#107c41] dark:bg-[#1e3a28]' : ''}">{colName(c)}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each { length: ROWS } as _, r (r)}
					<tr>
						<th class="sticky left-0 z-10 h-6 border-r border-b border-black/15 bg-[#f3f3f3] px-1 text-right font-normal dark:border-white/15 dark:bg-[#2b2b2b] {r >= box.r0 && r <= box.r1 ? 'bg-[#d3e3d6] font-semibold text-[#107c41] dark:bg-[#1e3a28]' : ''}">{r + 1}</th>
						{#each { length: COLS } as _, c (c)}
							{@const ref = `${colName(c)}${r + 1}`}
							{@const v = evaluate(cells, ref)}
							<td
								data-ref={ref}
								class="relative h-6 max-w-24 truncate border-r border-b border-black/10 px-1 dark:border-white/10 {typeof v === 'number' ? 'text-right' : ''} {isError(v) ? 'text-red-600' : ''} {inBox(c, r) && sel.ref !== ref ? 'bg-[#107c41]/10' : ''} {sel.ref === ref ? 'outline-2 -outline-offset-1 outline-[#107c41]' : ''} {(cells[ref] ?? '').startsWith('=') ? '' : r === 0 || (sheet === 'budget' && r === 2) ? 'font-semibold' : ''}"
								onpointerdown={(e) => select(ref, e.shiftKey)}
								ondblclick={() => edit(ref)}
							>
								{#if editing === ref}
									<input data-editor class="absolute inset-0 z-10 bg-white px-1 outline-2 outline-[#107c41] dark:bg-[#1f1f1f]" bind:value={draft} onkeydown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(0, 1); } else if (e.key === "Tab") { e.preventDefault(); commit(e.shiftKey ? -1 : 1, 0); } else if (e.key === "Escape") { editing = null; grid?.focus(); } }} onblur={() => commit()} aria-label="Edit {ref}" />
								{:else}{display(v)}{/if}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	<div class="flex h-6 shrink-0 items-center justify-end gap-5 border-t border-black/10 bg-[#f3f3f3] px-3 text-xs dark:border-white/10 dark:bg-[#2b2b2b]">
		{#if stats}<span>Average: {display(stats.sum / stats.count)}</span><span>Count: {stats.count}</span><span>Sum: {display(stats.sum)}</span>{:else}<span class="opacity-60">Ready</span>{/if}
	</div>
</div>
