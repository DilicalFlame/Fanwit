<script lang="ts">
	import { selectedObj } from "./blender.svelte";

	/** Shader Editor mock: drag nodes around; the wires follow. Base Color edits the selected object. */
	const W = 170;
	let nodes = $state([
		{ id: "tex", title: "Image Texture", color: "#8b5a2b", x: 20, y: 30 },
		{ id: "bsdf", title: "Principled BSDF", color: "#3d6b3d", x: 240, y: 20 },
		{ id: "out", title: "Material Output", color: "#7a2e2e", x: 460, y: 50 }
	]);
	const LINKS = [["tex", "bsdf"], ["bsdf", "out"]];
	const o = $derived(selectedObj());
	const at = (id: string) => nodes.find((n) => n.id === id)!;

	function drag(e: PointerEvent, n: (typeof nodes)[number]) {
		const el = e.currentTarget as HTMLElement;
		el.setPointerCapture(e.pointerId);
		const [x0, y0, nx, ny] = [e.clientX, e.clientY, n.x, n.y];
		const move = (ev: PointerEvent) => {
			n.x = nx + ev.clientX - x0;
			n.y = ny + ev.clientY - y0;
		};
		const up = () => {
			el.removeEventListener("pointermove", move);
			el.removeEventListener("pointerup", up);
		};
		el.addEventListener("pointermove", move);
		el.addEventListener("pointerup", up);
	}
</script>

<div class="relative h-full w-full overflow-hidden bg-[#1d1d1d]" style:background-image="radial-gradient(circle, rgb(255 255 255 / 0.06) 1px, transparent 1px)" style:background-size="18px 18px">
	<svg class="pointer-events-none absolute inset-0 size-full">
		{#each LINKS as [a, b] (a + b)}
			{@const p = at(a)}
			{@const q = at(b)}
			{@const x1 = p.x + W}
			{@const y1 = p.y + 44}
			{@const x2 = q.x}
			{@const y2 = q.y + 44}
			<path d="M{x1} {y1} C{x1 + 60} {y1}, {x2 - 60} {y2}, {x2} {y2}" fill="none" stroke="#c7c729" stroke-width="2" />
		{/each}
	</svg>
	{#each nodes as n (n.id)}
		<div class="absolute rounded-md bg-[#303030] shadow-lg" style:left="{n.x}px" style:top="{n.y}px" style:width="{W}px">
			<div class="cursor-move rounded-t-md px-2 py-1 font-medium" style:background={n.color} role="presentation" onpointerdown={(e) => drag(e, n)}>{n.title}</div>
			<div class="flex flex-col gap-1 p-2 text-[11px]">
				{#if n.id === "bsdf"}
					<label class="flex items-center justify-between">Base Color {#if o}<input type="color" class="h-4 w-12 cursor-pointer bg-transparent" bind:value={o.color} />{/if}</label>
					<div class="flex justify-between opacity-70"><span>Roughness</span><span>0.500</span></div>
					<div class="flex justify-between opacity-70"><span>Metallic</span><span>0.000</span></div>
				{:else if n.id === "tex"}
					<div class="opacity-70">Color ●</div>
					<div class="h-10 rounded" style:background="linear-gradient(135deg, #f59e0b, #ef4444, #8b5cf6)"></div>
				{:else}
					<div class="opacity-70">● Surface</div>
					<div class="opacity-70">● Volume</div>
				{/if}
			</div>
		</div>
	{/each}
</div>
