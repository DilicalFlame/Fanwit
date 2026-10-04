<script lang="ts">
	import { onMount, tick, type Component } from "svelte";
	import { getKernel, uiZoom } from "../../ui.svelte";
	import type { MenuKindProps, ResolvedGroup, ResolvedItem } from "../../menus/menus.svelte";
	import Icon from "../../icons/Icon.svelte";
	import KeyChip from "../KeyChip.svelte";
	import Self from "./MenuSurface.svelte";
	import { enter, leave, haptic } from "../../motion/motion";

	/**
	 * Renders one menu level (Section 7.7): opens at the pointer, flips then shifts to stay 8 px
	 * inside the window, caps its height with pointer position auto scroll, keeps diagonal moves
	 * to an open submenu inside the safe triangle, and implements the WAI-ARIA menu keyboard model.
	 */
	let {
		groups,
		x,
		y,
		anchor,
		level = 0,
		location,
		target,
		element,
		inert = false,
		onclose,
		onback,
		autofocus = true
	}: {
		groups: ResolvedGroup[];
		x: number;
		y: number;
		anchor?: DOMRect;
		level?: number;
		location: string;
		target?: unknown;
		element?: Element | null;
		inert?: boolean;
		onclose: () => void;
		onback?: () => void;
		autofocus?: boolean;
	} = $props();

	const k = getKernel();
	const menus = k.sys.menus;
	let el = $state<HTMLDivElement>();
	// svelte-ignore state_referenced_locally (the opening point; layout() clamps it into view after mount)
	let pos = $state({ left: x, top: y, maxH: 9999 });
	let active = $state(-1);
	let sub = $state<{ index: number; rect: DOMRect } | null>(null);
	let keyboardNav = $state(false);
	let kinds = $state<Record<string, Component<MenuKindProps<any>>>>({});
	const devMode = $derived((void k.context.version, !!k.context.get("devMode")));

	/** Rows in order with separators between non empty groups (contributors never manage separators). */
	const rows = $derived.by(() => {
		const out: ({ sep: true } | { sep?: false; item: ResolvedItem })[] = [];
		groups.forEach((g, gi) => {
			if (gi > 0) out.push({ sep: true });
			for (const item of g.items) out.push({ item });
		});
		return out;
	});
	const focusable = $derived(rows.map((r, i) => (!r.sep && r.item.kind !== "separator" && r.item.kind !== "header" && r.item.kind !== "progress" ? i : -1)).filter((i) => i >= 0));

	const BUILTIN = new Set(["action", "submenu", "checkbox", "radio", "separator", "header"]);

	onMount(async () => {
		// lazy kind components, kept warm by the menu service
		const needed = new Set(rows.flatMap((r) => (!r.sep && !BUILTIN.has(r.item.kind) ? [r.item.kind] : [])));
		const loaded: Record<string, Component<MenuKindProps<any>>> = {};
		for (const kind of needed) loaded[kind] = await menus.kindComponent(kind);
		kinds = loaded;
		await tick();
		place();
		if (autofocus) {
			el?.focus();
			if (level > 0 && focusable.length) setActive(focusable[0]);
		}
	});

	function place() {
		if (!el) return;
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		// layout size, not the bounding box: the entrance animation scales the menu while it is
		// measured. offset sizes are CSS px; the rest of this function works in screen px.
		const zoom = uiZoom();
		const r = { width: el.offsetWidth * zoom, height: el.offsetHeight * zoom };
		let left = x;
		let top = y;
		if (left + r.width > vw - 8) left = anchor ? anchor.left - r.width + 2 : x - r.width;
		left = Math.max(8, Math.min(left, vw - 8 - r.width));
		const maxH = vh - 16;
		const h = Math.min(r.height, maxH);
		if (top + h > vh - 8) {
			// flip: a menu below its anchor opens above it; one beside it lines up with its bottom edge
			if (!anchor) top = y - h;
			else if (level > 0) top = vh - 8 - h;
			else top = y >= anchor.bottom - 1 ? anchor.top - h - 2 : anchor.bottom - h;
		}
		top = Math.max(8, Math.min(top, vh - 8 - h));
		// everything above is in viewport pixels; body zoom (ui.zoom) scales the px we set
		pos = { left: left / zoom, top: top / zoom, maxH: maxH / zoom };
	}

	function valueOf(item: ResolvedItem): unknown {
		const from = item.props?.valueFrom as string | undefined;
		if (!from) return item.props?.value;
		if (from.startsWith("target.")) return from.slice(7).split(".").reduce<unknown>((o, kk) => (o && typeof o === "object" ? (o as Record<string, unknown>)[kk] : undefined), target);
		return k.context.lookup(element ?? null)(from);
	}

	async function run(item: ResolvedItem, value: Record<string, unknown> = {}, o: { preview?: boolean; keepOpen?: boolean } = {}) {
		if (!item.enabled) return;
		if (!o.preview) haptic("tick");
		const { __command, ...rest } = value as { __command?: string };
		const command = __command ?? (o.preview ? item.preview : item.command);
		// read props before closing: closing clears the menu state they derive from
		const tgt = target;
		const el = element;
		if (!o.keepOpen && !o.preview) onclose();
		if (!command) return;
		if (inert) {
			k.sys.notify.toast(`Would run ${command}${Object.keys({ ...item.args, ...rest }).length ? " " + JSON.stringify({ ...item.args, ...rest }) : ""}`);
			return;
		}
		try {
			await k.commands.run(command, { ...(item.args ?? {}), ...rest }, { source: "menu", target: tgt, element: el });
		} catch (e) {
			k.sys.notify.error(e);
		}
	}

	function activate(i: number, e?: MouseEvent | KeyboardEvent) {
		const r = rows[i];
		if (!r || r.sep) return;
		const item = r.item;
		if (e && "altKey" in e && e.altKey && devMode) {
			onclose();
			void k.commands.run("menus.edit", { location, item: item.id });
			return;
		}
		if (item.children?.length) {
			openSub(i);
			return;
		}
		if (item.kind === "checkbox" || item.kind === "toggle") return run(item, { on: !item.checked }, { keepOpen: item.kind === "toggle" });
		if (item.kind === "radio") return run(item, { value: item.props?.value });
		if (BUILTIN.has(item.kind)) return run(item);
	}

	function setActive(i: number) {
		active = i;
		const row = el?.querySelector<HTMLElement>(`[data-row="${i}"]`);
		row?.scrollIntoView({ block: "nearest" });
		const composite = row?.querySelector<HTMLElement>("[data-menu-composite] button, [data-menu-composite] input, [data-menu-composite] [tabindex='0']");
		(composite && keyboardNav ? composite : row)?.focus({ preventScroll: true });
	}

	function openSub(i: number) {
		const row = el?.querySelector<HTMLElement>(`[data-row="${i}"]`);
		if (!row) return;
		sub = { index: i, rect: row.getBoundingClientRect() };
	}

	// ----- safe triangle (Section 7.7.4) -----
	let lastPt = { x: 0, y: 0 };
	let pendingSwitch: ReturnType<typeof setTimeout> | undefined;
	let hoverTimer: ReturnType<typeof setTimeout> | undefined;
	function inTriangle(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) {
		const s = (p1: typeof p, p2: typeof p, p3: typeof p) => (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
		const d1 = s(p, a, b);
		const d2 = s(p, b, c);
		const d3 = s(p, c, a);
		return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
	}
	function hover(i: number, e: PointerEvent) {
		keyboardNav = false;
		const pt = { x: e.clientX, y: e.clientY };
		const prev = lastPt;
		lastPt = pt;
		clearTimeout(hoverTimer);
		if (sub && sub.index !== i) {
			const subEl = document.querySelector<HTMLElement>(`[data-menu-level="${level + 1}"]`);
			const sr = subEl?.getBoundingClientRect();
			if (sr) {
				const left = sr.left > prev.x;
				const near = left ? sr.left : sr.right;
				if (inTriangle(pt, prev, { x: near, y: sr.top - 4 }, { x: near, y: sr.bottom + 4 })) {
					clearTimeout(pendingSwitch);
					pendingSwitch = setTimeout(() => {
						active = i;
						sub = null;
						if (rowHasChildren(i)) openSub(i);
					}, 300);
					return;
				}
			}
		}
		clearTimeout(pendingSwitch);
		active = i;
		if (rowHasChildren(i)) {
			if (sub?.index !== i) hoverTimer = setTimeout(() => openSub(i), 100);
		} else sub = null;
	}
	const rowHasChildren = (i: number) => {
		const r = rows[i];
		return !!r && !r.sep && !!r.item.children?.length;
	};

	// ----- pointer position auto scroll (Section 7.7.3) -----
	let scroller = $state<HTMLDivElement>();
	let target_ = 0;
	let raf = 0;
	let overflow = $state({ top: false, bottom: false });
	function autoscroll(e: PointerEvent) {
		const s = scroller;
		if (!s || keyboardNav || s.scrollHeight <= s.clientHeight + 1 || e.pointerType === "touch") return;
		const r = s.getBoundingClientRect();
		const pad = 24;
		let t = (e.clientY - r.top - pad) / (r.height - 2 * pad);
		t = Math.max(0, Math.min(1, t));
		// edge zones accelerate so the last rows are reached quickly
		if (t < 0.08) t = 0;
		if (t > 0.92) t = 1;
		target_ = t * (s.scrollHeight - s.clientHeight);
		if (!raf) raf = requestAnimationFrame(stepScroll);
	}
	function stepScroll() {
		raf = 0;
		const s = scroller;
		if (!s) return;
		const kk = k.sys.settings.get<number>("menus.autoScrollSpeed") ?? 0.25;
		const d = (target_ - s.scrollTop) * kk;
		if (Math.abs(d) > 0.5) {
			s.scrollTop += d;
			raf = requestAnimationFrame(stepScroll);
		}
		updateOverflow();
	}
	function updateOverflow() {
		const s = scroller;
		if (s) overflow = { top: s.scrollTop > 2, bottom: s.scrollTop + s.clientHeight < s.scrollHeight - 2 };
	}

	// ----- keyboard model (Section 7.7.5) -----
	let typed = "";
	let typedTimer: ReturnType<typeof setTimeout> | undefined;
	function keys(e: KeyboardEvent) {
		keyboardNav = true;
		const insideComposite = (e.target as HTMLElement).closest?.("[data-menu-composite]");
		const pos_ = focusable.indexOf(active);
		const rtl = document.documentElement.dir === "rtl";
		const fwd = rtl ? "ArrowLeft" : "ArrowRight";
		const back = rtl ? "ArrowRight" : "ArrowLeft";
		switch (e.key) {
			case "ArrowDown":
				e.preventDefault();
				setActive(focusable[(pos_ + 1) % focusable.length]);
				break;
			case "ArrowUp":
				e.preventDefault();
				setActive(focusable[(pos_ - 1 + focusable.length) % focusable.length]);
				break;
			case "Home":
				e.preventDefault();
				setActive(focusable[0]);
				break;
			case "End":
				e.preventDefault();
				setActive(focusable[focusable.length - 1]);
				break;
			case "Enter":
			case " ":
				if (insideComposite && e.key === " ") return;
				if (insideComposite && (e.target as HTMLElement).tagName === "INPUT") return;
				e.preventDefault();
				if (!insideComposite || (e.target as HTMLElement).tagName !== "BUTTON") activate(active, e);
				else (e.target as HTMLElement).click();
				break;
			case "Escape":
				e.preventDefault();
				e.stopPropagation();
				if (level > 0) onback?.();
				else onclose();
				break;
			case "Tab":
				// Tab enters a composite kind; Shift+Tab leaves it
				if (!insideComposite && !e.shiftKey) {
					const c = el?.querySelector<HTMLElement>(`[data-row="${active}"] [data-menu-composite] button, [data-row="${active}"] [data-menu-composite] input, [data-row="${active}"] [data-menu-composite] [tabindex="0"]`);
					if (c) {
						e.preventDefault();
						c.focus();
						return;
					}
				}
				e.preventDefault();
				if (insideComposite) el?.querySelector<HTMLElement>(`[data-row="${active}"]`)?.focus();
				break;
			default:
				if (e.key === fwd && rowHasChildren(active)) {
					e.preventDefault();
					openSub(active);
				} else if (e.key === back && level > 0 && !insideComposite) {
					e.preventDefault();
					onback?.();
				} else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !insideComposite) {
					// typeahead to the next row starting with the typed letters
					clearTimeout(typedTimer);
					typed += e.key.toLowerCase();
					typedTimer = setTimeout(() => (typed = ""), 600);
					const start = Math.max(0, pos_);
					for (let n = 1; n <= focusable.length; n++) {
						const idx = focusable[(start + (typed.length === 1 ? n : 0) + n - 1) % focusable.length];
						const r = rows[idx];
						if (r && !r.sep && r.item.label.toLowerCase().startsWith(typed)) {
							setActive(idx);
							break;
						}
					}
				}
		}
	}
