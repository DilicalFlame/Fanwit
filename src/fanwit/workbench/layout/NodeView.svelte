<script lang="ts">
	import type { Component } from "svelte";
	import { getKernel } from "../../ui.svelte";
	import SplitView from "./SplitView.svelte";
	import TabSet from "./TabSet.svelte";
	import StackView from "./StackView.svelte";
	import GridView from "./GridView.svelte";
	import EmptyState from "../EmptyState.svelte";
	import Self from "./NodeView.svelte";

	/** Renders any layout node by type through the node renderer registry. */
	let { node, region = "main", single = false }: { node: string; region?: string; single?: boolean } = $props();
	const k = getKernel();
	const layout = k.sys.layout;
	const n = $derived(layout.doc.node[node]);
	const custom = $derived(n && !["split", "tabs", "stack", "grid"].includes(n.type) ? layout.nodeTypes.get(n.type) : undefined);
	let customComp = $state<Component<any> | null>(null);
	$effect(() => {
		const c = custom?.component as unknown;
		customComp = null;
		if (!c) return;
		if (typeof c === "function" && (c as { length: number }).length === 0) (c as () => Promise<{ default: Component<any> }>)().then((m) => (customComp = m.default));
		else customComp = c as Component<any>;
	});

	/** Single mode (narrow screens): only the tab set holding the active pane. */
	const singleChild = $derived.by(() => {
		if (!single || n?.type !== "split") return null;
		const kids = (n as { children: string[] }).children;
		const has = (id: string): boolean => {
			if (id === layout.activeTabset) return true;
			const c = layout.doc.node[id];
			return c?.type === "split" ? (c as { children: string[] }).children.some(has) : false;
		};
		return kids.find(has) ?? kids[0];
	});
</script>

{#if !n}
	<EmptyState icon="circle-alert" title="Missing node" description={`Layout node "${node}" does not exist.`} />
{:else if singleChild}
	<Self node={singleChild} {region} {single} />
{:else if n.type === "split"}
	<SplitView {node} {region} />
{:else if n.type === "tabs"}
	<TabSet {node} {region} />
{:else if n.type === "stack"}
	<StackView {node} {region} />
{:else if n.type === "grid"}
	<GridView {node} />
{:else if customComp}
	{@const C = customComp}
	<C {node} model={n} kernel={k} />
{:else}
	<EmptyState icon="shapes" title={`Unknown node type "${n.type}"`} description="Register it with defineLayoutNode." />
{/if}
