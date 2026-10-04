<script lang="ts">
	import type { Snippet } from "svelte";
	import { getKernel } from "../../ui.svelte";
	import Icon from "../../icons/Icon.svelte";
	import { manualState } from "../state.svelte";

	/**
	 * `<Callout kind="why">...</Callout>`. "why" and "under-the-hood" fold away when the reader
	 * picks Expert in the reading settings, and stay open in Guided and on Beginner pages.
	 * "learn-more" points to the official docs of a tool (Svelte, Rust, Tauri).
	 */
	let { kind = "note", title, children }: { kind?: "why" | "tip" | "note" | "warn" | "under-the-hood" | "learn-more"; title?: string; children?: Snippet } = $props();
	const k = getKernel();
	const META: Record<string, [string, string]> = {
		why: ["Why it is like this", "lightbulb"],
		tip: ["Tip", "sparkles"],
		note: ["Note", "info"],
		warn: ["Careful", "triangle-alert"],
		"under-the-hood": ["Under the hood", "cog"],
		"learn-more": ["Learn more", "graduation-cap"]
	};
	const [label, icon] = $derived(META[kind] ?? META.note);
	const foldable = $derived(kind === "why" || kind === "under-the-hood");
	const open = $derived(manualState(k).activeLevel === "beginner" || k.sys.settings.get<string>("manual.explain") !== "expert");
</script>

{#if foldable}
	<details class="fw-callout" data-kind={kind} {open}>
		<summary><Icon name={icon} size={15} /><span>{title ?? label}</span></summary>
		<div class="fw-callout-body">{@render children?.()}</div>
	</details>
{:else}
	<aside class="fw-callout" data-kind={kind} aria-label={title ?? label}>
		<div class="fw-callout-title"><Icon name={icon} size={15} /><span>{title ?? label}</span></div>
		<div class="fw-callout-body">{@render children?.()}</div>
	</aside>
{/if}
