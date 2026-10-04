<script lang="ts">
	import { onDestroy, tick } from "svelte";
	import { getKernel, menu, useT } from "../ui.svelte";
	import { ctxkeys } from "../kernel/context.svelte";
	import Icon from "../icons/Icon.svelte";
	import EmptyState from "../workbench/EmptyState.svelte";
	import { viewForPath } from "../core/palette";
	import type { Disposable } from "../kernel/disposable";
	import { enter } from "../motion/motion";

	/**
	 * Vault file tree (Figure 17.1 #6): indent guides, selection, keyboard navigation, inline
	 * rename (F2), drag and drop to move, and the explorer/item context menu.
	 */
	const k = getKernel();
	const t = useT();
	const { vault, layout, notify } = k.sys;
	interface Node {
		name: string;
		path: string;
		dir: boolean;
		depth: number;
	}
	let entries = $state<{ name: string; path: string; dir: boolean }[]>([]);
	let open = $state<Record<string, boolean>>({});
	let selected = $state<string | null>(null);
	let renaming = $state<string | null>(null);
	let renameValue = $state("");
	let loading = $state(false);
	// rows shown on first load appear in place; rows revealed later (expanding) cascade in
	let animateRows = $state(false);
	$effect(() => {
		if (!loading && entries.length && !animateRows) requestAnimationFrame(() => (animateRows = true));
	});
	let error = $state<string | null>(null);
	let watcher: Disposable | null = null;
	let dragOver = $state<string | null>(null);

	async function refresh() {
		if (!vault.current) {
			entries = [];
			return;
		}
		loading = true;
		error = null;
		try {
			entries = (await vault.fs.list("", { recursive: true })).map((e) => ({ name: e.name, path: e.path, dir: e.dir }));
		} catch (e) {
			error = String((e as Error).message ?? e);
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		const v = vault.current;
		void refresh();
		watcher?.dispose();
		watcher = null;
		if (v) void vault.fs.watch("**", () => refresh()).then((d) => (watcher = d));
	});
	onDestroy(() => watcher?.dispose());

	const visible = $derived.by(() => {
		const byParent = new Map<string, typeof entries>();
		for (const e of entries) {
			const parent = e.path.includes("/") ? e.path.slice(0, e.path.lastIndexOf("/")) : "";
			byParent.set(parent, [...(byParent.get(parent) ?? []), e]);
		}
		const out: Node[] = [];
		const walk = (dir: string, depth: number) => {
			const kids = (byParent.get(dir) ?? []).sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name, undefined, { numeric: true }));
			for (const c of kids) {
				out.push({ ...c, depth });
				if (c.dir && open[c.path]) walk(c.path, depth + 1);
			}
		};
		walk("", 0);
		return out;
	});

	function activate(n: Node, preview = true) {
		selected = n.path;
		if (n.dir) {
			open[n.path] = !open[n.path];
			return;
		}
		const view = viewForPath(k, n.path);
		if (view) void layout.openView(view, { path: n.path }, { preview: preview && !!k.sys.settings.get("layout.previewTabs") }).catch((e) => notify.error(e));
	}

	function selectedDir() {
		const n = entries.find((e) => e.path === selected);
		if (!n) return "";
		return n.dir ? n.path : n.path.slice(0, Math.max(0, n.path.lastIndexOf("/")));
	}

	async function startRename(path: string) {
		renaming = path;
		renameValue = path.split("/").pop()!;
		await tick();
		const input = document.querySelector<HTMLInputElement>("[data-explorer-rename]");
		input?.focus();
		const dot = renameValue.lastIndexOf(".");
		input?.setSelectionRange(0, dot > 0 ? dot : renameValue.length);
	}
	async function commitRename() {
		const from = renaming;
		renaming = null;
		if (!from || !renameValue.trim() || renameValue === from.split("/").pop()) return;
		const to = (from.includes("/") ? from.slice(0, from.lastIndexOf("/") + 1) : "") + renameValue.trim();
		await k.commands.run("explorer.rename", { path: from, to }).catch((e) => notify.error(e));
	}

	function keys(e: KeyboardEvent) {
		if (renaming) return;
		const i = visible.findIndex((n) => n.path === selected);
		const go = (j: number) => {
			const n = visible[Math.max(0, Math.min(visible.length - 1, j))];
			if (!n) return;
			selected = n.path;
			document.querySelector<HTMLElement>(`[data-explorer-path="${CSS.escape(n.path)}"]`)?.focus();
		};
		const cur = visible[i];
		if (e.key === "ArrowDown") (e.preventDefault(), go(i + 1));
		else if (e.key === "ArrowUp") (e.preventDefault(), go(i - 1));
		else if (e.key === "ArrowRight" && cur?.dir) (e.preventDefault(), cur && !open[cur.path] ? (open[cur.path] = true) : go(i + 1));
		else if (e.key === "ArrowLeft" && cur) {
			e.preventDefault();
			if (cur.dir && open[cur.path]) open[cur.path] = false;
			else {
				const parent = cur.path.slice(0, cur.path.lastIndexOf("/"));
				const pi = visible.findIndex((n) => n.path === parent);
				if (pi >= 0) go(pi);
			}
		} else if (e.key === "Enter" && cur) (e.preventDefault(), activate(cur, false));
		else if (e.key === "F2" && cur) (e.preventDefault(), startRename(cur.path));
		else if (e.key === "Delete" && cur) (e.preventDefault(), void k.commands.run("explorer.delete", { path: cur.path }).catch((err) => notify.error(err)));
	}

	async function drop(e: DragEvent, target: Node | null) {
		e.preventDefault();
		dragOver = null;
		const from = e.dataTransfer?.getData("text/x-fw-path");
		if (!from) return;
		const dir = target ? (target.dir ? target.path : target.path.slice(0, target.path.lastIndexOf("/"))) : "";
		const to = (dir ? dir + "/" : "") + from.split("/").pop();
		if (to !== from && !to.startsWith(from + "/")) await k.commands.run("explorer.rename", { path: from, to }).catch((err) => notify.error(err));
	}
