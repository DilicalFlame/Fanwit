<script lang="ts">
	import { parse } from "smol-toml";
	import { getKernel } from "../../ui.svelte";
	import Icon from "../../icons/Icon.svelte";
	import CodeArea from "../CodeArea.svelte";
	import { validateLayout } from "../../layout/validate";
	import { childNodes, nodePanes, type LayoutDoc } from "../../layout/model";

	/**
	 * Layout Lab (Figure 17.14): edit workspace.toml on the left, see the schematic on the right,
	 * with the action log demonstrating two way sync (origin ui, file, command, cli).
	 */
	const k = getKernel();
	const layout = k.sys.layout;
	let text = $state(layout.toToml());
	let base = $state(layout.toToml());
	const dirty = $derived(text !== base);
	$effect(() => {
		const t = layout.file?.text ?? "";
		if (!dirty) {
			text = t;
			base = t;
		}
	});
	const diags = $derived.by(() => {
		try {
			return validateLayout(parse(text), text, { views: new Set(layout.views.keys()), nodeTypes: new Set(layout.nodeTypes.keys()) });
		} catch (e) {
			const err = e as Error & { line?: number; column?: number };
			return [{ file: "workspace.toml", line: err.line, column: err.column, message: err.message.split("\n")[0], severity: "error" as const }];
		}
	});
	const valid = $derived(!diags.some((d) => d.severity === "error"));
	let timer: ReturnType<typeof setTimeout>;
	$effect(() => {
		// apply valid edits live, as if saved
		void text;
		clearTimeout(timer);
		if (!dirty || !valid || !layout.file) return;
		timer = setTimeout(async () => {
			const t0 = performance.now();
			await layout.file!.writeText(text);
			base = text;
			layout.actionLog = [{ time: Date.now(), origin: "file", type: "edit", detail: "Layout Lab", ms: performance.now() - t0 }, ...layout.actionLog];
		}, 400);
	});
	const doc = $derived(layout.doc);
	const nodes = $derived(Object.keys(doc.node).length + Object.keys(doc.pane).length);

	function copyAsCode(d: LayoutDoc) {
		const w = d.window.main;
		const nodeCode = (id: string): string => {
			const n = d.node[id];
			if (!n) return `/* missing ${id} */`;
			if (n.type === "split") return `split("${(n as { dir: string }).dir}", [${childNodes(n).map(nodeCode).join(", ")}])`;
			return `${n.type}([${nodePanes(n).map((p) => `pane("${d.pane[p]?.view}"${d.pane[p]?.props ? `, ${JSON.stringify(d.pane[p].props)}` : ""})`).join(", ")}])`;
		};
		const regions = Object.entries(w.regions ?? {})
			.filter(([, r]) => r?.node)
			.map(([name, r]) => `\t\t${name}: ${nodeCode(r!.node!)},`)
			.join("\n");
		const code = `export default defineLayout(({ window, split, tabs, pane, stack }) => [\n\twindow("main", { frame: "${w.frame ?? "workbench"}" }, {\n${regions}\n\t}),\n]);\n`;
		void navigator.clipboard.writeText(code);
		k.sys.notify.toast("defineLayout code copied", "success");
	}
</script>

{#snippet schematic(id: string)}
	{@const n = doc.node[id]}
	{#if n?.type === "split"}
		<div class="flex flex-1 gap-1 {(n as { dir: string }).dir === 'row' ? 'flex-row' : 'flex-col'}">
			{#each childNodes(n) as c (c)}<div class="flex min-h-8 min-w-8 flex-1">{@render schematic(c)}</div>{/each}
		</div>
	{:else if n}
		<button class="flex flex-1 flex-col items-start rounded border border-border bg-card p-1 text-left text-[10px] {layout.activeTabset === id ? 'ring-1 ring-primary' : ''}" onclick={() => { const p = nodePanes(n)[0]; if (p) layout.focusPane(p); }}>
			<b>{id}</b><span class="text-muted-foreground">{n.type}: {nodePanes(n).join(", ") || "empty"}</span>
		</button>
	{/if}
{/snippet}

<div class="flex h-full min-h-0 flex-col">
	<div class="flex h-9 shrink-0 items-center gap-2 border-b border-border px-2 text-xs">
		<b>LAYOUT LAB</b>
		<select class="fw-input h-7 w-40 text-xs" aria-label="Preset" value={doc.preset ?? ""} onchange={(e) => layout.applyPreset((e.currentTarget as HTMLSelectElement).value)}>
			<option value="" disabled>Preset…</option>
			{#each [...layout.presets.values()] as p (p.id)}<option value={p.id}>{p.title}</option>{/each}
		</select>
		<button class="fw-btn h-7" onclick={() => layout.reset()}>Reset</button>
		<button class="fw-btn h-7" onclick={() => copyAsCode(doc)}>Copy as code</button>
		<span class="flex-1"></span>
		<span class="flex items-center gap-1 {valid ? 'text-success' : 'text-destructive'}"><Icon name={valid ? "circle-check" : "circle-x"} size={13} />{valid ? "valid" : "invalid: previous layout kept"} · {nodes} nodes</span>
	</div>
	<div class="flex min-h-0 flex-1">
		<div class="flex min-w-0 flex-1 flex-col border-r border-border">
			{#if layout.file}
				<CodeArea bind:value={text} diagnostics={diags} label="workspace.toml (live)" />
			{:else}
				<p class="p-4 text-sm text-muted-foreground">Layout persistence is off (persist = "none").</p>
			{/if}
		</div>
		<div class="flex w-[45%] min-w-72 flex-col">
			<div class="flex min-h-0 flex-1 flex-col gap-1 p-3">
				{#each Object.entries(doc.window.main?.regions ?? {}).filter(([, r]) => r?.node) as [name, r] (name)}
					<div class="text-[10px] font-semibold text-muted-foreground uppercase">{name}{r?.visible === false ? " (hidden)" : ""}</div>
					<div class="flex min-h-10 {name === 'main' ? 'flex-1' : ''}">{@render schematic(r!.node!)}</div>
				{/each}
				{#each Object.entries(doc.float ?? {}) as [id, f] (id)}<div class="text-[10px]">float <b>{id}</b>: {f.pane} at {f.rect.join(", ")}</div>{/each}
			</div>
			<div class="h-48 shrink-0 overflow-auto border-t border-border p-2 font-mono text-[11px]" aria-label="Action log">
				<div class="fw-section-title px-0">Action log</div>
				{#each layout.actionLog.slice(0, 50) as e, i (i)}
					<div><span class="text-muted-foreground">{new Date(e.time).toLocaleTimeString(undefined, { hour12: false })}</span> <b>{e.origin}</b>: {e.type} {e.detail ?? ""} <span class="text-muted-foreground">({e.ms} ms)</span></div>
				{/each}
			</div>
		</div>
	</div>
</div>
