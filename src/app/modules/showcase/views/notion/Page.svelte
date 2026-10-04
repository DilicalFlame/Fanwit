<script lang="ts">
	import { tick } from "svelte";
	import Icon from "$fanwit/icons/Icon.svelte";
	import { currentPage, uid, type Block, type BlockType } from "./notion.svelte";

	/** The open page: cover, icon, title and editable blocks. */
	const page = $derived(currentPage());
	const TYPES: [BlockType, string][] = [["p", "Text"], ["h1", "Heading 1"], ["h2", "Heading 2"], ["todo", "To-do"], ["bullet", "Bulleted list"], ["quote", "Quote"]];
	const STYLE: Record<BlockType, string> = { h1: "text-3xl font-bold mt-4", h2: "text-xl font-semibold mt-3", p: "", todo: "", bullet: "", quote: "border-l-[3px] border-current pl-3 italic" };

	async function focus(id: string, end = true) {
		await tick();
		const el = document.querySelector<HTMLElement>(`[data-block="${id}"]`);
		el?.focus();
		if (end && el) {
			const r = document.createRange();
			r.selectNodeContents(el);
			r.collapse(false);
			getSelection()?.removeAllRanges();
			getSelection()?.addRange(r);
		}
	}

	function keys(e: KeyboardEvent, i: number, blk: Block) {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			const next: Block = { id: uid(), type: blk.type === "todo" || blk.type === "bullet" ? blk.type : "p", text: "" };
			page.blocks.splice(i + 1, 0, next);
			void focus(next.id);
		} else if (e.key === "Backspace" && !blk.text && page.blocks.length > 1) {
			e.preventDefault();
			page.blocks.splice(i, 1);
			void focus(page.blocks[Math.max(0, i - 1)].id);
		} else if (e.key === "ArrowUp" && i > 0) void focus(page.blocks[i - 1].id);
		else if (e.key === "ArrowDown" && i < page.blocks.length - 1) void focus(page.blocks[i + 1].id);
	}
</script>

<div class="h-full w-full overflow-auto bg-white text-[#37352f] dark:bg-[#191919] dark:text-[#d4d4d4]">
	<div class="h-36" style:background="linear-gradient(120deg, #fbc2eb 0%, #a6c1ee 100%)"></div>
	<div class="mx-auto max-w-3xl px-12 pb-24">
		<button class="-mt-10 mb-2 text-6xl" title="Change icon" onclick={() => (page.icon = ["📄", "🚀", "✨", "🌱", "🧠", "🎯"][(Math.random() * 6) | 0])}>{page.icon}</button>
		<input class="mb-4 w-full bg-transparent text-4xl font-bold outline-none placeholder:opacity-30" placeholder="Untitled" bind:value={page.title} aria-label="Page title" />
		{#each page.blocks as blk, i (blk.id)}
			<div class="group relative -ml-12 flex items-start gap-1 pl-12">
				<label class="absolute top-1 left-4 flex opacity-0 group-hover:opacity-50 focus-within:opacity-100" title="Turn into">
					<Icon name="grip-vertical" size={16} />
					<select class="absolute inset-0 cursor-pointer opacity-0" bind:value={blk.type} aria-label="Block type">{#each TYPES as [t, label] (t)}<option value={t}>{label}</option>{/each}</select>
				</label>
				{#if blk.type === "todo"}<input type="checkbox" class="mt-1.5 size-4" bind:checked={blk.done} aria-label="Done" />{/if}
				{#if blk.type === "bullet"}<span class="mt-0.5 px-1">•</span>{/if}
				<div
					data-block={blk.id}
					contenteditable="true"
					role="textbox"
					tabindex="0"
					aria-label="Block"
					class="min-h-7 flex-1 py-1 leading-relaxed outline-none empty:before:opacity-30 empty:before:content-[attr(data-placeholder)] {STYLE[blk.type]} {blk.done ? 'line-through opacity-50' : ''}"
					data-placeholder={i === page.blocks.length - 1 ? "Type something…" : ""}
					bind:textContent={blk.text}
					onkeydown={(e) => keys(e, i, blk)}
				></div>
			</div>
		{/each}
	</div>
</div>
