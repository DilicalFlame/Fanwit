<script lang="ts">
	import { getKernel, useT } from "../../ui.svelte";
	import Icon from "../../icons/Icon.svelte";
	import { enter } from "../../motion/motion";
	import SettingControl from "./SettingControl.svelte";
	import KeybindingsEditor from "./KeybindingsEditor.svelte";
	import { CATEGORY_ORDER } from "../../core/settings";
	import type { SettingDef, SettingScope } from "../../settings/define";
	import { LAYERS } from "../../settings/settings.svelte";
	import About from "../system/About.svelte";
	import TomlEditor from "../TomlEditor.svelte";

	/**
	 * Settings window (Figure 17.8), generated from the registry: categories, search with
	 * @modified @vault @experimental @plugin:<id> @id:<key> filters, scope tabs, modified bars,
	 * gear menu (reset, copy id, copy TOML, all layers), badges, and Open as TOML.
	 */
	let { props }: { props: { page?: string } } = $props();
	const k = getKernel();
	const t = useT();
	const s = k.sys.settings;
	// svelte-ignore state_referenced_locally (seeded once from the props it opened with)
	let page = $state(props.page && !props.page.startsWith("@") ? props.page : "General");
	// svelte-ignore state_referenced_locally (seeded once from the props it opened with)
	let query = $state(props.page?.startsWith("@") ? props.page : "");
	let scope = $state<SettingScope>("global");
	let showToml = $state(false);
	let layersFor = $state<string | null>(null);
	let gearFor = $state<string | null>(null);
	const CUSTOM = ["Keyboard", "About"];

	const all = $derived(s.list().filter((d) => !d.deprecated || s.isModified(d.key)));
	const pluginGroups = $derived([...new Set(all.filter((d) => k.modules.modules.get(d.owner)?.def.tier === "plugin").map((d) => d.owner))]);
	const categories = $derived([...new Set([...CATEGORY_ORDER, ...all.map((d) => d.category ?? "Other")])].filter((c) => CUSTOM.includes(c) || all.some((d) => (d.category ?? "Other") === c && k.modules.modules.get(d.owner)?.def.tier !== "plugin")));

	function matches(d: SettingDef & { owner: string }) {
		for (const tok of query.split(/\s+/).filter(Boolean)) {
			if (tok === "@modified") {
				if (!s.isModified(d.key, scope)) return false;
			} else if (tok === "@vault") {
				if (!(d.scope ?? ["global", "vault"]).includes("vault")) return false;
			} else if (tok === "@experimental") {
				if (!d.experimental) return false;
			} else if (tok.startsWith("@plugin:")) {
				if (d.owner !== tok.slice(8)) return false;
			} else if (tok.startsWith("@id:")) {
				if (!d.key.startsWith(tok.slice(4))) return false;
			} else {
				const hay = `${d.title ?? ""} ${d.description ?? ""} ${s.title(d)} ${s.describe(d) ?? ""} ${d.key} ${JSON.stringify(s.get(d.key))}`.toLowerCase();
				if (!hay.includes(tok.toLowerCase())) return false;
			}
		}
		return true;
	}
	const rows = $derived(
		(query ? all.filter(matches) : all.filter((d) => (pluginGroups.includes(page) ? d.owner === page : (d.category ?? "Other") === page))).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
	);
	const scopeAllowed = (d: SettingDef) => (d.scope ?? ["global", "vault"]).includes(scope);
	const valueIn = (d: SettingDef) => (scope === "global" ? s.get(d.key) : (s.inspect(d.key)[scope] ?? s.get(d.key)));
	const visibleRow = (d: SettingDef) => !d.when || k.context.evaluate(d.when);

	async function change(d: SettingDef, v: unknown) {
		try {
			await s.set(d.key, v, { scope });
			if (d.restart) k.sys.notify.send({ title: t("ui.settings.restartNeeded", "{name} changes after a restart", { name: s.title(d) }), kind: "info", actions: [{ label: t("ui.settings.restartNow", "Restart now"), command: "app.reload" }] });
		} catch (e) {
			k.sys.notify.error(e);
		}
	}
</script>

