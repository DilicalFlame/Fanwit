<script lang="ts">
	import { PEOPLE } from "./discord.svelte";

	const groups = $derived([
		["Online", Object.entries(PEOPLE).filter(([, p]) => p.status !== "offline")],
		["Offline", Object.entries(PEOPLE).filter(([, p]) => p.status === "offline")]
	] as const);
	const DOT = { online: "#23a559", idle: "#f0b232", offline: "#80848e" };
</script>

<aside class="h-full w-full overflow-auto bg-[#f2f3f5] px-2 py-4 dark:bg-[#2b2d31]" aria-label="Members">
	{#each groups as [label, list] (label)}
		<div class="mt-2 mb-1 px-2 text-[11px] font-semibold text-[#5c5e66] uppercase dark:text-[#949ba4]">{label} — {list.length}</div>
		{#each list as [name, p] (name)}
			<div class="flex h-11 items-center gap-3 rounded px-2 hover:bg-black/5 dark:hover:bg-white/5 {p.status === 'offline' ? 'opacity-40' : ''}">
				<span class="relative flex size-8 items-center justify-center rounded-full text-sm font-semibold text-white" style:background={p.color}>
					{name[0].toUpperCase()}
					<span class="absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-[#f2f3f5] dark:border-[#2b2d31]" style:background={DOT[p.status]}></span>
				</span>
				<span class="truncate text-[15px] font-medium" style:color={p.color}>{name}</span>
				{#if p.bot}<span class="rounded bg-[#5865f2] px-1 text-[10px] font-semibold text-white">BOT</span>{/if}
			</div>
		{/each}
	{/each}
</aside>
