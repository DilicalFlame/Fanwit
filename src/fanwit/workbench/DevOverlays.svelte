<script lang="ts">
	import { getKernel, svelteMeta, cssSelector } from "../ui.svelte";
	import Icon from "../icons/Icon.svelte";
	import KeyChip from "./KeyChip.svelte";

	/**
	 * Keyboard overlay (Ctrl+/: bindings available here, grouped by category, Section 6.7),
	 * the developer mode element inspector (Ctrl+Alt+I, Figure 17.16), the docking indicator
	 * and the veil over a window locked by a child.
	 */
	const k = getKernel();
	let overlay = $state(false);
	let inspecting = $state(false);
	let hover = $state<{ el: Element; rect: DOMRect } | null>(null);
	let picked = $state<{ el: Element; rect: DOMRect } | null>(null);
	const drag = $derived(k.sys.dock.state);

	const trigger = $derived(k.sys.settings.get<string>("keys.overlayTrigger") ?? "ctrl+/");
	k.events.on("fw:keys-overlay" as never, () => (overlay = trigger !== "off" && !overlay));
	/** hold-mod: holding Ctrl (or Cmd) alone for 800 ms shows the overlay until it is released. */
	let holdTimer: ReturnType<typeof setTimeout> | undefined;
	let held = false;
	function holdDown(e: KeyboardEvent) {
		clearTimeout(holdTimer);
		if (trigger !== "hold-mod" || e.repeat) return;
		if (e.key === "Control" || e.key === "Meta") holdTimer = setTimeout(() => (overlay = held = true), 800);
	}
	function holdUp() {
		clearTimeout(holdTimer);
		if (held) overlay = held = false;
	}
	k.events.on("fw:inspect" as never, () => {
		inspecting = true;
		picked = null;
	});
	k.events.on("fw:inspect-at" as never, (p: { x: number; y: number }) => {
		const el = document.elementFromPoint(p.x, p.y);
		if (el) picked = { el, rect: el.getBoundingClientRect() };
	});

	const groups = $derived.by(() => {
		if (!overlay) return [];
		const lookup = k.context.lookup(null);
		const map = new Map<string, { title: string; keys: string[] }[]>();
		for (const b of k.keys.effective()) {
			const c = k.commands.get(b.command);
			if (!c || (b.when && !k.context.evaluate(b.when)) || (c.def.when && !k.context.evaluate(c.def.when))) continue;
			const cat = c.def.category ?? "Other";
			const list = map.get(cat) ?? [];
			if (!list.some((x) => x.title === c.def.title)) list.push({ title: c.def.title, keys: k.keys.format(b.steps) });
			map.set(cat, list);
		}
		void lookup;
		return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
	});

	function move(e: PointerEvent) {
		if (!inspecting) return;
		const el = document.elementFromPoint(e.clientX, e.clientY);
		if (el && !el.closest("[data-fw-inspector]")) hover = { el, rect: el.getBoundingClientRect() };
	}
	function click(e: MouseEvent) {
		if (!inspecting) return;
		e.preventDefault();
		e.stopPropagation();
		inspecting = false;
		if (hover) picked = hover;
		hover = null;
	}
	function info(el: Element) {
		const meta = svelteMeta(el);
		const loc = (el.closest("[data-fw-menu]") as HTMLElement | null)?.dataset.fwMenu;
		const paneEl = el.closest("[data-fw-pane]") as HTMLElement | null;
		const pane = paneEl ? k.sys.layout.doc.pane[paneEl.dataset.fwPane!] : undefined;
		const view = pane ? k.sys.layout.views.get(pane.view) : undefined;
		const scoped: Record<string, unknown> = {};
		for (let n: Element | null = el; n; n = n.parentElement) {
			const s = (n as Element & { __fwctx?: Record<string, unknown> }).__fwctx;
			if (s) for (const [kk, v] of Object.entries(s)) if (!(kk in scoped)) scoped[kk] = v;
		}
		return { meta, loc, view: pane?.view, owner: view?.owner, scoped, id: (el.closest("[data-fw-id]") as HTMLElement | null)?.dataset.fwId, selector: cssSelector(el) };
	}
</script>

<svelte:window
	onpointermove={move}
	onclickcapture={click}
	onkeyup={holdUp}
	onblur={holdUp}
	onkeydown={(e) => {
		holdDown(e);
		if (e.key === "Escape" && (overlay || inspecting || picked)) {
			overlay = false;
			inspecting = false;
			picked = null;
		}
	}}
/>

