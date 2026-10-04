<script lang="ts">
	import Icon from "$fanwit/icons/Icon.svelte";
	import WindowControls from "$fanwit/workbench/WindowControls.svelte";
	import { dash } from "./data.svelte";

	/** A product nav bar: brand, sections, the date range (drives every chart), alerts, account. */
	const NAV = ["Overview", "Reports", "Customers", "Settings"];
	let section = $state("Overview");
	let alerts = $state(3);
	const RANGES = [7, 30, 90] as const;
</script>

<div class="fw-titlebar-inset flex h-full w-full items-center gap-1 border-b border-border bg-card text-sm" data-tauri-drag-region>
	<span class="ml-3 flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-sky-400 text-white"><Icon name="chart-line" size={15} /></span>
	<span class="mr-4 ml-1.5 font-semibold" data-tauri-drag-region>Acme Analytics</span>
	<nav class="flex items-center gap-1" aria-label="Sections">
		{#each NAV as n (n)}<button class="rounded-md px-3 py-1.5 {section === n ? 'bg-accent font-medium' : 'text-muted-foreground hover:text-foreground'}" aria-current={section === n ? "page" : undefined} onclick={() => (section = n)}>{n}</button>{/each}
	</nav>
	<div class="flex-1" data-tauri-drag-region></div>
	<button class="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-accent" title="Change the range" onclick={() => (dash.range = RANGES[(RANGES.indexOf(dash.range) + 1) % RANGES.length])}>
		<Icon name="calendar" size={13} />Last {dash.range} days<Icon name="chevron-down" size={12} class="opacity-60" />
	</button>
	<button class="relative ml-1 rounded-md p-1.5 hover:bg-accent" aria-label="{alerts} alerts" onclick={() => (alerts = 0)}>
		<Icon name="bell" size={16} />{#if alerts}<span class="absolute top-0.5 right-0.5 flex size-3.5 items-center justify-center rounded-full bg-rose-500 text-[9px] text-white">{alerts}</span>{/if}
	</button>
	<span class="mx-2 flex size-7 items-center justify-center rounded-full bg-indigo-500 text-xs font-semibold text-white">Y</span>
	<WindowControls />
</div>