</script>

<div class="flex h-full min-h-0 flex-col" use:ctxkeys={{ focusedView: "fanwit.explorer" }}>
	{#if !vault.current}
		<EmptyState icon="folder-open" title={t("ui.explorer.noVault", "No vault open")} description={t("ui.explorer.noVaultHint", "Open a folder to browse its files here.")}>
			<button class="fw-btn fw-btn-primary" onclick={() => k.commands.run("vault.open").catch((e) => notify.error(e))}>{t("ui.explorer.openFolder", "Open folder")}</button>
			<button class="fw-btn" onclick={() => k.commands.run("vault.switch")}>{t("ui.explorer.vaults", "Vaults…")}</button>
		</EmptyState>
	{:else}
		<div class="flex h-7 shrink-0 items-center gap-0.5 px-2 text-[11px] font-semibold text-muted-foreground uppercase">
			<span class="flex-1 truncate">{vault.current.name}</span>
			<button class="fw-icon-btn" title={k.commands.title("explorer.newFile")} aria-label={k.commands.title("explorer.newFile")} onclick={() => k.commands.run("explorer.newFile", { dir: selectedDir() }, { source: "toolbar" }).catch((e) => notify.error(e))}><Icon name="file-plus" size={14} /></button>
			<button class="fw-icon-btn" title={k.commands.title("explorer.newFolder")} aria-label={k.commands.title("explorer.newFolder")} onclick={() => k.commands.run("explorer.newFolder", { dir: selectedDir() }, { source: "toolbar" }).catch((e) => notify.error(e))}><Icon name="folder-plus" size={14} /></button>
			<button class="fw-icon-btn" title={t("ui.explorer.refresh", "Refresh")} aria-label={t("ui.explorer.refresh", "Refresh")} onclick={refresh}><Icon name="refresh-cw" size={13} /></button>
			<button class="fw-icon-btn" title={t("ui.explorer.collapseAll", "Collapse all")} aria-label={t("ui.explorer.collapseAll", "Collapse all")} onclick={() => (open = {})}><Icon name="chevrons-down-up" size={14} /></button>
		</div>
		<div
			role="tree"
			tabindex="-1"
			aria-label={t("ui.explorer.filesIn", "Files in {name}", { name: vault.current.name })}
			class="min-h-0 flex-1 overflow-auto pb-4"
			onkeydown={keys}
			ondragover={(e) => e.preventDefault()}
			ondrop={(e) => drop(e, null)}
			use:menu={{ location: "explorer/empty", target: { dir: "" } }}
		>
			{#if error}<div class="px-3 py-2 text-xs text-destructive">{error}</div>{/if}
			{#if loading && !entries.length}<div class="px-3 py-2 text-xs text-muted-foreground">{t("ui.loading", "Loading…")}</div>{/if}
			{#if !loading && !entries.length}<div class="px-3 py-2 text-xs text-muted-foreground">{t("ui.explorer.empty", "This vault is empty. Right click to create a file.")}</div>{/if}
			{#each visible as n (n.path)}
				<div
					role="treeitem"
					aria-selected={selected === n.path}
					aria-expanded={n.dir ? !!open[n.path] : undefined}
					aria-level={n.depth + 1}
					tabindex={selected === n.path || (!selected && n === visible[0]) ? 0 : -1}
					data-explorer-path={n.path}
					data-fw-id="explorer-item"
					draggable="true"
					class="relative flex cursor-default items-center gap-1 pr-2 text-[13px] outline-none hover:bg-sidebar-accent/60 focus-visible:ring-1 focus-visible:ring-ring {selected === n.path ? 'bg-selection' : ''} {dragOver === n.path ? 'bg-drop-target' : ''}"
					style:padding-left="{8 + n.depth * 12}px"
					style:height="var(--row-h)"
					onclick={() => activate(n)}
					ondblclick={() => !n.dir && activate(n, false)}
					onfocus={() => (selected = n.path)}
					ondragstart={(e) => e.dataTransfer?.setData("text/x-fw-path", n.path)}
					ondragover={(e) => {
						e.preventDefault();
						dragOver = n.path;
					}}
					ondragleave={() => (dragOver = null)}
					ondrop={(e) => {
						e.stopPropagation();
						void drop(e, n);
					}}
					onkeydown={() => {}}
					use:menu={{ location: "explorer/item", target: { path: n.path, dir: n.dir ? n.path : n.path.slice(0, Math.max(0, n.path.lastIndexOf("/"))), name: n.name, isDir: n.dir } }}
					use:ctxkeys={{ "resource.ext": n.dir ? "" : n.name.split(".").pop(), "resource.path": n.path, "explorer.isDir": n.dir }}
					use:enter={{ preset: "row", when: animateRows }}
				>
					{#each Array(n.depth) as _, d (d)}<span class="absolute top-0 bottom-0 w-px bg-sidebar-border" style:left="{14 + d * 12}px"></span>{/each}
					<Icon name={n.dir ? "chevron-right" : "dot"} size={14} class={n.dir ? `shrink-0 transition-transform duration-150 ${open[n.path] ? "rotate-90" : ""}` : "opacity-0"} />
					<Icon name={n.dir ? (open[n.path] ? "folder-open" : "folder") : n.name.endsWith(".md") ? "file-text" : n.name.endsWith(".toml") ? "file-cog" : "file"} size={14} class="shrink-0 opacity-70" />
					{#if renaming === n.path}
						<input
							data-explorer-rename
							class="fw-input h-5 px-1 text-[13px]"
							bind:value={renameValue}
							onkeydown={(e) => {
								e.stopPropagation();
								if (e.key === "Enter") void commitRename();
								if (e.key === "Escape") renaming = null;
							}}
							onblur={commitRename}
							onclick={(e) => e.stopPropagation()}
						/>
					{:else}
						<span class="truncate">{n.name}</span>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
