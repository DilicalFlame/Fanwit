<script lang="ts">
	import { onDestroy } from "svelte";
	import { getKernel } from "../ui.svelte";
	import CodeArea from "./CodeArea.svelte";
	import ErrorCard from "../workbench/ErrorCard.svelte";

	/** Plain text editor for any vault file: dirty tracking, Ctrl+S, reload when changed on disk. */
	let { paneId, props }: { paneId: string | null; props: { path?: string } } = $props();
	const k = getKernel();
	const { vault, layout, notify } = k.sys;
	let text = $state("");
	let base = $state("");
	let error = $state<unknown>(null);
	let loaded = $state(false);
	let area = $state<CodeArea>();
	const dirty = $derived(loaded && text !== base);

	async function load() {
		try {
			text = base = await vault.fs.readText(props.path!);
			loaded = true;
		} catch (e) {
			error = e;
		}
	}
	$effect(() => {
		if (props.path && vault.current) void load();
	});
	$effect(() => {
		if (paneId) layout.dirty[paneId] = dirty;
	});
	const off = k.events.on("editor:reveal" as never, (m: { path: string; line: number }) => m.path === props.path && area?.reveal(m.line));
	const veto = k.lifecycle.onWillShutdown((e) => dirty && e.veto(true, `${props.path} has unsaved changes`));
	onDestroy(() => {
		off.dispose();
		veto.dispose();
	});

	async function save() {
		const before = base;
		await vault.fs.write(props.path!, text);
		base = text;
		k.history.push({ label: `Save ${props.path}`, undo: async () => { await vault.fs.write(props.path!, before); text = base = before; } });
		notify.toast("Saved", "success");
	}
</script>

{#if error}
	<ErrorCard {error} title="Could not open this file" reset={() => { error = null; void load(); }} />
{:else}
	<div class="flex h-full min-h-0 flex-col" role="presentation" onkeydown={(e) => (e.ctrlKey || e.metaKey) && e.key === "s" && (e.preventDefault(), e.stopPropagation(), void save())}>
		{#if vault.current?.readonly}<div class="border-b border-border bg-muted px-3 py-1 text-xs text-muted-foreground">Read only: this vault is open in another instance.</div>{/if}
		<CodeArea bind:this={area} bind:value={text} label={props.path} readonly={vault.current?.readonly} />
	</div>
{/if}