{#if drag?.over}
	<div class="pointer-events-none fixed z-[95] rounded-md border-2 border-splitter-hover bg-drop-target transition-all duration-75" style:left="{drag.over.preview.x}px" style:top="{drag.over.preview.y}px" style:width="{drag.over.preview.w}px" style:height="{drag.over.preview.h}px"></div>
	{#if k.sys.settings.get("layout.dockIndicator") === "compass"}
		{@const r = drag.over.rect}
		<div class="pointer-events-none fixed z-[96] grid grid-cols-3 gap-1" style:left="{r.left + r.width / 2 - 58}px" style:top="{r.top + r.height / 2 - 58}px">
			{#each ["", "top", "", "left", "center", "right", "", "bottom", ""] as z, i (i)}
				<div class="size-9 rounded {z ? (drag.over.zone === z ? 'bg-primary' : 'border border-border bg-popover/90') : ''}"></div>
			{/each}
		</div>
	{/if}
{/if}
{#if drag}
	<div class="pointer-events-none fixed z-[97] rounded-md border border-border bg-popover px-2 py-1 text-xs shadow-lg" style:left="{drag.x + 12}px" style:top="{drag.y + 12}px">
		{drag.title}{drag.float ? " · float" : drag.outside ? " · new window" : ""}
	</div>
{/if}

{#if k.sys.windows.locked && k.host.caps.nativeWindows}
	<div class="fixed inset-0 z-[150] bg-black/25" role="presentation" aria-hidden="true"></div>
{/if}

{#if overlay}
	<div class="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-6" role="presentation" onpointerdown={() => (overlay = false)}>
		<div role="dialog" aria-label="Keyboard shortcuts available here" class="max-h-full w-[min(900px,100%)] overflow-auto rounded-xl border border-border bg-popover p-5 text-popover-foreground shadow-2xl">
			<div class="mb-3 flex items-center gap-2 text-sm font-semibold"><Icon name="keyboard" /> Shortcuts available here</div>
			<div class="columns-1 gap-6 sm:columns-2 lg:columns-3">
				{#each groups as [cat, list] (cat)}
					<section class="mb-4 break-inside-avoid">
						<div class="mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{cat}</div>
						{#each list as b (b.title)}
							<div class="flex items-center justify-between gap-3 py-0.5 text-xs"><span class="truncate">{b.title}</span><KeyChip keys={b.keys} /></div>
						{/each}
					</section>
				{/each}
			</div>
		</div>
	</div>
{/if}

{#if inspecting && hover}
	<div class="pointer-events-none fixed z-[140] border-2 border-sky-500 bg-sky-500/10" style:left="{hover.rect.left}px" style:top="{hover.rect.top}px" style:width="{hover.rect.width}px" style:height="{hover.rect.height}px">
		<span class="absolute -top-5 left-0 rounded bg-sky-600 px-1 text-[10px] whitespace-nowrap text-white">{svelteMeta(hover.el) ? `${svelteMeta(hover.el)!.file.split("/").pop()}:${svelteMeta(hover.el)!.line}` : hover.el.tagName.toLowerCase()}</span>
	</div>
{/if}
{#if picked}
	{@const i = info(picked.el)}
	<div class="pointer-events-none fixed z-[140] border-2 border-sky-500" style:left="{picked.rect.left}px" style:top="{picked.rect.top}px" style:width="{picked.rect.width}px" style:height="{picked.rect.height}px"></div>
	<aside data-fw-inspector class="fixed right-3 bottom-10 z-[141] w-80 rounded-xl border border-border bg-popover p-3 text-xs text-popover-foreground shadow-2xl">
		<div class="mb-2 flex items-center gap-2 text-sm font-semibold"><Icon name="scan-search" /> Inspect <span class="flex-1"></span><button class="fw-icon-btn" aria-label="Close" onclick={() => (picked = null)}><Icon name="x" size={13} /></button></div>
		<dl class="grid grid-cols-[96px_1fr] gap-x-2 gap-y-1">
			<dt class="text-muted-foreground">Component</dt><dd class="selectable truncate">{i.meta ? `${i.meta.file}:${i.meta.line}` : "(production build)"}</dd>
			<dt class="text-muted-foreground">data-fw-id</dt><dd class="selectable">{i.id ?? "none"}</dd>
			<dt class="text-muted-foreground">Menu location</dt><dd class="selectable">{i.loc ?? "none"}</dd>
			<dt class="text-muted-foreground">View</dt><dd class="selectable">{i.view ?? "none"}</dd>
			<dt class="text-muted-foreground">Owner</dt><dd>{i.owner ?? "core"}</dd>
			<dt class="text-muted-foreground">Context keys</dt>
			<dd class="selectable max-h-28 overflow-auto font-mono text-[10.5px]">{#each Object.entries(i.scoped) as [kk, v] (kk)}<div>{kk} = {JSON.stringify(v)}</div>{:else}none{/each}</dd>
		</dl>
		<div class="mt-3 flex flex-wrap gap-1.5">
			<button class="fw-btn h-6" onclick={() => { const l = i.loc ?? k.sys.menus.locations.get(`auto/${i.id}`)?.id; void k.commands.run("fanwit.createMenuHere", { location: l ?? `auto/${i.meta ? i.meta.file.split("/").pop() + ":" + i.meta.line : i.selector}` }); picked = null; }}>Edit menu</button>
			{#if i.meta}<button class="fw-btn h-6" onclick={() => k.commands.run("fanwit.openSource", { file: i.meta!.file, line: i.meta!.line })}>Open source</button>{/if}
			<button class="fw-btn h-6" onclick={() => navigator.clipboard.writeText(i.selector)}>Copy selector</button>
		</div>
	</aside>
{/if}
