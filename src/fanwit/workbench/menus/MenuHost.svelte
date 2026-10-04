<script lang="ts">
	import { getKernel, candidateLocation, cssSelector, svelteMeta } from "../../ui.svelte";
	import type { MenuItem, ResolvedGroup, ResolvedItem } from "../../menus/menus.svelte";
	import MenuSurface from "./MenuSurface.svelte";
	import { measure } from "../../kernel/budget";

	/**
	 * Hosts the open context menu and the built in text/context menu for inputs. In developer mode
	 * every menu ends with a developer group (Edit this menu, Inspect element, Open component
	 * source, Copy selector), and right clicking an element that has no menu opens just that group
	 * (Section 7.6.1).
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
			? Promise.resolve([{ id: "items", items: o.items.map(item) }] as ResolvedGroup[])
			: menus.resolve(o.location, { target: o.target, element: o.element });
		const dev = !!k.context.get("devMode");
		void resolved.then((g) => {
			if (id !== seq) return;
			groups = [...g.filter((x) => x.items.length), ...(dev ? [devGroup(o)] : [])];
			measure("fw:menus.resolve", t0, k.scopedLog("menus"), o.location);
		});
	});

	const item = (i: MenuItem): ResolvedItem => ({ ...i, kind: i.kind ?? "action", label: i.label ?? i.id, enabled: true, checked: false });

	/** Developer tools for whatever the menu was opened on. */
	function devGroup(o: NonNullable<typeof menus.open>): ResolvedGroup {
		const el = o.element ?? null;
		const meta = el ? svelteMeta(el) : null;
		return {
			id: "dev",
			items: [
				{ id: "dev.editMenu", label: "Edit this menu", icon: "pencil", command: "fanwit.createMenuHere", args: { location: o.location } },
				{ id: "dev.inspect", label: "Inspect element", icon: "scan-search", command: "fanwit.inspectAt", args: { x: o.x, y: o.y } },
				...(meta ? [{ id: "dev.source", label: "Open component source", icon: "file-code", command: "fanwit.openSource", args: { file: meta.file, line: meta.line } }] : []),
				...(el ? [{ id: "dev.copySelector", label: "Copy selector", icon: "copy", command: "clipboard.copy", args: { text: cssSelector(el) } }] : [])
			].map(item)
		};
	}

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
		// no menu here: a location of its own (empty until edited) plus the developer group
		const loc = candidateLocation(t);
		menus.open = { location: loc, x: e.clientX, y: e.clientY, element: t, items: menus.locations.has(loc) ? undefined : [] };
	}
	function pointerdown(e: PointerEvent) {
		if (menus.open && !(e.target as Element).closest("[role=menu]")) close();
	}
</script>

<svelte:document oncontextmenu={contextmenu} onpointerdowncapture={pointerdown} />
<svelte:window onblur={() => menus.open && close()} onresize={() => menus.open && close()} />

{#if menus.open && groups}
	{#key menus.open}
		{@const o = menus.open}
		<MenuSurface {groups} x={o.x} y={o.y} anchor={o.anchor} location={o.location} target={o.target} element={o.element} onclose={close} />
	{/key}
{/if}
