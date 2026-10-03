<script lang="ts">
	import { parse } from "smol-toml";
	import { getKernel } from "../../ui.svelte";
	import Icon from "../../icons/Icon.svelte";
	import MenuSurface from "../../workbench/menus/MenuSurface.svelte";
	import { applyPatches, type MenuItem, type MenuPatch, type ResolvedGroup } from "../../menus/menus.svelte";
	import type { ArgSpec } from "../../commands/types";

	/**
	 * Context Menu Editor (Figure 17.7), built only on the public Menu API. The editor never edits
	 * contributions: every change is a patch written to menus.toml.
	 */
	let { props }: { props: { location?: string; item?: string } } = $props();
	const k = getKernel();
	const menus = k.sys.menus;
	let location = $state(props.location ?? "tab/context");
	let selected = $state<string | null>(props.item ?? null);
	let search = $state("");
	let showPatch = $state(false);
	let importing = $state(false);
	let importText = $state("");
	let gallery = $state(false);
	let sim = $state<Record<string, unknown>>({ "selection.count": 2, "selection.locked": false, devMode: true, platform: k.host.platform });
	let targetJson = $state("{}");
	let undoStack = $state<MenuPatch[][]>([]);
	let redoStack = $state<MenuPatch[][]>([]);

	const locations = $derived((void menus.version, [...menus.locations.values()]));
	const owners = $derived.by(() => {
		const groups = new Map<string, typeof locations>();
		for (const l of locations) {
			if (search && !`${l.id} ${l.description ?? ""}`.toLowerCase().includes(search.toLowerCase())) continue;
			const tier = l.user ? "USER" : l.owner ? (k.modules.modules.get(l.owner)?.def.tier === "plugin" ? `PLUGIN ${l.owner}` : k.modules.modules.get(l.owner)?.def.tier === "core" || l.owner.startsWith("fanwit") ? "CORE" : `MODULE ${l.owner}`) : "CORE";
			groups.set(tier, [...(groups.get(tier) ?? []), l]);
		}
		return [...groups.entries()].sort(([a], [b]) => (a === "CORE" ? -1 : b === "CORE" ? 1 : a.localeCompare(b)));
	});
	const patches = $derived((void menus.version, menus.patchesFor(location)));
	const items = $derived((void menus.version, applyPatches(menus.contributed(location), patches)));
	const current = $derived(items.find((i) => i.id === selected));
	const loc = $derived(menus.locations.get(location));

	$effect(() => {
		const sample = loc?.samples?.[0];
		targetJson = JSON.stringify(sample ?? {}, null, 0);
	});
	const target = $derived.by(() => {
		try {
			return JSON.parse(targetJson);
		} catch {
			return {};
		}
	});

	let preview = $state<ResolvedGroup[]>([]);
	$effect(() => {
		void menus.version;
		void sim;
		void target;
		menus.resolve(location, { target, context: { ...sim }, includeHidden: true }).then((g) => (preview = g));
	});
	let previewBox = $state<HTMLDivElement>();
	let box = $state({ x: 0, y: 0 });
	$effect(() => {
		void preview;
		const r = previewBox?.getBoundingClientRect();
		if (r) box = { x: r.left + 16, y: r.top + 16 };
	});

	function write(next: MenuPatch[]) {
		undoStack = [...undoStack, patches];
		redoStack = [];
		menus.setPatches(location, next);
	}
	const add = (p: Omit<MenuPatch, "location">) => write([...patches, { location, ...p }]);
	function undo() {
		const prev = undoStack.at(-1);
		if (!prev) return;
		redoStack = [...redoStack, patches];
		undoStack = undoStack.slice(0, -1);
		menus.setPatches(location, prev);
	}
	function redo() {
		const next = redoStack.at(-1);
		if (!next) return;
		undoStack = [...undoStack, patches];
		redoStack = redoStack.slice(0, -1);
		menus.setPatches(location, next);
	}
	function move(id: string, dir: -1 | 1) {
		const i = items.findIndex((x) => x.id === id);
		const ref = items[i + dir];
		if (!ref) return;
		add({ op: "move", item: id, ...(dir < 0 ? { before: ref.id } : { after: ref.id }) });
	}
	function insert(kind: string) {
		gallery = false;
		const id = `user.${kind.replace(/\W/g, "")}${Date.now().toString(36).slice(-4)}`;
		const kd = menus.kinds.get(kind);
		const props = Object.fromEntries(Object.entries(kd?.props ?? {}).filter(([, s]) => s.default !== undefined).map(([n, s]) => [n, s.default]));
		const item: MenuItem = kind === "action" ? { id, kind, label: "New item", command: "palette.open" } : kind === "submenu" ? { id, kind, label: "New submenu", items: [] } : kind === "separator" ? { id, kind } : { id, kind, label: kd?.title ?? kind, props, command: "fanwit.menuDemo" };
		add({ op: "insert", item, group: current?.group ?? "other", ...(current ? { after: current.id } : {}) });
		selected = id;
	}
	/** Edit a property: user inserted items rewrite their insert patch; contributed items get patches. */
	function edit(field: "label" | "icon" | "when" | "command" | "args" | "props", value: unknown) {
		if (!current) return;
		if (current.userInserted) {
			write(patches.map((p) => (p.op === "insert" && typeof p.item === "object" && p.item.id === current.id ? { ...p, item: { ...p.item, [field]: value } } : p)));
			return;
		}
		if (field === "label") add({ op: "rename", item: current.id, label: String(value) });
		else if (field === "icon") add({ op: "icon", item: current.id, icon: String(value) });
		else if (field === "when") add({ op: "when", item: current.id, when: String(value) });
		else if (field === "props") add({ op: "props", item: current.id, props: value as Record<string, unknown> });
		else k.sys.notify.toast("Commands of contributed items cannot change; hide it and insert your own item instead.");
	}
	const truth = (when?: string) => {
		if (!when) return null;
		try {
			return k.context.evaluate(when, null, sim);
		} catch {
			return "error";
		}
	};
	const ORIGIN: Record<string, string> = { core: "bg-muted", module: "bg-info-muted text-info", plugin: "bg-warning-muted text-warning", user: "bg-success-muted text-success" };
	const kindProps = $derived<Record<string, ArgSpec>>(current ? (menus.kinds.get(current.kind ?? "action")?.props ?? {}) : {});
	const KEYS = $derived(k.context.declared.map((d) => d.key));

	async function doImport() {
		try {
			const doc = parse(importText) as { patch?: MenuPatch[] };
			const extra = (doc.patch ?? []).filter((p) => p.location && p.op);
			menus.setPatches(location, [...patches, ...extra.filter((p) => p.location === location)]);
			for (const l of new Set(extra.filter((p) => p.location !== location).map((p) => p.location))) menus.setPatches(l, [...menus.patchesFor(l), ...extra.filter((p) => p.location === l)]);
			k.sys.notify.toast(`Imported ${extra.length} patches`, "success");
			importing = false;
		} catch (e) {
			k.sys.notify.error(e);
		}
	}
