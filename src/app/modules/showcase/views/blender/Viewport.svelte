<script lang="ts">
	import Icon from "$fanwit/icons/Icon.svelte";
	import { scene, type Obj } from "./blender.svelte";

	/** CSS 3D viewport: drag to orbit, wheel to zoom, click an object to select it. Each area orbits on its own. */
	let yaw = $state(-35);
	let pitch = $state(62);
	let dist = $state(1);
	let wire = $state(false);
	const U = 44; // pixels per Blender unit
	const FACES = ["translateZ(H)", "rotateY(180deg) translateZ(H)", "rotateY(90deg) translateZ(H)", "rotateY(-90deg) translateZ(H)", "rotateX(-90deg) translateZ(H)", "rotateX(90deg) translateZ(H)"];
	const SHADE = [1.15, 0.55, 0.85, 0.7, 1, 0.6];

	function orbit(e: PointerEvent) {
		if ((e.target as HTMLElement).closest("[data-obj]")) return;
		const el = e.currentTarget as HTMLElement;
		el.setPointerCapture(e.pointerId);
		const [y0, p0, x0, py0] = [yaw, pitch, e.clientX, e.clientY];
		const move = (ev: PointerEvent) => {
			yaw = y0 + (ev.clientX - x0) * 0.4;
			pitch = Math.min(89, Math.max(5, p0 - (ev.clientY - py0) * 0.4));
		};
		const up = () => {
			el.removeEventListener("pointermove", move);
			el.removeEventListener("pointerup", up);
		};
		el.addEventListener("pointermove", move);
		el.addEventListener("pointerup", up);
	}
	const place = (o: Obj) => `translate3d(${o.loc[0] * U}px, ${-o.loc[1] * U}px, ${o.loc[2] * U}px)`;
	const turn = (o: Obj) => `rotateX(${o.rot[0]}deg) rotateY(${o.rot[1]}deg) rotateZ(${o.rot[2] + (o.spin ?? 0) * (scene.frame - 1)}deg)`;
</script>

<div class="relative h-full w-full overflow-hidden bg-[#3d3d3d] select-none" role="application" aria-label="3D viewport" onpointerdown={orbit} onwheel={(e) => { e.preventDefault(); dist = Math.min(3, Math.max(0.3, dist * Math.exp(-e.deltaY * 0.001))); }}>
	<div class="absolute top-2 left-2 z-10 flex gap-1 text-[11px]">
		<span class="rounded bg-black/30 px-2 py-0.5">Object Mode</span>
		<button class="rounded px-2 py-0.5 {wire ? 'bg-black/30' : 'bg-[#4772b3]'}" onpointerdown={(e) => e.stopPropagation()} onclick={() => (wire = false)}>Solid</button>
		<button class="rounded px-2 py-0.5 {wire ? 'bg-[#4772b3]' : 'bg-black/30'}" onpointerdown={(e) => e.stopPropagation()} onclick={() => (wire = true)}>Wireframe</button>
	</div>
	<div class="absolute right-2 bottom-2 z-10 text-[10px] opacity-60">Drag to orbit · wheel to zoom · frame {scene.frame}</div>
	<div class="absolute inset-0 flex items-center justify-center" style:perspective="900px">
		<div class="relative" style:transform-style="preserve-3d" style:transform="scale({dist}) rotateX({pitch}deg) rotateZ({yaw}deg)">
			<!-- floor grid and axes -->
			<div class="absolute -top-[300px] -left-[300px] size-[600px]" style:background-image="linear-gradient(rgb(255 255 255 / 0.08) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / 0.08) 1px, transparent 1px)" style:background-size="{U}px {U}px"></div>
			<div class="absolute top-0 -left-[300px] h-px w-[600px] bg-[#c0392b]/70"></div>
			<div class="absolute -top-[300px] left-0 h-[600px] w-px bg-[#7cb342]/70"></div>
			{#each scene.objects as o (o.id)}
				{#if !o.hidden}
					{@const sel = scene.selected === o.id}
					<div class="absolute" style:transform-style="preserve-3d" style:transform="{place(o)} {turn(o)}">
						{#if o.kind === "mesh"}
							{@const s = U * 2 * o.scale}
							{#each FACES as f, i (i)}
								<button
									data-obj={o.id}
									aria-label={o.name}
									class="absolute block border {sel ? 'border-[#ffa726]' : wire ? 'border-black/70' : 'border-black/30'}"
									style:width="{s}px"
									style:height="{s}px"
									style:left="{-s / 2}px"
									style:top="{-s / 2}px"
									style:background={wire ? "transparent" : o.color}
									style:filter="brightness({SHADE[i]})"
									style:transform={f.replace("H", `${s / 2}px`)}
									onclick={() => (scene.selected = o.id)}
								></button>
							{/each}
						{:else}
							<button data-obj={o.id} aria-label={o.name} class="absolute -top-3 -left-3 flex size-6 items-center justify-center rounded-full {sel ? 'bg-[#ffa726] text-black' : 'bg-black/50'}" style:transform="rotateZ({-yaw}deg) rotateX({-pitch}deg)" onclick={() => (scene.selected = o.id)}>
								<Icon name={o.kind === "camera" ? "video" : "lightbulb"} size={13} />
							</button>
						{/if}
					</div>
				{/if}
			{/each}
		</div>
	</div>
</div>
