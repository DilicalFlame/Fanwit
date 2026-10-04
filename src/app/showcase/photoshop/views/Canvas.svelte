<script lang="ts">
	import { untrack } from "svelte";
	import { ensureDoc, ps } from "./ps.svelte";

	/**
	 * A document: one <canvas> per layer, stacked on a transparency checkerboard. Brush, eraser,
	 * fill (whole layer) and eyedropper; Ctrl+wheel zooms. Adjustments apply as live CSS filters.
	 */
	let { props }: { props: { name?: string; w?: number; h?: number; photo?: boolean } } = $props();
	// a document's identity and size are fixed for the life of its pane
	const { name = "Untitled", w: W = 800, h: H = 600 } = untrack(() => props);
	const doc = ensureDoc(name);
	const canvases = new Map<string, HTMLCanvasElement>();
	let zoom = $state(0.8);

	function layer(node: HTMLCanvasElement, id: string) {
		canvases.set(id, node);
		const first = doc.layers[0]?.id === id && node.dataset.init !== "1";
		if (first) {
			node.dataset.init = "1";
			paintBackground(node.getContext("2d")!);
		}
		return { destroy: () => canvases.delete(id) };
	}

	/** The background layer: white, or a generated landscape for the "photo" document. */
	function paintBackground(c: CanvasRenderingContext2D) {
		if (!props.photo) {
			c.fillStyle = "#ffffff";
			c.fillRect(0, 0, W, H);
			return;
		}
		const sky = c.createLinearGradient(0, 0, 0, H);
		sky.addColorStop(0, "#1e3a8a");
		sky.addColorStop(0.55, "#f97316");
		sky.addColorStop(1, "#fde68a");
		c.fillStyle = sky;
		c.fillRect(0, 0, W, H);
		c.fillStyle = "#fef3c7";
		c.beginPath();
		c.arc(W * 0.68, H * 0.52, 60, 0, Math.PI * 2);
		c.fill();
		for (const [color, base, peaks] of [["#7c2d12", 0.72, 5], ["#431407", 0.82, 7]] as const) {
			c.fillStyle = color;
			c.beginPath();
			c.moveTo(0, H);
			for (let i = 0; i <= peaks; i++) c.lineTo((W / peaks) * i, H * base - (i % 2 ? 70 : 10));
			c.lineTo(W, H);
			c.fill();
		}
	}

	const point = (e: PointerEvent) => {
		const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
		return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
	};

	function down(e: PointerEvent) {
		if (e.button !== 0) return;
		const active = doc.layers.find((l) => l.id === doc.active);
		const c = canvases.get(doc.active)?.getContext("2d", { willReadFrequently: true });
		if (!c || !active) return;
		const p = point(e);
		if (ps.tool === "eyedropper") {
			for (const l of [...doc.layers].reverse()) {
				const d = l.visible && canvases.get(l.id)?.getContext("2d")?.getImageData(Math.floor(p.x), Math.floor(p.y), 1, 1).data;
				if (d && d[3] > 0) return void (ps.color = `#${[d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, "0")).join("")}`);
			}
			return;
		}
		if (ps.tool === "fill") {
			c.globalAlpha = ps.opacity / 100;
			c.fillStyle = ps.color;
			c.fillRect(0, 0, W, H);
			doc.history.push("Fill");
			return;
		}
		if (ps.tool !== "brush" && ps.tool !== "eraser") return;
		const el = e.currentTarget as HTMLElement;
		el.setPointerCapture(e.pointerId);
		c.globalCompositeOperation = ps.tool === "eraser" ? "destination-out" : "source-over";
		c.globalAlpha = ps.opacity / 100;
		c.strokeStyle = ps.color;
		c.lineWidth = ps.size;
		c.lineCap = c.lineJoin = "round";
		c.beginPath();
		c.moveTo(p.x, p.y);
		c.lineTo(p.x + 0.01, p.y);
		c.stroke();
		const move = (ev: PointerEvent) => {
			const q = point(ev);
			c.lineTo(q.x, q.y);
			c.stroke();
		};
		const up = () => {
			el.removeEventListener("pointermove", move);
			el.removeEventListener("pointerup", up);
			c.globalCompositeOperation = "source-over";
			doc.history.push(ps.tool === "eraser" ? "Eraser" : "Brush Tool");
		};
		el.addEventListener("pointermove", move);
		el.addEventListener("pointerup", up);
	}

	const filter = $derived(`brightness(${doc.adjust.brightness}%) contrast(${doc.adjust.contrast}%) saturate(${doc.adjust.saturation}%) hue-rotate(${doc.adjust.hue}deg)`);
	const cursor = $derived(ps.tool === "eyedropper" ? "copy" : ps.tool === "move" ? "move" : "crosshair");
</script>

<div class="flex h-full w-full flex-col bg-[#282828]">
	<div class="flex min-h-0 flex-1 items-center justify-center overflow-auto p-8" onwheel={(e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoom = Math.min(4, Math.max(0.1, zoom * Math.exp(-e.deltaY * 0.002))); } }}>
		<div
			class="relative shrink-0 shadow-2xl"
			style:width="{W * zoom}px"
			style:height="{H * zoom}px"
			style:cursor={cursor}
			style:background="repeating-conic-gradient(#ccc 0 25%, #fff 0 50%) 0 0 / 16px 16px"
			role="img"
			aria-label="Document {name}"
			onpointerdown={down}
		>
			<div class="absolute inset-0" style:filter={filter}>
				{#each doc.layers as l (l.id)}
					<canvas use:layer={l.id} width={W} height={H} class="absolute inset-0 size-full" class:invisible={!l.visible} style:opacity={l.opacity / 100}></canvas>
				{/each}
			</div>
		</div>
	</div>
	<div class="flex h-6 shrink-0 items-center gap-4 border-t border-black/40 bg-[#323232] px-3 text-[11px] text-[#bbb]">
		<span>{Math.round(zoom * 100)}%</span><span>{W} px × {H} px (72 ppi)</span><span class="ml-auto">Ctrl+wheel to zoom</span>
	</div>
</div>
