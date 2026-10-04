<script lang="ts">
	import type { MenuKindProps } from "../../../menus/menus.svelte";
	import Icon from "../../../icons/Icon.svelte";

	/** Horizontal row of icon buttons (quick actions); arrow keys move between them. */
	let { item, props, emit }: MenuKindProps<{ label?: string; items?: { icon: string; label: string; command?: string; args?: Record<string, unknown> }[] }> = $props();
	const buttons = $derived(props.items ?? []);

	function keys(e: KeyboardEvent) {
		const btns = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>("button")];
		const i = btns.indexOf(document.activeElement as HTMLButtonElement);
		if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
			e.preventDefault();
			e.stopPropagation();
			btns[(i + (e.key === "ArrowRight" ? 1 : -1) + btns.length) % btns.length]?.focus();
		}
	}
</script>

<div role="toolbar" tabindex="-1" aria-label={props.label ?? item.label} class="flex items-center justify-between gap-1 px-1.5 py-1" onkeydown={keys} data-menu-composite>
	{#each buttons as b, i (i)}
		<button class="fw-icon-btn size-8 rounded-md" title={b.label} aria-label={b.label} disabled={!item.enabled} onclick={() => emit({ __command: b.command, ...(b.args ?? {}) })}>
			<Icon name={b.icon} size={16} />
		</button>
	{/each}
</div>
