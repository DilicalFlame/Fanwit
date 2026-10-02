<script lang="ts">
	import { getKernel, candidateLocation, cssSelector, svelteMeta } from "../../ui.svelte";
	import type { ResolvedGroup } from "../../menus/menus.svelte";
	import MenuSurface from "./MenuSurface.svelte";

	/**
	 * Hosts the open context menu, the built in text/context menu for inputs, and the developer
	 * mode fallback: right clicking an element that has no menu offers Edit this menu,
	 * Inspect element, Open component source and Copy selector (Section 7.6.1).
	 */
	const k = getKernel();
	const menus = k.sys.menus;
	let groups = $state<ResolvedGroup[] | null>(null);
	let returnFocus: Element | null = null;
	let seq = 0;

	$effect(() => {
		const o = menus.open;
		void menus.version;
		if (!o) {
			groups = null;
			return;
		}
		const id = ++seq;
		returnFocus = document.activeElement;
		const t0 = performance.now();
		const resolved = o.items
			? Promise.resolve([{ id: "items", items: o.items.map((i) => ({ ...i, kind: i.kind ?? "action", label: i.label ?? i.id, enabled: true, checked: false })) }] as ResolvedGroup[])
			: menus.resolve(o.location, { target: o.target, element: o.element });
		void resolved.then((g) => {
			if (id !== seq) return;
			groups = g;
			const ms = performance.now() - t0;
			if (ms > 16) k.scopedLog("menus").debug(`${o.location} resolved in ${ms.toFixed(1)} ms (budget 16 ms)`);
		});
	});

	function close() {
		menus.close();
		const el = returnFocus as HTMLElement | null;
		returnFocus = null;
		queueMicrotask(() => el?.focus?.({ preventScroll: true }));
	}

	function isText(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement {
		return !!el && (el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && /^(text|search|url|email|password|number|tel)$/.test(el.type)) || (el as HTMLElement).isContentEditable);
	}

	/** Capture phase: text inputs get text/context; dev mode handles elements without a menu. */
	function contextmenu(e: MouseEvent) {
		const t = e.target as Element;
		if (t.closest("[role=menu]")) return e.preventDefault();
		if (t.closest("[data-fw-menu]")) return; // the element's own use:menu handles it
		if (t.closest("[data-native-menu]")) return;
		e.preventDefault();
		if (isText(t)) {
			(t as HTMLElement).focus();
			menus.show("text/context", e.clientX, e.clientY, { element: t });
			return;
		}
		if (!k.context.get("devMode")) return;
		const loc = candidateLocation(t);
		const meta = svelteMeta(t);
		const has = menus.locations.has(loc);
		menus.open = {
			location: has ? loc : "dev/fallback",
			x: e.clientX,
			y: e.clientY,
			element: t,
			items: has
				? undefined
				: [
						{ id: "dev.editMenu", label: "Edit this menu", icon: "pencil", command: "fanwit.createMenuHere", args: { location: loc } },
						{ id: "dev.inspect", label: "Inspect element", icon: "scan-search", command: "fanwit.inspectAt", args: { x: e.clientX, y: e.clientY } },
						...(meta ? [{ id: "dev.source", label: "Open component source", icon: "file-code", command: "fanwit.openSource", args: { file: meta.file, line: meta.line } }] : []),
						{ id: "dev.copySelector", label: "Copy selector", icon: "copy", command: "clipboard.copy", args: { text: cssSelector(t) } }
					]
		};
	}
	function pointerdown(e: PointerEvent) {
		if (menus.open && !(e.target as Element).closest("[role=menu]")) close();
	}
</script>

<svelte:document oncontextmenu={contextmenu} onpointerdowncapture={pointerdown} />
<svelte:window onblur={() => menus.open && close()} onresize={() => menus.open && close()} />

{#if menus.open && groups}
	{#key menus.open}
		<MenuSurface {groups} x={menus.open.x} y={menus.open.y} anchor={menus.open.anchor} location={menus.open.location} target={menus.open.target} element={menus.open.element} onclose={close} />
	{/key}
{/if}
