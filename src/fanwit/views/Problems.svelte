<script lang="ts">
	import { getKernel } from "../ui.svelte";
	import Icon from "../icons/Icon.svelte";
	import EmptyState from "../workbench/EmptyState.svelte";
	import type { TomlDiagnostic } from "../data/toml-file.svelte";

	/** Diagnostics from every live TOML file (layout, settings, keys, menus) with line numbers. */
	const k = getKernel();
	const s = k.sys;
	const all = $derived<(TomlDiagnostic & { open: string })[]>([
		...s.layout.diagnostics.map((d) => ({ ...d, open: "workspace" })),
		...s.settings.global.diagnostics.map((d) => ({ ...d, open: "settings" })),
		...(s.settings.vault?.diagnostics ?? []).map((d) => ({ ...d, open: "vault-settings" })),
		...(s.keysFile?.diagnostics ?? []).map((d) => ({ ...d, open: "keys" })),
		...(s.menus.file?.diagnostics ?? []).map((d) => ({ ...d, open: "menus" }))
	]);
</script>

{#if !all.length}
	<EmptyState icon="circle-check" title="No problems" description="Problems in your TOML files appear here with their line numbers." />
{:else}
	<ul class="h-full overflow-auto p-1 text-xs">
		{#each all as d, i (i)}
			<li>
				<button class="flex w-full items-start gap-2 rounded px-2 py-1 text-left hover:bg-accent" onclick={() => s.layout.openView("fanwit.tomlEditor", { file: d.open, line: d.line })}>
					<Icon name={d.severity === "error" ? "circle-x" : "triangle-alert"} size={14} class={d.severity === "error" ? "text-destructive" : "text-warning"} />
					<span class="flex-1">{d.message}</span>
					<span class="shrink-0 text-muted-foreground">{d.file.split("/").pop()}{d.line ? `:${d.line}` : ""}</span>
				</button>
			</li>
		{/each}
	</ul>
{/if}
