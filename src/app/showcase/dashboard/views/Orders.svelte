<script lang="ts">
	import { fmt, rng } from "./data.svelte";

	/** Recent orders; click a header to sort. */
	const r = rng(42);
	const NAMES = ["Ada Lovelace", "Grace Hopper", "Linus T.", "Margaret H.", "Ken Thompson", "Barbara L.", "Alan Kay", "Edsger D."];
	const STATUS = ["Paid", "Pending", "Refunded", "Paid", "Paid", "Shipped"] as const;
	const rows = NAMES.map((name, i) => ({ id: 1040 + i, name, amount: Math.round(20 + r() * 480), status: STATUS[Math.floor(r() * STATUS.length)] }));
	let by = $state<"id" | "name" | "amount" | "status">("id");
	let desc = $state(true);
	const sorted = $derived([...rows].sort((a, b) => (a[by] < b[by] ? -1 : a[by] > b[by] ? 1 : 0) * (desc ? -1 : 1)));
	const TONE = { Paid: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", Pending: "bg-amber-500/15 text-amber-700 dark:text-amber-300", Refunded: "bg-rose-500/15 text-rose-700 dark:text-rose-300", Shipped: "bg-sky-500/15 text-sky-700 dark:text-sky-300" };
	const sort = (k: typeof by) => (by === k ? (desc = !desc) : ((by = k), (desc = false)));
</script>

<div class="h-full w-full overflow-auto">
	<table class="w-full text-xs">
		<thead class="sticky top-0 bg-card text-left text-muted-foreground">
			<tr>
				{#each [["id", "Order"], ["name", "Customer"], ["amount", "Amount"], ["status", "Status"]] as [key, label] (key)}
					<th class="px-3 py-1.5 font-medium" aria-sort={by === key ? (desc ? "descending" : "ascending") : "none"}><button onclick={() => sort(key as typeof by)}>{label}{by === key ? (desc ? " ↓" : " ↑") : ""}</button></th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each sorted as o (o.id)}
				<tr class="border-t border-border">
					<td class="px-3 py-1.5 font-mono">#{o.id}</td>
					<td class="px-3 py-1.5">{o.name}</td>
					<td class="px-3 py-1.5 tabular-nums">${fmt(o.amount)}</td>
					<td class="px-3 py-1.5"><span class="rounded-full px-2 py-0.5 {TONE[o.status]}">{o.status}</span></td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
