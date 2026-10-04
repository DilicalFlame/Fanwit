<script lang="ts">
	import { tick } from "svelte";
	import Icon from "$fanwit/icons/Icon.svelte";
	import { chat, PEOPLE, send, server } from "./discord.svelte";

	/** Messages of the current channel and the composer. Enter sends; someone answers. */
	let draft = $state("");
	let list = $state<HTMLDivElement>();
	const channel = $derived(server().channels.find((c) => c.id === chat.channel));
	const messages = $derived(chat.messages[chat.channel] ?? []);
	$effect(() => {
		void messages.length;
		void tick().then(() => list?.scrollTo({ top: list.scrollHeight }));
	});
	function submit(e: Event) {
		e.preventDefault();
		if (draft.trim()) send(draft.trim());
		draft = "";
	}
</script>

<div class="flex h-full w-full flex-col bg-white text-[#313338] dark:bg-[#313338] dark:text-[#dbdee1]">
	<header class="flex h-12 shrink-0 items-center gap-2 border-b border-black/10 px-4 font-semibold"><Icon name="hash" size={20} class="opacity-60" />{channel?.name ?? chat.channel}</header>
	<div bind:this={list} class="min-h-0 flex-1 overflow-auto py-4">
		{#if !messages.length}<div class="px-4 text-sm opacity-60">This is the start of #{channel?.name}.</div>{/if}
		{#each messages as msg (msg.id)}
			<div class="flex gap-4 px-4 py-1.5 hover:bg-black/[0.03] dark:hover:bg-white/[0.03]">
				<span class="flex size-10 shrink-0 items-center justify-center rounded-full font-semibold text-white" style:background={PEOPLE[msg.author]?.color ?? "#888"}>{msg.author[0].toUpperCase()}</span>
				<div class="min-w-0">
					<div class="flex items-baseline gap-2"><span class="font-medium" style:color={PEOPLE[msg.author]?.color}>{msg.author}</span>{#if PEOPLE[msg.author]?.bot}<span class="rounded bg-[#5865f2] px-1 text-[10px] font-semibold text-white">BOT</span>{/if}<span class="text-xs opacity-50">Today at {msg.time}</span></div>
					<div class="selectable text-[15px] leading-snug">{msg.text}</div>
				</div>
			</div>
		{/each}
	</div>
	<form class="mx-4 mb-5 flex items-center gap-3 rounded-lg bg-[#ebedef] px-4 dark:bg-[#383a40]" onsubmit={submit}>
		<Icon name="circle-plus" size={20} class="opacity-60" />
		<input class="h-11 flex-1 bg-transparent outline-none placeholder:opacity-50" placeholder="Message #{channel?.name}" bind:value={draft} aria-label="Message" />
		<Icon name="smile" size={20} class="opacity-60" />
	</form>
</div>
