<script lang="ts">
	import { getKernel } from "../../ui.svelte";
	import { argSpecs } from "../../commands/args";
	import { cliName, formatHuman } from "../../core/cli";
	import { identity } from "../../gen/identity";

	/** Command and CLI Lab: run any command with a generated argument form and see the CLI form. */
	const k = getKernel();
	let id = $state("notify.send");
	let args = $state<Record<string, unknown>>({});
	let output = $state("");
	let ok = $state(true);
	const entry = $derived(k.commands.get(id));
	const specs = $derived(entry ? argSpecs(entry.def.args) : {});
	const cli = $derived.by(() => {
		if (!entry) return "";
		const [g, n] = cliName(entry.def);
		const flags = Object.entries(args)
			.filter(([, v]) => v !== "" && v !== undefined)
			.map(([key, v]) => (v === true ? `--${key}` : v === false ? `--no-${key}` : `--${key} ${JSON.stringify(typeof v === "object" ? JSON.stringify(v) : String(v))}`));
		return `${identity.slug}-cli ${g} ${n} ${flags.join(" ")} --json`;
	});
	async function run() {
		try {
			const r = await k.commands.run(id, Object.fromEntries(Object.entries(args).filter(([, v]) => v !== "")), { source: "api", interactive: true });
			ok = true;
			output = formatHuman(r) || "(no result)";
		} catch (e) {
			ok = false;
			output = String((e as Error).message ?? e);
		}
	}
</script>

<div class="flex h-full flex-col gap-3 overflow-auto p-4 text-[13px]">
	<label class="flex flex-col gap-1">Command
		<select class="fw-input" bind:value={id} onchange={() => (args = {})}>
			{#each k.commands.list().sort((a, b) => a.def.id.localeCompare(b.def.id)) as c (c.def.id)}<option value={c.def.id}>{c.def.id}{c.def.cli ? "  (cli)" : ""}</option>{/each}
		</select>
	</label>
	{#each Object.entries(specs) as [name, s] (name)}
		<label class="flex flex-col gap-1">{s.title ?? name} <span class="text-xs text-muted-foreground">{s.type}{s.required === false || s.default !== undefined ? "" : ", required"}</span>
			{#if s.type === "boolean"}<input type="checkbox" checked={!!args[name]} onchange={(e) => (args[name] = (e.currentTarget as HTMLInputElement).checked)} />
			{:else if s.type === "enum"}<select class="fw-input" value={args[name] ?? s.default ?? ""} onchange={(e) => (args[name] = (e.currentTarget as HTMLSelectElement).value)}><option value=""></option>{#each s.options ?? [] as o (typeof o === "string" ? o : o.value)}<option value={typeof o === "string" ? o : o.value}>{typeof o === "string" ? o : (o.label ?? o.value)}</option>{/each}</select>
			{:else}<input class="fw-input" type={s.type === "number" ? "number" : "text"} value={args[name] ?? ""} placeholder={s.default !== undefined ? String(s.default) : ""} onchange={(e) => { const v = (e.currentTarget as HTMLInputElement).value; args[name] = s.type === "number" ? Number(v) : v; }} />{/if}
		</label>
	{/each}
	<div class="flex gap-2"><button class="fw-btn fw-btn-primary" onclick={run}>Run</button>{#if !entry?.def.cli}<span class="self-center text-xs text-muted-foreground">Not exposed to the CLI (cli: false)</span>{/if}</div>
	{#if entry?.def.cli}<div><div class="fw-section-title px-0">CLI</div><pre class="selectable rounded bg-muted p-2 font-mono text-xs">{cli}</pre></div>{/if}
	{#if output}<div><div class="fw-section-title px-0">Result</div><pre class="selectable rounded p-2 font-mono text-xs {ok ? 'bg-muted' : 'bg-destructive/10 text-destructive'}">{output}</pre></div>{/if}
</div>
