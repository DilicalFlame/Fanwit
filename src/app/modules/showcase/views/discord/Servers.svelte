<script lang="ts">
	import Icon from "$fanwit/icons/Icon.svelte";
	import { chat } from "./discord.svelte";

	/** Server rail. */
	function pick(id: string) {
		chat.server = id;
		chat.channel = chat.servers.find((s) => s.id === id)!.channels[0].id;
	}
	function add() {
		const names = ["Book Club", "Rustaceans", "Svelte Society", "Photo Walks"];
		const name = names[chat.servers.length % names.length];
		chat.servers.push({ id: `s${chat.servers.length}`, name, color: ["#f47b67", "#3ba55c", "#faa61a", "#00b0f4"][chat.servers.length % 4], channels: [{ id: `s${chat.servers.length}-general`, name: "general" }] });
	}
</script>

<nav class="flex h-full w-full flex-col items-center gap-2 overflow-auto bg-[#e3e5e8] py-3 dark:bg-[#1e1f22]" aria-label="Servers">
	<div class="flex size-12 items-center justify-center rounded-2xl bg-[#5865f2] text-white"><Icon name="message-circle" size={22} /></div>
	<div class="h-0.5 w-8 rounded bg-black/10 dark:bg-white/10"></div>
	{#each chat.servers as s (s.id)}
		{@const on = chat.server === s.id}
		<div class="relative flex w-full justify-center">
			<span class="absolute top-1/2 left-0 w-1 -translate-y-1/2 rounded-r bg-current transition-all {on ? 'h-10' : 'h-0'}"></span>
			<button class="flex size-12 items-center justify-center text-sm font-semibold text-white transition-all {on ? 'rounded-2xl' : 'rounded-[24px] hover:rounded-2xl'}" style:background={s.color} title={s.name} aria-label={s.name} aria-current={on} onclick={() => pick(s.id)}>
				{s.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
			</button>
		</div>
	{/each}
	<button class="flex size-12 items-center justify-center rounded-[24px] bg-white text-[#23a559] transition-all hover:rounded-2xl hover:bg-[#23a559] hover:text-white dark:bg-[#313338]" title="Add a server" aria-label="Add a server" onclick={add}><Icon name="plus" size={22} /></button>
</nav>
