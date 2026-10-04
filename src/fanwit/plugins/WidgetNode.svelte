<script lang="ts">
	/** One node of a plugin's widget tree (widgets.ts), drawn with the app's own controls. */
	import Icon from "../icons/Icon.svelte";
	import { render } from "../manual/markdown";
	import Self from "./WidgetNode.svelte";
	import type { Widget } from "./widgets";

	let { w, act }: { w: Widget; act: (action: string, value?: unknown) => void } = $props();
	const tone = (t?: string) => (t === "muted" ? "text-muted-foreground" : t === "danger" ? "text-destructive" : t === "success" ? "text-emerald-600 dark:text-emerald-400" : t === "warning" ? "text-amber-600 dark:text-amber-400" : "");
</script>

{#if w.type === "stack" || w.type === "row"}
	<div class="flex min-w-0 {w.type === 'row' ? 'flex-row flex-wrap items-center' : 'flex-col'}" style:gap="{(w.gap ?? 2) * 4}px">
		{#each w.children ?? [] as c, i (i)}<Self w={c} {act} />{/each}
	</div>
{:else if w.type === "text"}
	<div class="{tone(w.tone)} {w.size === 'sm' ? 'text-xs' : w.size === 'lg' ? 'text-base font-medium' : w.size === 'xl' ? 'text-3xl font-semibold tabular-nums' : 'text-[13px]'} {w.mono ? 'font-mono' : ''}">{w.text}</div>
{:else if w.type === "markdown"}
	<!-- render() escapes all text; it emits no raw HTML from the source -->
	<div class="fw-prose text-[13px]">{@html render(String(w.text ?? "")).html}</div>
{:else if w.type === "badge"}
	<span class="inline-flex w-fit items-center rounded-full border border-border px-2 py-px text-[11px] {tone(w.tone)}">{w.text}</span>
{:else if w.type === "icon"}
	<Icon name={w.name} size={16} />
{:else if w.type === "button"}
	<button class="fw-btn w-fit {w.variant === 'primary' ? 'fw-btn-primary' : w.variant === 'ghost' ? 'fw-btn-ghost' : w.variant === 'danger' ? 'fw-btn-danger' : ''}" onclick={() => act(w.action, w.value)}>
		{#if w.icon}<Icon name={w.icon} size={14} />{/if}{w.label}
	</button>
{:else if w.type === "input"}
	<input class="fw-input" aria-label={w.placeholder ?? w.id} placeholder={w.placeholder} value={w.value ?? ""} onkeydown={(e) => e.key === "Enter" && act(w.action, (e.currentTarget as HTMLInputElement).value)} />
{:else if w.type === "toggle"}
	<label class="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={!!w.value} onchange={(e) => act(w.action, (e.currentTarget as HTMLInputElement).checked)} />{w.label}</label>
{:else if w.type === "select"}
	<select class="fw-input" aria-label={w.id} value={w.value} onchange={(e) => act(w.action, (e.currentTarget as HTMLSelectElement).value)}>
		{#each w.options ?? [] as o (o)}<option value={o}>{o}</option>{/each}
	</select>
{:else if w.type === "list"}
	<ul class="flex flex-col">
		{#each w.items ?? [] as it, i (i)}
			<li>
				<button class="fw-menu-row" disabled={!it.action} onclick={() => it.action && act(it.action, it.value)}>
					{#if it.icon}<Icon name={it.icon} size={14} />{/if}
					<span class="min-w-0 flex-1 truncate">{it.label}</span>
					{#if it.description}<span class="truncate text-xs text-muted-foreground">{it.description}</span>{/if}
				</button>
			</li>
		{/each}
	</ul>
{:else if w.type === "table"}
	<table class="w-full text-left text-xs">
		<thead><tr>{#each w.columns ?? [] as c (c)}<th class="border-b border-border px-1 py-1 font-medium text-muted-foreground">{c}</th>{/each}</tr></thead>
		<tbody>{#each w.rows ?? [] as r, i (i)}<tr>{#each r as cell, j (j)}<td class="border-b border-border/50 px-1 py-1 tabular-nums">{cell}</td>{/each}</tr>{/each}</tbody>
	</table>
{:else if w.type === "progress"}
	<div class="flex flex-col gap-1">
		{#if w.label}<div class="text-xs text-muted-foreground">{w.label}</div>{/if}
		<div class="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(w.value * 100)}>
			<div class="h-full bg-primary transition-[width] duration-(--duration-fast)" style:width="{Math.max(0, Math.min(1, w.value)) * 100}%"></div>
		</div>
	</div>
{/if}
