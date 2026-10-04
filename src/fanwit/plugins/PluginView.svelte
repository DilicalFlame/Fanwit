<script lang="ts">
	/**
	 * Every view a plugin contributes. ui = "widgets": draws the tree the plugin sent with
	 * ui.render. ui = "iframe": the plugin's own page in a sandboxed, cross origin frame (no
	 * same origin, no IPC) that talks to the plugin through a MessagePort under its permissions.
	 */
	import { onDestroy } from "svelte";
	import { getKernel } from "../ui.svelte";
	import EmptyState from "../workbench/EmptyState.svelte";
	import ErrorCard from "../workbench/ErrorCard.svelte";
	import type { Disposable } from "../kernel/disposable";
	import type { PluginConnection } from "./host";
	import WidgetNode from "./WidgetNode.svelte";
	import { frameDocument, frameUrl } from "./frames";

	let { paneId }: { paneId: string } = $props();
	const k = getKernel();
	const svc = $derived(k.sys.plugins);
	const viewId = $derived(k.sys.layout.doc.pane[paneId]?.view ?? "");
	const owner = $derived(svc ? (void svc.version, svc.viewOwner(viewId)) : null);
	const tree = $derived(svc?.widgets.get(viewId));
	const act = (action: string, value?: unknown) => svc?.uiEvent(viewId, action, value);

	// ----- iframe views -----
	let src = $state<string | null>(null);
	let srcdoc = $state<string | null>(null);
	let error = $state<unknown>(null);
	let frame = $state<HTMLIFrameElement>();
	let conn: (PluginConnection & Disposable) | null = null;

	$effect(() => {
		const o = owner;
		if (!svc || !o || o.view.ui !== "iframe") return;
		error = null;
		const p = o.plugin;
		const entry = o.view.entry!;
		(k.host.plugins?.frames === "scheme" ? frameUrl(k, svc, p, entry).then((u) => (src = u)) : frameDocument(svc, p, entry).then((d) => (srcdoc = d))).catch((e) => (error = e));
	});

	function themeVars() {
		const cs = getComputedStyle(document.documentElement);
		const names = ["background", "foreground", "card", "card-foreground", "popover", "popover-foreground", "primary", "primary-foreground", "secondary", "secondary-foreground", "muted", "muted-foreground", "accent", "accent-foreground", "destructive", "border", "input", "ring", "radius", "font-sans", "font-mono"];
		return { vars: Object.fromEntries(names.map((n) => [n, cs.getPropertyValue(`--${n}`).trim()]).filter(([, v]) => v)), dark: document.documentElement.classList.contains("dark") };
	}

	async function onload() {
		if (!frame?.contentWindow || !svc) return;
		conn?.dispose();
		const ch = new MessageChannel();
		// opaque origin frame: "*" is the only target that reaches it; the port is the only channel
		frame.contentWindow.postMessage({ t: "fw-port" }, "*", [ch.port2]);
		try {
			conn = (await svc.connectFrame(viewId, ch.port1)) as PluginConnection & Disposable;
			conn.post({ t: "theme", ...themeVars() });
		} catch (e) {
			error = e;
		}
	}

	$effect(() => {
		void k.sys.themes.version;
		void k.sys.themes.mode;
		conn?.post({ t: "theme", ...themeVars() });
	});
	onDestroy(() => conn?.dispose());
</script>

{#if !svc || !owner}
	<EmptyState icon="puzzle" title="Plugin view" description="The plugin that provides this view is off or not installed." />
{:else if owner.view.ui === "widgets"}
	<div class="h-full min-h-0 overflow-auto p-3">
		{#if tree}
			<WidgetNode w={tree} {act} />
		{:else if owner.plugin.error}
			<ErrorCard error={new Error(owner.plugin.error)} title="{owner.plugin.manifest.name} stopped" />
		{:else}
			<div class="text-xs text-muted-foreground">Starting {owner.plugin.manifest.name}…</div>
		{/if}
	</div>
{:else if error}
	<ErrorCard {error} title="This plugin page could not load" />
{:else if src || srcdoc}
	<iframe bind:this={frame} title={owner.view.title} class="h-full w-full flex-1 border-0 bg-background" sandbox="allow-scripts" referrerpolicy="no-referrer" {onload} src={src ?? undefined} srcdoc={srcdoc ?? undefined}></iframe>
{:else}
	<div class="p-3 text-xs text-muted-foreground">Loading…</div>
{/if}
