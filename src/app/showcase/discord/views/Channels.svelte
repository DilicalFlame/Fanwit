<script lang="ts">
	import Icon from "$fanwit/icons/Icon.svelte";
	import { chat, PEOPLE, server } from "./discord.svelte";

	/** Channel list and the user panel. */
	const s = $derived(server());
	const text = $derived(s.channels.filter((c) => !c.voice));
	const voice = $derived(s.channels.filter((c) => c.voice));
</script>

<div class="flex h-full w-full flex-col bg-[#f2f3f5] text-[#4e5058] dark:bg-[#2b2d31] dark:text-[#949ba4]">
	<header class="flex h-12 shrink-0 items-center border-b border-black/10 px-4 font-semibold text-[#060607] dark:text-[#f2f3f5]">{s.name}<Icon name="chevron-down" size={16} class="ml-auto" /></header>
	<div class="min-h-0 flex-1 overflow-auto px-2 py-3 text-[15px]">
		{#each [["Text channels", text], ["Voice channels", voice]] as const as [label, list] (label)}
			{#if list.length}
				<div class="mt-2 mb-1 px-2 text-[11px] font-semibold uppercase">{label}</div>
				{#each list as c (c.id)}
					<button class="flex h-8 w-full items-center gap-1.5 rounded px-2 text-left {chat.channel === c.id ? 'bg-black/10 text-[#060607] dark:bg-white/10 dark:text-white' : 'hover:bg-black/5 dark:hover:bg-white/5'}" onclick={() => !c.voice && (chat.channel = c.id)}>
						<Icon name={c.voice ? "volume-2" : "hash"} size={17} class="opacity-70" />{c.name}
					</button>
				{/each}
			{/if}
		{/each}
	</div>
	<footer class="flex h-14 shrink-0 items-center gap-2 bg-[#ebedef] px-2 dark:bg-[#232428]">
		<span class="relative flex size-8 items-center justify-center rounded-full text-sm font-semibold text-white" style:background={PEOPLE.you.color}>Y<span class="absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-[#ebedef] bg-[#23a559] dark:border-[#232428]"></span></span>
		<div class="min-w-0 flex-1 leading-tight"><div class="text-sm font-semibold text-[#060607] dark:text-white">you</div><div class="text-xs">Online</div></div>
		<button class="rounded p-1.5 hover:bg-black/10 {chat.muted ? 'text-[#ed4245]' : ''}" aria-pressed={chat.muted} aria-label="Mute" title="Mute" onclick={() => (chat.muted = !chat.muted)}><Icon name={chat.muted ? "mic-off" : "mic"} size={17} /></button>
		<button class="rounded p-1.5 hover:bg-black/10 {chat.deafened ? 'text-[#ed4245]' : ''}" aria-pressed={chat.deafened} aria-label="Deafen" title="Deafen" onclick={() => (chat.deafened = !chat.deafened)}><Icon name={chat.deafened ? "headphone-off" : "headphones"} size={17} /></button>
	</footer>
</div>
