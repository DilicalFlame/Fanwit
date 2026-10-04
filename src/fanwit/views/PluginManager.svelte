<script lang="ts">
	import { untrack } from "svelte";
	import { getKernel } from "../ui.svelte";
	import Icon from "../icons/Icon.svelte";
	import EmptyState from "../workbench/EmptyState.svelte";
	import { describePermission } from "../plugins/manifest";
	import { render } from "../manual/markdown";
	import { categoryOf, runtimeLabel, type InstalledPlugin, type RegistryEntry } from "../plugins/plugins.svelte";

	/**
	 * Plugin browser (Figure 17.11), laid out like Obsidian's: Installed (yours), Built-in (ship
	 * with the app, off until you turn them on), Community (trusted registries) and CSS snippets.
	 * Cards on the left, the selected plugin's README, permissions and cost on the right.
	 */
	type Tab = "installed" | "builtin" | "community" | "snippets";
	let { props = {} }: { props?: { tab?: Tab } } = $props();
	const k = getKernel();
	const svc = $derived(k.sys.plugins);
	let tab = $state<Tab>(untrack(() => props.tab) ?? "installed");
	let selected = $state<string | null>(null);
	let q = $state("");
	let category = $state("all");

	const matches = (text: string) => !q || text.toLowerCase().includes(q.toLowerCase());
	const inTab = $derived((svc?.installed ?? []).filter((p) => (tab === "builtin" ? p.scope === "builtin" : p.scope !== "builtin")));
	const categories = $derived(["all", ...new Set(inTab.map((p) => categoryOf(p.manifest)))].sort((a, b) => (a === "all" ? -1 : b === "all" ? 1 : a.localeCompare(b))));
	const list = $derived(inTab.filter((p) => (category === "all" || categoryOf(p.manifest) === category) && matches(`${p.manifest.name} ${p.manifest.description ?? ""} ${p.manifest.author ?? ""}`)));
	const current = $derived(list.find((p) => key(p) === selected));
	const mod = $derived(current ? (void k.modules.version, k.modules.modules.get(`plugin:${current.manifest.id}`)) : undefined);
	const community = $derived((svc?.browse ?? []).filter((e) => matches(`${e.name} ${e.description ?? ""}`)));
	const updates = $derived(svc ? (void svc.version, svc.updates()) : []);
	const enabledCount = $derived(inTab.filter((p) => p.enabled).length);

	const key = (p: InstalledPlugin) => `${p.scope}:${p.manifest.id}`;
	const RUNTIME: Record<string, string> = { data: "No code", js: "Worker", wasm: "WebAssembly", sidecar: "Native", "main thread": "Main thread" };

	function setTab(t: Tab) {
		tab = t;
		category = "all";
		selected = null;
		if (t === "community") void svc?.loadRegistries();
	}
	async function installFolder() {
		const p = await k.host.fs.pickFolder({ title: "Choose a plugin folder (with plugin.toml)" });
		if (p) await svc!.installFromFolder(p).catch((e) => k.sys.notify.error(e));
	}
	async function install(e: RegistryEntry) {
		await svc!
			.installFromRegistry(e)
			.then(() => k.sys.notify.toast(`Installed ${e.name}. Turn it on under Installed.`, "success"))
			.catch((err) => k.sys.notify.error(err));
	}
	const toggle = (p: InstalledPlugin) => svc!.setEnabled(p.manifest.id, p.scope, !p.enabled).catch((e) => k.sys.notify.error(e));
	const counts = (p: InstalledPlugin) => {
		const c = p.manifest.contributes ?? {};
		return [
			[c.commands?.length ?? 0, "command"],
			[c.views?.length ?? 0, "view"],
			[c.statusItems?.length ?? 0, "status item"],
			[c.settings?.length ?? 0, "setting"],
			[Object.values(c.menus ?? {}).flat().length, "menu item"],
			[c.themes?.length ?? 0, "theme"],
			[c.styles?.length ?? 0, "stylesheet"],
			[c.keybindings?.length ?? 0, "keybinding"]
		].filter(([n]) => n) as [number, string][];
	};
	const where = (p: InstalledPlugin) => (p.scope === "builtin" ? "Ships with the app" : p.scope === "vault" ? "Installed in this vault" : "Installed for all vaults");
</script>

