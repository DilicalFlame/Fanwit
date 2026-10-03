<script lang="ts">
	import { getKernel } from "../ui.svelte";
	import Icon from "../icons/Icon.svelte";
	import EmptyState from "../workbench/EmptyState.svelte";
	import { describePermission, isDataOnly } from "../plugins/manifest";
	import { render } from "../manual/markdown";
	import type { InstalledPlugin } from "../plugins/plugins.svelte";

	/**
	 * Plugin Manager (Figure 17.11): Installed, Browse and Updates. Details show the README,
	 * permissions in plain language, every contribution, activation time, isolation and scope.
	 */
	let { props = {} }: { props?: { compact?: boolean } } = $props();
	const k = getKernel();
	const svc = $derived(k.sys.plugins);
	let tab = $state<"installed" | "browse" | "updates">("installed");
	let selected = $state<string | null>(null);
	let q = $state("");
	const list = $derived((svc?.installed ?? []).filter((p) => !q || `${p.manifest.name} ${p.manifest.description ?? ""}`.toLowerCase().includes(q.toLowerCase())));
	const current = $derived(list.find((p) => `${p.scope}:${p.manifest.id}` === selected) ?? list[0]);
	const mod = $derived(current ? k.modules.list().find((m) => m.def.id === `plugin:${current.manifest.id}`) : undefined);
	const samples = import.meta.glob("/plugins/*/**", { query: "?raw", import: "default" }) as Record<string, () => Promise<string>>;

	async function installSamples() {
		const byPlugin = new Map<string, Record<string, string>>();
		for (const [path, load] of Object.entries(samples)) {
			const [, , id, ...rest] = path.split("/");
			const files = byPlugin.get(id) ?? {};
			files[rest.join("/")] = await load();
			byPlugin.set(id, files);
		}
		for (const files of byPlugin.values()) await svc!.installFromFiles(files);
		k.sys.notify.toast(`Installed ${byPlugin.size} sample plugins. Enable them below.`, "success");
	}
	async function installFolder() {
		const p = await k.host.fs.pickFolder({ title: "Choose a plugin folder (with plugin.toml)" });
		if (p) await svc!.installFromFolder(p).catch((e) => k.sys.notify.error(e));
	}
	const counts = (p: InstalledPlugin) => {
		const c = p.manifest.contributes ?? {};
		return [
			[c.commands?.length ?? 0, "command"],
			[c.statusItems?.length ?? 0, "status item"],
			[c.settings?.length ?? 0, "setting"],
			[Object.values(c.menus ?? {}).flat().length, "menu item"],
			[c.themes?.length ?? 0, "theme"],
			[c.keybindings?.length ?? 0, "keybinding"]
		].filter(([n]) => n) as [number, string][];
	};
</script>