<div class="flex h-full min-h-0">
	<nav class="flex w-56 shrink-0 flex-col gap-0.5 overflow-auto border-r border-border bg-sidebar p-2" aria-label={t("ui.settings.categories", "Settings categories")}>
		<div class="relative mb-2">
			<Icon name="search" size={13} class="absolute top-2 left-2 text-muted-foreground" />
			<input class="fw-input pl-7 text-xs" placeholder={t("ui.settings.search", "Search settings")} aria-label={t("ui.settings.search", "Search settings")} bind:value={query} />
		</div>
		{#each categories as c (c)}
			<button class="rounded px-2 py-1 text-left text-[13px] {page === c && !query ? 'bg-sidebar-accent font-medium' : 'hover:bg-sidebar-accent/60'}" onclick={() => { page = c; query = ""; }}>{s.categoryTitle(c)}</button>
		{/each}
		{#if pluginGroups.length}
			<div class="fw-section-title px-2">{s.categoryTitle("Plugins")}</div>
			{#each pluginGroups as p (p)}
				<button class="rounded px-2 py-1 text-left text-[13px] {page === p ? 'bg-sidebar-accent' : 'hover:bg-sidebar-accent/60'}" onclick={() => (page = p)}>{k.modules.modules.get(p)?.def.title ?? p}</button>
			{/each}
		{/if}
		<div class="mt-auto flex flex-wrap gap-1 pt-2 text-[11px] text-muted-foreground">
			{#each ["@modified", "@vault", "@experimental"] as f (f)}<button class="rounded bg-muted px-1.5 hover:text-foreground" onclick={() => (query = f)}>{f}</button>{/each}
		</div>
	</nav>

	<div class="flex min-w-0 flex-1 flex-col">
		<div class="flex h-10 shrink-0 items-center gap-2 border-b border-border px-4">
			{#if !CUSTOM.includes(page) || query}
				<div role="tablist" aria-label={t("ui.settings.scope", "Scope")} class="flex rounded-md border border-border p-0.5 text-xs">
					{#each [["global", "User"], ["vault", "Vault"], ["window", "Window"]] as [sc, label] (sc)}
						<button role="tab" aria-selected={scope === sc} disabled={sc === "vault" && !k.sys.vault.current} class="h-6 rounded px-3 disabled:opacity-40 {scope === sc ? 'bg-accent' : ''}" onclick={() => (scope = sc as SettingScope)}>{t(`ui.settings.scope.${sc}`, label)}</button>
					{/each}
				</div>
			{/if}
			<span class="flex-1"></span>
			<button class="fw-btn h-7" aria-pressed={showToml} onclick={() => (showToml = !showToml)}><Icon name="file-code" size={13} /> {t("ui.settings.openToml", "Open as TOML")}</button>
		</div>
		<div class="flex min-h-0 flex-1">
			<div class="min-w-0 flex-1 overflow-auto px-6 py-4">
				{#key page}
				<div use:enter={"rise"}>
				{#if page === "Keyboard" && !query}
					<KeybindingsEditor />
				{:else if page === "About" && !query}
					<About />
				{:else}
					<h1 class="mb-3 text-lg font-semibold">{query ? t("ui.settings.results", "Results for \"{query}\"", { query }) : (k.modules.modules.get(page)?.def.title ?? s.categoryTitle(page))}</h1>
					{#if page === "Menus" && !query}
						<button class="fw-btn mb-4" onclick={() => k.commands.run("menus.edit")}><Icon name="list-tree" size={13} /> {k.commands.title("menus.edit")}</button>
					{/if}
					{#if page === "Plugins" && !query}
						<button class="fw-btn mb-4" onclick={() => k.commands.run("plugins.open")}><Icon name="puzzle" size={13} /> {k.commands.title("plugins.open")}</button>
					{/if}
					{#each rows as d (d.key)}
						{#if visibleRow(d)}
							{@const modified = s.isModified(d.key, scope)}
							<div class="group relative flex flex-wrap items-start gap-x-6 gap-y-2 border-b border-border/60 py-3 pl-3 {scopeAllowed(d) ? '' : 'opacity-50'}">
								{#if modified}<span class="absolute top-3 bottom-3 left-0 w-0.5 rounded bg-tab-border" aria-label="modified"></span>{/if}
								<div class="min-w-64 flex-1">
									<div class="flex flex-wrap items-center gap-1.5 text-[13px] font-medium">
										{s.title(d)}
										{#if d.restart}<span class="rounded bg-warning-muted px-1 text-[10px] text-warning">{t("ui.settings.restart", "restart")}</span>{/if}
										{#if d.experimental}<span class="rounded bg-info-muted px-1 text-[10px] text-info">{t("ui.settings.experimental", "experimental")}</span>{/if}
										{#if d.deprecated}<span class="rounded bg-muted px-1 text-[10px]">{t("ui.settings.deprecated", "deprecated")}</span>{/if}
										{#if s.cliOverridden(d.key)}<span class="flex items-center gap-0.5 rounded bg-muted px-1 text-[10px]" title={t("ui.settings.cliOverride", "Overridden by a CLI flag or environment variable for this process")}><Icon name="terminal" size={10} />CLI</span>{/if}
									</div>
									{#if d.description}<div class="mt-0.5 text-xs text-muted-foreground">{s.describe(d)}</div>{/if}
									<div class="mt-0.5 font-mono text-[10.5px] text-muted-foreground/70">{d.key}</div>
								</div>
								<div class="flex items-center gap-2">
									{#if scopeAllowed(d)}
										<SettingControl def={d} value={valueIn(d)} onchange={(v) => change(d, v)} />
									{:else}
										<span class="text-xs text-muted-foreground">{t("ui.settings.notInScope", "Not available in this scope")}</span>
									{/if}
									<div class="relative">
										<button class="fw-icon-btn opacity-0 group-hover:opacity-100 focus-visible:opacity-100" aria-label={t("ui.settings.moreActions", "More actions for {name}", { name: s.title(d) })} onclick={() => (gearFor = gearFor === d.key ? null : d.key)}><Icon name="settings" size={14} /></button>
										{#if gearFor === d.key}
											<div role="menu" tabindex="-1" class="absolute right-0 z-10 w-52 rounded-md border border-border bg-popover p-1 shadow-lg" onmouseleave={() => (gearFor = null)}>
												<button role="menuitem" class="fw-menu-row" onclick={() => { void s.reset(d.key, { scope }); gearFor = null; }}>{t("ui.settings.reset", "Reset")}</button>
												<button role="menuitem" class="fw-menu-row" onclick={() => { void navigator.clipboard.writeText(d.key); gearFor = null; }}>{t("ui.settings.copyId", "Copy setting id")}</button>
												<button role="menuitem" class="fw-menu-row" onclick={() => { void navigator.clipboard.writeText(s.tomlFor(d.key)); gearFor = null; }}>{t("ui.settings.copyToml", "Copy as TOML")}</button>
												<button role="menuitem" class="fw-menu-row" onclick={() => { showToml = true; gearFor = null; }}>{t("ui.settings.showInFile", "Show in file")}</button>
												<button role="menuitem" class="fw-menu-row" onclick={() => { layersFor = d.key; gearFor = null; }}>{t("ui.settings.showLayers", "Show all layers")}</button>
											</div>
										{/if}
									</div>
								</div>
								{#if layersFor === d.key}
									{@const ins = s.inspect(d.key)}
									<div class="w-full rounded-md bg-muted/50 p-2 font-mono text-[11px]">
										{#each LAYERS as l (l)}
											<div class="flex gap-2 {ins.source === l ? 'font-semibold text-foreground' : 'text-muted-foreground'}"><span class="w-16">{l}</span><span>{JSON.stringify((ins as unknown as Record<string, unknown>)[l]) ?? "–"}</span></div>
										{/each}
										<button class="mt-1 text-[10px] underline" onclick={() => (layersFor = null)}>{t("ui.settings.hide", "hide")}</button>
									</div>
								{/if}
							</div>
						{/if}
					{:else}
						<p class="text-sm text-muted-foreground">{t("ui.settings.noMatch", "No settings match.")}</p>
					{/each}
				{/if}
				</div>
				{/key}
			</div>
			{#if showToml}
				<div class="flex w-[45%] min-w-80 border-l border-border">
					<TomlEditor paneId={null} props={{ file: scope === "vault" ? "vault-settings" : "settings" }} />
				</div>
			{/if}
		</div>
	</div>
</div>
