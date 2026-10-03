<script lang="ts">
	import { getKernel } from "../ui.svelte";
	import Icon from "../icons/Icon.svelte";
	import CodeArea from "./CodeArea.svelte";
	import type { TomlFile } from "../data/toml-file.svelte";

	/**
	 * The in app TOML editor for every live file: line numbers, diagnostics with squiggle markers,
	 * save with Ctrl+S, and a reconcile bar when the file changes on disk while you have edits.
	 */
	let { paneId, props }: { paneId: string | null; props: { file?: string; line?: number } } = $props();
	const k = getKernel();
	const s = k.sys;
	const files: Record<string, () => TomlFile | null | undefined> = {
		workspace: () => s.layout.file as unknown as TomlFile,
		settings: () => s.settings.global,
		"vault-settings": () => s.settings.vault,
		keys: () => s.keysFile,
		menus: () => s.menus.file as unknown as TomlFile,
		commands: () => s.userCommands
	};
	let which = $state(props.file ?? "workspace");
	const file = $derived(files[which]?.() ?? null);
	let text = $state("");
	let base = $state("");
	const dirty = $derived(text !== base);
	const diskChanged = $derived(!!file && file.text !== base && dirty);

	$effect(() => {
		const f = file;
		if (!f) return;
		if (!dirty || !base) {
			text = f.text;
			base = f.text;
		}
	});
	$effect(() => {
		if (paneId) s.layout.dirty[paneId] = dirty;
	});

	async function save() {
		if (!file) return;
		const ok = await file.writeText(text);
		base = text;
		if (!ok) s.notify.send({ title: `${which}.toml has problems`, body: "The previous valid state is kept until the file is fixed.", kind: "warning" });
		else s.notify.toast("Saved", "success");
	}
	function keys(e: KeyboardEvent) {
		if ((e.ctrlKey || e.metaKey) && e.key === "s") {
			e.preventDefault();
			e.stopPropagation();
			void save();
		}
	}
</script>

<div class="flex h-full min-h-0 flex-col" role="presentation" onkeydown={keys}>
	<div class="flex h-8 shrink-0 items-center gap-2 border-b border-border px-2 text-xs">
		<select class="fw-input h-6 w-auto text-xs" aria-label="File" bind:value={which}>
			{#each Object.keys(files) as f (f)}<option value={f} disabled={!files[f]()}>{f}.toml</option>{/each}
		</select>
		<span class="truncate text-muted-foreground" title={file?.path}>{file?.path ?? "Not available (open a vault?)"}</span>
		<span class="flex-1"></span>
		{#if file?.diagnostics.length}
			<span class="flex items-center gap-1 text-warning"><Icon name="triangle-alert" size={13} />{file.diagnostics.length} problem{file.diagnostics.length > 1 ? "s" : ""}</span>
		{:else if file}
			<span class="flex items-center gap-1 text-success"><Icon name="circle-check" size={13} />valid</span>
		{/if}
		<button class="fw-btn h-6" disabled={!dirty} onclick={save}>Save</button>
	</div>
	{#if diskChanged}
		<div class="flex items-center gap-2 border-b border-border bg-warning-muted px-3 py-1 text-xs" role="alert">
			<Icon name="info" size={13} /> The file changed on disk.
			<button class="fw-btn h-6" onclick={() => (base = file!.text)}>Keep mine</button>
			<button class="fw-btn h-6" onclick={() => { text = file!.text; base = file!.text; }}>Load from disk</button>
		</div>
	{/if}
	<CodeArea bind:value={text} diagnostics={file?.diagnostics ?? []} gotoLine={props.line} label="{which}.toml" />
</div>