{#if !svc}
	<EmptyState icon="puzzle" title="Plugins are starting" description="The plugin system activates after the first paint." />
{:else}
	<div class="flex h-full min-h-0 flex-col text-[13px]">
		<div class="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
			<div role="tablist" class="flex rounded-md border border-border p-0.5 text-xs">
				{#each [["installed", "Installed"], ["browse", "Browse"], ["updates", `Updates (${svc.updates().length})`]] as [t, label] (t)}
					<button role="tab" aria-selected={tab === t} class="h-6 rounded px-3 {tab === t ? 'bg-accent' : ''}" onclick={() => { tab = t as typeof tab; if (t !== "installed") void svc.loadRegistries(); }}>{label}</button>
				{/each}
			</div>
			<input class="fw-input h-7 max-w-60 text-xs" placeholder="Search plugins" aria-label="Search plugins" bind:value={q} />
			<span class="flex-1"></span>
			{#if k.host.caps.nativeWindows}<button class="fw-btn h-7" onclick={installFolder}><Icon name="folder-input" size={13} />Install from folder</button>{/if}
			<button class="fw-btn h-7" onclick={installSamples}><Icon name="package-plus" size={13} />Install samples</button>
			<button class="fw-icon-btn" title="Reload plugins" aria-label="Reload plugins" onclick={() => svc.reload()}><Icon name="refresh-cw" size={14} /></button>
		</div>
		{#if svc.safeMode || k.sys.settings.get("plugins.safeMode")}
			<div class="border-b border-border bg-warning-muted px-3 py-1 text-xs">Safe mode: code plugins are disabled for this session. Data only plugins still load.</div>
		{/if}
		{#if tab === "installed"}
			<div class="flex min-h-0 flex-1">
				<ul class="w-72 shrink-0 overflow-auto border-r border-border" aria-label="Installed plugins">
					{#each list as p (p.scope + p.manifest.id)}
						<li class="flex items-center gap-2 border-b border-border/60 px-3 py-2 {current === p ? 'bg-accent/60' : ''}">
							<button class="min-w-0 flex-1 text-left" onclick={() => (selected = `${p.scope}:${p.manifest.id}`)}>
								<div class="flex items-center gap-1 font-medium">{p.manifest.name}{#if isDataOnly(p.manifest)}<span class="rounded bg-muted px-1 text-[10px] font-normal">data only</span>{/if}{#if p.scope === "vault"}<span class="rounded bg-info-muted px-1 text-[10px] font-normal text-info">vault</span>{/if}</div>
								<div class="truncate text-xs text-muted-foreground">{p.error ?? p.manifest.description ?? ""}</div>
							</button>
							<button role="switch" aria-checked={p.enabled} aria-label="Enable {p.manifest.name}" class="relative h-5 w-9 shrink-0 rounded-full {p.enabled ? 'bg-primary' : 'bg-input'}" onclick={() => svc.setEnabled(p.manifest.id, p.scope, !p.enabled)}>
								<span class="absolute top-0.5 size-4 rounded-full bg-background shadow transition-all {p.enabled ? 'left-4.5' : 'left-0.5'}"></span>
							</button>
						</li>
					{:else}
						<li class="p-4"><EmptyState icon="puzzle" title="No plugins installed" description="Install the sample plugins to see worker isolation and a data only theme." /></li>
					{/each}
				</ul>
				{#if current}
					<div class="min-w-0 flex-1 overflow-auto p-5">
						<div class="flex items-start gap-3">
							<div class="flex size-10 items-center justify-center rounded-lg bg-muted"><Icon name={isDataOnly(current.manifest) ? "palette" : "puzzle"} size={20} /></div>
							<div class="flex-1">
								<h2 class="text-lg font-semibold">{current.manifest.name}</h2>
								<div class="text-xs text-muted-foreground">v{current.manifest.version}{current.manifest.author ? ` by ${current.manifest.author}` : ""} · {isDataOnly(current.manifest) ? "data only (runs no code)" : current.manifest.isolation === "worker" ? "worker isolated" : "runs in the app (isolation none)"}</div>
							</div>
							<button class="fw-btn" onclick={() => svc.uninstall(current.manifest.id, current.scope)}>Uninstall</button>
						</div>
						{#if current.error}<div class="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">{current.error}</div>{/if}
						<div class="fw-section-title px-0">Permissions</div>
						<ul class="list-disc pl-5 text-xs">{#each current.manifest.permissions as perm (perm)}<li>{describePermission(perm)}</li>{:else}<li class="list-none text-muted-foreground">None needed</li>{/each}</ul>
						<div class="fw-section-title px-0">Contributes</div>
						<div class="flex flex-wrap gap-1.5 text-xs">{#each counts(current) as [n, what] (what)}<span class="rounded bg-muted px-1.5">{n} {what}{n > 1 ? "s" : ""}</span>{:else}<span class="text-muted-foreground">Nothing</span>{/each}</div>
						<div class="fw-section-title px-0">Performance</div>
						<div class="text-xs">{mod?.activationMs !== undefined ? `Activation ${mod.activationMs} ms (${mod.activatedBy})` : mod ? `Not active yet (${current.manifest.activation.join(", ") || "onStartupFinished"})` : "Not loaded"}{mod?.activationMs && mod.activationMs > 50 ? " · over the 50 ms budget" : ""}</div>
						<div class="fw-section-title px-0">Scope</div>
						<div class="text-xs">{current.scope === "vault" ? "Installed in this vault" : "Installed for all vaults"} · {current.enabled ? "enabled" : "disabled"}</div>
						{#if current.readme}<div class="fw-prose mt-4 border-t border-border pt-4">{@html render(current.readme).html}</div>{/if}
					</div>
				{/if}
			</div>
		{:else}
			{@const entries = tab === "browse" ? svc.browse : svc.updates()}
			<div class="min-h-0 flex-1 overflow-auto p-4">
				{#each entries as e (e.id + e.version)}
					<div class="mb-2 flex items-center gap-3 rounded-lg border border-border p-3">
						<div class="flex-1"><div class="font-medium">{e.name} <span class="text-xs text-muted-foreground">v{e.version}</span></div><div class="text-xs text-muted-foreground">{e.description}</div></div>
						<button class="fw-btn" onclick={() => svc.installFromRegistry(e).then(() => k.sys.notify.toast(`Installed ${e.name}`, "success")).catch((err) => k.sys.notify.error(err))}>{tab === "updates" ? "Update" : "Install"}</button>
					</div>
				{:else}
					<EmptyState icon="globe" title={tab === "browse" ? "No registries configured" : "Everything is up to date"} description={tab === "browse" ? "List trusted registry.json URLs in app.config.ts (plugins.registries)." : ""} />
				{/each}
			</div>
		{/if}
	</div>
{/if}
<!-- props.compact reserved for the sidebar -->
{#if props.compact}{/if}
