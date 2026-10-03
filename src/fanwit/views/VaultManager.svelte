<script lang="ts">
	import { getKernel, menu } from "../ui.svelte";
	import { useWindow } from "../windows/windows.svelte";
	import Icon from "../icons/Icon.svelte";
	import { identity } from "../gen/identity";
	import type { RecentVault } from "../data/vault.svelte";

	/**
	 * Vault Manager (Figure 17.3): identity, recent vaults (missing ones greyed with Locate),
	 * row menu, filter when more than five, and exactly one primary action.
	 */
	const k = getKernel();
	const { vault, notify } = k.sys;
	let self: ReturnType<typeof useWindow> | null = null;
	try {
		self = useWindow();
	} catch {
		self = null;
	}
	let list = $state<RecentVault[]>([]);
	let filter = $state("");
	let creating = $state(false);
	let name = $state("My vault");
	let template = $state("empty");
	let busy = $state(false);
	const browser = k.host.kind === "browser";

	$effect(() => {
		void vault.recent().then((l) => (list = l));
	});
	const shown = $derived(list.filter((v) => !filter || `${v.name} ${v.path}`.toLowerCase().includes(filter.toLowerCase())).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.lastOpened - a.lastOpened));

	async function act(fn: () => Promise<unknown>) {
		busy = true;
		try {
			await fn();
			await self?.close(true);
		} catch (e) {
			notify.error(e);
		} finally {
			busy = false;
		}
	}
	const open = (path?: string) => act(() => vault.open(path));
</script>

<div class="flex h-full min-h-0">
	<aside class="flex w-64 shrink-0 flex-col border-r border-border bg-sidebar">
		<div class="flex items-center gap-3 p-4">
			<img src="/favicon.svg" alt="" class="size-9" />
			<div><div class="font-semibold">{identity.name}</div><div class="text-xs text-muted-foreground">Version {identity.version}</div></div>
		</div>
		<div class="fw-section-title">Recent vaults</div>
		{#if list.length > 5}<input class="fw-input mx-3 mb-2 w-auto text-xs" placeholder="Filter vaults" aria-label="Filter vaults" bind:value={filter} />{/if}
		<ul class="min-h-0 flex-1 overflow-auto px-2" aria-label="Recent vaults">
			{#each shown as v (v.path)}
				<li>
					<button
						class="group flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left hover:bg-sidebar-accent {v.missing ? 'opacity-50' : ''} {vault.current?.path === v.path ? 'bg-sidebar-accent' : ''}"
						disabled={busy}
						onclick={() => (v.missing ? act(async () => { const p = await k.host.fs.pickFolder({ title: `Locate ${v.name}` }); if (p) { await vault.forget(v.path); await vault.open(p); } }) : open(v.path))}
						use:menu={{ location: "vault/item", target: { path: v.path, name: v.name } }}
					>
						<span class="flex w-full items-center gap-1 text-sm font-medium">{#if v.pinned}<Icon name="pin" size={11} />{/if}<span class="truncate">{v.name}</span>{#if v.missing}<span class="ml-auto text-[10px]">Locate</span>{/if}</span>
						<span class="w-full truncate text-[11px] text-muted-foreground">{v.path}</span>
					</button>
				</li>
			{:else}
				<li class="px-2 text-xs text-muted-foreground">No recent vaults.</li>
			{/each}
		</ul>
	</aside>
	<main class="flex min-w-0 flex-1 flex-col gap-4 p-6">
		<div>
			<h1 class="text-xl font-semibold">Open a vault</h1>
			<p class="text-sm text-muted-foreground">Vaults are folders. Your notes stay plain files you own.</p>
		</div>
		<div class="flex flex-col divide-y divide-border rounded-lg border border-border">
			<div class="flex items-center gap-4 p-4">
				<div class="flex-1"><div class="text-sm font-medium">Create new vault</div><div class="text-xs text-muted-foreground">Create a folder with a fresh {identity.vaultFolder} setup{browser ? " in browser storage" : ""}.</div></div>
				<button class="fw-btn fw-btn-primary" disabled={busy} onclick={() => (creating = !creating)}>Create</button>
			</div>
			{#if creating}
				<form class="flex flex-wrap items-end gap-2 p-4" onsubmit={(e) => { e.preventDefault(); void act(() => vault.create({ name, template })); }}>
					<label class="flex flex-col gap-1 text-xs">Name<input class="fw-input w-56" bind:value={name} required /></label>
					<label class="flex flex-col gap-1 text-xs">Template<select class="fw-input w-40" bind:value={template}><option value="empty">Empty</option><option value="journal">Journal</option><option value="project">Project</option></select></label>
					<button class="fw-btn" type="submit" disabled={busy || !name.trim()}>{browser ? "Create" : "Choose location and create"}</button>
				</form>
			{/if}
			<div class="flex items-center gap-4 p-4">
				<div class="flex-1"><div class="text-sm font-medium">Open folder as vault</div><div class="text-xs text-muted-foreground">{k.host.caps.fileSystem === "opfs" ? "This browser cannot open real folders; vaults live in browser storage." : "Pick any existing folder."}</div></div>
				<button class="fw-btn" disabled={busy || k.host.caps.fileSystem === "opfs"} onclick={() => open()}>Open</button>
			</div>
			<div class="flex items-center gap-4 p-4">
				<div class="flex-1"><div class="text-sm font-medium">Continue without a vault</div><div class="text-xs text-muted-foreground">Use global data only. You can open a vault any time.</div></div>
				<button class="fw-btn" onclick={() => self?.close(false)}>Continue</button>
			</div>
		</div>
		<div class="mt-auto flex items-center gap-3 text-xs text-muted-foreground">
			<select class="fw-input h-7 w-36 text-xs" aria-label="Language" value={k.sys.settings.get("general.language")} onchange={(e) => k.sys.settings.set("general.language", (e.currentTarget as HTMLSelectElement).value)}>
				{#each k.sys.settings.definition("general.language")?.options ?? [] as o (o)}<option value={o}>{k.sys.settings.definition("general.language")?.labels?.[o] ?? o}</option>{/each}
			</select>
			<button class="hover:underline" onclick={() => k.commands.run("manual.open", { page: "vaults" })}>Help</button>
		</div>
	</main>
</div>
