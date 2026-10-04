<script lang="ts">
	import { getKernel } from "../../ui.svelte";
	import type { SplitNode } from "../../layout/model";
	import NodeView from "./NodeView.svelte";
	import Splitter from "./Splitter.svelte";

	/** Children laid out along a direction; sizes are weights (0.6) or pixels ("280px"). */
	let { node, region }: { node: string; region: string } = $props();
	const k = getKernel();
	const layout = k.sys.layout;
	const n = $derived(layout.doc.node[node] as SplitNode);
	let el: HTMLDivElement;
	/** Live sizes while dragging (committed on release). */
	let live = $state<(number | string)[] | null>(null);
	const sizes = $derived(live ?? n.sizes ?? n.children.map(() => 1));

	const weight = (s: number | string | undefined) => (typeof s === "number" ? s : Number(s ?? 1) || 1);
	/** Sum of the weighted children: grow factors below 1 in total would leave the rest of the split empty. */
	const weights = $derived(sizes.filter((s) => !(typeof s === "string" && s.endsWith("px"))).reduce<number>((t, s) => t + weight(s), 0) || 1);

	function flex(s: number | string | undefined) {
		if (typeof s === "string" && s.endsWith("px")) return `0 0 ${s}`;
		return `${weight(s) / weights} 1 0px`;
	}

	function measure(): number[] {
		const kids = [...el.children].filter((c) => (c as HTMLElement).dataset.fwSplitChild !== undefined) as HTMLElement[];
		return kids.map((c) => (n.dir === "row" ? c.getBoundingClientRect().width : c.getBoundingClientRect().height));
	}

	function resize(i: number, delta: number) {
		const px = measure();
		const min = 60;
		const pair = px[i] + px[i + 1];
		const a = Math.min(pair - min, Math.max(min, px[i] + delta));
		px[i] = a;
		px[i + 1] = pair - a;
		const prev = n.sizes ?? n.children.map(() => 1);
		const total = px.reduce((x, y) => x + y, 0);
		live = px.map((p, j) => (typeof prev[j] === "string" && String(prev[j]).endsWith("px") ? `${Math.round(p)}px` : Math.round((p / total) * 1000) / 1000));
	}

	function commit() {
		if (!live) return;
		const s = live;
		live = null;
		void layout.dispatch({ type: "setSizes", node, sizes: s }, { undoable: false });
	}
</script>

<div bind:this={el} class="flex min-h-0 min-w-0 flex-1 {n.dir === 'row' ? 'flex-row' : 'flex-col'}" data-fw-split={node}>
	{#each n.children as child, i (child)}
		{#if i > 0}
			<Splitter
				dir={n.dir}
				onresize={(d) => resize(i - 1, d)}
				onend={commit}
				onequalize={() => layout.dispatch({ type: "setSizes", node, sizes: n.children.map(() => 1) }, { undoable: false })}
				label="Resize {region}"
			/>
		{/if}
		<div data-fw-split-child class="flex min-h-0 min-w-0 overflow-hidden" style:flex={flex(sizes[i])}>
			<NodeView node={child} {region} />
		</div>
	{/each}
</div>
