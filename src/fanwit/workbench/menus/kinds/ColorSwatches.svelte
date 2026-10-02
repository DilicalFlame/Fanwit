<script lang="ts">
	import type { MenuKindProps } from "../../../menus/menus.svelte";
	import Icon from "../../../icons/Icon.svelte";

	/** Grid of colour circles, recent colours and "More…" opening a full picker; emits { color }. */
	let { item, props, value, emit }: MenuKindProps<{ label?: string; palette?: "theme" | "brand" | "grey" | "custom"; colors?: string[]; columns?: number; recent?: boolean; allowCustom?: boolean }> = $props();

	const PALETTES: Record<string, string[]> = {
		theme: ["#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#3b82f6", "#6366f1", "#a855f7", "#ec4899", "#78716c", "#0f172a", "#ffffff"],
		brand: ["#e5484d", "#ff8b3e", "#ffc53d", "#30a46c", "#0090ff", "#8e4ec6", "#d6409f", "#1c2024"],
		grey: ["#000000", "#1f2937", "#374151", "#6b7280", "#9ca3af", "#d1d5db", "#f3f4f6", "#ffffff"]
	};
	const RECENT_KEY = "fw:recent-colors";
	let recent = $state<string[]>([]);
	try {
		recent = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
	} catch {
		recent = [];
	}
	const colors = $derived(props.colors ?? PALETTES[props.palette ?? "theme"] ?? PALETTES.theme);
	const current = $derived((value as { color?: string } | string | undefined) && typeof value === "object" ? (value as { color?: string }).color : (value as string | undefined));

	function pick(c: string) {
		if (props.recent !== false) {
			recent = [c, ...recent.filter((x) => x !== c)].slice(0, 8);
			try {
				localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
			} catch {
				/* ignore */
			}
		}
		emit({ color: c });
	}

	function keys(e: KeyboardEvent) {
		const cells = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>("[data-menu-cell]")];
		const i = cells.indexOf(document.activeElement as HTMLElement);
		const cols = props.columns ?? 8;
		const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
		if (d === undefined || i < 0) return;
		const n = i + d;
		if (n < 0 || n >= cells.length) return; // let the surface move to the next row
		e.preventDefault();
		e.stopPropagation();
		cells[n].focus();
	}
</script>

<div class="px-2 pt-1 text-xs text-muted-foreground">{props.label ?? item.label}</div>
<div role="group" aria-label={props.label ?? item.label} class="grid gap-1 px-2 pb-2 pt-1" style:grid-template-columns="repeat({props.columns ?? 8}, 1.25rem)" onkeydown={keys} data-menu-composite>
	{#each colors as c, i (c)}
		<button
			role="menuitemradio"
			aria-checked={current === c}
			aria-label={c}
			data-menu-cell={i}
			tabindex={i === 0 ? 0 : -1}
			disabled={!item.enabled}
			class="size-5 rounded-full border border-black/10 ring-offset-1 ring-offset-popover outline-none focus-visible:ring-2 focus-visible:ring-ring {current === c ? 'ring-2 ring-foreground' : ''}"
			style:background={c}
			onclick={() => pick(c)}
		></button>
	{/each}
	{#if props.allowCustom !== false}
		<label class="relative flex size-5 cursor-pointer items-center justify-center rounded-full border border-dashed border-muted-foreground/60" title="More…" data-menu-cell={colors.length}>
			<Icon name="plus" size={11} />
			<input type="color" class="absolute inset-0 cursor-pointer opacity-0" aria-label="Custom colour" onchange={(e) => pick((e.currentTarget as HTMLInputElement).value)} />
		</label>
	{/if}
</div>
{#if props.recent !== false && recent.length}
	<div class="flex gap-1 px-2 pb-2" aria-label="Recent colours">
		{#each recent as c (c)}
			<button class="size-4 rounded-full border border-black/10" style:background={c} aria-label="Recent {c}" onclick={() => pick(c)}></button>
		{/each}
	</div>
{/if}