</script>

<div class="flex h-full min-h-0 flex-col text-[13px]">
	<div class="flex h-10 shrink-0 items-center gap-1 border-b border-border px-2">
		<button class="fw-btn h-7" onclick={() => (gallery = !gallery)}><Icon name="plus" size={13} />Add item</button>
		<button class="fw-btn h-7" onclick={() => insert("submenu")}><Icon name="list-tree" size={13} />Add submenu</button>
		<button class="fw-btn h-7" onclick={() => insert("separator")}>Add separator</button>
		<button class="fw-btn h-7" disabled={!current} onclick={() => current && add({ op: current.hidden ? "show" : "hide", item: current.id })}><Icon name={current?.hidden ? "eye" : "eye-off"} size={13} />{current?.hidden ? "Show" : "Hide"}</button>
		<button class="fw-btn h-7" disabled={!current?.patched} onclick={() => current && menus.resetItem(location, current.id)}>Reset item</button>
		<button class="fw-btn h-7" disabled={!patches.length} onclick={() => write([])}>Reset location</button>
		<span class="flex-1"></span>
		<button class="fw-icon-btn" title="Undo" aria-label="Undo" disabled={!undoStack.length} onclick={undo}><Icon name="undo-2" size={14} /></button>
		<button class="fw-icon-btn" title="Redo" aria-label="Redo" disabled={!redoStack.length} onclick={redo}><Icon name="redo-2" size={14} /></button>
		<button class="fw-btn h-7" aria-pressed={showPatch} onclick={() => (showPatch = !showPatch)}>Show patch</button>
		<button class="fw-btn h-7" onclick={() => { void navigator.clipboard.writeText(menus.patchToml(location)); k.sys.notify.toast("Patch copied as TOML", "success"); }}>Export</button>
		<button class="fw-btn h-7" onclick={() => (importing = !importing)}>Import</button>
	</div>
	{#if gallery}
		<div class="grid shrink-0 grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2 border-b border-border bg-muted/30 p-2">
			{#each [{ kind: "action", title: "Action", description: "Icon, label, shortcut" }, ...menus.kinds.values()] as kd (kd.kind)}
				<button class="flex flex-col items-start rounded-md border border-border bg-background p-2 text-left hover:border-primary" onclick={() => insert(kd.kind)}>
					<span class="text-xs font-medium">{kd.title}</span><span class="text-[11px] text-muted-foreground">{kd.description ?? kd.kind}</span>
				</button>
			{/each}
		</div>
	{/if}
	{#if importing}
		<div class="flex shrink-0 gap-2 border-b border-border p-2">
			<textarea class="fw-input h-20 flex-1 py-1 font-mono text-xs" placeholder="Paste [[patch]] TOML" bind:value={importText}></textarea>
			<button class="fw-btn fw-btn-primary" onclick={doImport}>Import</button>
		</div>
	{/if}
	<div class="flex min-h-0 flex-1">
		<nav class="flex w-60 shrink-0 flex-col border-r border-border bg-sidebar" aria-label="Locations">
			<input class="fw-input m-2 w-auto text-xs" placeholder="Search locations" aria-label="Search locations" bind:value={search} />
			<div class="min-h-0 flex-1 overflow-auto pb-2">
				{#each owners as [owner, list] (owner)}
					<div class="fw-section-title">{owner}</div>
					{#each list as l (l.id)}
						{@const count = menus.contributed(l.id).length}
						<button class="flex w-full items-center gap-1 px-3 py-0.5 text-left text-xs hover:bg-sidebar-accent {location === l.id ? 'bg-sidebar-accent font-medium' : ''}" title={l.description} onclick={() => { location = l.id; selected = null; undoStack = []; redoStack = []; }}>
							<span class="flex-1 truncate">{l.id}</span>
							{#if menus.patchesFor(l.id).length}<span class="size-1.5 rounded-full bg-tab-border" aria-label="has user patches"></span>{/if}
							<span class="text-muted-foreground">{count}</span>
						</button>
					{/each}
				{/each}
			</div>
		</nav>

		<div class="flex min-w-0 flex-1 flex-col">
			<div class="flex min-h-0 flex-1 border-b border-border">
				<section class="relative min-w-0 flex-1" aria-label="Live preview">
					<div class="fw-section-title">Live preview <span class="font-normal normal-case">(commands are not executed)</span></div>
					<div bind:this={previewBox} class="relative h-[calc(100%-32px)] overflow-hidden">
						{#key location + JSON.stringify(sim) + targetJson + menus.version}
							{#if preview.length && box.x}
								<MenuSurface groups={preview} x={box.x} y={box.y} {location} {target} inert autofocus={false} onclose={() => {}} />
							{/if}
						{/key}
					</div>
				</section>
				<section class="w-64 shrink-0 overflow-auto border-l border-border p-2 text-xs" aria-label="Context simulator">
					<div class="fw-section-title px-0">Context</div>
					{#each Object.entries(sim) as [key, val] (key)}
						<label class="flex items-center gap-2 py-0.5">
							<span class="flex-1 truncate font-mono">{key}</span>
							{#if typeof val === "boolean"}<input type="checkbox" checked={val} onchange={(e) => (sim = { ...sim, [key]: (e.currentTarget as HTMLInputElement).checked })} />
							{:else}<input class="fw-input h-6 w-24 text-xs" value={String(val)} onchange={(e) => { const v = (e.currentTarget as HTMLInputElement).value; sim = { ...sim, [key]: isNaN(Number(v)) || v === "" ? v : Number(v) }; }} />{/if}
						</label>
					{/each}
					<select class="fw-input mt-1 h-6 text-xs" aria-label="Add context key" onchange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value; if (v) sim = { ...sim, [v]: true }; (e.currentTarget as HTMLSelectElement).value = ""; }}>
						<option value="">+ key…</option>
						{#each KEYS.filter((x) => !(x in sim)) as key (key)}<option value={key}>{key}</option>{/each}
					</select>
					<div class="fw-section-title px-0">Sample target ({loc?.target ?? "any"})</div>
					<textarea class="fw-input h-20 py-1 font-mono text-[11px]" aria-label="Sample target JSON" bind:value={targetJson}></textarea>
				</section>
			</div>

			<section class="min-h-0 flex-1 overflow-auto p-2" aria-label="Items">
				<div class="fw-section-title px-1">Items in {location}</div>
				{#each items as it, i (it.id)}
					{#if i === 0 || items[i - 1].group !== it.group}<div class="px-2 pt-2 text-[10.5px] text-muted-foreground">group: {it.group ?? "other"}</div>{/if}
					<div class="flex items-center gap-1 rounded px-2 py-0.5 {selected === it.id ? 'bg-selection' : 'hover:bg-accent/50'}">
						<button class="flex min-w-0 flex-1 items-center gap-2 text-left {it.hidden ? 'line-through opacity-50' : ''}" onclick={() => (selected = it.id)}>
							<span class="rounded bg-muted px-1 font-mono text-[10px]">{it.kind ?? (it.items || it.submenu ? "submenu" : "action")}</span>
							<span class="truncate">{it.label ?? (it.command ? k.commands.get(it.command)?.def.title : it.id) ?? it.id}</span>
							{#if it.hidden}<span class="text-[10px] text-muted-foreground">user: hidden</span>{/if}
						</button>
						<span class="rounded px-1 text-[10px] {ORIGIN[it.source ?? 'module']}">{it.userInserted ? "user" : it.source === "module" ? it.owner : it.source}</span>
						<button class="fw-icon-btn size-5" aria-label="Move up" onclick={() => move(it.id, -1)}><Icon name="chevron-up" size={12} /></button>
						<button class="fw-icon-btn size-5" aria-label="Move down" onclick={() => move(it.id, 1)}><Icon name="chevron-down" size={12} /></button>
						<button class="fw-icon-btn size-5" aria-label={it.hidden ? "Show" : "Hide"} onclick={() => add({ op: it.hidden ? "show" : "hide", item: it.id })}><Icon name={it.hidden ? "eye-off" : "eye"} size={12} /></button>
					</div>
				{:else}
					<p class="px-2 text-xs text-muted-foreground">No items yet. Add one with the toolbar.</p>
				{/each}
				{#if showPatch}
					<div class="fw-section-title px-1">menus.toml patch</div>
					<pre class="selectable rounded bg-muted p-2 font-mono text-[11px]">{menus.patchToml(location) || "# no patches for this location"}</pre>
				{/if}
			</section>
		</div>

		<aside class="w-72 shrink-0 overflow-auto border-l border-border p-3 text-xs" aria-label="Inspector">
			{#if current}
				<div class="mb-2 text-sm font-semibold">Item: {current.label ?? current.id}</div>
				<div class="flex flex-col gap-2">
					<label class="flex flex-col gap-1">Kind<input class="fw-input h-7 text-xs" value={current.kind ?? "action"} disabled /></label>
					<label class="flex flex-col gap-1">Label<input class="fw-input h-7 text-xs" value={current.label ?? ""} placeholder={current.command ? k.commands.get(current.command)?.def.title : ""} onchange={(e) => edit("label", (e.currentTarget as HTMLInputElement).value)} /></label>
					<label class="flex flex-col gap-1">Icon<input class="fw-input h-7 text-xs" value={current.icon ?? ""} placeholder="lucide name, e.g. star" onchange={(e) => edit("icon", (e.currentTarget as HTMLInputElement).value)} /></label>
					{#each Object.entries(kindProps) as [name, spec] (name)}
						<label class="flex flex-col gap-1">{spec.title ?? name}
							{#if spec.type === "boolean"}
								<input type="checkbox" checked={!!current.props?.[name]} onchange={(e) => edit("props", { [name]: (e.currentTarget as HTMLInputElement).checked })} />
							{:else if spec.type === "enum"}
								<select class="fw-input h-7 text-xs" value={String(current.props?.[name] ?? spec.default ?? "")} onchange={(e) => edit("props", { [name]: (e.currentTarget as HTMLSelectElement).value })}>
									{#each spec.options ?? [] as o (typeof o === "string" ? o : o.value)}<option value={typeof o === "string" ? o : o.value}>{typeof o === "string" ? o : o.label ?? o.value}</option>{/each}
								</select>
							{:else if spec.type === "number"}
								<input type="number" class="fw-input h-7 text-xs" value={current.props?.[name] ?? spec.default} onchange={(e) => edit("props", { [name]: Number((e.currentTarget as HTMLInputElement).value) })} />
							{:else}
								<input class="fw-input h-7 text-xs" value={typeof current.props?.[name] === "object" ? JSON.stringify(current.props?.[name]) : (current.props?.[name] ?? "")} onchange={(e) => { const v = (e.currentTarget as HTMLInputElement).value; let parsed: unknown = v; if (spec.type === "json") try { parsed = JSON.parse(v); } catch { /* keep text */ } edit("props", { [name]: parsed }); }} />
							{/if}
						</label>
					{/each}
					<label class="flex flex-col gap-1">Command
						<select class="fw-input h-7 text-xs" value={current.command ?? ""} disabled={!current.userInserted} onchange={(e) => edit("command", (e.currentTarget as HTMLSelectElement).value)}>
							<option value="">(none)</option>
							{#each k.commands.list() as c (c.def.id)}<option value={c.def.id}>{k.commands.label(c.def.id)}</option>{/each}
						</select>
					</label>
					<label class="flex flex-col gap-1">Args (JSON, ${"{"}target.x{"}"} templates allowed)
						<input class="fw-input h-7 font-mono text-xs" value={JSON.stringify(current.args ?? {})} disabled={!current.userInserted} onchange={(e) => { try { edit("args", JSON.parse((e.currentTarget as HTMLInputElement).value)); } catch { k.sys.notify.toast("Args must be JSON", "warning"); } }} />
					</label>
					<label class="flex flex-col gap-1">When
						<input class="fw-input h-7 font-mono text-xs" list="fw-when-keys" value={current.when ?? ""} placeholder="e.g. !selection.locked" onchange={(e) => edit("when", (e.currentTarget as HTMLInputElement).value)} />
						<datalist id="fw-when-keys">{#each KEYS as key (key)}<option value={key}></option>{/each}</datalist>
						{#if current.when}{@const t = truth(current.when)}<span class={t === true ? "text-success" : t === false ? "text-muted-foreground" : "text-destructive"}>{t === true ? "✓ true in the simulator" : t === false ? "✗ false in the simulator" : "invalid clause"}</span>{/if}
					</label>
					<div class="text-muted-foreground">Origin: {current.userInserted ? "user" : `${current.source} (${current.owner})`}{current.patched ? " · patched" : ""}</div>
				</div>
			{:else}
				<p class="text-muted-foreground">Select an item to edit its properties. Every change is saved as a patch in menus.toml, so app updates keep flowing.</p>
			{/if}
		</aside>
	</div>
</div>
