<script lang="ts">
	import { getKernel } from "../../ui.svelte";
	import type { SettingDef } from "../../settings/define";
	import { haptic } from "../../motion/motion";

	/** Control generated from a setting's schema or its widget override. */
	let { def, value, onchange }: { def: SettingDef; value: unknown; onchange: (v: unknown) => void } = $props();
	const k = getKernel();
	const widget = $derived(def.widget ?? (def.type === "boolean" ? "switch" : def.type === "enum" ? ((def.options?.length ?? 0) <= 3 ? "segmented" : "select") : def.type));
	let draft = $state("");
	$effect(() => {
		draft = def.type === "json" ? JSON.stringify(value ?? def.default, null, 1) : def.type === "string[]" ? ((value as string[] | undefined) ?? []).join(", ") : String(value ?? "");
	});
	const label = (o: string) => k.sys.settings.optionLabel(def, o);
</script>

{#if widget === "switch"}
	<button role="switch" aria-checked={!!value} aria-label={def.title ?? def.key} class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors {value ? 'bg-primary' : 'bg-input'}" onclick={() => (haptic("select"), onchange(!value))}>
		<span class="absolute size-4 rounded-full bg-background shadow transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] {value ? 'translate-x-4.5' : 'translate-x-0.5'}"></span>
	</button>
{:else if widget === "segmented"}
	<div role="radiogroup" aria-label={def.title ?? def.key} class="flex rounded-md border border-border p-0.5">
		{#each def.options ?? [] as o (o)}
			<button role="radio" aria-checked={value === o} class="h-6 rounded px-2.5 text-xs {value === o ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'}" onclick={() => onchange(o)}>{label(o)}</button>
		{/each}
	</div>
{:else if widget === "select" || def.type === "enum"}
	<select class="fw-input w-56 text-xs" aria-label={def.title ?? def.key} value={value as string} onchange={(e) => onchange((e.currentTarget as HTMLSelectElement).value)}>
		{#each def.options ?? [] as o (o)}<option value={o}>{label(o)}</option>{/each}
	</select>
{:else if widget === "slider"}
	<div class="flex w-64 items-center gap-2">
		<input type="range" class="flex-1 accent-[var(--primary)]" min={def.min} max={def.max} step={def.step ?? 1} value={value as number} aria-label={def.title ?? def.key} onchange={(e) => onchange(Number((e.currentTarget as HTMLInputElement).value))} />
		<span class="w-14 text-right text-xs tabular-nums">{value}{def.unit ?? ""}</span>
	</div>
{:else if widget === "theme"}
	<select class="fw-input w-56 text-xs" aria-label={def.title ?? def.key} value={value as string} onchange={(e) => onchange((e.currentTarget as HTMLSelectElement).value)}>
		{#each k.sys.themes.list() as t (t.def.meta.id)}<option value={t.def.meta.id}>{t.def.meta.name}</option>{/each}
	</select>
{:else if widget === "color"}
	<input type="color" value={value as string} aria-label={def.title ?? def.key} onchange={(e) => onchange((e.currentTarget as HTMLInputElement).value)} />
{:else if def.type === "number"}
	<div class="flex items-center gap-1">
		<input type="number" class="fw-input w-28 text-xs" min={def.min} max={def.max} step={def.step ?? 1} value={value as number} aria-label={def.title ?? def.key} onchange={(e) => onchange(Number((e.currentTarget as HTMLInputElement).value))} />
		{#if def.unit}<span class="text-xs text-muted-foreground">{def.unit}</span>{/if}
	</div>
{:else if def.type === "path"}
	<div class="flex w-80 gap-1">
		<input class="fw-input text-xs" value={value as string} aria-label={def.title ?? def.key} placeholder={def.placeholder} onchange={(e) => onchange((e.currentTarget as HTMLInputElement).value)} />
		<button class="fw-btn" onclick={async () => { const p = await k.host.fs.pickFolder(); if (p) onchange(p); }}>Browse…</button>
	</div>
{:else if def.type === "json"}
	<textarea class="fw-input h-20 w-80 py-1 font-mono text-xs" aria-label={def.title ?? def.key} bind:value={draft} onchange={() => { try { onchange(JSON.parse(draft)); } catch { k.sys.notify.toast("Not valid JSON", "warning"); } }}></textarea>
{:else if def.type === "string[]"}
	<input class="fw-input w-80 text-xs" aria-label={def.title ?? def.key} bind:value={draft} onchange={() => onchange(draft.split(",").map((s) => s.trim()).filter(Boolean))} />
{:else if def.type === "secret"}
	<input type="password" class="fw-input w-64 text-xs" aria-label={def.title ?? def.key} placeholder={value ? "•••••••• (stored in the OS keychain)" : "Not set"} onchange={(e) => onchange((e.currentTarget as HTMLInputElement).value)} />
{:else}
	<input class="fw-input w-80 text-xs" aria-label={def.title ?? def.key} placeholder={def.placeholder} value={value as string} onchange={(e) => onchange((e.currentTarget as HTMLInputElement).value)} />
{/if}