{#snippet toggleSwitch(p: InstalledPlugin)}
	<button role="switch" aria-checked={p.enabled} aria-label="Turn {p.manifest.name} {p.enabled ? 'off' : 'on'}" class="relative h-5 w-9 shrink-0 rounded-full transition-colors {p.enabled ? 'bg-primary' : 'bg-input'}" onclick={(e) => (e.stopPropagation(), toggle(p))}>
		<span class="absolute top-0.5 size-4 rounded-full bg-background shadow transition-all {p.enabled ? 'left-4.5' : 'left-0.5'}"></span>
	</button>
{/snippet}

{#snippet badge(text: string, tone = "")}
	<span class="rounded px-1.5 py-px text-[10px] font-medium {tone || 'bg-muted text-muted-foreground'}">{text}</span>
{/snippet}

{#if !svc}
	<EmptyState icon="puzzle" title="Plugins are starting" description="The plugin system starts after the first paint." />
{:else}
	<div class="flex h-full min-h-0 flex-col text-[13px]">
		<header class="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
			<div role="tablist" aria-label="Plugin sources" class="flex rounded-md border border-border p-0.5 text-xs">
				{#each [["installed", "Installed"], ["builtin", "Built-in"], ["community", "Community"], ["snippets", "CSS snippets"]] as [t, label] (t)}
					<button role="tab" aria-selected={tab === t} class="flex h-6 items-center gap-1 rounded px-3 {tab === t ? 'bg-accent font-medium' : 'text-muted-foreground hover:text-foreground'}" onclick={() => setTab(t as Tab)}>
						{label}{#if t === "community" && updates.length}<span class="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{updates.length}</span>{/if}
					</button>
				{/each}
			</div>
			<div class="relative max-w-64 flex-1">
				<Icon name="search" size={13} class="absolute top-1/2 left-2 -translate-y-1/2 opacity-50" />
				<input class="fw-input h-7 pl-7 text-xs" placeholder={tab === "snippets" ? "Search snippets" : "Search plugins"} aria-label="Search" bind:value={q} />
			</div>
			<span class="flex-1"></span>
			{#if tab === "installed" && k.host.caps.nativeWindows}<button class="fw-btn h-7" onclick={installFolder}><Icon name="folder-input" size={13} />Install from folder</button>{/if}
			<button class="fw-icon-btn" title="Rescan plugins" aria-label="Rescan plugins" onclick={() => svc.reload()}><Icon name="refresh-cw" size={14} /></button>
		</header>
		{#if svc.safeMode || k.sys.settings.get("plugins.safeMode")}
			<div class="border-b border-border bg-warning-muted px-3 py-1 text-xs">Safe mode: code plugins are off for this session. Appearance plugins and snippets still load.</div>
		{/if}

		{#if tab === "installed" || tab === "builtin"}
			<div class="flex min-h-0 flex-1">
				<div class="flex min-w-0 flex-1 flex-col">
					<div class="flex flex-wrap items-center gap-1.5 px-4 pt-3 pb-2">
						{#each categories as c (c)}
							<button class="rounded-full border px-2.5 py-0.5 text-xs capitalize {category === c ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground'}" aria-pressed={category === c} onclick={() => (category = c)}>{c}</button>
						{/each}
						<span class="ml-auto text-xs text-muted-foreground">{enabledCount} of {inTab.length} on</span>
					</div>
					<div class="min-h-0 flex-1 overflow-auto px-4 pb-4">
						{#if list.length}
							<ul class="grid gap-2" style="grid-template-columns: repeat(auto-fill, minmax(240px, 1fr))" aria-label="Plugins">
								{#each list as p (key(p))}
									<li class="flex flex-col gap-1.5 rounded-lg border p-3 transition-colors {current === p ? 'border-primary bg-accent/40' : 'border-border hover:bg-accent/30'}">
										<div class="flex items-start gap-2.5">
											<div class="flex size-8 shrink-0 items-center justify-center rounded-md {p.enabled ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}"><Icon name={p.manifest.icon ?? (categoryOf(p.manifest) === "appearance" ? "palette" : "puzzle")} size={16} /></div>
											<button class="min-w-0 flex-1 text-left" aria-label="Details of {p.manifest.name}" onclick={() => (selected = current === p ? null : key(p))}>
												<div class="truncate font-medium">{p.manifest.name}</div>
												<div class="truncate text-[11px] text-muted-foreground">{p.manifest.author ? `${p.manifest.author} · ` : ""}v{p.manifest.version}</div>
											</button>
											{@render toggleSwitch(p)}
										</div>
										<p class="line-clamp-2 min-h-8 text-xs text-muted-foreground">{p.error ?? p.manifest.description ?? ""}</p>
										<div class="flex flex-wrap gap-1">
											{@render badge(RUNTIME[runtimeLabel(p.manifest)], runtimeLabel(p.manifest) === "main thread" ? "bg-warning-muted" : "")}
											{#if p.scope === "vault"}{@render badge("Vault", "bg-info-muted text-info")}{/if}
											{#if p.script}{@render badge("Script")}{/if}
											{#if p.error}{@render badge("Needs attention", "bg-destructive/10 text-destructive")}{/if}
										</div>
									</li>
								{/each}
							</ul>
						{:else if tab === "builtin"}
							<EmptyState icon="package" title="No built-in plugins" description="Plugins in this repository's plugins/ folder ship with the app. `pnpm fw plugin new <id>` makes one; `pnpm fw restore` brings back stripped ones." />
						{:else}
							<EmptyState icon="puzzle" title={q ? "No plugins match" : "No plugins installed yet"} description="Browse Community, install a folder, or turn on a Built-in plugin." />
						{/if}
					</div>
				</div>

				{#if current}
					<aside class="w-96 shrink-0 overflow-auto border-l border-border p-5" aria-label="{current.manifest.name} details">
						<div class="flex items-start gap-3">
							<div class="flex size-11 items-center justify-center rounded-lg bg-muted"><Icon name={current.manifest.icon ?? "puzzle"} size={22} /></div>
							<div class="min-w-0 flex-1">
								<h2 class="truncate text-base font-semibold">{current.manifest.name}</h2>
								<div class="text-xs text-muted-foreground">v{current.manifest.version}{current.manifest.author ? ` by ${current.manifest.author}` : ""}</div>
							</div>
							{@render toggleSwitch(current)}
						</div>
						<div class="mt-3 flex flex-wrap gap-1.5">
							{#if current.manifest.contributes?.settings?.length}<button class="fw-btn" onclick={() => k.sys.layout.openView("fanwit.settings", { page: `@plugin:plugin:${current!.manifest.id}` })}><Icon name="settings" size={13} />Options</button>{/if}
							{#each current.manifest.contributes?.views ?? [] as v (v.id)}<button class="fw-btn" disabled={!current.enabled} onclick={() => svc.reveal({ view: v.id })}><Icon name={v.icon ?? "app-window"} size={13} />Open {v.title}</button>{/each}
							{#if current.scope !== "builtin"}<button class="fw-btn fw-btn-danger ml-auto" onclick={() => svc.uninstall(current!.manifest.id, current!.scope as "global" | "vault")}>Uninstall</button>{/if}
						</div>
						{#if current.error}<div class="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">{current.error}</div>{/if}
						<div class="fw-section-title px-0">Runs</div>
						<div class="text-xs">
							{#if runtimeLabel(current.manifest) === "data"}No code: styles, themes or presets only.
							{:else if runtimeLabel(current.manifest) === "wasm"}WebAssembly in its own worker, off the main thread.
							{:else if runtimeLabel(current.manifest) === "sidecar"}A native program in its own process (desktop, asks first).
							{:else if runtimeLabel(current.manifest) === "main thread"}In the app itself (isolation = "none"); permissions are a contract, not a sandbox.
							{:else}JavaScript in its own worker, off the main thread.{/if}
						</div>
						<div class="mt-1 text-xs text-muted-foreground">
							{mod?.activationMs !== undefined ? `Started in ${mod.activationMs} ms (${mod.activatedBy})` : mod ? `Waiting: starts on ${current.manifest.activation.join(", ") || "its first command or view"}` : current.enabled ? "Not loaded" : "Off"}{mod?.activationMs && mod.activationMs > 50 ? " · over the 50 ms budget" : ""}
						</div>
						<div class="fw-section-title px-0">Permissions</div>
						<ul class="list-disc pl-5 text-xs">{#each current.manifest.permissions as perm (perm)}<li>{describePermission(perm)}</li>{:else}<li class="list-none text-muted-foreground">None needed</li>{/each}</ul>
						<div class="fw-section-title px-0">Contributes</div>
						<div class="flex flex-wrap gap-1.5 text-xs">{#each counts(current) as [n, what] (what)}<span class="rounded bg-muted px-1.5">{n} {what}{n > 1 ? "s" : ""}</span>{:else}<span class="text-muted-foreground">Nothing</span>{/each}</div>
						<div class="fw-section-title px-0">Source</div>
						<div class="text-xs">{where(current)}</div>
						{#await svc.readme(current) then md}{#if md}<div class="fw-prose mt-4 border-t border-border pt-4">{@html render(md).html}</div>{/if}{/await}
					</aside>
				{/if}
			</div>
		{:else if tab === "community"}
			<div class="min-h-0 flex-1 overflow-auto p-4">
				{#if community.length}
					<ul class="grid gap-2" style="grid-template-columns: repeat(auto-fill, minmax(260px, 1fr))" aria-label="Community plugins">
						{#each community as e (e.id + e.version)}
							{@const installed = svc.installed.find((p) => p.manifest.id === e.id && p.scope !== "builtin")}
							{@const update = updates.some((u) => u.id === e.id)}
							<li class="flex flex-col gap-1.5 rounded-lg border border-border p-3">
								<div class="flex items-center gap-2"><span class="min-w-0 flex-1 truncate font-medium">{e.name}</span><span class="text-[11px] text-muted-foreground">v{e.version}</span></div>
								<div class="text-[11px] text-muted-foreground">{e.author ?? "Unknown author"}{e.rating ? ` · ★ ${e.rating}` : ""}</div>
								<p class="line-clamp-2 min-h-8 text-xs text-muted-foreground">{e.description ?? ""}</p>
								<div class="flex items-center gap-1">
									{@render badge(RUNTIME[e.runtime === "wasm" ? "wasm" : e.isolation === "none" ? "main thread" : "js"])}
									{#if !e.verified}{@render badge(e.signature ? "Untrusted signature" : "Unsigned", "bg-warning-muted")}{/if}
									<span class="flex-1"></span>
									{#if update}<button class="fw-btn fw-btn-primary" onclick={() => install(e)}>Update</button>{:else if installed}<span class="text-xs text-muted-foreground">Installed</span>{:else}<button class="fw-btn" onclick={() => install(e)}>Install</button>{/if}
								</div>
							</li>
						{/each}
					</ul>
				{:else}
					<EmptyState icon="globe" title={k.sys.config.plugins?.registries?.length ? "Nothing found" : "No registries configured"} description="Community plugins come from registry.json files the app trusts (plugins.registries in app.config.ts). Entries must be signed by a key in plugins.trustedKeys, and every file is checked against its SHA-256." />
				{/if}
			</div>
		{:else}
			{@const snippets = svc.snippets.filter((s) => matches(s.name))}
			<div class="min-h-0 flex-1 overflow-auto p-4">
				<p class="mb-3 max-w-2xl text-xs text-muted-foreground">
					CSS snippets restyle anything without a plugin. Put <code>.css</code> files in the snippets folder and turn them on here. They are sanitized (no remote <code>@import</code> or <code>url()</code>) and update live as you edit them. Scope rules with <code>html[data-preset="blender"]</code> or <code>[data-fw-view="..."]</code>.
				</p>
				<div class="mb-3 flex gap-2">
					<button class="fw-btn" onclick={() => svc.newSnippet("global").then((p) => k.host.reveal(p)).catch((e) => k.sys.notify.error(e))}><Icon name="file-plus" size={13} />New snippet</button>
					<button class="fw-btn" onclick={() => k.host.fs.mkdir(svc.snippetDir("global")!).then(() => k.host.reveal(svc.snippetDir("global")!)).catch((e) => k.sys.notify.error(e))}><Icon name="folder-open" size={13} />Open snippets folder</button>
					{#if k.sys.vault.current}<button class="fw-btn" onclick={() => svc.newSnippet("vault").catch((e) => k.sys.notify.error(e))}><Icon name="file-plus" size={13} />New vault snippet</button>{/if}
				</div>
				<ul class="flex max-w-2xl flex-col rounded-lg border border-border" aria-label="CSS snippets">
					{#each snippets as s (s.scope + s.name)}
						<li class="flex items-center gap-2 border-b border-border/60 px-3 py-2 last:border-0">
							<Icon name="file-code" size={14} class="opacity-60" />
							<span class="min-w-0 flex-1 truncate">{s.name}</span>
							{#if s.scope === "vault"}{@render badge("Vault", "bg-info-muted text-info")}{/if}
							<button role="switch" aria-checked={s.enabled} aria-label="Turn {s.name} {s.enabled ? 'off' : 'on'}" class="relative h-5 w-9 shrink-0 rounded-full {s.enabled ? 'bg-primary' : 'bg-input'}" onclick={() => svc.setSnippet(s.name, s.scope, !s.enabled)}>
								<span class="absolute top-0.5 size-4 rounded-full bg-background shadow transition-all {s.enabled ? 'left-4.5' : 'left-0.5'}"></span>
							</button>
						</li>
					{:else}
						<li class="p-4"><EmptyState icon="file-code" title="No snippets yet" description="Create one, or drop .css files into the snippets folder." /></li>
					{/each}
				</ul>
			</div>
		{/if}
	</div>
{/if}
