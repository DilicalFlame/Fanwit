<script lang="ts">
	import { onDestroy } from "svelte";
	import { getKernel } from "../ui.svelte";
	import { logs, type LogRecord } from "../kernel/logger";
	import Icon from "../icons/Icon.svelte";

	/** Log viewer (Figure 17.19): front and back logs merged, level, scope and text filters, follow tail. */
	const k = getKernel();
	const ORDER = { trace: 0, debug: 1, info: 2, warn: 3, error: 4 } as const;
	let records = $state.raw<LogRecord[]>([...logs.records]);
	let level = $state<keyof typeof ORDER>("debug");
	let scope = $state("");
	let text = $state("");
	let follow = $state(true);
	let list = $state<HTMLDivElement>();
	let pending = false;
	const d = logs.onRecord.on(() => {
		if (pending) return;
		pending = true;
		requestAnimationFrame(() => {
			pending = false;
			records = [...logs.records];
		});
	});
	onDestroy(() => d.dispose());

	const scopes = $derived([...new Set(records.map((r) => r.scope))].sort());
	const shown = $derived(records.filter((r) => ORDER[r.level] >= ORDER[level] && (!scope || r.scope === scope) && (!text || r.message.toLowerCase().includes(text.toLowerCase()))).slice(-2000));
	$effect(() => {
		void shown.length;
		if (follow && list) queueMicrotask(() => list && (list.scrollTop = list.scrollHeight));
	});
	const COLOR = { trace: "text-muted-foreground", debug: "text-info", info: "text-success", warn: "text-warning", error: "text-destructive" } as const;
	const t = (n: number) => new Date(n).toLocaleTimeString(undefined, { hour12: false });
	function copyBundle() {
		void navigator.clipboard.writeText(shown.map((r) => `${new Date(r.time).toISOString()} ${r.level.toUpperCase()} [${r.scope}] ${r.message}${r.fields ? " " + JSON.stringify(r.fields) : ""}${r.location ? ` (${r.location})` : ""}`).join("\n"));
		k.sys.notify.toast("Logs copied", "success");
	}
</script>

<div class="flex h-full min-h-0 flex-col text-xs">
	<div class="flex shrink-0 items-center gap-1.5 border-b border-border px-2 py-1">
		<input class="fw-input h-6 max-w-48 text-xs" placeholder="Filter text" aria-label="Filter text" bind:value={text} />
		<select class="fw-input h-6 w-auto text-xs" aria-label="Minimum level" bind:value={level}>
			{#each Object.keys(ORDER) as l (l)}<option value={l}>{l}+</option>{/each}
		</select>
		<select class="fw-input h-6 w-auto text-xs" aria-label="Scope" bind:value={scope}>
			<option value="">all scopes</option>
			{#each scopes as s (s)}<option value={s}>{s}</option>{/each}
		</select>
		<span class="flex-1"></span>
		<label class="flex items-center gap-1"><input type="checkbox" bind:checked={follow} />Follow</label>
		<button class="fw-icon-btn" title="Copy bundle" aria-label="Copy bundle" onclick={copyBundle}><Icon name="clipboard-copy" size={13} /></button>
		<button class="fw-icon-btn" title="Clear" aria-label="Clear" onclick={() => { logs.records.length = 0; records = []; }}><Icon name="trash-2" size={13} /></button>
	</div>
	<div bind:this={list} class="selectable min-h-0 flex-1 overflow-auto px-2 py-1 font-mono text-[11.5px] leading-5" role="log" aria-live="off">
		{#each shown as r (r.id)}
			<div class="flex gap-2 whitespace-pre-wrap">
				<span class="shrink-0 text-muted-foreground">{t(r.time)}</span>
				<span class="w-11 shrink-0 font-semibold uppercase {COLOR[r.level]}">{r.level}</span>
				<span class="shrink-0 text-muted-foreground">[{r.scope}]{r.source === "back" ? " ⚙" : ""}</span>
				<span class="min-w-0 flex-1 break-words">{r.message}{#if r.fields}<span class="text-muted-foreground"> {JSON.stringify(r.fields)}</span>{/if}</span>
				{#if r.location}<button class="shrink-0 text-muted-foreground hover:underline" onclick={() => { const [f, l] = r.location!.split(/:(?=\d+$)/); void k.commands.run("fanwit.openSource", { file: f, line: Number(l) || 1 }); }}>{r.location.split("/").pop()}</button>{/if}
			</div>
		{:else}
			<div class="py-4 text-center text-muted-foreground">No log records match.</div>
		{/each}
	</div>
</div>
