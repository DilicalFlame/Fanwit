<script lang="ts">
	import { getKernel } from "../../ui.svelte";
	import Icon from "../../icons/Icon.svelte";
	import EmptyState from "../../workbench/EmptyState.svelte";

	/**
	 * Database Explorer (Figure 17.19): scope picker, tables grouped by owner prefix, SQL editor,
	 * results with timing, export CSV or JSON. Read only unless developer mode allows writes.
	 */
	const k = getKernel();
	let scope = $state<"global" | "vault">("global");
	let file = $state("app.db");
	let tables = $state<string[]>([]);
	let sql = $state("SELECT name, type FROM sqlite_master ORDER BY name");
	let rows = $state<Record<string, unknown>[]>([]);
	let ms = $state<number | null>(null);
	let error = $state<string | null>(null);
	const dev = $derived((void k.context.version, !!k.context.get("devMode")));
	const available = k.host.caps.sql;

	function db() {
		return k.sys.db.sql("fanwit", { scope, file, readonly: !dev });
	}
	async function loadTables() {
		error = null;
		try {
			tables = await db().tables();
		} catch (e) {
			tables = [];
			error = String((e as Error).message ?? e);
		}
	}
	$effect(() => {
		void scope;
		void file;
		if (available) void loadTables();
	});
	const grouped = $derived.by(() => {
		const m = new Map<string, string[]>();
		for (const t of tables) {
			const owner = t.includes("__") ? t.split("__")[0] + "__" : t.startsWith("_") ? "internal" : "other";
			m.set(owner, [...(m.get(owner) ?? []), t]);
		}
		return [...m.entries()];
	});
	async function run() {
		error = null;
		const t0 = performance.now();
		try {
			rows = await db().query(sql);
			ms = Math.round(performance.now() - t0);
			if (dev) void loadTables();
		} catch (e) {
			error = String((e as Error).message ?? e);
			rows = [];
		}
	}
	const cols = $derived([...new Set(rows.flatMap((r) => Object.keys(r)))]);
	function exportAs(kind: "csv" | "json") {
		const text = kind === "json" ? JSON.stringify(rows, null, 2) : [cols.join(","), ...rows.map((r) => cols.map((c) => JSON.stringify(r[c] ?? "")).join(","))].join("\n");
		void navigator.clipboard.writeText(text);
		k.sys.notify.toast(`${kind.toUpperCase()} copied`, "success");
	}
</script>

{#if !available}
	<EmptyState icon="database" title="SQL is not available on this host" description="The desktop uses SQLite through Rust; browsers need the Origin Private File System for SQLite WASM." />
{:else}
	<div class="flex h-full min-h-0 text-xs">
		<aside class="flex w-56 shrink-0 flex-col border-r border-border">
			<div class="flex flex-col gap-1 p-2">
				<select class="fw-input h-7 text-xs" aria-label="Scope" bind:value={scope}><option value="global">global</option><option value="vault" disabled={!k.sys.vault.current}>vault {k.sys.vault.current ? `(${k.sys.vault.current.name})` : ""}</option></select>
				<select class="fw-input h-7 text-xs" aria-label="Database" bind:value={file}><option value="app.db">app.db</option><option value="state.db">state.db</option></select>
			</div>
			<div class="min-h-0 flex-1 overflow-auto pb-2">
				{#each grouped as [owner, list] (owner)}
					<div class="fw-section-title">{owner}</div>
					{#each list as t (t)}<button class="block w-full truncate px-3 py-0.5 text-left font-mono hover:bg-accent" onclick={() => { sql = `SELECT * FROM "${t}" LIMIT 100`; void run(); }}>{t}</button>{/each}
				{:else}
					<div class="px-3 text-muted-foreground">No tables yet.</div>
				{/each}
			</div>
		</aside>
		<div class="flex min-w-0 flex-1 flex-col">
			<div class="flex gap-2 border-b border-border p-2">
				<textarea class="fw-input h-16 flex-1 py-1 font-mono text-xs" aria-label="SQL" bind:value={sql} onkeydown={(e) => (e.ctrlKey || e.metaKey) && e.key === "Enter" && run()}></textarea>
				<button class="fw-btn fw-btn-primary self-start" onclick={run}><Icon name="play" size={13} />Run</button>
			</div>
			{#if error}<div class="border-b border-border bg-destructive/10 px-3 py-1 text-destructive">{error}</div>{/if}
			<div class="min-h-0 flex-1 overflow-auto">
				<table class="w-full border-collapse font-mono text-[11.5px]">
					<thead class="sticky top-0 bg-muted"><tr>{#each cols as c (c)}<th class="border-b border-border px-2 py-1 text-left font-medium">{c}</th>{/each}</tr></thead>
					<tbody>{#each rows as r, i (i)}<tr class="hover:bg-accent/40">{#each cols as c (c)}<td class="selectable max-w-80 truncate border-b border-border/50 px-2 py-0.5">{typeof r[c] === "object" ? JSON.stringify(r[c]) : String(r[c] ?? "")}</td>{/each}</tr>{/each}</tbody>
				</table>
			</div>
			<div class="flex items-center gap-2 border-t border-border px-2 py-1 text-muted-foreground">
				{rows.length} rows{ms !== null ? ` in ${ms} ms` : ""} · {dev ? "writes allowed (developer mode)" : "read only unless developer mode"}
				<span class="flex-1"></span>
				<button class="fw-btn h-6" disabled={!rows.length} onclick={() => exportAs("csv")}>CSV</button>
				<button class="fw-btn h-6" disabled={!rows.length} onclick={() => exportAs("json")}>JSON</button>
			</div>
		</div>
	</div>
{/if}