</script>

<div
	bind:this={el}
	role="menu"
	tabindex="-1"
	aria-label={location}
	data-menu-level={level}
	use:enter={{ preset: level > 0 ? "side" : "pop", origin: () => `${pos.top >= y - 1 ? "top" : "bottom"} ${pos.left >= x - 1 ? "left" : "right"}` }}
	out:leave|global={{ preset: "pop", duration: level > 0 ? 0 : undefined }}
	class="fixed z-[100] min-w-52 max-w-96 overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg outline-none"
	style:left="{pos.left}px"
	style:top="{pos.top}px"
	onkeydown={keys}
	oncontextmenu={(e) => e.preventDefault()}
>
	<div bind:this={scroller} role="presentation" class="relative overflow-hidden" style:max-height="{pos.maxH - 10}px" onpointermove={autoscroll} onscroll={updateOverflow} onwheel={(e) => { if (scroller) { scroller.scrollTop += e.deltaY; updateOverflow(); } }}>
		{#each rows as row, i (i)}
			{#if row.sep}
				<div role="separator" class="mx-1 my-1 h-px bg-border"></div>
			{:else}
				{@const item = row.item}
				{@const K = kinds[item.kind]}
				<div
					data-row={i}
					role="none"
					class="rounded-md {active === i && !K ? 'bg-accent text-accent-foreground' : ''} {item.hidden ? 'opacity-50 line-through' : ''}"
					onpointermove={(e) => hover(i, e)}
				>
					{#if item.kind === "separator"}
						<div role="separator" class="mx-1 my-1 h-px bg-border"></div>
					{:else if item.kind === "header"}
						<div class="px-2 pt-1.5 pb-0.5 text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase">{item.label}</div>
					{:else if K}
						<K {item} props={item.props ?? {}} value={valueOf(item)} emit={(v: Record<string, unknown>, o?: { preview?: boolean; keepOpen?: boolean }) => run(item, v, o)} close={onclose} {inert} />
					{:else}
						<button
							role={item.kind === "checkbox" ? "menuitemcheckbox" : item.kind === "radio" ? "menuitemradio" : "menuitem"}
							aria-checked={item.kind === "checkbox" || item.kind === "radio" ? item.checked : undefined}
							aria-haspopup={item.children?.length ? "menu" : undefined}
							aria-expanded={item.children?.length ? sub?.index === i : undefined}
							aria-disabled={!item.enabled}
							tabindex="-1"
							title={!item.enabled && item.disabledReason ? `Unavailable: ${item.disabledReason} is false` : item.description}
							class="fw-menu-row w-full {item.group === 'danger' ? 'text-destructive' : ''} {!item.enabled ? 'opacity-50' : ''}"
							onclick={(e) => activate(i, e)}
						>
							{#if item.kind === "checkbox" || item.kind === "radio" || item.checked}
								<span class="flex w-[15px] justify-center">{#if item.checked}<Icon name={item.kind === "radio" ? "dot" : "check"} size={14} />{/if}</span>
							{:else if item.icon}
								<Icon name={item.icon} size={15} class="opacity-80" />
							{:else}
								<span class="w-[15px]"></span>
							{/if}
							<span class="flex-1 truncate text-left">{item.label}</span>
							{#if item.userInserted}<span class="rounded bg-info-muted px-1 text-[9px] text-info">user</span>{/if}
							{#if item.children?.length}
								<Icon name="chevron-right" size={14} class="opacity-60 rtl:rotate-180" />
							{:else}
								<KeyChip keys={item.keys} />
							{/if}
						</button>
					{/if}
				</div>
			{/if}
		{/each}
		{#if !rows.length}
			<div class="px-2 py-1.5 text-xs text-muted-foreground">No items here</div>
		{/if}
	</div>
	{#if overflow.top}<div class="pointer-events-none absolute inset-x-1 top-1 h-4 bg-gradient-to-b from-popover to-transparent"></div>{/if}
	{#if overflow.bottom}<div class="pointer-events-none absolute inset-x-1 bottom-1 h-4 bg-gradient-to-t from-popover to-transparent"></div>{/if}
</div>

{#if sub}
	{@const subItem = (rows[sub.index] as { item: ResolvedItem }).item}
	{#key sub.index}
		<Self
			groups={subItem.children ?? []}
			x={sub.rect.right - 2}
			y={sub.rect.top - 5}
			anchor={sub.rect}
			level={level + 1}
			location={subItem.submenu ?? location}
			{target}
			{element}
			{inert}
			{onclose}
			onback={() => {
				const i = sub!.index;
				sub = null;
				setActive(i);
			}}
		/>
	{/key}
{/if}
